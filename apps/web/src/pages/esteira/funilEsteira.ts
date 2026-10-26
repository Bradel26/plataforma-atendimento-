/**
 * Lógica do Funil da esteira (spec 6.2) — pura, sem React (testada com vitest).
 *
 * Períodos são dias `AAAA-MM-DD` (Brasília), com `ate` incluído: é o formato
 * que a API lê (`parseFiltros` transforma `ate` só com data em fim exclusivo).
 */
import type { EtapaFunil, FiltrosEsteira, FunilDoPeriodo } from '../../lib/esteiraTypes';

export type PeriodoDias = { desde: string; ate: string };
export type EtapaComPercentuais = EtapaFunil & {
  /** Parte da primeira etapa do trilho que chegou aqui (0..1); nulo se a primeira está zerada. */
  daPrimeira: number | null;
  /** Comprimento da barra (0..1) relativo à maior etapa. */
  largura: number;
};

const FUSO = 'America/Sao_Paulo';
const DIA_MS = 86_400_000;

/** Etapas na ordem do trilho com % da primeira e a largura da barra. */
export function percentuaisDoFunil(etapas: readonly EtapaFunil[]): EtapaComPercentuais[] {
  const ordenadas = [...etapas].sort((a, b) => a.trilho - b.trilho);
  const primeira = ordenadas[0]?.alcancaram ?? 0;
  const maior = Math.max(0, ...ordenadas.map((e) => e.alcancaram));
  return ordenadas.map((e) => ({
    ...e,
    daPrimeira: primeira > 0 ? e.alcancaram / primeira : null,
    largura: maior > 0 ? e.alcancaram / maior : 0,
  }));
}

const somarDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T00:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);
const diferencaEmDias = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / DIA_MS);

/** Dia de hoje em Brasília. */
export const diaDeHoje = (agora = new Date()) => agora.toLocaleDateString('en-CA', { timeZone: FUSO });

/** Últimos `dias` dias terminando hoje (hoje incluído). */
export function periodoDoPreset(hoje: string, dias: number): PeriodoDias {
  return { desde: somarDias(hoje, -(Math.max(1, dias) - 1)), ate: hoje };
}

/** Período de mesma duração imediatamente antes (termina na véspera do `desde`). */
export function periodoAnterior(p: PeriodoDias): PeriodoDias {
  const dias = Math.max(1, diferencaEmDias(p.desde, p.ate) + 1);
  return { desde: somarDias(p.desde, -dias), ate: somarDias(p.desde, -1) };
}

const diaBr = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: FUSO });

/** Período efetivo devolvido pela API, em dias legíveis (`ateExclusivo` mostra o último dia incluído). */
export function periodoExibido(p: FunilDoPeriodo['periodo']): { desde: string; ate: string } {
  const ate = new Date(p.ate);
  return { desde: diaBr(new Date(p.desde)), ate: diaBr(p.ateExclusivo ? new Date(ate.getTime() - 1) : ate) };
}

/** Filtros da tela que o funil não aplica (a API ignora; o período é o do próprio funil). */
export function filtrosForaDoFunil(f: FiltrosEsteira): string[] {
  const fora: string[] = [];
  if (f.etapas?.length) fora.push('etapa');
  if (f.situacoes?.length) fora.push('situação');
  if (f.paradoHaMaisDe !== undefined) fora.push('parado há');
  if (f.desde || f.ate) fora.push('período dos filtros');
  return fora;
}

export const formatarPercentual = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);

export function formatarDias(dias: number | null): string {
  if (dias === null) return '—';
  const texto = dias.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return dias === 1 ? '1 dia' : `${texto} dias`;
}
