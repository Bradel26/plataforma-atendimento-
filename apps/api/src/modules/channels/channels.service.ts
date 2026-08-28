import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Channel } from '@prisma/client';
import { prisma, prismaSemIsolamento } from '../../lib/prisma';
import { semOrganizacao } from '../../lib/tenant';
import { badRequest, notFound } from '../../lib/errors';
import { cifrar, decifrar } from '../../lib/crypto-box';

export const CANAIS_EXTERNOS = ['WHATSAPP', 'INSTAGRAM', 'FACEBOOK'] as const;
export type CanalExterno = (typeof CANAIS_EXTERNOS)[number];

/** Mascara segredos: a API nunca devolve token nem app secret em claro. */
const mascarar = (valor: string | null) =>
  valor ? `${valor.slice(0, 4)}${'*'.repeat(Math.max(4, valor.length - 8))}${valor.slice(-4)}` : null;

/**
 * Campos cifrados em repouso. `verifyToken` entra na lista porque quem o tem
 * consegue passar pela verificacao do webhook e assinar o canal em outro lugar;
 * `iaSegredo` porque com ele se forja uma entrega para o motor de IA.
 */
const SEGREDOS = ['accessToken', 'appSecret', 'verifyToken', 'iaSegredo'] as const;

/**
 * O que `salvarCanal` cifra. `iaSegredo` fica de fora porque nao entra por esta
 * rota — ele e gravado por `salvarIa`, que cifra por conta propria. Duas listas
 * em vez de uma para o tipo de entrada nao ter de aceitar um campo que a rota
 * de canal nao recebe.
 */
const SEGREDOS_DO_CANAL = ['accessToken', 'appSecret', 'verifyToken'] as const;

type ComSegredos = {
  accessToken: string | null;
  appSecret: string | null;
  verifyToken: string | null;
  iaSegredo: string | null;
};

/** Decifra os segredos de um registro lido do banco. */
function aberto<T extends ComSegredos>(config: T): T {
  const copia = { ...config };
  for (const campo of SEGREDOS) {
    const valor = copia[campo];
    if (valor) copia[campo] = decifrar(valor) as T[typeof campo];
  }
  return copia;
}

export async function listarCanais() {
  const canais = await prisma.channelConfig.findMany({
    include: { fila: { select: { id: true, nome: true } } },
    orderBy: { canal: 'asc' },
  });

  return canais.map(aberto).map((c) => ({
    id: c.id,
    canal: c.canal,
    ativo: c.ativo,
    phoneNumberId: c.phoneNumberId,
    wabaId: c.wabaId,
    pageId: c.pageId,
    igUserId: c.igUserId,
    fila: c.fila,
    atualizadoEm: c.atualizadoEm,
    accessTokenMascarado: mascarar(c.accessToken),
    appSecretMascarado: mascarar(c.appSecret),
    /** Pronto para receber webhook = tem segredo de assinatura e token de verificacao. */
    configurado: Boolean(c.accessToken && c.appSecret && c.verifyToken),
  }));
}

type SalvarCanalInput = {
  ativo?: boolean;
  phoneNumberId?: string | null;
  wabaId?: string | null;
  pageId?: string | null;
  igUserId?: string | null;
  accessToken?: string | null;
  appSecret?: string | null;
  verifyToken?: string | null;
  filaId?: string | null;
};

export async function salvarCanal(canal: CanalExterno, input: SalvarCanalInput) {
  if (input.filaId) {
    const fila = await prisma.queue.findUnique({ where: { id: input.filaId } });
    if (!fila) throw notFound('Fila nao encontrada');
  }

  const gravado = await prisma.channelConfig.findUnique({ where: { canal } });
  const atual = gravado ? aberto(gravado) : null;
  const futuro = { ...atual, ...input };

  if (futuro.ativo && !(futuro.accessToken && futuro.appSecret && futuro.verifyToken)) {
    throw badRequest('Para ativar o canal informe accessToken, appSecret e verifyToken');
  }

  // Cifra so o que veio nesta requisicao; campo ausente nao e reescrito, e
  // campo enviado como null continua sendo limpeza explicita.
  const paraGravar = { ...input };
  for (const campo of SEGREDOS_DO_CANAL) {
    const valor = paraGravar[campo];
    if (valor) paraGravar[campo] = cifrar(valor);
  }

  await prisma.channelConfig.upsert({
    where: { canal },
    update: paraGravar,
    create: { canal, ...paraGravar },
  });

  const canais = await listarCanais();
  return canais.find((c) => c.canal === canal)!;
}

/** Sempre devolve os segredos em claro — o resto do sistema nao sabe da cifra. */
export async function obterConfig(canal: Channel) {
  const config = await prisma.channelConfig.findFirst({ where: { canal } });
  return config ? aberto(config) : null;
}

/**
 * Descobre a organizacao dona de um webhook de entrada.
 *
 * A URL do webhook e compartilhada — `/api/webhooks/whatsapp` e a mesma para
 * todas as empresas —, entao o canal na rota nao identifica ninguem. Quem
 * identifica e o **id externo** que a Meta manda no corpo: `phone_number_id` no
 * WhatsApp, `page_id` no Messenger, `ig_user_id` no Instagram. Sao ids globais
 * da Meta, e e por isso que eles sao unicos no banco inteiro e nao por
 * organizacao: dois clientes nao podem cadastrar o mesmo numero.
 *
 * Roda irrestrito porque e justamente a pergunta "de quem e isto?" — nao ha
 * contexto para abrir antes da resposta.
 *
 * Sem identificador no corpo (payload de teste, canal recem-cadastrado), cai
 * para o unico canal ativo daquele tipo. Com mais de um, recusa em vez de
 * escolher: entregar a mensagem de um cliente na caixa de outro e pior do que
 * nao entregar.
 */
export async function organizacaoDoWebhook(
  canal: Channel,
  identificador: string | null,
): Promise<string | null> {
  return semOrganizacao('webhook: o id externo no corpo e que revela a organizacao', async () => {
    if (identificador) {
      const porId = await prismaSemIsolamento.channelConfig.findFirst({
        where: {
          canal,
          ativo: true,
          OR: [
            { phoneNumberId: identificador },
            { pageId: identificador },
            { igUserId: identificador },
          ],
        },
        select: { organizacaoId: true },
      });
      if (porId) return porId.organizacaoId;
    }

    const ativos = await prismaSemIsolamento.channelConfig.findMany({
      where: { canal, ativo: true },
      select: { organizacaoId: true },
      take: 2,
    });
    if (ativos.length === 1) return ativos[0]!.organizacaoId;
    if (ativos.length > 1) {
      console.warn(
        `[webhook] ${canal}: ${ativos.length}+ organizacoes com o canal ativo e nenhum id externo no corpo — mensagem descartada`,
      );
    }
    return null;
  });
}

/**
 * Valida a assinatura X-Hub-Signature-256 do webhook.
 * A Meta assina o corpo BRUTO com o App Secret — por isso a rota do webhook
 * precisa do body cru, nao do JSON ja parseado e reserializado.
 */
export function assinaturaValida(corpoBruto: Buffer, assinatura: string | undefined, appSecret: string) {
  if (!assinatura?.startsWith('sha256=')) return false;

  const esperado = createHmac('sha256', appSecret).update(corpoBruto).digest('hex');
  const recebido = assinatura.slice('sha256='.length);
  const a = Buffer.from(esperado, 'utf8');
  const b = Buffer.from(recebido, 'utf8');

  // timingSafeEqual exige tamanhos iguais.
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Assina um corpo do jeito que a Meta assina — usado pelo simulador de webhook. */
export const assinar = (corpo: string, appSecret: string) =>
  `sha256=${createHmac('sha256', appSecret).update(corpo).digest('hex')}`;
