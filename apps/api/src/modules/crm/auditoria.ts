import type { CampoAuditado, Prisma } from '@prisma/client';
import { prisma, type ClienteDeEscrita } from '../../lib/prisma';
import { usuarioAtual } from '../../lib/tenant';

/**
 * Trilha de auditoria da oportunidade (item 3.2 do plano em ANALISE-CRM.md).
 *
 * Hoje a oportunidade guarda o estado atual e a mudanca de etapa. Nada responde
 * "o valor caiu de 40 para 28 mil — quem baixou, e quando?", que e a pergunta
 * que aparece quando o mes fecha longe da previsao.
 *
 * A trilha **nao** grava mudanca de etapa: isso ja vive em
 * `OpportunityStageLog`, com o tempo gasto no estagio. Duplicar daria dois
 * registros do mesmo fato, e a leitura contaria duas vezes. A tela mostra a
 * uniao das duas fontes.
 */

/**
 * Valor de um campo auditado, no tipo natural dele.
 *
 * `{id, nome}` e referencia a usuario; `{quantidade, total}` e o retrato da
 * proposta. Guardar a proposta como texto pronto ("3 itens · R$ 1.000") poria
 * formatacao dentro do banco e impediria qualquer leitura numerica depois.
 */
export type ValorAuditado =
  | string
  | number
  | null
  | { id: string; nome: string }
  | { quantidade: number; total: number };

export type Diferenca = { campo: CampoAuditado; de: ValorAuditado; para: ValorAuditado };

/** Um retrato parcial da oportunidade, por campo auditado. */
export type Retrato = Partial<Record<CampoAuditado, ValorAuditado>>;

/**
 * Normaliza para comparacao.
 *
 * Referencia (`{id, nome}`) compara por **id**, nao pelo objeto inteiro: alguem
 * renomear o usuario nao e uma edicao da oportunidade, e geraria uma linha de
 * auditoria dizendo que o responsavel mudou de "Joao" para "Joao Silva".
 */
const chave = (v: ValorAuditado | undefined): string => {
  if (v === null || v === undefined) return 'nulo';
  if (typeof v === 'object') {
    return 'id' in v ? `ref:${v.id}` : `itens:${v.quantidade}:${v.total}`;
  }
  return `${typeof v}:${String(v)}`;
};

/**
 * As diferencas entre dois retratos da oportunidade.
 *
 * Tres regras, e cada uma corresponde a um jeito de a trilha mentir:
 *
 * - **campo ausente em `depois` nao gera linha.** Num PATCH, ausente significa
 *   "nao mandei", nunca "apague". Tratar ausencia como nulo faria toda edicao de
 *   titulo registrar que o responsavel e a previsao foram removidos — o classico
 *   defeito de PATCH, aqui com o agravante de virar registro permanente;
 * - **campo que nao mudou nao gera linha.** Uma linha "de X para X" e ruido, e
 *   ruido em auditoria e pior que em tela: ele esconde a mudanca real no meio de
 *   dez linhas iguais;
 * - **nulo e um valor**, nao ausencia: limpar a previsao de fechamento e uma
 *   mudanca e tem de aparecer.
 */
export function diferencasDaOportunidade(antes: Retrato, depois: Retrato): Diferenca[] {
  const saida: Diferenca[] = [];
  for (const campo of Object.keys(depois) as CampoAuditado[]) {
    const para = depois[campo];
    if (para === undefined) continue;
    const de = antes[campo] ?? null;
    if (chave(de) === chave(para)) continue;
    saida.push({ campo, de, para });
  }
  return saida;
}

/**
 * Grava as diferencas, se houver alguma.
 *
 * Recebe o cliente de escrita para poder rodar **dentro** da transacao que faz a
 * mudanca: trilha gravada fora da transacao pode registrar uma edicao que
 * acabou revertida, e uma auditoria que afirma o que nao aconteceu e pior que
 * auditoria nenhuma.
 */
export async function registrarAuditoria(
  tx: ClienteDeEscrita,
  oportunidadeId: string,
  diferencas: Diferenca[],
) {
  if (diferencas.length === 0) return;
  const { id: autorId } = usuarioAtual();
  await tx.opportunityAudit.createMany({
    data: diferencas.map((d) => ({
      oportunidadeId,
      campo: d.campo,
      de: d.de as Prisma.InputJsonValue,
      para: d.para as Prisma.InputJsonValue,
      autorId,
    })),
  });
}

/** Uma linha da trilha, ja pronta para a tela. */
export type EventoAuditoria = {
  id: string;
  tipo: 'CAMPO' | 'ETAPA';
  campo: CampoAuditado | null;
  de: ValorAuditado;
  para: ValorAuditado;
  autor: string | null;
  ocorridoEm: Date;
};

/**
 * Ordena a trilha do mais recente para o mais antigo.
 *
 * Funcao pura e separada porque a uniao das duas fontes e o unico lugar onde a
 * ordem pode sair errada — e uma trilha fora de ordem conta a historia trocada.
 * O desempate por id existe para o resultado nao variar entre duas execucoes
 * quando dois eventos caem no mesmo milissegundo, o que acontece sempre que uma
 * transacao grava etapa e campo juntos.
 */
export function ordenarTrilha(eventos: EventoAuditoria[]): EventoAuditoria[] {
  return [...eventos].sort((a, b) => {
    const t = b.ocorridoEm.getTime() - a.ocorridoEm.getTime();
    return t !== 0 ? t : a.id.localeCompare(b.id);
  });
}

/**
 * A trilha completa de uma oportunidade: edicoes de campo e mudancas de etapa.
 *
 * Quem chama **ja conferiu** que a oportunidade esta no escopo de quem pede —
 * estas duas tabelas nao carregam `organizacao_id`, e a extensao de multi-tenant
 * filtra a operacao consultada, nao a relacao. Ler por `oportunidadeId` sem essa
 * conferencia anterior seria uma porta para a trilha de outra organizacao.
 */
export async function trilhaDaOportunidade(oportunidadeId: string): Promise<EventoAuditoria[]> {
  const [campos, etapas] = await Promise.all([
    prisma.opportunityAudit.findMany({
      where: { oportunidadeId },
      include: { autor: { select: { nome: true } } },
      orderBy: { criadoEm: 'desc' },
      take: 200,
    }),
    prisma.opportunityStageLog.findMany({
      where: { oportunidadeId },
      include: {
        deEstagio: { select: { nome: true } },
        paraEstagio: { select: { nome: true } },
        usuario: { select: { nome: true } },
      },
      orderBy: { criadoEm: 'desc' },
      take: 200,
    }),
  ]);

  const deCampo: EventoAuditoria[] = campos.map((c) => ({
    id: c.id,
    tipo: 'CAMPO',
    campo: c.campo,
    de: c.de as ValorAuditado,
    para: c.para as ValorAuditado,
    autor: c.autor?.nome ?? null,
    ocorridoEm: c.criadoEm,
  }));

  const deEtapa: EventoAuditoria[] = etapas.map((e) => ({
    id: e.id,
    tipo: 'ETAPA',
    campo: null,
    // Nulo na origem e a entrada no funil, nao "estagio apagado": o primeiro
    // registro do historico nasce sem estagio de origem de proposito.
    de: e.deEstagio?.nome ?? null,
    para: e.paraEstagio.nome,
    autor: e.usuario?.nome ?? null,
    ocorridoEm: e.criadoEm,
  }));

  return ordenarTrilha([...deCampo, ...deEtapa]);
}
