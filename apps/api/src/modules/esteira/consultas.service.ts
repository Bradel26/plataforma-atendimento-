/**
 * Consultas da esteira (somente leitura): estrutura da operação, Kanban
 * paginado por coluna e Lista paginada no servidor (spec 6, 6.1, 6.3).
 *
 * Toda consulta compõe com AND: filtros da tela (`whereDosFiltros`, que já traz
 * a operação e os não arquivados), a carteira do usuário e as operações que ele
 * enxerga. Alvo: até ~10 mil vínculos por operação em < 1 s (spec 8) — por isso
 * a contagem do Kanban é um `groupBy` só e a página de cada coluna busca primeiro
 * os ids (consulta leve, em paralelo) e depois os cards de todas as colunas de uma vez.
 */
import type { NivelOperacao, Operacao, Prisma, Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';
import { filtroDe, politicaCredenciamentos } from '../../lib/politicas';
import { usuarioAtual } from '../../lib/tenant';
import { filtroOperacoesPermitidas, podeForcar } from './acesso';
import { ETAPAS, MOTIVOS_PERDA, type ChaveEtapa, type EtapaCatalogo } from './catalogo';
import { COLUNAS, ordenacaoDaColuna, type ColunaEsteira, type VinculoLinha } from './colunas';
import {
  FILTROS_ESPECIFICOS,
  ORIGENS,
  codificarCursor,
  decodificarCursor,
  whereDepoisDoCursor,
  whereDosFiltros,
  type FiltroEspecifico,
  type FiltrosEsteira,
  type PosicaoNaColuna,
} from './filtros';
import { diasParadoEfetivo } from './movimento';
import { funilDaOperacao, inclusao, montarLinha, montarResumo, type VinculoResumo } from './vinculos.service';

type Where = Prisma.CredenciamentoWhereInput;

/** Filtros da tela + carteira + operações permitidas, sempre com AND. */
export async function whereDaConsulta(operacao: Operacao, filtros: FiltrosEsteira, agora: Date): Promise<Where> {
  const [carteira, permitidas] = await Promise.all([filtroDe(politicaCredenciamentos), filtroOperacoesPermitidas()]);
  return { AND: [carteira, permitidas, whereDosFiltros(operacao, filtros, agora)] };
}

// ---------------------------------------------------------------------------
// Estrutura
// ---------------------------------------------------------------------------

export type EstruturaEsteira = {
  operacao: Operacao;
  /** `diasParado` é o configurado; `diasParadoEfetivo`, o limite em vigor (padrão 7; saída: nulo). */
  etapas: Array<EtapaCatalogo & { id: string; nome: string; diasParado: number | null; diasParadoEfetivo: number | null; ativa: boolean }>;
  colunas: ColunaEsteira[];
  motivosPerda: Array<{ valor: string; rotulo: string; classe: 'RECUPERAVEL' | 'DEFINITIVO' }>;
  filtrosEspecificos: FiltroEspecifico[];
  /** Valores aceitos no filtro comum `origem`. */
  origens: Array<{ valor: string; rotulo: string }>;
  nivel: NivelOperacao | undefined;
  podeForcar: boolean;
};

/** Etapas na ordem do catálogo, com o nome (renomeável) e o limite de "parado" da organização. */
export async function estruturaDaEsteira(operacao: Operacao, nivel: NivelOperacao | undefined): Promise<EstruturaEsteira> {
  const funil = await funilDaOperacao(operacao);
  const etapas = ETAPAS[operacao].flatMap((c) => {
    const e = funil.estagios.find((s) => s.chave === c.chave);
    return e
      ? [{ ...c, id: e.id, nome: e.nome, diasParado: e.diasParado, diasParadoEfetivo: diasParadoEfetivo(e.diasParado, c.tipo), ativa: e.ativa }]
      : [];
  });
  return {
    operacao,
    etapas,
    colunas: COLUNAS[operacao],
    motivosPerda:
      operacao === 'STARLINK'
        ? Object.entries(MOTIVOS_PERDA).map(([valor, m]) => ({ valor, rotulo: m.rotulo, classe: m.classe }))
        : [],
    filtrosEspecificos: FILTROS_ESPECIFICOS[operacao],
    origens: ORIGENS[operacao],
    nivel,
    podeForcar: podeForcar(usuarioAtual().perfil as Role, nivel),
  };
}

// ---------------------------------------------------------------------------
// Kanban
// ---------------------------------------------------------------------------

export type ColunaKanban = { chave: ChaveEtapa; total: number; itens: VinculoResumo[]; proximoCursor: string | null };

/** Ordem dentro da coluna: há mais tempo na etapa primeiro; desempate pelo id (o cursor depende disso). */
const ORDEM_DA_COLUNA = [{ estagioDesde: 'asc' }, { id: 'asc' }] satisfies Prisma.CredenciamentoOrderByWithRelationInput[];

/** Ids de uma página da coluna (consulta leve) e o cursor da próxima, se houver. */
async function paginaDaColuna(where: Where, estagioId: string, porColuna: number, depois: PosicaoNaColuna | null) {
  const linhas = await prisma.credenciamento.findMany({
    where: { AND: [where, { estagioId }, ...(depois ? [whereDepoisDoCursor(depois)] : [])] },
    select: { id: true, estagioDesde: true },
    orderBy: ORDEM_DA_COLUNA,
    take: porColuna + 1,
  });
  const pagina = linhas.slice(0, porColuna);
  const ultimo = pagina[pagina.length - 1];
  return { ids: pagina.map((l) => l.id), proximoCursor: linhas.length > porColuna && ultimo ? codificarCursor(ultimo) : null };
}

/** Cards dos ids, na ordem dos ids (a visibilidade já foi conferida na consulta dos ids). */
async function cardsNaOrdem(ids: string[], agora: Date): Promise<Map<string, VinculoResumo>> {
  if (!ids.length) return new Map();
  const vinculos = await prisma.credenciamento.findMany({ where: { id: { in: ids } }, include: inclusao });
  return new Map(vinculos.map((v) => [v.id, montarResumo(v, agora)]));
}

const naOrdem = (ids: string[], cards: Map<string, VinculoResumo>) =>
  ids.flatMap((id) => {
    const card = cards.get(id);
    return card ? [card] : [];
  });

/** Etapas ativas da operação na ordem do funil, só as com chave do catálogo da operação. */
async function colunasAtivas(operacao: Operacao) {
  const chaves = new Set<string>(ETAPAS[operacao].map((e) => e.chave));
  const funil = await funilDaOperacao(operacao);
  return funil.estagios
    .filter((e) => e.ativa && e.chave && chaves.has(e.chave))
    .map((e) => ({ id: e.id, chave: e.chave as ChaveEtapa }));
}

/**
 * Kanban: uma coluna por etapa ativa, com o total (um `groupBy` para todas) e a
 * primeira página. Starlink: a coluna é o `estagioId` gravado (cache da etapa
 * derivada, mantido a cada gravação).
 */
export async function kanban(operacao: Operacao, filtros: FiltrosEsteira, porColuna: number): Promise<{ colunas: ColunaKanban[] }> {
  const agora = new Date();
  const [colunas, where] = await Promise.all([colunasAtivas(operacao), whereDaConsulta(operacao, filtros, agora)]);
  const [contagens, paginas] = await Promise.all([
    prisma.credenciamento.groupBy({
      by: ['estagioId'],
      where: { AND: [where, { estagioId: { in: colunas.map((c) => c.id) } }] },
      _count: { _all: true },
    }),
    Promise.all(colunas.map((c) => paginaDaColuna(where, c.id, porColuna, null))),
  ]);
  const totais = new Map(contagens.map((g) => [g.estagioId, g._count._all]));
  const cards = await cardsNaOrdem(
    paginas.flatMap((p) => p.ids),
    agora,
  );
  return {
    colunas: colunas.map((c, i) => ({
      chave: c.chave,
      total: totais.get(c.id) ?? 0,
      itens: naOrdem(paginas[i]!.ids, cards),
      proximoCursor: paginas[i]!.proximoCursor,
    })),
  };
}

/** "Carregar mais" de uma coluna do Kanban, a partir do cursor (sem cursor: a primeira página). */
export async function kanbanColuna(
  operacao: Operacao,
  chave: string,
  filtros: FiltrosEsteira,
  porColuna: number,
  cursor: string | undefined,
): Promise<{ chave: ChaveEtapa; itens: VinculoResumo[]; proximoCursor: string | null }> {
  const depois = cursor ? decodificarCursor(cursor) : null;
  if (cursor && !depois) throw badRequest('Cursor inválido');
  const agora = new Date();
  const [colunas, where] = await Promise.all([colunasAtivas(operacao), whereDaConsulta(operacao, filtros, agora)]);
  const coluna = colunas.find((c) => c.chave === chave);
  if (!coluna) throw notFound('Coluna não encontrada nesta esteira');
  const pagina = await paginaDaColuna(where, coluna.id, porColuna, depois);
  const cards = await cardsNaOrdem(pagina.ids, agora);
  return { chave: coluna.chave, itens: naOrdem(pagina.ids, cards), proximoCursor: pagina.proximoCursor };
}

// ---------------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------------

export type OpcoesDaLista = { pagina: number; tamanho: number; ordenarPor?: string; direcao: 'asc' | 'desc' };

/** Sem ordenação escolhida: interação mais recente primeiro. */
const ORDEM_PADRAO = [{ ultimaInteracaoEm: 'desc' }, { id: 'desc' }] satisfies Prisma.CredenciamentoOrderByWithRelationInput[];

/** Lista paginada por offset, ordenável pelas colunas `ordenavel` da operação. */
export async function lista(
  operacao: Operacao,
  filtros: FiltrosEsteira,
  opcoes: OpcoesDaLista,
): Promise<{ total: number; pagina: number; linhas: VinculoLinha[] }> {
  const orderBy = opcoes.ordenarPor ? ordenacaoDaColuna(operacao, opcoes.ordenarPor, opcoes.direcao) : ORDEM_PADRAO;
  if (!orderBy) throw badRequest('Esta coluna não pode ser ordenada');
  const agora = new Date();
  const where = await whereDaConsulta(operacao, filtros, agora);
  const [total, vinculos] = await Promise.all([
    prisma.credenciamento.count({ where }),
    prisma.credenciamento.findMany({
      where,
      include: inclusao,
      orderBy,
      skip: (opcoes.pagina - 1) * opcoes.tamanho,
      take: opcoes.tamanho,
    }),
  ]);
  return { total, pagina: opcoes.pagina, linhas: vinculos.map((v) => montarLinha(v, agora)) };
}
