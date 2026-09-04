import { prisma } from '../../lib/prisma';
import { filtroDe, politicaOportunidades } from '../../lib/politicas';
import { organizacaoAtual } from '../../lib/tenant';
import { badRequest } from '../../lib/errors';
import { tarefasPorOportunidade } from './opportunities.service';

/**
 * Leitura comercial do funil — itens 1.2 a 1.5 do plano em ANALISE-CRM.md.
 *
 * Os quatro relatorios saem de dado que a plataforma **ja gravava**: passagem de
 * estagio (`OpportunityStageLog`), fechamento com motivo (`Opportunity`) e tarefa
 * com prazo (`Activity`). Nenhuma migration. O comentario do proprio
 * `OpportunityStageLog` no schema pedia dois destes desde o primeiro commit.
 *
 * Regra que atravessa o arquivo: **consulta fina, agregacao pura**. Cada
 * relatorio tem uma funcao que le o banco e uma que calcula, e a que calcula e
 * exportada e testada. Relatorio de gestao mente de forma plausivel — um
 * denominador errado nao quebra nada, so faz alguem decidir errado.
 */

export type Periodo = { desde: Date; ate: Date };

/** Percentual, ou nulo quando nao ha denominador. */
const taxa = (parte: number, total: number): number | null => (total > 0 ? parte / total : null);

const soma = (valores: number[]) => valores.reduce((a, b) => a + b, 0);

const media = (valores: number[]): number | null => (valores.length > 0 ? soma(valores) / valores.length : null);

/**
 * Funil do relatorio: o informado, ou o primeiro ativo.
 *
 * Repetido de `opportunities.service` de proposito — aqui nao se quer o estagio
 * inicial nem a validacao de destino, so a lista de estagios em ordem.
 */
async function funilComEstagios(funilId?: string) {
  const f = funilId
    ? await prisma.funnel.findUnique({ where: { id: funilId }, include: { estagios: { orderBy: { ordem: 'asc' } } } })
    : await prisma.funnel.findFirst({
        where: { ativo: true },
        orderBy: { criadoEm: 'asc' },
        include: { estagios: { orderBy: { ordem: 'asc' } } },
      });
  if (!f) throw badRequest('Nenhum funil configurado');
  return f;
}

// ---------------------------------------------------------------------------
// 1.2 — conversao etapa a etapa e tempo medio por etapa
// ---------------------------------------------------------------------------

export type EstagioDoFunil = { id: string; nome: string; ordem: number; probabilidade: number };

export type LinhaFunil = EstagioDoFunil & {
  /** Passagens que ENTRARAM nesta etapa no periodo. */
  entrou: number;
  /** Saidas para etapa de ordem maior. */
  avancou: number;
  /** Saidas para etapa de ordem menor — o funil andando para tras. */
  retrocedeu: number;
  /** Fechadas no periodo estando nesta etapa. */
  ganhas: number;
  perdidas: number;
  /** Abertas nesta etapa agora. Nao e do periodo: e foto do momento. */
  abertasAgora: number;
  /** Media de tempo das saidas do periodo. Nulo sem saida com tempo medido. */
  tempoMedioSegundos: number | null;
  taxaAvanco: number | null;
  taxaPerda: number | null;
};

export type PassagemDeEstagio = {
  deEstagioId: string | null;
  paraEstagioId: string;
  segundosNoEstagio: number | null;
};

export type FechamentoDeEstagio = { estagioId: string; status: string };

/**
 * O calculo do funil, separado da consulta para poder ser testado.
 *
 * Tres armadilhas que este agrupamento evita, e que sao a razao de ele existir
 * fora da funcao que consulta:
 *
 * 1. **`entrou` e `avancou` sao fluxos do periodo e nao se fecham entre si.** Um
 *    cartao pode ter entrado antes do periodo e saido dentro dele. Somar
 *    `avancou + ganhas + perdidas + abertasAgora` e esperar `entrou` da um numero
 *    errado — e o relatorio nao promete isso em lugar nenhum.
 * 2. **Retrocesso nao e avanco.** Mover um cartao para tras e uma saida, e
 *    conta-la como avanco inflaria a conversao exatamente nos funis mal
 *    trabalhados, que sao os que precisam do relatorio.
 * 3. **Ganhar nao gera passagem de estagio.** `fecharOportunidade` so muda
 *    status; a oportunidade ganha fica parada na ultima etapa por onde passou.
 *    Sem contar fechamento separado, a etapa final apareceria com 100% de
 *    abandono.
 *
 * `tempoMedioSegundos` usa a media das saidas do periodo, e nao o tempo dos
 * cartoes que ainda estao na etapa: incluir quem nao saiu misturaria "quanto
 * tempo leva para passar" com "quanto tempo tem de fila", que sao perguntas
 * diferentes — a segunda e o cronometro do cartao (item 1.1).
 */
export function montarFunil(
  estagios: EstagioDoFunil[],
  passagens: PassagemDeEstagio[],
  fechamentos: FechamentoDeEstagio[],
  abertasPorEstagio: Map<string, number>,
): { estagios: LinhaFunil[]; totalPassagens: number } {
  const ordemDe = new Map(estagios.map((e) => [e.id, e.ordem]));

  const linhas = estagios.map((e) => {
    const entrou = passagens.filter((p) => p.paraEstagioId === e.id).length;
    const saidas = passagens.filter((p) => p.deEstagioId === e.id);

    let avancou = 0;
    let retrocedeu = 0;
    for (const s of saidas) {
      const destino = ordemDe.get(s.paraEstagioId);
      // Destino fora do funil informado nao e avanco nem retrocesso: nao ha
      // ordem para comparar. Conta como saida e nada mais — inventar um lado
      // seria pior que nao classificar.
      if (destino === undefined) continue;
      if (destino > e.ordem) avancou += 1;
      else if (destino < e.ordem) retrocedeu += 1;
    }

    const tempos = saidas.map((s) => s.segundosNoEstagio).filter((t): t is number => t !== null);
    const ganhas = fechamentos.filter((f) => f.estagioId === e.id && f.status === 'GANHA').length;
    const perdidas = fechamentos.filter((f) => f.estagioId === e.id && f.status === 'PERDIDA').length;

    return {
      ...e,
      entrou,
      avancou,
      retrocedeu,
      ganhas,
      perdidas,
      abertasAgora: abertasPorEstagio.get(e.id) ?? 0,
      tempoMedioSegundos: media(tempos),
      taxaAvanco: taxa(avancou, entrou),
      taxaPerda: taxa(perdidas, entrou),
    };
  });

  return { estagios: linhas, totalPassagens: passagens.length };
}

export async function relatorioFunil(periodo: Periodo, funilId?: string) {
  const f = await funilComEstagios(funilId);
  const visivel = await filtroDe(politicaOportunidades);

  /*
   * `OpportunityStageLog` NAO esta na lista de tabelas que a extensao de
   * multi-tenant filtra — e uma tabela filha, sem `organizacao_id`. Por isso o
   * escopo entra a mao aqui, pela relacao: um filtro por relacao tambem nao passa
   * pela extensao, entao `organizacaoId` explicito e o que impede este relatorio
   * de somar passagem de outra empresa.
   */
  const escopo = { organizacaoId: organizacaoAtual(), funilId: f.id, ...visivel };

  const [passagens, fechadas, abertas] = await Promise.all([
    prisma.opportunityStageLog.findMany({
      where: { criadoEm: { gte: periodo.desde, lte: periodo.ate }, oportunidade: escopo },
      select: { deEstagioId: true, paraEstagioId: true, segundosNoEstagio: true },
    }),
    prisma.opportunity.findMany({
      where: { AND: [{ funilId: f.id, fechadoEm: { gte: periodo.desde, lte: periodo.ate } }, visivel] },
      select: { estagioId: true, status: true },
    }),
    prisma.opportunity.groupBy({
      by: ['estagioId'],
      where: { AND: [{ funilId: f.id, status: 'ABERTA' }, visivel] },
      _count: { _all: true },
    }),
  ]);

  const abertasPorEstagio = new Map(abertas.map((a) => [a.estagioId, a._count._all]));
  const resultado = montarFunil(f.estagios, passagens, fechadas, abertasPorEstagio);

  return { funil: { id: f.id, nome: f.nome }, periodo, ...resultado };
}

// ---------------------------------------------------------------------------
// 1.3 — cartoes de oportunidade em risco
// ---------------------------------------------------------------------------

export type Balde = { total: number; valor: number };

export type Risco = {
  /** Previsao de fechamento no passado e ainda aberta. */
  atrasadas: Balde;
  /** Previsao dentro dos proximos `diasDeAviso` dias. */
  vencendo: Balde;
  /** Previsao no futuro — o que sustenta a previsao ponderada. */
  emForecast: Balde;
  /** Aberta sem previsao de fechamento: nao entra em forecast nenhum. */
  semPrevisao: Balde;
  /** Aberta sem nenhuma tarefa com prazo em aberto. Mesma regra do item 1.1. */
  semProximaAcao: Balde;
  abertas: Balde;
  diasDeAviso: number;
};

export type OportunidadeParaRisco = {
  id: string;
  valor: number;
  previsaoFechamento: Date | null;
};

/**
 * Os cinco baldes de risco, separados da consulta para poder ser testados.
 *
 * Os baldes **se sobrepoem de proposito** e isso esta no nome de cada um: uma
 * oportunidade atrasada e sem proxima acao entra nos dois. Somar os cinco nao da
 * `abertas`, e forcar baldes exclusivos esconderia justamente a pior combinacao —
 * atrasada *e* abandonada.
 *
 * `semProximaAcao` reusa a mesma definicao do cartao do kanban (decisao 55): so
 * conta atividade com prazo, porque nota sem prazo e registro do que aconteceu,
 * nao proximo passo. Se as duas telas divergissem, o supervisor veria um numero
 * no painel e outro no quadro para a mesma pergunta.
 */
export function montarRisco(
  abertas: OportunidadeParaRisco[],
  comTarefaAberta: Set<string>,
  agora: Date,
  diasDeAviso = 7,
): Risco {
  const limite = new Date(agora.getTime() + diasDeAviso * 86_400_000);
  const balde = (filtro: (o: OportunidadeParaRisco) => boolean): Balde => {
    const alvo = abertas.filter(filtro);
    return { total: alvo.length, valor: soma(alvo.map((o) => o.valor)) };
  };

  return {
    atrasadas: balde((o) => o.previsaoFechamento !== null && o.previsaoFechamento < agora),
    vencendo: balde(
      (o) => o.previsaoFechamento !== null && o.previsaoFechamento >= agora && o.previsaoFechamento <= limite,
    ),
    emForecast: balde((o) => o.previsaoFechamento !== null && o.previsaoFechamento >= agora),
    semPrevisao: balde((o) => o.previsaoFechamento === null),
    semProximaAcao: balde((o) => !comTarefaAberta.has(o.id)),
    abertas: balde(() => true),
    diasDeAviso,
  };
}

export async function relatorioRisco(diasDeAviso = 7, funilId?: string) {
  const visivel = await filtroDe(politicaOportunidades);
  const abertas = await prisma.opportunity.findMany({
    where: { AND: [{ status: 'ABERTA', ...(funilId ? { funilId } : {}) }, visivel] },
    select: { id: true, valor: true, previsaoFechamento: true },
  });

  const paraRisco = abertas.map((o) => ({
    id: o.id,
    valor: Number(o.valor),
    previsaoFechamento: o.previsaoFechamento,
  }));
  const tarefas = await tarefasPorOportunidade(paraRisco.map((o) => o.id));

  return montarRisco(paraRisco, new Set(tarefas.keys()), new Date(), diasDeAviso);
}

// ---------------------------------------------------------------------------
// 1.4 — indicadores comerciais, com variacao contra o periodo anterior
// ---------------------------------------------------------------------------

export type FluxoComercial = {
  ganhas: number;
  perdidas: number;
  valorGanho: number;
  valorPerdido: number;
  ticketMedio: number | null;
  /** Ganhas sobre decididas (ganhas + perdidas) NO periodo. */
  taxaConversao: number | null;
  /** Media de dias entre abertura e fechamento das ganhas. */
  cicloMedioDias: number | null;
};

export type FechamentoComercial = {
  status: string;
  valor: number;
  criadoEm: Date;
  fechadoEm: Date | null;
};

/**
 * O fluxo do periodo — o que se compara com o periodo anterior.
 *
 * `taxaConversao` e ganhas sobre **decididas no periodo**, nao sobre abertas. As
 * duas leituras existem e dao numeros muito diferentes; esta responde "das que
 * bateram o martelo, quantas ganhamos", que e a que nao se move quando alguem
 * abre trinta oportunidades novas no ultimo dia do mes.
 *
 * `cicloMedioDias` conta so as ganhas: incluir as perdidas mede "quanto tempo
 * demoramos para desistir", que e outra pergunta e puxa a media para cima.
 */
export function montarFluxo(fechamentos: FechamentoComercial[]): FluxoComercial {
  const ganhas = fechamentos.filter((f) => f.status === 'GANHA');
  const perdidas = fechamentos.filter((f) => f.status === 'PERDIDA');
  const valorGanho = soma(ganhas.map((g) => g.valor));

  const ciclos = ganhas
    .filter((g) => g.fechadoEm !== null)
    .map((g) => (g.fechadoEm!.getTime() - g.criadoEm.getTime()) / 86_400_000)
    // Fechamento antes da criacao seria dado corrompido; descartar e mais
    // honesto que devolver ciclo negativo.
    .filter((d) => d >= 0);

  return {
    ganhas: ganhas.length,
    perdidas: perdidas.length,
    valorGanho,
    valorPerdido: soma(perdidas.map((p) => p.valor)),
    ticketMedio: taxa(valorGanho, ganhas.length),
    taxaConversao: taxa(ganhas.length, ganhas.length + perdidas.length),
    cicloMedioDias: media(ciclos),
  };
}

/**
 * Variacao relativa entre dois numeros, ou nulo.
 *
 * Nulo em tres casos, e cada um deles seria uma mentira se virasse numero:
 *
 * - **anterior zero**: crescer de 0 para 5 nao e "+500%" nem "+100%", e uma
 *   divisao por zero. O painel tem de dizer "sem base de comparacao";
 * - **qualquer um dos dois nulo**: nao havia o que medir num dos lados;
 * - **os dois zero**: nao houve movimento, e "0%" sugeriria estabilidade medida.
 */
export function variacao(atual: number | null, anterior: number | null): number | null {
  if (atual === null || anterior === null) return null;
  if (anterior === 0) return null;
  return (atual - anterior) / anterior;
}

export type VariacaoComercial = { [K in keyof FluxoComercial]: number | null };

export function compararFluxos(atual: FluxoComercial, anterior: FluxoComercial): VariacaoComercial {
  const chaves = Object.keys(atual) as Array<keyof FluxoComercial>;
  const saida = {} as VariacaoComercial;
  for (const k of chaves) saida[k] = variacao(atual[k], anterior[k]);
  return saida;
}

export async function relatorioIndicadores(periodo: Periodo, funilId?: string) {
  const visivel = await filtroDe(politicaOportunidades);
  const doFunil = funilId ? { funilId } : {};

  // O periodo anterior tem o MESMO tamanho e termina onde o atual comeca. Um
  // "mes anterior" de calendario compararia 28 com 31 dias e faria fevereiro
  // parecer sempre pior.
  const duracao = periodo.ate.getTime() - periodo.desde.getTime();
  const anterior = { desde: new Date(periodo.desde.getTime() - duracao), ate: periodo.desde };

  const buscar = async (p: Periodo) =>
    (
      await prisma.opportunity.findMany({
        where: { AND: [{ ...doFunil, fechadoEm: { gte: p.desde, lte: p.ate } }, visivel] },
        select: { status: true, valor: true, criadoEm: true, fechadoEm: true },
      })
    ).map((o) => ({ ...o, valor: Number(o.valor) }));

  const [fAtual, fAnterior, emAberto] = await Promise.all([
    buscar(periodo),
    buscar(anterior),
    prisma.opportunity.findMany({
      where: { AND: [{ ...doFunil, status: 'ABERTA' }, visivel] },
      select: { valor: true, estagio: { select: { probabilidade: true } } },
    }),
  ]);

  const atual = montarFluxo(fAtual);

  /*
   * Previsao ponderada e foto do MOMENTO, nao fluxo do periodo — e por isso ela
   * fica fora do bloco comparado. Comparar a previsao de hoje com "a previsao do
   * mes passado" exigiria historico de previsao, que nao existe; o que se teria
   * e a previsao de hoje sobre as oportunidades fechadas no mes passado, que nao
   * quer dizer nada. Separar e a unica forma honesta.
   */
  const previsaoPonderada = soma(emAberto.map((o) => (Number(o.valor) * o.estagio.probabilidade) / 100));

  return {
    periodo,
    periodoAnterior: anterior,
    atual,
    anterior: montarFluxo(fAnterior),
    variacao: compararFluxos(atual, montarFluxo(fAnterior)),
    agora: {
      abertas: emAberto.length,
      valorEmAberto: soma(emAberto.map((o) => Number(o.valor))),
      previsaoPonderada,
    },
  };
}

// ---------------------------------------------------------------------------
// 1.5 — Win/Loss por motivo de perda
// ---------------------------------------------------------------------------

export type LinhaPerda = { motivo: string; total: number; valor: number; fatia: number };

export type PerdaCrua = { motivoPerda: string | null; valor: number };

/**
 * Perdas por motivo, separado da consulta para poder ser testado.
 *
 * Perda sem motivo entra como `SEM_MOTIVO` em vez de ser descartada. Hoje o
 * motivo e obrigatorio ao perder, entao a linha deveria ficar em zero — e e
 * exatamente por isso que ela precisa aparecer: se um dia crescer, e sinal de
 * dado entrando por outro caminho, e um relatorio que descarta silenciosamente
 * nunca mostraria isso.
 *
 * `fatia` e sobre a CONTAGEM, nao sobre o valor, e as duas ordens sao diferentes:
 * "o motivo que mais aparece" e "o motivo que mais custa" costumam ser motivos
 * distintos — preco perde muitas pequenas, concorrente perde poucas grandes. Por
 * isso o valor vem junto em vez de virar a unica ordenacao.
 */
export function montarPerdas(perdas: PerdaCrua[]): { motivos: LinhaPerda[]; total: number; valor: number } {
  const porMotivo = new Map<string, { total: number; valor: number }>();
  for (const p of perdas) {
    const chave = p.motivoPerda ?? 'SEM_MOTIVO';
    const atual = porMotivo.get(chave) ?? { total: 0, valor: 0 };
    porMotivo.set(chave, { total: atual.total + 1, valor: atual.valor + p.valor });
  }

  const total = perdas.length;
  const motivos = [...porMotivo.entries()]
    .map(([motivo, v]) => ({ motivo, ...v, fatia: total > 0 ? v.total / total : 0 }))
    .sort((a, b) => b.total - a.total || b.valor - a.valor);

  return { motivos, total, valor: soma(perdas.map((p) => p.valor)) };
}

export async function relatorioPerdas(periodo: Periodo, funilId?: string) {
  const visivel = await filtroDe(politicaOportunidades);
  const perdas = await prisma.opportunity.findMany({
    where: {
      AND: [
        { ...(funilId ? { funilId } : {}), status: 'PERDIDA', fechadoEm: { gte: periodo.desde, lte: periodo.ate } },
        visivel,
      ],
    },
    select: { motivoPerda: true, valor: true },
  });

  return { periodo, ...montarPerdas(perdas.map((p) => ({ motivoPerda: p.motivoPerda, valor: Number(p.valor) }))) };
}

// ---------------------------------------------------------------------------
// 2.3 — politica de desconto da organizacao
// ---------------------------------------------------------------------------

/**
 * O teto de desconto que COMERCIAL concede sem aprovacao.
 *
 * Mora na organizacao, e nao num arquivo de configuracao, porque e regra de
 * negocio que muda sem deploy — e porque cada organizacao da plataforma tem a
 * sua. Cem significa sem restricao, e e o padrao: ligar a alcada e uma decisao
 * que a empresa toma, nao um efeito colateral de atualizacao.
 */
export async function lerPoliticaDeDesconto() {
  const org = await prisma.organizacao.findFirstOrThrow({
    where: { id: organizacaoAtual() },
    select: { descontoMaximoPercentual: true },
  });
  return { descontoMaximoPercentual: org.descontoMaximoPercentual };
}

/**
 * Muda o teto.
 *
 * **Nao recalcula as propostas existentes**, de propósito. Baixar o teto de 20%
 * para 5% marcaria como pendente toda proposta em negociacao que ja tinha
 * desconto aprovado tacitamente, e o vendedor descobriria isso na hora de
 * fechar, sem ninguem para aprovar. A regra nova vale para a proxima edicao de
 * cada proposta — que e quando alguem esta olhando o desconto de novo.
 */
export async function gravarPoliticaDeDesconto(percentual: number) {
  await prisma.organizacao.update({
    where: { id: organizacaoAtual() },
    data: { descontoMaximoPercentual: percentual },
  });
  return lerPoliticaDeDesconto();
}
