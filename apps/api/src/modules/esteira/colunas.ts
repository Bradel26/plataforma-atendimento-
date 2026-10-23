/**
 * Colunas da Lista das esteiras (spec 6.3) — puro, sem banco.
 *
 * Cada operação tem as colunas comuns (cadastro central + vínculo) e as da sua
 * tabela 1:1 (spec 4.5/4.6). `editavel` só onde a edição do vínculo aceita
 * (responsável, observações, campos da operação); o cadastro central (CNPJ,
 * CPF, telefone, cidade) não se edita aqui. `ordenavel` sai de haver uma
 * ordenação no banco para a coluna (`ordenacaoDaColuna`).
 */
import type { Operacao, Prisma } from '@prisma/client';
import { MOTIVOS_PERDA } from './catalogo';
import { prontoTim, type CamposTim } from './tim';
import type { VinculoDetalhe, VinculoResumo } from './vinculos.service';

export type ColunaEsteira = {
  chave: string;
  rotulo: string;
  tipo: 'texto' | 'data' | 'booleano3' | 'enum' | 'numero';
  opcoes?: Array<{ valor: string; rotulo: string }>;
  editavel: boolean;
  /** Onde a coluna se edita no PATCH do vínculo (`responsavelId`, `observacoes`, `campos.<campo>`). */
  campo?: string;
  /** Visível quando o usuário ainda não escolheu as colunas. */
  padrao: boolean;
  ordenavel: boolean;
};

export type ValorColuna = string | number | boolean | null;

/** Linha da Lista: o resumo do card (sem destinos) mais o valor de cada coluna da operação. */
export type VinculoLinha = Omit<VinculoResumo, 'destinos'> & { valores: Record<string, ValorColuna> };

/** O que basta para calcular as colunas (o detalhe do vínculo tem tudo isso). */
export type FonteDaColuna = Pick<
  VinculoDetalhe,
  | 'operacao'
  | 'parceiro'
  | 'responsavel'
  | 'etapa'
  | 'situacao'
  | 'diasNaEtapa'
  | 'ultimaInteracaoEm'
  | 'criadoEm'
  | 'observacoes'
  | 'campos'
>;

type Direcao = 'asc' | 'desc';
type Ordenacao = Prisma.CredenciamentoOrderByWithRelationInput;

/** Definição interna: a coluna, como ler o valor e como ordenar no banco. */
type Definicao = Omit<ColunaEsteira, 'ordenavel'> & {
  valor: (v: FonteDaColuna) => unknown;
  ordenar?: (d: Direcao) => Ordenacao[];
};

const inverter = (d: Direcao): Direcao => (d === 'asc' ? 'desc' : 'asc');
const opcoes = (o: Record<string, string>) => Object.entries(o).map(([valor, rotulo]) => ({ valor, rotulo }));

// ---------------------------------------------------------------------------
// Comuns
// ---------------------------------------------------------------------------

const SITUACOES: Record<Operacao, Record<string, string>> = {
  TIM: { EM_ANDAMENTO: 'Em andamento', DESISTENTE: 'Desistente', DESCREDENCIADO: 'Descredenciado' },
  STARLINK: { EM_ANDAMENTO: 'Em andamento', NURTURE: 'Nurture', DESCARTADO: 'Descartado' },
};

const comuns = (operacao: Operacao): Definicao[] => [
  {
    chave: 'parceiro',
    rotulo: 'Parceiro',
    tipo: 'texto',
    editavel: false,
    padrao: true,
    valor: (v) => v.parceiro.nome,
    // O nome exibido é o da conta, senão o do contato: ordena pelos dois nessa ordem.
    ordenar: (d) => [{ conta: { nome: d } }, { contato: { nome: d } }],
  },
  { chave: 'cnpj', rotulo: 'CNPJ', tipo: 'texto', editavel: false, padrao: operacao === 'TIM', valor: (v) => v.parceiro.cnpj },
  { chave: 'cpf', rotulo: 'CPF', tipo: 'texto', editavel: false, padrao: false, valor: (v) => v.parceiro.cpf },
  { chave: 'telefone', rotulo: 'Telefone', tipo: 'texto', editavel: false, padrao: true, valor: (v) => v.parceiro.telefone },
  {
    chave: 'cidade',
    rotulo: 'Cidade',
    tipo: 'texto',
    editavel: false,
    padrao: true,
    valor: (v) => v.parceiro.cidade,
    ordenar: (d) => [{ contato: { cidade: d } }],
  },
  {
    chave: 'uf',
    rotulo: 'UF',
    tipo: 'texto',
    editavel: false,
    padrao: true,
    valor: (v) => v.parceiro.uf,
    ordenar: (d) => [{ contato: { uf: d } }],
  },
  {
    chave: 'responsavel',
    rotulo: 'Responsável',
    tipo: 'texto',
    editavel: true,
    campo: 'responsavelId',
    padrao: true,
    valor: (v) => v.responsavel?.nome ?? null,
    ordenar: (d) => [{ responsavel: { nome: d } }],
  },
  {
    chave: 'etapa',
    rotulo: 'Etapa',
    tipo: 'texto',
    editavel: false,
    padrao: true,
    valor: (v) => v.etapa.nome,
    ordenar: (d) => [{ estagio: { ordem: d } }],
  },
  {
    chave: 'situacao',
    rotulo: 'Situação',
    tipo: 'enum',
    opcoes: opcoes(SITUACOES[operacao]),
    editavel: false,
    padrao: false,
    valor: (v) => v.situacao,
  },
  {
    chave: 'diasNaEtapa',
    rotulo: 'Dias na etapa',
    tipo: 'numero',
    editavel: false,
    padrao: true,
    valor: (v) => v.diasNaEtapa,
    // Mais dias na etapa = entrou nela antes.
    ordenar: (d) => [{ estagioDesde: inverter(d) }],
  },
  {
    chave: 'ultimaInteracaoEm',
    rotulo: 'Última interação',
    tipo: 'data',
    editavel: false,
    padrao: true,
    valor: (v) => v.ultimaInteracaoEm,
    ordenar: (d) => [{ ultimaInteracaoEm: d }],
  },
  {
    chave: 'criadoEm',
    rotulo: 'Entrada',
    tipo: 'data',
    editavel: false,
    padrao: false,
    valor: (v) => v.criadoEm,
    ordenar: (d) => [{ criadoEm: d }],
  },
  {
    chave: 'observacoes',
    rotulo: 'Observações',
    tipo: 'texto',
    editavel: true,
    campo: 'observacoes',
    padrao: false,
    valor: (v) => v.observacoes,
  },
];

// ---------------------------------------------------------------------------
// Específicas (tabelas 1:1)
// ---------------------------------------------------------------------------

type ColunaDeCampo = {
  chave: string;
  /** Campo da tabela 1:1; padrão: a própria chave. */
  campo?: string;
  rotulo: string;
  tipo: ColunaEsteira['tipo'];
  opcoes?: Record<string, string>;
  editavel?: boolean;
  padrao?: boolean;
};

/** Coluna lida de `campos` e ordenada pela relação 1:1 da operação. */
const deCampo = (relacao: 'tim' | 'starlink', c: ColunaDeCampo): Definicao => {
  const campo = c.campo ?? c.chave;
  const editavel = c.editavel ?? true;
  return {
    chave: c.chave,
    rotulo: c.rotulo,
    tipo: c.tipo,
    ...(c.opcoes ? { opcoes: opcoes(c.opcoes) } : {}),
    editavel,
    ...(editavel ? { campo: `campos.${campo}` } : {}),
    padrao: c.padrao ?? false,
    valor: (v) => (v.campos as Record<string, unknown>)[campo] ?? null,
    ordenar: (d) => [{ [relacao]: { [campo]: d } } as Ordenacao],
  };
};

const STATUS_ITEM = { PENDENTE: 'Pendente', CONCLUIDO: 'Concluído' };
/** Tri-estado (Sim/Não/—): nulo é "não respondido", nunca Não. */
const tri = (chave: string, rotulo: string, extra: Partial<ColunaDeCampo> = {}): ColunaDeCampo => ({
  chave,
  rotulo,
  tipo: 'booleano3',
  ...extra,
});

const especificasTim: Definicao[] = [
  ...[
    { chave: 'origem', rotulo: 'Origem', tipo: 'enum', opcoes: { MANUAL: 'Manual', PLANILHA: 'Planilha' }, editavel: false },
    { chave: 'flagTrafegoPago', rotulo: 'Tráfego pago', tipo: 'booleano3' },
    { chave: 'statusDescritivo', rotulo: 'Status (aceite comercial)', tipo: 'texto' },
    { chave: 'dep', rotulo: 'DEP', tipo: 'enum', opcoes: { TIM: 'TIM', PARCEIRO: 'Parceiro', BRADEL: 'Bradel' }, padrao: true },
    { chave: 'dataCredenciamento', rotulo: 'Data do credenciamento', tipo: 'data' },
    { chave: 'matriculaSappdv', rotulo: 'Matrícula SAPPDV', tipo: 'texto' },
    { chave: 'promoStatus', rotulo: 'Promo status', tipo: 'texto' },
    { chave: 'tipoCarteira', rotulo: 'Tipo de carteira', tipo: 'texto' },
    tri('sistemaTimVendas', 'TIM Vendas'),
    tri('sistemaGn', 'GN'),
    tri('sistemaTimFormaMais', 'TIM Forma Mais'),
    tri('sistemaPortalFornecedor', 'Portal do Fornecedor'),
    tri('sistemaMeuTim', 'Meu TIM'),
    { chave: 'compraChip', rotulo: 'Compra de chip', tipo: 'enum', opcoes: STATUS_ITEM },
    { chave: 'treinamento', rotulo: 'Treinamento', tipo: 'enum', opcoes: STATUS_ITEM },
    {
      chave: 'statusParceria',
      rotulo: 'Status da parceria',
      tipo: 'enum',
      opcoes: { ATIVO: 'Ativo', DESISTENTE: 'Desistente', DESCREDENCIADO: 'Descredenciado' },
      // O serviço mantém em sincronia com a etapa.
      editavel: false,
    },
  ].map((c) => deCampo('tim', c as ColunaDeCampo)),
  {
    chave: 'vendaLiberada',
    rotulo: 'Venda liberada',
    tipo: 'booleano3',
    editavel: false,
    padrao: true,
    // Calculada ("pronto"), não é coluna do banco.
    valor: (v) => (v.operacao === 'TIM' ? prontoTim(v.campos as CamposTim) : null),
  },
];

const especificasStarlink: Definicao[] = [
  {
    chave: 'tipoCaptacao',
    rotulo: 'Captação',
    tipo: 'enum',
    opcoes: { LEAD_INBOUND: 'Lead inbound', PROSPECCAO_ATIVA: 'Prospecção ativa' },
    padrao: true,
  },
  { chave: 'primeiroContatoEm', rotulo: 'Primeiro contato', tipo: 'data' },
  tri('cnpjApto', 'CNPJ apto'),
  tri('mei', 'MEI'),
  tri('altCnae', 'Alteração de CNAE'),
  tri('vsm', 'VSM', { padrao: true }),
  {
    chave: 'vivensisStatus',
    rotulo: 'Vivensis',
    tipo: 'enum',
    opcoes: { PENDENTE: 'Pendente', APROVADO: 'Aprovado', REPROVADO: 'Reprovado' },
    padrao: true,
  },
  tri('treinamento', 'Treinamento'),
  // `parceiro` já é a coluna do nome do parceiro.
  tri('ehParceiro', 'Parceiro', { campo: 'parceiro' }),
  tri('contrato', 'Contrato'),
  tri('prontoVenda', 'Pronto p/ venda'),
  tri('perdido', 'Perdido'),
  {
    chave: 'motivoPerda',
    rotulo: 'Motivo da perda',
    tipo: 'enum',
    opcoes: Object.fromEntries(Object.entries(MOTIVOS_PERDA).map(([valor, m]) => [valor, m.rotulo])),
  },
].map((c) => deCampo('starlink', c as ColunaDeCampo));

const DEFINICOES: Record<Operacao, Definicao[]> = {
  TIM: [...comuns('TIM'), ...especificasTim],
  STARLINK: [...comuns('STARLINK'), ...especificasStarlink],
};

const POR_CHAVE: Record<Operacao, Map<string, Definicao>> = {
  TIM: new Map(DEFINICOES.TIM.map((d) => [d.chave, d])),
  STARLINK: new Map(DEFINICOES.STARLINK.map((d) => [d.chave, d])),
};

const publica = ({ valor: _valor, ordenar, ...coluna }: Definicao): ColunaEsteira => ({ ...coluna, ordenavel: !!ordenar });

export const COLUNAS: Record<Operacao, ColunaEsteira[]> = {
  TIM: DEFINICOES.TIM.map(publica),
  STARLINK: DEFINICOES.STARLINK.map(publica),
};

/** Datas viram ISO; o resto passa como está. */
function serializar(valor: unknown): ValorColuna {
  if (valor == null) return null;
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === 'string' || typeof valor === 'number' || typeof valor === 'boolean') return valor;
  return String(valor);
}

/** Valor da coluna para um vínculo (ou uma linha já montada); nulo se a coluna não é da operação. */
export function valorDaColuna(v: FonteDaColuna | VinculoLinha, chave: string): ValorColuna {
  if ('valores' in v) return v.valores[chave] ?? null;
  const def = POR_CHAVE[v.operacao].get(chave);
  return def ? serializar(def.valor(v)) : null;
}

/** Valores de todas as colunas da operação, na ordem das colunas. */
export function valoresDaLinha(v: FonteDaColuna): Record<string, ValorColuna> {
  return Object.fromEntries(DEFINICOES[v.operacao].map((d) => [d.chave, serializar(d.valor(v))]));
}

/**
 * `orderBy` do Prisma para ordenar a Lista pela coluna, com desempate pelo id
 * (paginação estável). Nulo se a coluna não é ordenável ou não é da operação.
 */
export function ordenacaoDaColuna(operacao: Operacao, chave: string, direcao: Direcao): Ordenacao[] | null {
  const ordenar = POR_CHAVE[operacao].get(chave)?.ordenar;
  return ordenar ? [...ordenar(direcao), { id: direcao }] : null;
}
