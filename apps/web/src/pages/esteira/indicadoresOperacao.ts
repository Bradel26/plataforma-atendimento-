/**
 * Rótulos das telas que mostram as duas operações (Dashboard, Gestão,
 * Desempenho, Acompanhamentos, campanhas) — puro, sem React.
 *
 * O rótulo vem sempre do código da operação (`TIM`/`STARLINK`), nunca do nome
 * do funil (o ADMIN pode renomear), e o consolidado se chama "TIM + Starlink".
 */
import type { Operacao, TipoEtapa } from '../../lib/esteiraTypes';
import { ROTULO_OPERACAO } from './cadastroEsteira';
import { OPERACOES } from './estadoEsteira';

/** Nome do consolidado das operações informadas, na ordem fixa (TIM antes de Starlink). */
export function rotuloConsolidado(operacoes: readonly Operacao[]): string {
  const presentes = OPERACOES.filter((o) => operacoes.includes(o));
  return presentes.length ? presentes.map((o) => ROTULO_OPERACAO[o]).join(' + ') : 'Nenhuma operação';
}

/** Rótulo pelo código; sem código (funil anterior à migração), a reserva. */
export const rotuloDaOperacao = (codigo: Operacao | null | undefined, reserva = ''): string =>
  codigo ? ROTULO_OPERACAO[codigo] : reserva;

/**
 * Opções do seletor de operação das telas de indicadores. O valor vazio é o
 * consolidado das permitidas; as operações aparecem uma a uma só quando há
 * mais de uma (com uma só, o consolidado já é ela).
 */
export function opcoesDeOperacao(funis: ReadonlyArray<{ id: string; operacao?: Operacao | null }>) {
  const comCodigo = funis
    .filter((f): f is { id: string; operacao: Operacao } => Boolean(f.operacao))
    .sort((a, b) => OPERACOES.indexOf(a.operacao) - OPERACOES.indexOf(b.operacao));
  const consolidado = { valor: '', rotulo: rotuloConsolidado(comCodigo.map((f) => f.operacao)) };
  if (comCodigo.length <= 1) return [consolidado];
  return [consolidado, ...comCodigo.map((f) => ({ valor: f.id, rotulo: ROTULO_OPERACAO[f.operacao] }))];
}

/** Nome da etapa (o da API), com a operação na frente quando a visão mistura as duas. */
export const rotuloDaEtapa = (etapa: string, operacao: Operacao | null | undefined, comOperacao: boolean): string =>
  comOperacao && operacao ? `${ROTULO_OPERACAO[operacao]} · ${etapa}` : etapa;

/**
 * Partes da barra do Dashboard: ativos, cadastro pendente, quem saiu (soma das
 * etapas de saída) e o restante, em andamento.
 */
export function partesDoPainel(o: {
  total: number;
  ativos: number;
  pendentes: number;
  porEstagio: ReadonlyArray<{ total: number; tipo?: TipoEtapa | null }>;
}) {
  const saidas = o.porEstagio.reduce((n, e) => n + (e.tipo === 'SAIDA' ? e.total : 0), 0);
  return {
    ativos: o.ativos,
    pendentes: o.pendentes,
    emAndamento: Math.max(0, o.total - o.ativos - o.pendentes - saidas),
    saidas,
  };
}
