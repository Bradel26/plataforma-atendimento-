/**
 * Regras puras da migração das esteiras antigas (spec 7) — sem banco.
 *
 * A migration SQL `20261023130000_esteiras_dados` repete as tabelas abaixo
 * (SQL não importa TypeScript); `migracao.test.ts` confere que as duas não
 * divergem. A CLI `esteira-estrutura` usa as funções para reposicionar o que a
 * SQL não consegue (as etapas novas só existem depois da sincronização).
 */
import type { Operacao, StatusParceria } from '@prisma/client';
import type { ChaveEtapa } from './catalogo';

/** Nome sem acento, minúsculo, sem espaços nas pontas e com espaços colapsados. */
export function normalizarNomeDeEtapa(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** Etapas antigas (spec 3), pelo nome normalizado, e a chave que recebem. */
export const NOMES_ANTIGOS: Record<Operacao, Record<string, ChaveEtapa>> = {
  TIM: {
    'em negociacao': 'TIM_NEGOCIACAO',
    documentacao: 'TIM_DOCUMENTACAO',
    'credenciamento em andamento': 'TIM_CRED_ANDAMENTO',
    'credenciamento ok': 'TIM_CRED_OK',
    'apto para venda': 'TIM_VENDA_LIBERADA',
  },
  // "Treinamento realizado" fica de fora: no fluxo antigo vinha depois do
  // contrato, e "Em treinamento" (SL_TREINAMENTO) é outra coisa. A etapa vira
  // inativa e os cards vão para a etapa derivada dos campos retropreenchidos.
  STARLINK: {
    'preencher o vsm': 'SL_CREDENCIAMENTO',
    'contrato assinado': 'SL_CONTRATO',
    'pronto para venda': 'SL_PRONTO_VENDA',
  },
};

/** Chave do catálogo para uma etapa antiga, ou nulo se não houver equivalente. */
export function chaveDaEtapaAntiga(operacao: Operacao, nome: string): ChaveEtapa | null {
  return NOMES_ANTIGOS[operacao][normalizarNomeDeEtapa(nome)] ?? null;
}

type CampoStarlinkMigrado = 'cnpjApto' | 'contrato' | 'treinamento' | 'prontoVenda';

/**
 * Campos da Starlink retropreenchidos a partir da etapa antiga, para que a
 * etapa derivada ("furthest wins", spec 5.2) bata com os fatos.
 */
export const CAMPOS_STARLINK_ANTIGOS: Record<string, Partial<Record<CampoStarlinkMigrado, boolean>>> = {
  'preencher o vsm': { cnpjApto: true },
  'contrato assinado': { contrato: true },
  // No fluxo antigo o treinamento vinha depois do contrato.
  'treinamento realizado': { contrato: true, treinamento: true },
  'pronto para venda': { prontoVenda: true },
};

export function camposStarlinkDaEtapaAntiga(nome: string): Partial<Record<CampoStarlinkMigrado, boolean>> {
  return { ...(CAMPOS_STARLINK_ANTIGOS[normalizarNomeDeEtapa(nome)] ?? {}) };
}

/** Posição de `TIM_CRED_OK` no trilho: exceção a partir daqui é descredenciamento. */
const TRILHO_CRED_OK = 4;

export type SaidaMigrada = {
  chave: ChaveEtapa;
  statusParceria?: StatusParceria;
  perdido?: true;
  motivoPerda?: 'OUTRO';
  classe?: 'DEFINITIVO';
};

/**
 * Etapa de saída para um card que estava marcado com a situação de exceção
 * antiga. `trilhoAtual` é a posição no trilho da etapa em que o card estava
 * (nulo quando a etapa não tem chave — tratado como antes de Credenciamento OK).
 */
export function saidaDaExcecaoAntiga(
  operacao: Operacao,
  situacao: 'REPROVADO' | 'CANCELADO' | 'INATIVADO',
  trilhoAtual: number | null,
): SaidaMigrada {
  if (operacao === 'STARLINK') {
    return { chave: 'SL_DESCARTADO', perdido: true, motivoPerda: 'OUTRO', classe: 'DEFINITIVO' };
  }
  const depoisDoCredOk = trilhoAtual !== null && trilhoAtual >= TRILHO_CRED_OK;
  if (situacao === 'INATIVADO' || depoisDoCredOk) {
    return { chave: 'TIM_DESCREDENCIADO', statusParceria: 'DESCREDENCIADO' };
  }
  return { chave: 'TIM_DESISTENCIA', statusParceria: 'DESISTENTE' };
}
