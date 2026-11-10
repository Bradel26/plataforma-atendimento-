/**
 * Estado da tela da Esteira — puro, sem React (testado com vitest em node).
 *
 * Precedência: URL > preferência salva > padrão (spec 6). A URL carrega a visão
 * e os filtros no MESMO formato que a API lê (`parseFiltros`): listas em CSV e
 * os específicos de operação achatados (`dep`, `vsm`…), para o link ser
 * compartilhável e a query das consultas sair do mesmo lugar.
 */
import type {
  AcessoOperacoes,
  ChaveEtapa,
  DepTim,
  EstruturaEsteira,
  FiltrosEsteira,
  Operacao,
  Situacao,
  TipoCaptacao,
  VivensisStatus,
} from '../../lib/esteiraTypes';

export type Visao = 'kanban' | 'funil' | 'lista';
export type CampoOcultavel = 'responsavel' | 'cidade' | 'etiquetas' | 'ultimaInteracao';
export type FavoritoEsteira = { nome: string; filtros: FiltrosEsteira };
export type TamanhoPagina = 25 | 50 | 100;
/** Período do Funil salvo: relativo ("últimos N dias", nunca envelhece) ou datas fixas do personalizado. */
export type PeriodoFunilPref = { desde?: string; ate?: string } | { dias: number };

export type PreferenciaEsteira = {
  visao: Visao;
  filtros: FiltrosEsteira;
  lista: {
    colunas: string[];
    larguras: Record<string, number>;
    ordenacao: { chave: string; direcao: 'asc' | 'desc' } | null;
    tamanhoPagina: TamanhoPagina;
  };
  funil: { periodo: PeriodoFunilPref; comparar: boolean };
  kanban: { recolhidas: string[]; densidade: 'compacta' | 'detalhada'; camposOcultos: CampoOcultavel[] };
  favoritos: FavoritoEsteira[];
};

/** Props comuns das três visões (Kanban, Funil, Lista). */
export type PropsDaVisao = {
  operacao: Operacao;
  estrutura: EstruturaEsteira;
  /** Filtros em vigor (URL > preferência); a query das consultas sai de `queryDosFiltros`. */
  filtros: FiltrosEsteira;
  pref: PreferenciaEsteira;
  /** Grava parte da preferência da operação (debounce no servidor). */
  atualizarPref: (p: Partial<PreferenciaEsteira>) => void;
  /** Troca de visão já com outros filtros (ex.: Funil → Lista da etapa); entra no histórico. */
  irPara: (visao: Visao, filtros: FiltrosEsteira) => void;
};

export const VISOES: readonly Visao[] = ['kanban', 'funil', 'lista'];
export const OPERACOES: readonly Operacao[] = ['TIM', 'STARLINK'];
export const LIMITE_FAVORITOS = 20;
export const TAMANHOS_PAGINA: readonly TamanhoPagina[] = [25, 50, 100];
const TAMANHO_PAGINA_PADRAO: TamanhoPagina = 50;
const DIAS_FUNIL_PADRAO = 90;
const DIAS_FUNIL_MAX = 3650;
export const TAMANHO_NOME_FAVORITO = 60;
const CAMPOS_OCULTAVEIS: readonly CampoOcultavel[] = ['responsavel', 'cidade', 'etiquetas', 'ultimaInteracao'];
const LARGURA_MIN = 60;
const LARGURA_MAX = 800;

// Valores aceitos (os mesmos enums do `filtros.ts` da API).
const SITUACOES: readonly Situacao[] = ['EM_ANDAMENTO', 'DESISTENTE', 'DESCREDENCIADO', 'NURTURE', 'DESCARTADO'];
const DEPS: readonly DepTim[] = ['TIM', 'PARCEIRO', 'BRADEL'];
const CAPTACOES: readonly TipoCaptacao[] = ['LEAD_INBOUND', 'PROSPECCAO_ATIVA'];
const VIVENSIS: readonly VivensisStatus[] = ['PENDENTE', 'APROVADO', 'REPROVADO'];
const VSM = ['SIM', 'NAO', 'VAZIO'] as const;
const PERIODOS = ['criadoEm', 'estagioDesde'] as const;
const CHAVES_ETAPA = new Set<string>([
  'TIM_NEGOCIACAO', 'TIM_DOCUMENTACAO', 'TIM_CRED_ANDAMENTO', 'TIM_CRED_OK', 'TIM_POS_CRED',
  'TIM_VENDA_LIBERADA', 'TIM_ACOMPANHAMENTO', 'TIM_DESISTENCIA', 'TIM_DESCREDENCIADO',
  'SL_AGUARDANDO', 'SL_EM_ATENDIMENTO', 'SL_MEI', 'SL_ALT_CNAE', 'SL_CREDENCIAMENTO',
  'SL_TREINAMENTO', 'SL_PARCEIRO', 'SL_CONTRATO', 'SL_PRONTO_VENDA', 'SL_NURTURE', 'SL_DESCARTADO',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UF = /^[A-Z]{2}$/;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// ---------------------------------------------------------------------------
// Normalização dos filtros (vale para a URL e para a preferência)
// ---------------------------------------------------------------------------

/** Lista de strings válidas, sem repetição; aceita array ou CSV. Vazia → indefinida. */
function listaDe<T extends string>(valor: unknown, valida: (s: string) => s is T): T[] | undefined;
function listaDe(valor: unknown, valida: (s: string) => boolean): string[] | undefined;
function listaDe(valor: unknown, valida: (s: string) => boolean): string[] | undefined {
  const brutos = Array.isArray(valor) ? valor : typeof valor === 'string' ? valor.split(',') : [];
  const itens = [...new Set(brutos.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean))];
  const validos = itens.filter(valida).slice(0, 200);
  return validos.length ? validos : undefined;
}

const de = <T extends string>(lista: readonly T[]) => (s: string): s is T => (lista as readonly string[]).includes(s);

function booleano(v: unknown): boolean | undefined {
  if (v === true || v === 'true' || v === '1') return true;
  if (v === false || v === 'false' || v === '0') return false;
  return undefined;
}

function inteiro(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= 3650 ? n : undefined;
}

const dia = (v: unknown) => (typeof v === 'string' && DIA.test(v) && !Number.isNaN(Date.parse(v)) ? v : undefined);

/** Objeto sem chaves `undefined` (para comparar e serializar limpo). */
function definidos<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/**
 * Filtros válidos a partir de um objeto qualquer. Os específicos podem vir
 * agrupados (`tim`/`starlink`, como na preferência) ou achatados (como na URL).
 * Com `etapasValidas`, descarta etapas que não existem na estrutura.
 */
export function normalizarFiltros(valor: unknown, etapasValidas?: Set<string>): FiltrosEsteira {
  if (!ehObjeto(valor)) return {};
  const tim = ehObjeto(valor.tim) ? valor.tim : valor;
  const starlink = ehObjeto(valor.starlink) ? valor.starlink : valor;
  const busca = typeof valor.busca === 'string' ? valor.busca.trim().slice(0, 120) : '';
  const filtrosTim = definidos({
    dep: listaDe(tim.dep, de(DEPS)),
    trafegoPago: booleano(tim.trafegoPago),
    vendaLiberada: booleano(tim.vendaLiberada),
  });
  const filtrosStarlink = definidos({
    tipoCaptacao: listaDe(starlink.tipoCaptacao, de(CAPTACOES)),
    vivensis: listaDe(starlink.vivensis, de(VIVENSIS)),
    vsm: de(VSM)(String(starlink.vsm ?? '')) ? (starlink.vsm as (typeof VSM)[number]) : undefined,
  });
  return definidos({
    busca: busca || undefined,
    responsavelIds: listaDe(valor.responsavelIds, (s) => UUID.test(s)),
    ufs: listaDe(valor.ufs, (s) => UF.test(s)),
    cidades: listaDe(valor.cidades, (s) => s.length <= 120),
    etapas: listaDe(valor.etapas, (s): s is ChaveEtapa => CHAVES_ETAPA.has(s) && (!etapasValidas || etapasValidas.has(s))),
    passouPorEtapa:
      typeof valor.passouPorEtapa === 'string' &&
      CHAVES_ETAPA.has(valor.passouPorEtapa) &&
      (!etapasValidas || etapasValidas.has(valor.passouPorEtapa))
        ? (valor.passouPorEtapa as ChaveEtapa)
        : undefined,
    situacoes: listaDe(valor.situacoes, de(SITUACOES)),
    periodoCampo: de(PERIODOS)(String(valor.periodoCampo ?? '')) ? (valor.periodoCampo as (typeof PERIODOS)[number]) : undefined,
    desde: dia(valor.desde),
    ate: dia(valor.ate),
    paradoHaMaisDe: inteiro(valor.paradoHaMaisDe),
    origem: listaDe(valor.origem, (s) => s.length <= 40),
    tim: Object.keys(filtrosTim).length ? filtrosTim : undefined,
    starlink: Object.keys(filtrosStarlink).length ? filtrosStarlink : undefined,
  });
}

/** Quantos filtros estão preenchidos (período conta uma vez; `periodoCampo` sozinho não conta). */
export function quantosFiltros(f: FiltrosEsteira): number {
  const n = normalizarFiltros(f);
  const comuns = (['busca', 'responsavelIds', 'ufs', 'cidades', 'etapas', 'passouPorEtapa', 'situacoes', 'paradoHaMaisDe', 'origem'] as const).filter(
    (k) => n[k] !== undefined,
  ).length;
  return comuns + (n.desde || n.ate ? 1 : 0) + Object.keys(n.tim ?? {}).length + Object.keys(n.starlink ?? {}).length;
}

// ---------------------------------------------------------------------------
// URL e query string
// ---------------------------------------------------------------------------

/** Query string dos filtros no formato aceito por `parseFiltros` da API (só os preenchidos). */
export function queryDosFiltros(f: FiltrosEsteira): URLSearchParams {
  const n = normalizarFiltros(f);
  const q = new URLSearchParams();
  const por = (chave: string, v: string | number | boolean | string[] | undefined) => {
    if (v === undefined) return;
    q.set(chave, Array.isArray(v) ? v.join(',') : String(v));
  };
  por('busca', n.busca);
  por('responsavelIds', n.responsavelIds);
  por('ufs', n.ufs);
  por('cidades', n.cidades);
  por('etapas', n.etapas);
  por('passouPorEtapa', n.passouPorEtapa);
  por('situacoes', n.situacoes);
  por('periodoCampo', n.periodoCampo);
  por('desde', n.desde);
  por('ate', n.ate);
  por('paradoHaMaisDe', n.paradoHaMaisDe);
  por('origem', n.origem);
  por('dep', n.tim?.dep);
  por('trafegoPago', n.tim?.trafegoPago);
  por('vendaLiberada', n.tim?.vendaLiberada);
  por('tipoCaptacao', n.starlink?.tipoCaptacao);
  por('vivensis', n.starlink?.vivensis);
  por('vsm', n.starlink?.vsm);
  return q;
}

/** `?visao=...&<filtros>` — só os filtros não vazios. */
export function urlDoEstado(visao: Visao, filtros: FiltrosEsteira): string {
  const q = new URLSearchParams({ visao });
  for (const [k, v] of queryDosFiltros(filtros)) q.set(k, v);
  return `?${q.toString()}`;
}

/** Visão e filtros presentes na URL; ausentes (ou inválidos) ficam de fora. */
export function estadoDaUrl(search: string): { visao?: Visao; filtros?: Partial<FiltrosEsteira> } {
  const q = new URLSearchParams(search);
  const visao = q.get('visao');
  const filtros = normalizarFiltros(Object.fromEntries(q.entries()));
  return definidos({
    visao: visao && de(VISOES)(visao) ? visao : undefined,
    filtros: Object.keys(filtros).length ? filtros : undefined,
  });
}

// ---------------------------------------------------------------------------
// Preferência
// ---------------------------------------------------------------------------

export function preferenciaPadrao(estrutura: EstruturaEsteira): PreferenciaEsteira {
  return {
    visao: 'kanban',
    filtros: {},
    lista: {
      colunas: estrutura.colunas.filter((c) => c.padrao).map((c) => c.chave),
      larguras: {},
      ordenacao: null,
      tamanhoPagina: TAMANHO_PAGINA_PADRAO,
    },
    funil: { periodo: { dias: DIAS_FUNIL_PADRAO }, comparar: false },
    kanban: {
      recolhidas: estrutura.etapas.filter((e) => e.tipo !== 'NORMAL').map((e) => e.chave),
      densidade: 'detalhada',
      camposOcultos: [],
    },
    favoritos: [],
  };
}

/** Período do Funil salvo → válido: dias inteiros 1..3650, ou datas válidas com início antes do fim. */
function normalizarPeriodoFunil(valor: unknown): PeriodoFunilPref {
  const padrao = { dias: DIAS_FUNIL_PADRAO };
  if (!ehObjeto(valor)) return padrao;
  if ('dias' in valor) {
    const n = valor.dias;
    return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= DIAS_FUNIL_MAX ? { dias: n } : padrao;
  }
  const desde = dia(valor.desde);
  const ate = dia(valor.ate);
  if ((valor.desde !== undefined && !desde) || (valor.ate !== undefined && !ate) || (!desde && !ate)) return padrao;
  if (desde && ate && desde > ate) return padrao;
  return definidos({ desde, ate });
}

function normalizarFavoritos(valor: unknown, etapas: Set<string>): FavoritoEsteira[] {
  if (!Array.isArray(valor)) return [];
  const vistos = new Set<string>();
  const saida: FavoritoEsteira[] = [];
  for (const item of valor) {
    if (!ehObjeto(item) || typeof item.nome !== 'string') continue;
    const nome = item.nome.trim().slice(0, TAMANHO_NOME_FAVORITO);
    const chave = nome.toLocaleLowerCase('pt-BR');
    if (!nome || vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push({ nome, filtros: normalizarFiltros(item.filtros, etapas) });
    if (saida.length >= LIMITE_FAVORITOS) break;
  }
  return saida;
}

/**
 * Preferência salva → preferência válida para esta estrutura. Tolera lixo e
 * versões antigas: o que não se reconhece volta ao padrão; colunas e etapas que
 * não existem (ou mudaram de operação) somem.
 */
export function normalizarPreferencia(valor: unknown, estrutura: EstruturaEsteira): PreferenciaEsteira {
  const padrao = preferenciaPadrao(estrutura);
  if (!ehObjeto(valor)) return padrao;
  const etapas = new Set<string>(estrutura.etapas.map((e) => e.chave));
  const colunas = new Map(estrutura.colunas.map((c) => [c.chave, c]));

  const lista = ehObjeto(valor.lista) ? valor.lista : {};
  const escolhidas = Array.isArray(lista.colunas) ? listaDe(lista.colunas, (s) => colunas.has(s)) : undefined;
  const larguras = ehObjeto(lista.larguras)
    ? Object.fromEntries(
        Object.entries(lista.larguras).flatMap(([k, v]) =>
          colunas.has(k) && typeof v === 'number' && Number.isFinite(v)
            ? [[k, Math.round(Math.min(LARGURA_MAX, Math.max(LARGURA_MIN, v)))]]
            : [],
        ),
      )
    : {};
  const ord = ehObjeto(lista.ordenacao) ? lista.ordenacao : null;
  const ordenacao =
    ord && typeof ord.chave === 'string' && colunas.get(ord.chave)?.ordenavel && (ord.direcao === 'asc' || ord.direcao === 'desc')
      ? { chave: ord.chave, direcao: ord.direcao as 'asc' | 'desc' }
      : null;

  const kanban = ehObjeto(valor.kanban) ? valor.kanban : {};
  const recolhidas = Array.isArray(kanban.recolhidas)
    ? (listaDe(kanban.recolhidas, (s) => etapas.has(s)) ?? [])
    : padrao.kanban.recolhidas;

  const tamanhoPagina = TAMANHOS_PAGINA.find((t) => t === lista.tamanhoPagina) ?? TAMANHO_PAGINA_PADRAO;
  const funil = ehObjeto(valor.funil) ? valor.funil : {};

  return {
    visao: typeof valor.visao === 'string' && de(VISOES)(valor.visao) ? valor.visao : 'kanban',
    filtros: normalizarFiltros(valor.filtros, etapas),
    lista: { colunas: escolhidas ?? padrao.lista.colunas, larguras, ordenacao, tamanhoPagina },
    funil: { periodo: normalizarPeriodoFunil(funil.periodo), comparar: funil.comparar === true },
    kanban: {
      recolhidas,
      densidade: kanban.densidade === 'compacta' ? 'compacta' : 'detalhada',
      camposOcultos: listaDe(kanban.camposOcultos, de(CAMPOS_OCULTAVEIS)) ?? [],
    },
    favoritos: normalizarFavoritos(valor.favoritos, etapas),
  };
}

// ---------------------------------------------------------------------------
// Favoritos
// ---------------------------------------------------------------------------

/** Salva (ou substitui pelo nome, sem diferenciar caixa) um filtro favorito. */
export function salvarFavorito(
  lista: FavoritoEsteira[],
  nome: string,
  filtros: FiltrosEsteira,
): FavoritoEsteira[] | 'SEM_NOME' | 'LIMITE' {
  const limpo = nome.trim().slice(0, TAMANHO_NOME_FAVORITO);
  if (!limpo) return 'SEM_NOME';
  const chave = limpo.toLocaleLowerCase('pt-BR');
  const novo = { nome: limpo, filtros: normalizarFiltros(filtros) };
  const indice = lista.findIndex((f) => f.nome.toLocaleLowerCase('pt-BR') === chave);
  if (indice >= 0) return lista.map((f, i) => (i === indice ? novo : f));
  if (lista.length >= LIMITE_FAVORITOS) return 'LIMITE';
  return [...lista, novo];
}

export const apagarFavorito = (lista: FavoritoEsteira[], nome: string): FavoritoEsteira[] => lista.filter((f) => f.nome !== nome);

// ---------------------------------------------------------------------------
// Operação da rota
// ---------------------------------------------------------------------------

/** Operações acessíveis, na ordem fixa TIM → Starlink. */
export const operacoesPermitidas = (acesso: AcessoOperacoes | undefined): Operacao[] =>
  OPERACOES.filter((o) => {
    const nivel = acesso?.[o];
    return nivel === 'LEITURA' || nivel === 'EDICAO';
  });

/** `tim`/`starlink` da URL (sem diferenciar caixa). */
export function operacaoDoParametro(s: string | undefined): Operacao | null {
  const v = s?.toLowerCase();
  return v === 'tim' ? 'TIM' : v === 'starlink' ? 'STARLINK' : null;
}

export const parametroDaOperacao = (o: Operacao) => o.toLowerCase();

/** Para onde `/esteira` leva: a última operação usada (preferência `{ operacao }`) se permitida, senão a primeira. */
export function operacaoInicial(permitidas: Operacao[], ultima: unknown): Operacao | null {
  const salva = ehObjeto(ultima) && typeof ultima.operacao === 'string' ? (ultima.operacao as Operacao) : null;
  if (salva && permitidas.includes(salva)) return salva;
  return permitidas[0] ?? null;
}

// Chaves de preferência (spec 4.10).
export const CHAVE_ULTIMA_OPERACAO = 'esteira:ultimaOperacao';
export const chavePreferencia = (o: Operacao) => `esteira:${o}`;
export const chaveFavoritos = (o: Operacao) => `esteira:${o}:favoritos`;
