import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Channel } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';

export const CANAIS_EXTERNOS = ['WHATSAPP', 'INSTAGRAM', 'FACEBOOK'] as const;
export type CanalExterno = (typeof CANAIS_EXTERNOS)[number];

/** Mascara segredos: a API nunca devolve token nem app secret em claro. */
const mascarar = (valor: string | null) =>
  valor ? `${valor.slice(0, 4)}${'*'.repeat(Math.max(4, valor.length - 8))}${valor.slice(-4)}` : null;

export async function listarCanais() {
  const canais = await prisma.channelConfig.findMany({
    include: { fila: { select: { id: true, nome: true } } },
    orderBy: { canal: 'asc' },
  });

  return canais.map((c) => ({
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

  const atual = await prisma.channelConfig.findUnique({ where: { canal } });
  const futuro = { ...atual, ...input };

  if (futuro.ativo && !(futuro.accessToken && futuro.appSecret && futuro.verifyToken)) {
    throw badRequest('Para ativar o canal informe accessToken, appSecret e verifyToken');
  }

  await prisma.channelConfig.upsert({
    where: { canal },
    update: input,
    create: { canal, ...input },
  });

  const canais = await listarCanais();
  return canais.find((c) => c.canal === canal)!;
}

export async function obterConfig(canal: Channel) {
  return prisma.channelConfig.findUnique({ where: { canal } });
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
