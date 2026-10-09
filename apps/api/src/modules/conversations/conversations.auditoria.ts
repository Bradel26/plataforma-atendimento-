import type { ConversationStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { filtroDe, politicaConversas } from '../../lib/politicas';

const lista = <T extends z.ZodTypeAny>(item: T) =>
  z
    .union([item, z.array(item)])
    .optional()
    .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]) as z.infer<T>[]);

export const SITUACOES = ['AGUARDANDO_FILA', 'EM_ATENDIMENTO', 'FINALIZADA'] as const;
export type Situacao = (typeof SITUACOES)[number];

const STATUS_DA_SITUACAO: Record<Situacao, ConversationStatus[]> = {
  AGUARDANDO_FILA: ['EM_ESPERA'],
  EM_ATENDIMENTO: ['ATRIBUIDO', 'EM_ATENDIMENTO'],
  FINALIZADA: ['FINALIZADO'],
};

export function situacaoDaConversa(status: ConversationStatus): Situacao {
  if (status === 'EM_ESPERA') return 'AGUARDANDO_FILA';
  if (status === 'FINALIZADO') return 'FINALIZADA';
  return 'EM_ATENDIMENTO';
}

export const auditoriaSchema = z
  .object({
    pagina: z.coerce.number().int().min(1).default(1),
    tamanho: z.coerce.number().int().min(1).max(100).default(10),
    agenteId: lista(z.string().uuid()),
    filaId: lista(z.union([z.string().uuid(), z.literal('SEM_EQUIPE')])),
    canalConfigId: lista(z.string().uuid()),
    situacao: lista(z.enum(SITUACOES)),
    origem: z.enum(['ATIVO', 'RECEPTIVO']).optional(),
    contato: z.string().trim().min(1).max(120).optional(),
    telefone: z.string().trim().min(1).max(30).optional(),
    protocolo: z.string().trim().min(1).max(20).optional(),
    inicioDe: z.coerce.date().optional(),
    inicioAte: z.coerce.date().optional(),
    fimDe: z.coerce.date().optional(),
    fimAte: z.coerce.date().optional(),
  })
  .refine((q) => !(q.inicioDe && q.inicioAte) || q.inicioDe <= q.inicioAte, {
    message: 'Data de início: o começo do intervalo é depois do fim',
  })
  .refine((q) => !(q.fimDe && q.fimAte) || q.fimDe <= q.fimAte, {
    message: 'Data de fim: o começo do intervalo é depois do fim',
  });

export type AuditoriaQuery = z.infer<typeof auditoriaSchema>;

export function filtrosDaAuditoria(q: AuditoriaQuery): Prisma.ConversationWhereInput[] {
  const filtros: Prisma.ConversationWhereInput[] = [];
  if (q.agenteId.length) {
    filtros.push({ OR: [{ agenteId: { in: q.agenteId } }, { atendenteInicialId: { in: q.agenteId } }] });
  }
  if (q.filaId.length) {
    const ids = q.filaId.filter((id) => id !== 'SEM_EQUIPE');
    filtros.push({
      OR: [
        ...(ids.length ? [{ filaId: { in: ids } }] : []),
        ...(q.filaId.includes('SEM_EQUIPE') ? [{ filaId: null }] : []),
      ],
    });
  }
  if (q.canalConfigId.length) filtros.push({ canalConfigId: { in: q.canalConfigId } });
  if (q.situacao.length) filtros.push({ status: { in: q.situacao.flatMap((situacao) => STATUS_DA_SITUACAO[situacao]) } });
  if (q.origem) filtros.push({ origem: q.origem });
  if (q.contato) filtros.push({ contato: { nome: { contains: q.contato, mode: 'insensitive' } } });
  if (q.telefone) {
    const digitos = q.telefone.replace(/\D/g, '');
    if (digitos) filtros.push({ contato: { telefone: { contains: digitos } } });
  }
  if (q.protocolo) filtros.push({ protocolo: { contains: q.protocolo } });
  if (q.inicioDe || q.inicioAte) {
    filtros.push({ criadoEm: { ...(q.inicioDe ? { gte: q.inicioDe } : {}), ...(q.inicioAte ? { lte: q.inicioAte } : {}) } });
  }
  if (q.fimDe || q.fimAte) {
    filtros.push({ finalizadoEm: { ...(q.fimDe ? { gte: q.fimDe } : {}), ...(q.fimAte ? { lte: q.fimAte } : {}) } });
  }
  return filtros;
}

const inclusaoAuditoria = {
  contato: { select: { id: true, nome: true, telefone: true } },
  fila: { select: { id: true, nome: true } },
  atendenteInicial: { select: { id: true, nome: true } },
  canalConfig: { select: { id: true, nome: true, ponteSessao: true, phoneNumberId: true } },
} satisfies Prisma.ConversationInclude;

type RegistroAuditoria = Prisma.ConversationGetPayload<{ include: typeof inclusaoAuditoria }>;

function toLinhaAuditoria(c: RegistroAuditoria) {
  return {
    id: c.id,
    contato: c.contato,
    protocolo: c.protocolo,
    linha: c.canalConfig
      ? { id: c.canalConfig.id, nome: c.canalConfig.nome ?? c.canalConfig.phoneNumberId ?? c.canalConfig.ponteSessao ?? 'Número' }
      : null,
    equipe: c.fila,
    criadoEm: c.criadoEm,
    finalizadoEm: c.finalizadoEm,
    atendenteInicial: c.atendenteInicial,
    origem: c.origem,
    situacao: situacaoDaConversa(c.status),
  };
}

export async function listarAuditoria(q: AuditoriaQuery) {
  const where: Prisma.ConversationWhereInput = { AND: [await filtroDe(politicaConversas), ...filtrosDaAuditoria(q)] };
  const [total, registros] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      include: inclusaoAuditoria,
      orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
      skip: (q.pagina - 1) * q.tamanho,
      take: q.tamanho,
    }),
  ]);
  return { total, pagina: q.pagina, tamanho: q.tamanho, itens: registros.map(toLinhaAuditoria) };
}

export async function opcoesDaAuditoria() {
  const [usuarios, filas, linhas] = await Promise.all([
    prisma.user.findMany({ where: { ativo: true }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
    prisma.queue.findMany({ select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
    prisma.channelConfig.findMany({
      where: { canal: 'WHATSAPP' },
      select: { id: true, nome: true, ponteSessao: true, phoneNumberId: true },
      orderBy: { id: 'asc' },
    }),
  ]);
  return {
    usuarios,
    filas,
    linhas: linhas.map((linha) => ({ id: linha.id, nome: linha.nome ?? linha.phoneNumberId ?? linha.ponteSessao ?? 'Número' })),
  };
}
