/**
 * Funil por operação (spec 6.2): de uma coorte de vínculos criados no período,
 * quantos chegaram a cada etapa do trilho, a conversão para a próxima, as
 * saídas, a mediana de dias em cada etapa e o gargalo.
 *
 * `calcularFunil` é pura (sem banco). `funilDaOperacao` monta as entradas: uma
 * consulta da coorte e consultas de histórico em lotes (sem N+1).
 */
import type { Operacao } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ETAPAS, etapa, type ChaveEtapa } from './catalogo';
import { whereDaConsulta } from './consultas.service';
import type { FiltrosEsteira } from './filtros';
import { funilDaOperacao as funilDeEstagios } from './vinculos.service';

export type EntradaFunil = {
  /** Maior trilho alcançado (histórico + etapa atual); 0 se nunca esteve no trilho. */
  trilhoMaximo: number;
  /** Trilho da etapa de onde saiu para uma SAIDA, se saiu. */
  saiuNoTrilho: number | null;
  /** Dias passados em cada trilho (soma das passagens concluídas). */
  diasPorTrilho: Record<number, number>;
};

export type EtapaFunil = {
  trilho: number;
  chave: ChaveEtapa;
  nome: string;
  alcancaram: number;
  conversaoParaProxima: number | null;
  saidas: number;
  medianaDias: number | null;
  gargalo: boolean;
};

export type PeriodoFunil = { desde: Date; ate: Date; ateExclusivo?: boolean };

const DIA_MS = 86_400_000;
const DIAS_PADRAO = 90;
const TAMANHO_LOTE = 2000;

/** Mediana; para quantidade par, a média dos dois centrais. Nulo se vazio. */
export function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio]! : (v[meio - 1]! + v[meio]!) / 2;
}

export function calcularFunil(
  entradas: EntradaFunil[],
  etapasTrilho: Array<{ trilho: number; chave: ChaveEtapa; nome: string }>,
): EtapaFunil[] {
  const ordenadas = [...etapasTrilho].sort((a, b) => a.trilho - b.trilho);
  const base = ordenadas.map((e) => {
    const dias = entradas.flatMap((x) => (x.diasPorTrilho[e.trilho] != null ? [x.diasPorTrilho[e.trilho]!] : []));
    return {
      trilho: e.trilho,
      chave: e.chave,
      nome: e.nome,
      alcancaram: entradas.filter((x) => x.trilhoMaximo >= e.trilho).length,
      saidas: entradas.filter((x) => x.saiuNoTrilho === e.trilho).length,
      medianaDias: mediana(dias),
    };
  });
  const etapas = base.map((e, i): EtapaFunil => {
    const proxima = base[i + 1];
    return {
      ...e,
      conversaoParaProxima: proxima && e.alcancaram > 0 ? proxima.alcancaram / e.alcancaram : null,
      gargalo: false,
    };
  });
  // Gargalo: menor conversão; empate, maior mediana; empate total, a primeira.
  let pior: EtapaFunil | null = null;
  for (const e of etapas) {
    if (e.conversaoParaProxima == null) continue;
    if (
      !pior ||
      e.conversaoParaProxima < pior.conversaoParaProxima! ||
      (e.conversaoParaProxima === pior.conversaoParaProxima && (e.medianaDias ?? -1) > (pior.medianaDias ?? -1))
    ) {
      pior = e;
    }
  }
  if (pior) pior.gargalo = true;
  return etapas;
}

/** Período do funil: o dos filtros, ou os últimos 90 dias até agora. */
export function periodoDosFiltros(f: FiltrosEsteira, agora: Date): PeriodoFunil {
  const ate = f.ate ?? agora;
  return { desde: f.desde ?? new Date(ate.getTime() - DIAS_PADRAO * DIA_MS), ate, ateExclusivo: f.ate ? !!f.ateExclusivo : false };
}

type Passagem = { credenciamentoId: string; deEstagioId: string | null; paraEstagioId: string; segundosNoEstagio: number | null };

/**
 * Funil da operação. O filtro por etapa/situação é ignorado (filtrar pela etapa
 * atual destruiria a coorte); os demais filtros valem. A coorte é de quem foi
 * criado no período, com a carteira e as operações permitidas do usuário (AND).
 */
export async function funilDaOperacao(
  operacao: Operacao,
  filtros: FiltrosEsteira,
  periodo: PeriodoFunil,
): Promise<{ periodo: { desde: Date; ate: Date }; total: number; etapas: EtapaFunil[] }> {
  const agora = new Date();
  const { etapas: _e, situacoes: _s, ...demais } = filtros;
  const where = await whereDaConsulta(
    operacao,
    { ...demais, periodoCampo: 'criadoEm', desde: periodo.desde, ate: periodo.ate, ateExclusivo: periodo.ateExclusivo },
    agora,
  );
  const [funil, vinculos] = await Promise.all([
    funilDeEstagios(operacao),
    prisma.credenciamento.findMany({ where, select: { id: true, estagioId: true } }),
  ]);

  // Estágio -> etapa do catálogo (só os com chave conhecida da operação).
  const chaves = new Set<string>(ETAPAS[operacao].map((e) => e.chave));
  const doEstagio = new Map(
    funil.estagios.flatMap((s) => (s.chave && chaves.has(s.chave) ? [[s.id, etapa(s.chave as ChaveEtapa)] as const] : [])),
  );

  const passagens = new Map<string, Passagem[]>();
  for (let i = 0; i < vinculos.length; i += TAMANHO_LOTE) {
    const ids = vinculos.slice(i, i + TAMANHO_LOTE).map((v) => v.id);
    const historico = await prisma.credenciamentoHistorico.findMany({
      where: { credenciamentoId: { in: ids } },
      select: { credenciamentoId: true, deEstagioId: true, paraEstagioId: true, segundosNoEstagio: true },
      orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
    });
    for (const h of historico) {
      const lista = passagens.get(h.credenciamentoId);
      if (lista) lista.push(h);
      else passagens.set(h.credenciamentoId, [h]);
    }
  }

  const entradas = vinculos.map((v): EntradaFunil => {
    let trilhoMaximo = doEstagio.get(v.estagioId)?.trilho ?? 0;
    let saiuNoTrilho: number | null = null;
    const diasPorTrilho: Record<number, number> = {};
    for (const h of passagens.get(v.id) ?? []) {
      const para = doEstagio.get(h.paraEstagioId);
      const de = h.deEstagioId ? doEstagio.get(h.deEstagioId) : undefined;
      if (para?.trilho != null) trilhoMaximo = Math.max(trilhoMaximo, para.trilho);
      if (de?.trilho != null && h.segundosNoEstagio != null) {
        diasPorTrilho[de.trilho] = (diasPorTrilho[de.trilho] ?? 0) + h.segundosNoEstagio / 86_400;
      }
      if (para?.tipo === 'SAIDA') saiuNoTrilho = de?.trilho ?? null;
      else if (para) saiuNoTrilho = null; // voltou ao fluxo (reativação)
    }
    return { trilhoMaximo, saiuNoTrilho, diasPorTrilho };
  });

  const nomes = new Map(funil.estagios.map((s) => [s.chave, s.nome]));
  const etapasTrilho = ETAPAS[operacao].flatMap((e) =>
    e.trilho != null ? [{ trilho: e.trilho, chave: e.chave, nome: nomes.get(e.chave) ?? e.nome }] : [],
  );
  return {
    periodo: { desde: periodo.desde, ate: periodo.ate },
    total: vinculos.length,
    etapas: calcularFunil(entradas, etapasTrilho),
  };
}
