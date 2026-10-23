import { Router, type Request } from 'express';
import { AppError } from '../../lib/errors';
import { z } from 'zod';
import type { Channel } from '@prisma/client';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody } from '../../http/middleware/validate';
import { param } from '../../http/params';
import { env } from '../../env';
import { badRequest, forbidden, notFound, serviceUnavailable } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { organizacaoAtual } from '../../lib/tenant';
import { notificarStatusCanal } from '../../realtime/hub';
import { salvarRegistroChamadaWebJs } from './webjs-call-history.service';
import { registrarAnalise } from '../voice/analise.service';
import {
  CANAIS_EXTERNOS,
  atualizarNumero,
  conectarMinhaLinhaWhatsapp,
  criarNumero,
  excluirNumero,
  listarCanais,
  listarLinhasDesconectadas,
  minhaLinhaWhatsapp,
  obterConfig,
  obterConfigPorId,
  salvarCanal,
  type CanalExterno,
} from './channels.service';
import { AVISO_NAO_OFICIAL, modoEfetivo } from './whatsapp.modo';
import { getWhatsAppProvider } from './whatsapp-provider.factory';
import { estadoDaIa, estadoDaIaDoNumero, salvarIa, salvarIaDoNumero } from '../bots/ia.service';
import { conectarNumeroMeta, estadoDoEmbeddedSignup } from './meta-embedded-signup.service';
import { emitirTicketWebJsCall } from './webjs-call-ticket';

export const channelsRoutes = Router();

const WEBJS_CALL_TICKET_TTL_SECONDS = 45;

function webJsBridgeConfig() {
  const port = process.env.WEBJS_LOCAL_PORT?.trim() || '4174';
  const base = (process.env.WEBJS_LOCAL_URL?.trim() || `http://127.0.0.1:${port}/api/platform`).replace(/\/+$/, '');
  const token = process.env.WEBJS_LOCAL_TOKEN?.trim() || process.env.WPP_CONNECT_WEBHOOK_SECRET?.trim() || '';
  return { base, token };
}

async function chamarWebJsBridge(path: string, init: RequestInit = {}, timeoutMs = 20_000) {
  const { base, token } = webJsBridgeConfig();
  if ((process.env.WHATSAPP_PROVIDER?.trim().toLowerCase() || 'webjs') !== 'webjs' || !token) {
    throw serviceUnavailable('O conector de chamadas WhatsApp Web não está configurado no servidor.');
  }
  let resposta: Response;
  try {
    resposta = await fetch(`${base}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw serviceUnavailable('O serviço de chamadas WhatsApp Web não respondeu.');
  }
  const corpo = await resposta.json().catch(() => ({})) as Record<string, unknown>;
  if (!resposta.ok) {
    throw new AppError(resposta.status >= 500 ? 502 : resposta.status, 'CHAMADA_WHATSAPP_RECUSADA', String(corpo.error ?? 'O serviço de chamadas recusou a operação.'));
  }
  return corpo;
}

async function configDeChamadaWebJs(req: Request) {
  if ((process.env.WHATSAPP_PROVIDER?.trim().toLowerCase() || 'webjs') !== 'webjs' || !webJsBridgeConfig().token) {
    throw serviceUnavailable('O conector de chamadas WhatsApp Web não está configurado no servidor.');
  }
  const config = await obterConfigPorId(param(req, 'id'));
  if (!config || config.canal !== 'WHATSAPP') throw notFound('Linha WhatsApp não encontrada.');
  exigirDonoOuAdmin(req, config.donoId);
  if (!config.ativo || modoEfetivo(config.modo) !== 'NAO_OFICIAL' || !config.ponteSessao) {
    throw serviceUnavailable('Conecte uma linha WhatsApp no modo não oficial pelo Atendimento primeiro.');
  }
  return config;
}

/**
 * QR/estado/desconexao passam pelo `WhatsAppProvider` em vez de falar direto
 * com `whatsapp.ponte.ts` — o primeiro passo para esta rota parar de saber que
 * o modo nao oficial e "a ponte" (ver whatsapp.provider.ts). O envio de
 * mensagens ainda nao foi migrado (fica para uma proxima fase).
 *
 * Qual implementacao (Baileys ou WPPConnect) e decidido em
 * `whatsapp-provider.factory.ts` — nao aqui.
 */
const whatsAppProvider = getWhatsAppProvider();

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
  whatsappCallingHabilitado: z.boolean().optional(),
  gravarChamadasWhatsapp: z.boolean().optional(),
  transcreverChamadasWhatsapp: z.boolean().optional(),
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
  ponteConectadoEm?: Date | null;
}): Promise<void> {
  const status = config.ponteConectadoEm ? 'DESCONECTADO' : 'AGUARDANDO_QR';
  const em = new Date();
  await prisma.channelConfig.update({
    where: { id: config.id },
    data: { ponteStatus: status, ponteStatusEm: em },
  });

  notificarStatusCanal(
    {
      id: config.id,
      ponteSessao: config.ponteSessao,
      status,
      detalhe: null,
      em: em.toISOString(),
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
    espelharCelular: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, naoVazio);

const canalDaRota = (valor: string): CanalExterno => {
  const canal = valor.toUpperCase();
  if (!(CANAIS_EXTERNOS as readonly string[]).includes(canal)) throw notFound('Canal não suportado');
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
  if (!(CANAIS_IA as readonly string[]).includes(canal)) throw notFound('Canal não suportado para IA');
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
        estado: { situacao: 'DESCONHECIDO', detalhe: 'o WhatsApp não está no modo não oficial' },
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
      res.json({ qr: null, conectado: false, motivo: 'o WhatsApp não está no modo não oficial' });
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
      throw notFound('O WhatsApp não está no modo não oficial');
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
    res.json({
      canais: await listarCanais(),
      suportados: CANAIS_EXTERNOS,
      // WhatsApp nao oficial com conexao de infraestrutura (WAHA, WPPConnect):
      // a linha so precisa do QR, e a tela esconde endereco/token/segredo da
      // ponte — detalhe de instalacao que ninguem ali deveria preencher.
      whatsappConexaoGlobal: !whatsAppProvider.credenciaisPorLinha,
    });
  }),
);

channelsRoutes.get(
  '/linhas-desconectadas',
  requireRole('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (_req, res) => {
    res.json(await listarLinhasDesconectadas());
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

channelsRoutes.get(
  '/numeros/:id/webjs-call/status',
  asyncHandler(async (req, res) => {
    const config = await configDeChamadaWebJs(req);
    const estado = await chamarWebJsBridge(`/status?session=${encodeURIComponent(config.ponteSessao!)}`);
    res.json(estado);
  }),
);

channelsRoutes.post(
  '/numeros/:id/webjs-call/originar',
  validateBody(z.object({ phone: z.string().trim().min(10).max(30) })),
  asyncHandler(async (req, res) => {
    const config = await configDeChamadaWebJs(req);
    const resultado = await chamarWebJsBridge('/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: config.ponteSessao, phone: req.body.phone }),
    }, 55_000);
    res.json(resultado);
  }),
);

channelsRoutes.post(
  '/numeros/:id/webjs-call/action/:acao',
  asyncHandler(async (req, res) => {
    const config = await configDeChamadaWebJs(req);
    const acao = param(req, 'acao');
    if (!['accept', 'reject', 'hangup'].includes(acao)) throw notFound('Ação de chamada não encontrada.');
    const resultado = await chamarWebJsBridge(`/call/${acao}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: config.ponteSessao }),
    });
    res.json(resultado);
  }),
);

const registroWebJsCallSchema = z.object({
  callId: z.string().trim().min(1).max(200),
  direcao: z.enum(['ENTRANTE', 'SAINTE']),
  telefone: z.string().trim().min(1).max(200),
  status: z.enum(['CHAMANDO', 'EM_ANDAMENTO', 'COMPLETADA', 'NAO_ATENDIDA', 'OCUPADA', 'FALHOU', 'CANCELADA']),
  iniciadoEm: z.string().datetime().optional(),
  atendidoEm: z.string().datetime().nullable().optional(),
  encerradoEm: z.string().datetime().nullable().optional(),
  duracao: z.number().int().min(0).max(86_400).nullable().optional(),
  recordingName: z.string().trim().max(255).optional(),
  transcricao: z.string().max(100_000).nullable().optional(),
  resumo: z.string().max(20_000).nullable().optional(),
  analisadoPor: z.string().trim().max(120).nullable().optional(),
});

/** Registra o ciclo da chamada WebJS e importa sua gravação do conector para o storage da plataforma. */
channelsRoutes.post(
  '/numeros/:id/webjs-call/registro',
  validateBody(registroWebJsCallSchema),
  asyncHandler(async (req, res) => {
    const config = await configDeChamadaWebJs(req);
    const dados = req.body as z.infer<typeof registroWebJsCallSchema>;
    let gravacao: { buffer: Buffer; nome: string } | undefined;

    if (dados.recordingName) {
      const nome = dados.recordingName;
      if (!nome.startsWith(`sessao-${config.ponteSessao}-chamada-`) || !nome.endsWith('-audio-completo.wav')) {
        throw badRequest('A gravação não pertence à sessão WhatsApp conectada.');
      }
      const { base, token } = webJsBridgeConfig();
      let resposta: Response;
      try {
        resposta = await fetch(`${base}/recordings/${encodeURIComponent(nome)}/audio?session=${encodeURIComponent(config.ponteSessao!)}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        throw serviceUnavailable('O conector local não conseguiu entregar a gravação.');
      }
      if (!resposta.ok) throw serviceUnavailable('A gravação ainda não está disponível no conector local.');
      const tamanhoDeclarado = Number(resposta.headers.get('content-length') || 0);
      if (tamanhoDeclarado > 100 * 1024 * 1024) throw badRequest('A gravação ultrapassa o limite de 100 MB.');
      const buffer = Buffer.from(await resposta.arrayBuffer());
      if (buffer.length > 100 * 1024 * 1024) throw badRequest('A gravação ultrapassa o limite de 100 MB.');
      gravacao = { buffer, nome };
    }

    const resultado = await salvarRegistroChamadaWebJs({
      ...dados,
      sessao: config.ponteSessao!,
      canalConfig: { id: config.id, donoId: config.donoId, filaId: config.filaId, nome: config.nome },
      agenteId: req.user!.sub,
      ...(gravacao ? { gravacao } : {}),
    });
    res.json(resultado);
  }),
);

channelsRoutes.post(
  '/numeros/:id/webjs-call/audio-ticket',
  asyncHandler(async (req, res) => {
    const config = await configDeChamadaWebJs(req);
    const ticket = await emitirTicketWebJsCall({
      organizacaoId: organizacaoAtual(),
      usuarioId: req.user!.sub,
      canalConfigId: config.id,
      sessao: config.ponteSessao!,
    });
    res.json({ ticket, expiresIn: WEBJS_CALL_TICKET_TTL_SECONDS });
  }),
);

channelsRoutes.post(
  '/numeros/:id/webjs-call/recordings/:base/analyze',
  validateBody(z.object({ plataformaCallId: z.string().uuid().optional() })),
  asyncHandler(async (req, res) => {
    const config = await configDeChamadaWebJs(req);
    const base = param(req, 'base');
    if (!base.startsWith(`sessao-${config.ponteSessao}-`)) throw notFound('Gravação não encontrada nesta linha.');
    // A análise pode transcrever as duas faixas e então gerar o resumo local.
    // O limite padrão de 20 s encerrava a requisição antes de o conector concluir.
    const resultado = await chamarWebJsBridge(
      `/recordings/${encodeURIComponent(base)}/analyze?session=${encodeURIComponent(config.ponteSessao!)}`,
      { method: 'POST' },
      700_000,
    );
    const dados = resultado as {
      transcript?: string;
      resumo?: string;
      sentimento?: 'POSITIVO' | 'NEUTRO' | 'NEGATIVO' | null;
      proximasAcoes?: string[];
      engine?: string;
    };
    const plataformaCallId = (req.body as { plataformaCallId?: string }).plataformaCallId;
    if (plataformaCallId) {
      const chamada = await prisma.call.findFirst({
        where: { id: plataformaCallId, canalConfigId: config.id },
        select: { id: true },
      });
      if (!chamada) throw notFound('Chamada não encontrada nesta linha.');
      await registrarAnalise(chamada.id, {
        transcricao: dados.transcript ?? '',
        resumo: dados.resumo ?? '',
        sentimento: dados.sentimento ?? null,
        proximasAcoes: dados.proximasAcoes ?? [],
        motor: dados.engine ?? 'Whisper + análise local',
      });
    }
    res.json(resultado);
  }),
);

channelsRoutes.get(
  '/numeros/:id/webjs-call/recordings/:name/audio',
  asyncHandler(async (req, res) => {
    const config = await configDeChamadaWebJs(req);
    const name = param(req, 'name');
    if (!name.startsWith(`sessao-${config.ponteSessao}-`)) throw notFound('Gravação não encontrada nesta linha.');
    const { base, token } = webJsBridgeConfig();
    let resposta: Response;
    try {
      resposta = await fetch(`${base}/recordings/${encodeURIComponent(name)}/audio?session=${encodeURIComponent(config.ponteSessao!)}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw serviceUnavailable('O serviço de gravações WhatsApp não respondeu.');
    }
    if (!resposta.ok) throw new AppError(resposta.status, 'GRAVACAO_NAO_DISPONIVEL', 'A gravação ainda não está disponível.');
    res.type('audio/wav').send(Buffer.from(await resposta.arrayBuffer()));
  }),
);

/** Configuração pública mínima do Embedded Signup: IDs não são segredos. */
channelsRoutes.get('/whatsapp/meta/embedded-signup', asyncHandler(async (_req, res) => {
  res.json(estadoDoEmbeddedSignup());
}));

/** Finaliza o OAuth no servidor e associa a linha Meta ao usuário autenticado. */
channelsRoutes.post(
  '/whatsapp/pessoal/meta/conectar',
  validateBody(z.object({
    codigo: z.string().trim().min(10).max(4000),
    wabaId: z.string().trim().min(4).max(80),
    phoneNumberId: z.string().trim().min(4).max(80),
    pin: z.string().regex(/^\d{6}$/, 'Defina um PIN de segurança com 6 dígitos'),
  })),
  asyncHandler(async (req, res) => {
    if (!env.META_EMBEDDED_SIGNUP_CONFIG_ID) {
      throw serviceUnavailable('O cadastro padrão do WhatsApp ainda não foi configurado pela Meta.');
    }
    const resultado = await conectarNumeroMeta({ ...req.body, donoId: req.user!.sub });
    res.status(201).json(resultado);
  }),
);

/** Conecta uma linha WhatsApp Business App por coexistência, mantendo o app ativo. */
channelsRoutes.post(
  '/whatsapp/pessoal/meta/conectar-coexistencia',
  validateBody(z.object({
    codigo: z.string().trim().min(10).max(4000),
    wabaId: z.string().trim().min(4).max(80),
    phoneNumberId: z.string().trim().min(4).max(80).optional(),
  })),
  asyncHandler(async (req, res) => {
    if (!env.META_EMBEDDED_SIGNUP_COEX_CONFIG_ID) {
      throw serviceUnavailable('A conexão mantendo o WhatsApp Business no celular ainda não foi configurada pela Meta.');
    }
    const resultado = await conectarNumeroMeta({ ...req.body, coexistencia: true, donoId: req.user!.sub });
    res.status(201).json(resultado);
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
    if (!config) throw notFound('Número não encontrado');
    exigirDonoOuAdmin(req, config.donoId);
    if (config.donoId && !config.ponteSessao) {
      throw badRequest(
        'Esta linha pessoal não tem nome de sessão configurado — configure antes de conectar, para não usar a sessão da linha compartilhada.',
      );
    }

    const caminhoWebhook = `/api/webhooks/ponte/whatsapp/${organizacaoAtual()}`;

    if (config.canal !== 'WHATSAPP' || modoEfetivo(config.modo) !== 'NAO_OFICIAL') {
      res.json({
        estado: { situacao: 'DESCONHECIDO', detalhe: 'este número não está no modo não oficial' },
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
    if (!config) throw notFound('Número não encontrado');
    exigirDonoOuAdmin(req, config.donoId);
    if (config.donoId && !config.ponteSessao) {
      throw badRequest(
        'Esta linha pessoal não tem nome de sessão configurado — configure antes de conectar, para não usar a sessão da linha compartilhada.',
      );
    }

    if (config.canal !== 'WHATSAPP' || modoEfetivo(config.modo) !== 'NAO_OFICIAL') {
      res.json({ qr: null, conectado: false, motivo: 'este número não está no modo não oficial' });
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
    if (!config) throw notFound('Número não encontrado');
    exigirDonoOuAdmin(req, config.donoId);
    if (config.donoId && !config.ponteSessao) {
      throw badRequest(
        'Esta linha pessoal não tem nome de sessão configurado — configure antes de conectar, para não usar a sessão da linha compartilhada.',
      );
    }

    if (config.canal !== 'WHATSAPP' || modoEfetivo(config.modo) !== 'NAO_OFICIAL') {
      throw notFound('Este número não está no modo não oficial');
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
