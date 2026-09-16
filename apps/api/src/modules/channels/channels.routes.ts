import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Channel } from '@prisma/client';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody } from '../../http/middleware/validate';
import { param } from '../../http/params';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { organizacaoAtual } from '../../lib/tenant';
import { notificarStatusCanal } from '../../realtime/hub';
import {
  CANAIS_EXTERNOS,
  atualizarNumero,
  conectarMinhaLinhaWhatsapp,
  criarNumero,
  excluirNumero,
  listarCanais,
  minhaLinhaWhatsapp,
  obterConfig,
  obterConfigPorId,
  salvarCanal,
  type CanalExterno,
} from './channels.service';
import { AVISO_NAO_OFICIAL, modoEfetivo } from './whatsapp.modo';
import { BaileysProvider } from './providers/baileys.provider';
import { estadoDaIa, estadoDaIaDoNumero, salvarIa, salvarIaDoNumero } from '../bots/ia.service';

export const channelsRoutes = Router();

/**
 * QR/estado/desconexao passam pelo `WhatsAppProvider` em vez de falar direto
 * com `whatsapp.ponte.ts` — o primeiro passo para esta rota parar de saber que
 * o modo nao oficial e "a ponte" (ver whatsapp.provider.ts). O envio de
 * mensagens ainda nao foi migrado (fica para uma proxima fase).
 */
const whatsAppProvider = new BaileysProvider();

channelsRoutes.use(requireAuth);

/**
 * ADMIN mexe em qualquer numero; o vendedor dono da linha mexe na propria.
 *
 * E a mesma logica de "Meu WhatsApp" do vendedor (a ficha 360 dele): ele nao
 * precisa de um ADMIN por perto so para escanear o proprio QR de novo quando
 * o celular ficar sem bateria.
 */
export function exigirDonoOuAdmin(req: Request, donoId: string | null): void {
  const usuario = req.user!;
  if (usuario.perfil === 'ADMIN') return;
  if (donoId && usuario.sub === donoId) return;
  throw forbidden();
}

const camposDoCanal = {
  ativo: z.boolean().optional(),
  phoneNumberId: z.string().trim().max(60).nullable().optional(),
  wabaId: z.string().trim().max(60).nullable().optional(),
  pageId: z.string().trim().max(60).nullable().optional(),
  igUserId: z.string().trim().max(60).nullable().optional(),
  accessToken: z.string().trim().min(10).nullable().optional(),
  appSecret: z.string().trim().min(10).nullable().optional(),
  verifyToken: z.string().trim().min(6).nullable().optional(),
  filaId: z.string().uuid().nullable().optional(),
  /*
   * WhatsApp nos dois modos.
   *
   * `modo` nulo limpa a escolha (volta ao oficial, que e o efetivo do nulo).
   * O segredo da ponte tem minimo de 16 caracteres pelo mesmo motivo do
   * segredo da IA: e uma chave HMAC, e chave curta se quebra por forca bruta
   * enquanto ninguem olha.
   */
  modo: z.enum(['OFICIAL', 'NAO_OFICIAL']).nullable().optional(),
  ponteUrl: z.string().trim().url().max(300).nullable().optional(),
  ponteToken: z.string().trim().min(8).max(200).nullable().optional(),
  ponteSegredo: z
    .string()
    .trim()
    .min(16, 'Use um segredo de ao menos 16 caracteres')
    .max(200)
    .nullable()
    .optional(),
  ponteSessao: z.string().trim().max(60).nullable().optional(),
};

/**
 * Atualiza o estado local para desconectado logo depois que o provider
 * confirma, reutilizando a mesma escrita e o mesmo evento Socket.IO que o
 * webhook da ponte usa quando ELA reporta a desconexao por conta propria
 * (`ponte.routes.ts`) — sem isto a tela ficava mostrando "conectado" ate a
 * ponte decidir avisar, o que pode nunca acontecer se ela estiver fora do ar.
 *
 * So e chamada DEPOIS de `provider.disconnect` ter retornado com sucesso: se
 * ele lancar, esta funcao nem roda, e o estado local so muda quando a ponte de
 * fato confirmar depois.
 */
async function marcarDesconectadoLocalmente(config: {
  id: string;
  ponteSessao: string | null;
  donoId: string | null;
}): Promise<void> {
  await prisma.channelConfig.update({
    where: { id: config.id },
    data: { ponteStatus: 'DESCONECTADO', ponteStatusEm: new Date() },
  });

  notificarStatusCanal(
    {
      id: config.id,
      ponteSessao: config.ponteSessao,
      status: 'DESCONECTADO',
      detalhe: null,
      em: new Date().toISOString(),
    },
    { agenteId: config.donoId },
  );
}

const naoVazio = { message: 'Informe ao menos um campo' } as const;

const salvarSchema = z.object(camposDoCanal).refine((d) => Object.keys(d).length > 0, naoVazio);

/**
 * Linha pessoal: mesmos campos do canal, mais rotulo e dono.
 *
 * `donoId` obrigatorio na criacao — uma linha pessoal sem dono e so um numero
 * a mais do canal, o que a rota `PUT /:canal` ja cobre.
 */
const numeroSchema = z.object({
  ...camposDoCanal,
  nome: z.string().trim().min(1).max(60).nullable().optional(),
  donoId: z.string().uuid(),
});

const atualizarNumeroSchema = z
  .object({
    ...camposDoCanal,
    nome: z.string().trim().min(1).max(60).nullable().optional(),
    donoId: z.string().uuid().nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, naoVazio);

const canalDaRota = (valor: string): CanalExterno => {
  const canal = valor.toUpperCase();
  if (!(CANAIS_EXTERNOS as readonly string[]).includes(canal)) throw notFound('Canal nao suportado');
  return canal as CanalExterno;
};

/**
 * A ponte de IA vale para qualquer canal, nao so os da Meta: um agente
 * respondendo no webchat e o caso mais facil de testar, e o e-mail nao tem
 * credencial de Graph API nenhuma.
 */
const CANAIS_IA = ['WEBCHAT', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'EMAIL'] as const;

const canalDeIa = (valor: string): Channel => {
  const canal = valor.toUpperCase();
  if (!(CANAIS_IA as readonly string[]).includes(canal)) throw notFound('Canal nao suportado para IA');
  return canal as Channel;
};

const iaSchema = z
  .object({
    iaAtiva: z.boolean().optional(),
    iaUrlWebhook: z.string().trim().url().max(300).nullable().optional(),
    iaSegredo: z.string().trim().min(16, 'Use um segredo de ao menos 16 caracteres').max(200).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Informe ao menos um campo' });

/**
 * Estado da sessao da ponte nao oficial.
 *
 * Diagnostico, e por isso **nunca falha**: ponte fora do ar responde
 * DESCONHECIDO com o motivo, e nao 500. Uma tela de configuracao que quebra
 * porque o diagnostico quebrou impede justamente quem esta tentando arrumar.
 *
 * Existe porque a sessao do WhatsApp Web CAI — o QR expira, o container
 * reinicia, o celular perde a rede. Sem esta tela, o sintoma que chega e "o
 * cliente mandou mensagem e ninguem viu", que ninguem liga a uma sessao caida.
 */
channelsRoutes.get(
  '/whatsapp/ponte/estado',
  requireRole('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (_req, res) => {
    const config = await obterConfig('WHATSAPP');

    /*
     * O caminho que a PONTE deve chamar, montado aqui.
     *
     * Ele leva o id da organizacao, e o front nao o conhece — nem deveria ter de
     * conhecer para escrever uma URL. Vem so o caminho: o host quem sabe e o
     * navegador, que pode estar atras de tunel ou de dominio proprio.
     *
     * O id na URL nao e segredo: ele diz *para quem* e a mensagem, e a assinatura
     * com `ponteSegredo` e que diz *se pode*.
     */
    const caminhoWebhook = `/api/webhooks/ponte/whatsapp/${organizacaoAtual()}`;

    if (!config || modoEfetivo(config.modo) !== 'NAO_OFICIAL') {
      res.json({
        estado: { situacao: 'DESCONHECIDO', detalhe: 'o WhatsApp nao esta no modo nao oficial' },
        aviso: AVISO_NAO_OFICIAL,
        caminhoWebhook,
      });
      return;
    }
    res.json({ estado: await whatsAppProvider.getStatus(config), aviso: AVISO_NAO_OFICIAL, caminhoWebhook });
  }),
);

/**
 * O QR Code para parear o numero, buscado na ponte e repassado para a tela.
 *
 * A tela nao fala com a ponte direto, e isso e proposital: a ponte fica na rede
 * interna e o token dela nao pode chegar ao navegador — se chegasse, qualquer
 * pessoa com o DevTools aberto poderia mandar mensagem pelo numero da empresa.
 *
 * ADMIN e nao SUPERVISOR: quem ve este QR pode parear o WhatsApp da empresa em
 * outro aparelho, o que e do mesmo tamanho que trocar a credencial do canal.
 */
channelsRoutes.get(
  '/whatsapp/ponte/qr',
  requireRole('ADMIN'),
  asyncHandler(async (_req, res) => {
    const config = await obterConfig('WHATSAPP');

    if (!config || modoEfetivo(config.modo) !== 'NAO_OFICIAL') {
      res.json({ qr: null, conectado: false, motivo: 'o WhatsApp nao esta no modo nao oficial' });
      return;
    }

    res.json(await whatsAppProvider.getQRCode(config));
  }),
);

/**
 * Desfaz o pareamento: o "trocar de numero" da tela.
 *
 * Existe porque a alternativa e ir no celular, achar "Aparelhos conectados" e
 * remover o certo — e remover o errado derruba o atendimento inteiro.
 */
channelsRoutes.post(
  '/whatsapp/ponte/desconectar',
  requireRole('ADMIN'),
  asyncHandler(async (_req, res) => {
    const config = await obterConfig('WHATSAPP');

    if (!config || modoEfetivo(config.modo) !== 'NAO_OFICIAL') {
      throw notFound('O WhatsApp nao esta no modo nao oficial');
    }

    await whatsAppProvider.disconnect(config);
    await marcarDesconectadoLocalmente(config);
    res.json({ ok: true });
  }),
);

channelsRoutes.get(
  '/',
  requireRole('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (_req, res) => {
    res.json({ canais: await listarCanais(), suportados: CANAIS_EXTERNOS });
  }),
);

/**
 * Linha pessoal: numero proprio de um usuario (vendedor com WhatsApp dedicado).
 *
 * `/numeros/:id` registrada ANTES de `PUT /:canal`: os dois casam com
 * `PUT /alguma-coisa`, e o Express usa a primeira rota que bater — com a ordem
 * trocada, `PUT /numeros/xyz` seria lido como canal "numeros" e cairia no 404
 * de canal invalido.
 */
/**
 * Self-service: qualquer usuario logado ve a propria linha, sem precisar de
 * ADMIN nem de abrir Configuracoes — e o que a tela de Atendimento usa para
 * oferecer "Conectar WhatsApp". Registrada ANTES de `PUT /numeros/:id` pelo
 * mesmo motivo: path literal tem que vir antes do `:id` correspondente.
 */
channelsRoutes.get(
  '/numeros/meu',
  asyncHandler(async (req, res) => {
    const numero = await minhaLinhaWhatsapp(req.user!.sub);
    res.json({ numero });
  }),
);

/**
 * Self-service: cria (ou recupera, se ja existir) a propria linha pessoal e
 * devolve so o essencial para a tela seguir para o QR — nunca ponteUrl,
 * ponteToken ou ponteSegredo. E o "Conectar WhatsApp" de um clique so: o
 * usuario nao escolhe sessao nem preenche nada da ponte.
 */
channelsRoutes.post(
  '/whatsapp/pessoal/conectar',
  asyncHandler(async (req, res) => {
    const numero = await conectarMinhaLinhaWhatsapp(req.user!.sub);
    res.status(201).json({ numero });
  }),
);

channelsRoutes.put(
  '/numeros/:id',
  requireRole('ADMIN'),
  validateBody(atualizarNumeroSchema),
  asyncHandler(async (req, res) => {
    res.json({ canal: await atualizarNumero(param(req, 'id'), req.body) });
  }),
);

channelsRoutes.delete(
  '/numeros/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    await excluirNumero(param(req, 'id'));
    res.status(204).end();
  }),
);

/**
 * Ponte de IA de uma linha pessoal — mesma ideia de `/:canal/ia`, so que por
 * numero: o vendedor pode ter motor de IA proprio, diferente do compartilhado.
 */
channelsRoutes.get(
  '/numeros/:id/ia',
  requireRole('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (req, res) => {
    res.json({ ia: await estadoDaIaDoNumero(param(req, 'id')) });
  }),
);

channelsRoutes.put(
  '/numeros/:id/ia',
  requireRole('ADMIN'),
  validateBody(iaSchema),
  asyncHandler(async (req, res) => {
    res.json({ ia: await salvarIaDoNumero(param(req, 'id'), req.body) });
  }),
);

/**
 * Estado da sessao da ponte de uma linha PESSOAL — o irmao de
 * `/whatsapp/ponte/estado`, so que por numero em vez do canal compartilhado.
 *
 * ADMIN ve qualquer numero; o proprio vendedor ve so o dele — e o "Meu
 * WhatsApp: conectado" que a ficha dele mostra.
 */
channelsRoutes.get(
  '/numeros/:id/ponte/estado',
  asyncHandler(async (req, res) => {
    const config = await obterConfigPorId(param(req, 'id'));
    if (!config) throw notFound('Numero nao encontrado');
    exigirDonoOuAdmin(req, config.donoId);
    if (config.donoId && !config.ponteSessao) {
      throw badRequest(
        'Esta linha pessoal nao tem nome de sessao configurado — configure antes de conectar, para nao usar a sessao da linha compartilhada.',
      );
    }

    const caminhoWebhook = `/api/webhooks/ponte/whatsapp/${organizacaoAtual()}`;

    if (config.canal !== 'WHATSAPP' || modoEfetivo(config.modo) !== 'NAO_OFICIAL') {
      res.json({
        estado: { situacao: 'DESCONHECIDO', detalhe: 'este numero nao esta no modo nao oficial' },
        aviso: AVISO_NAO_OFICIAL,
        caminhoWebhook,
      });
      return;
    }
    res.json({ estado: await whatsAppProvider.getStatus(config), aviso: AVISO_NAO_OFICIAL, caminhoWebhook });
  }),
);

/**
 * QR para parear a linha pessoal — o vendedor escaneia com o proprio celular.
 *
 * Diferente do QR do canal compartilhado (ADMIN-only, porque pareia o numero
 * da empresa inteira): aqui quem escaneia esta pareando o proprio numero, e o
 * dono da linha pode fazer isso sozinho.
 */
channelsRoutes.get(
  '/numeros/:id/ponte/qr',
  asyncHandler(async (req, res) => {
    const config = await obterConfigPorId(param(req, 'id'));
    if (!config) throw notFound('Numero nao encontrado');
    exigirDonoOuAdmin(req, config.donoId);
    if (config.donoId && !config.ponteSessao) {
      throw badRequest(
        'Esta linha pessoal nao tem nome de sessao configurado — configure antes de conectar, para nao usar a sessao da linha compartilhada.',
      );
    }

    if (config.canal !== 'WHATSAPP' || modoEfetivo(config.modo) !== 'NAO_OFICIAL') {
      res.json({ qr: null, conectado: false, motivo: 'este numero nao esta no modo nao oficial' });
      return;
    }
    res.json(await whatsAppProvider.getQRCode(config));
  }),
);

/** Desfaz o pareamento da linha pessoal — o "trocar de numero" do vendedor. */
channelsRoutes.post(
  '/numeros/:id/ponte/desconectar',
  asyncHandler(async (req, res) => {
    const config = await obterConfigPorId(param(req, 'id'));
    if (!config) throw notFound('Numero nao encontrado');
    exigirDonoOuAdmin(req, config.donoId);
    if (config.donoId && !config.ponteSessao) {
      throw badRequest(
        'Esta linha pessoal nao tem nome de sessao configurado — configure antes de conectar, para nao usar a sessao da linha compartilhada.',
      );
    }

    if (config.canal !== 'WHATSAPP' || modoEfetivo(config.modo) !== 'NAO_OFICIAL') {
      throw notFound('Este numero nao esta no modo nao oficial');
    }
    await whatsAppProvider.disconnect(config);
    await marcarDesconectadoLocalmente(config);
    res.json({ ok: true });
  }),
);

channelsRoutes.post(
  '/:canal/numeros',
  requireRole('ADMIN'),
  validateBody(numeroSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ canal: await criarNumero(canalDaRota(param(req, 'canal')), req.body) });
  }),
);

channelsRoutes.put(
  '/:canal',
  requireRole('ADMIN'),
  validateBody(salvarSchema),
  asyncHandler(async (req, res) => {
    res.json({ canal: await salvarCanal(canalDaRota(param(req, 'canal')), req.body) });
  }),
);

/**
 * Estado e configuracao da ponte com o motor de IA externo.
 *
 * Rota propria e nao campo no PUT do canal: quem liga a IA nao esta mexendo em
 * credencial da Meta, e o canal WEBCHAT — o mais provavel para o primeiro teste
 * — nao passa pela validacao daquele PUT.
 */
channelsRoutes.get(
  '/:canal/ia',
  requireRole('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (req, res) => {
    res.json({ ia: await estadoDaIa(canalDeIa(param(req, 'canal'))) });
  }),
);

channelsRoutes.put(
  '/:canal/ia',
  requireRole('ADMIN'),
  validateBody(iaSchema),
  asyncHandler(async (req, res) => {
    res.json({ ia: await salvarIa(canalDeIa(param(req, 'canal')), req.body) });
  }),
);
