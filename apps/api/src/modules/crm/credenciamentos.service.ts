import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/errors';
import { acessoDoUsuarioAtual } from '../esteira/acesso';

/**
 * Funis ESTEIRA (um por operacao) para os indicadores e seletores. O cadastro,
 * a consulta e os movimentos dos vinculos ficam em `modules/esteira`
 * (`/api/esteiras/:operacao`); a API antiga de credenciamentos saiu na Task 21.
 */

// Só etapas ativas: a migração desativa as etapas antigas sem chave (ex.:
// Starlink "Treinamento realizado", "Ativo"), que não podem aparecer no
// Dashboard, na Gestão nem nos seletores de etapa (Desempenho, Campanhas).
const comEstagios = { estagios: { where: { ativa: true }, orderBy: { ordem: 'asc' } } } satisfies Prisma.FunnelInclude;

/** Funis ESTEIRA ativos da organizacao — um por operacao (ex.: TIM, Starlink). */
export function funisDaEsteira() {
  return prisma.funnel.findMany({
    where: { tipo: 'ESTEIRA', ativo: true },
    orderBy: { criadoEm: 'asc' },
    include: comEstagios,
  });
}

/**
 * Funis ESTEIRA das operacoes que o usuario atual enxerga (spec 4.9). Funil sem
 * operacao (anterior a migracao) nao aparece: credenciamento sempre tem operacao.
 */
export async function funisPermitidos() {
  const [funis, acesso] = await Promise.all([funisDaEsteira(), acessoDoUsuarioAtual()]);
  return funis.filter((f) => f.operacao !== null && acesso[f.operacao] !== undefined);
}

/** Funil pedido por id fora das operacoes permitidas: 404, sem revelar que existe. */
export async function exigirFunilPermitido(funilId: string | undefined) {
  if (!funilId) return;
  if (!(await funisPermitidos()).some((f) => f.id === funilId)) throw notFound('Operação não encontrada');
}
