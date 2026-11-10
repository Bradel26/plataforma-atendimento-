/**
 * Regra de "alcançou a etapa" do funil (spec 6.2) — pura, sem banco.
 *
 * Um vínculo alcançou a etapa de trilho N quando o maior trilho por onde passou
 * (etapa atual + `paraEstagio` de cada passagem do histórico) é >= N: quem
 * voltou de etapa, saiu ou foi migrado direto numa etapa adiantada continua
 * contando nas anteriores. O funil (`funil.ts`) aplica a regra em memória sobre
 * `trilhoMaximo`; a Lista (`filtros.ts`, `passouPorEtapa`) a traduz num where
 * — os dois saem daqui para nunca divergirem.
 */
import type { Operacao, Prisma } from '@prisma/client';
import { badRequest } from '../../lib/errors';
import { ETAPAS, type ChaveEtapa } from './catalogo';

/** Chegou à etapa de trilho `trilho` quem tem `trilhoMaximo` maior ou igual. */
export const alcancou = (trilhoMaximo: number, trilho: number): boolean => trilhoMaximo >= trilho;

/** Trilho da etapa nesta operação; nulo se não é do trilho dela (outra operação, desvio ou saída). */
export function trilhoNaOperacao(operacao: Operacao, chave: string): number | null {
  return ETAPAS[operacao].find((e) => e.chave === chave)?.trilho ?? null;
}

/** Etapas do trilho da operação que, se alcançadas, implicam ter alcançado o trilho `trilho`. */
export function chavesQueAlcancam(operacao: Operacao, trilho: number): ChaveEtapa[] {
  return ETAPAS[operacao].flatMap((e) => (e.trilho != null && alcancou(e.trilho, trilho) ? [e.chave] : []));
}

/**
 * Where dos vínculos que passaram (ao menos) pela etapa: a atual ou alguma
 * passagem do histórico está numa etapa de trilho >= o da escolhida. Chave fora
 * do trilho da operação → 400.
 */
export function wherePassouPorEtapa(operacao: Operacao, chave: string): Prisma.CredenciamentoWhereInput {
  const trilho = trilhoNaOperacao(operacao, chave);
  if (trilho == null) throw badRequest('Etapa do funil inválida para esta esteira');
  const chaves = chavesQueAlcancam(operacao, trilho);
  return {
    OR: [{ estagio: { chave: { in: chaves } } }, { historico: { some: { paraEstagio: { chave: { in: chaves } } } } }],
  };
}
