/**
 * Critério do vínculo operacional (spec 4.2) — puro, sem banco.
 *
 * Um parceiro tem no máximo um vínculo não arquivado por operação: a conta o
 * identifica quando houver; sem conta, o contato (entre os cards sem conta).
 * É o mesmo critério dos índices únicos parciais `credenciamentos_vinculo_*`
 * (migration `esteiras_dados`). Card em situação de exceção continua sendo o
 * vínculo — reativação reusa o mesmo card, não cria outro.
 */
import type { Operacao, Prisma } from '@prisma/client';

export type ChaveVinculo = { operacao: Operacao; contaId: string | null; contatoId: string };

/** `where` do Prisma que encontra o vínculo (aberto ou em exceção) do parceiro na operação. */
export function whereDoVinculo(v: ChaveVinculo): Prisma.CredenciamentoWhereInput {
  return {
    operacao: v.operacao,
    arquivadoEm: null,
    ...(v.contaId ? { contaId: v.contaId } : { contaId: null, contatoId: v.contatoId }),
  };
}

/** O mesmo critério de `whereDoVinculo`, para um card já carregado. */
export function pertenceAoVinculo(
  card: { operacao: Operacao; contaId: string | null; contatoId: string; arquivadoEm: Date | null },
  v: ChaveVinculo,
): boolean {
  if (card.arquivadoEm !== null || card.operacao !== v.operacao) return false;
  return v.contaId ? card.contaId === v.contaId : card.contaId === null && card.contatoId === v.contatoId;
}

/** Identificador textual do vínculo, para deduplicar em memória (ex.: um lote de importação). */
export function chaveDoVinculo(v: ChaveVinculo): string {
  return v.contaId ? `${v.operacao}:conta:${v.contaId}` : `${v.operacao}:contato:${v.contatoId}`;
}

/**
 * Vínculo a conferir antes de criar conta/contato do parceiro (criação manual).
 * Conta existente identifica o parceiro (o contato é indiferente: `whereDoVinculo`
 * ignora o contato quando há conta); sem conta, o contato existente. Conta nova
 * (CNPJ inédito) ou parceiro todo novo não podem ter vínculo: nulo.
 */
export function vinculoAntesDeCriar(
  operacao: Operacao,
  p: { contaId: string | null; contaNova: boolean; contatoId: string | null },
): ChaveVinculo | null {
  if (p.contaNova) return null;
  if (p.contaId) return { operacao, contaId: p.contaId, contatoId: p.contatoId ?? '' };
  if (p.contatoId) return { operacao, contaId: null, contatoId: p.contatoId };
  return null;
}
