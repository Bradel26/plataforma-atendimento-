/**
 * Regras puras dos indicadores da esteira (Dashboard, Gestão, Desempenho,
 * Acompanhamentos) — sem banco, para serem testadas.
 *
 * Duas regras atravessam todas as telas (spec 4.7 e 6.5):
 * - o papel de um card vem da CHAVE da etapa, nunca do nome (o ADMIN renomeia);
 * - etapas de operações diferentes nunca se agrupam pelo nome.
 */
import type { Operacao } from '@prisma/client';
import { chaveConhecida, papelDaChave } from '../esteira/catalogo';
import { DIA_MS, media, papelDoEstagio, type PapelDoEstagio } from './esteira';

type EstagioComChave = { nome: string; chave: string | null };
type CardDoFluxo = { situacaoExcecao: string | null; estagio: EstagioComChave };

/**
 * Card ainda na esteira (nem saiu, nem está em exceção).
 *
 * Com chave, só a etapa decide: saída (papel nulo) fica fora. `situacaoExcecao`
 * é legado — a migração o deixa preenchido em quem foi para a saída, e um
 * reativado volta ao trilho com ele ainda gravado. Sem chave (funil antigo),
 * vale a situação legada, como antes.
 */
export function emFluxo(c: CardDoFluxo): boolean {
  if (chaveConhecida(c.estagio.chave)) return papelDaChave(c.estagio.chave) !== null;
  return c.situacaoExcecao === null;
}

/** Papel consolidado do card (pela chave; nome só para funil sem chave). */
export const papelDoCard = (c: { estagio: EstagioComChave }): PapelDoEstagio =>
  papelDoEstagio(c.estagio.nome, c.estagio.chave);

/** Contadores do Dashboard: saídas não contam como pendente nem como ativo. */
export function contarPorPapel(cards: CardDoFluxo[]): { pendentes: number; ativos: number } {
  let pendentes = 0;
  let ativos = 0;
  for (const c of cards) {
    if (!emFluxo(c)) continue;
    const papel = papelDoCard(c);
    if (papel === 'PENDENCIA') pendentes += 1;
    else if (papel === 'ATIVO') ativos += 1;
  }
  return { pendentes, ativos };
}

/**
 * Saídas que pedem tentativa de reativação (CRM > Acompanhamentos): TIM
 * descredenciado e Starlink em Nurture (perda recuperável). Desistência e
 * Descartado encerram o relacionamento.
 */
export const saidaReativavel = (chave: string | null): boolean => chave === 'TIM_DESCREDENCIADO' || chave === 'SL_NURTURE';

const CONCLUI_CREDENCIAMENTO: PapelDoEstagio[] = ['CREDENCIADO', 'ATIVO'];

export type PassagemDeCredenciamento = {
  credenciamentoId: string;
  criadoEm: Date;
  paraEstagio: EstagioComChave;
  credenciamento: { criadoEm: Date; responsavelId: string | null };
};

/**
 * Credenciamentos concluídos no período, com a duração em dias.
 *
 * "Tempo médio de credenciamento" termina ao ENTRAR em CREDENCIADO (spec 4.7) —
 * quem pulou direto para ATIVO também concluiu. Vale a PRIMEIRA entrada do card
 * em toda a história: as passagens devem vir em ordem cronológica e incluir as
 * anteriores ao período, senão um TIM que entrou em Cred OK no mês passado e em
 * Pós-cred este mês seria contado de novo, com um tempo maior.
 */
export function concluidosNoPeriodo(
  passagens: PassagemDeCredenciamento[],
  periodo: { desde: Date; ate: Date },
): Array<{ dias: number; responsavelId: string | null }> {
  const vistos = new Set<string>();
  const concluidos: Array<{ dias: number; responsavelId: string | null }> = [];
  for (const p of passagens) {
    if (vistos.has(p.credenciamentoId)) continue;
    if (!CONCLUI_CREDENCIAMENTO.includes(papelDoEstagio(p.paraEstagio.nome, p.paraEstagio.chave))) continue;
    vistos.add(p.credenciamentoId);
    if (p.criadoEm < periodo.desde || p.criadoEm > periodo.ate) continue;
    concluidos.push({
      dias: (p.criadoEm.getTime() - p.credenciamento.criadoEm.getTime()) / DIA_MS,
      responsavelId: p.credenciamento.responsavelId,
    });
  }
  return concluidos;
}

export type RegistroDeTempo = {
  operacao: Operacao;
  chave: string | null;
  /** Agrupa etapas sem chave (funil antigo), que não têm outra identidade estável. */
  estagioId: string;
  nome: string;
  ordem: number;
  segundos: number;
};

export const arred1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

/** Ordem de exibição das operações (a mesma das telas: TIM, depois Starlink). */
export const ORDEM_OPERACAO: Record<Operacao, number> = { TIM: 0, STARLINK: 1 };

/**
 * Tempo médio por etapa, agrupado por (operação, chave). Corrige o agrupamento
 * antigo pelo nome, que somava a etapa da TIM com a da Starlink de mesmo nome.
 */
export function agruparTempoPorEtapa(registros: RegistroDeTempo[]) {
  const grupos = new Map<string, { r: RegistroDeTempo; segundos: number[] }>();
  for (const r of registros) {
    const chave = `${r.operacao}|${r.chave ?? `id:${r.estagioId}`}`;
    const atual = grupos.get(chave) ?? { r, segundos: [] };
    atual.segundos.push(r.segundos);
    grupos.set(chave, atual);
  }
  return [...grupos.values()]
    .sort((a, b) => ORDEM_OPERACAO[a.r.operacao] - ORDEM_OPERACAO[b.r.operacao] || a.r.ordem - b.r.ordem)
    .map(({ r, segundos }) => ({
      operacao: r.operacao,
      chave: r.chave,
      etapa: r.nome,
      papel: papelDoEstagio(r.nome, r.chave),
      passagens: segundos.length,
      mediaDias: arred1(media(segundos)! / 86_400),
    }));
}
