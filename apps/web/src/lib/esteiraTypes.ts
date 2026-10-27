/**
 * Tipos das esteiras TIM e Starlink (`/api/esteiras/:operacao/...`), espelhando
 * o JSON que a API devolve (datas em string ISO). Fonte: `apps/api/src/modules/esteira`
 * — `consultas.service.ts`, `vinculos.service.ts`, `colunas.ts`, `filtros.ts`,
 * `funil.ts`, `movimento.ts`, `tipos.ts`, `acesso.ts`, `planilhas.service.ts`.
 * Reexportados por `lib/types.ts`.
 */

export type Operacao = 'TIM' | 'STARLINK';
export type NivelOperacao = 'SEM_ACESSO' | 'LEITURA' | 'EDICAO';
/** Nível efetivo por operação (`/auth/me` e sessão); operação sem acesso não aparece. */
export type AcessoOperacoes = Partial<Record<Operacao, NivelOperacao>>;

export type ChaveTim =
  | 'TIM_NEGOCIACAO'
  | 'TIM_DOCUMENTACAO'
  | 'TIM_CRED_ANDAMENTO'
  | 'TIM_CRED_OK'
  | 'TIM_POS_CRED'
  | 'TIM_VENDA_LIBERADA'
  | 'TIM_ACOMPANHAMENTO'
  | 'TIM_DESISTENCIA'
  | 'TIM_DESCREDENCIADO';
export type ChaveStarlink =
  | 'SL_AGUARDANDO'
  | 'SL_EM_ATENDIMENTO'
  | 'SL_MEI'
  | 'SL_ALT_CNAE'
  | 'SL_CREDENCIAMENTO'
  | 'SL_TREINAMENTO'
  | 'SL_PARCEIRO'
  | 'SL_CONTRATO'
  | 'SL_PRONTO_VENDA'
  | 'SL_NURTURE'
  | 'SL_DESCARTADO';
export type ChaveEtapa = ChaveTim | ChaveStarlink;

export type TipoEtapa = 'NORMAL' | 'DESVIO' | 'SAIDA';
export type PapelDoEstagio = 'NOVO' | 'ANALISE' | 'PENDENCIA' | 'APROVACAO' | 'CREDENCIADO' | 'ATIVO' | 'OUTRO';
export type Situacao = 'EM_ANDAMENTO' | 'DESISTENTE' | 'DESCREDENCIADO' | 'NURTURE' | 'DESCARTADO';
export type TipoHistoricoEsteira = 'MOVIMENTO' | 'EXCECAO' | 'AUTOMATICO' | 'SAIDA' | 'REATIVACAO' | 'IMPORTACAO' | 'CORRECAO';
export type ClasseMotivo = 'RECUPERAVEL' | 'DEFINITIVO';

export type DepTim = 'TIM' | 'PARCEIRO' | 'BRADEL';
export type OrigemTim = 'MANUAL' | 'PLANILHA';
export type StatusItemTim = 'PENDENTE' | 'CONCLUIDO';
export type StatusParceria = 'ATIVO' | 'DESISTENTE' | 'DESCREDENCIADO';
export type TipoCaptacao = 'LEAD_INBOUND' | 'PROSPECCAO_ATIVA';
export type VivensisStatus = 'PENDENTE' | 'APROVADO' | 'REPROVADO';
export type MotivoPerdaStarlink =
  | 'NAO_RESPONDEU'
  | 'SEM_CONTATO'
  | 'OUTRO_PARCEIRO'
  | 'SEM_ESTRUTURA'
  | 'SEM_INTERESSE'
  | 'SEM_PERFIL'
  | 'CNPJ_IRREGULAR'
  | 'REPROVADO_VIVENSIS'
  | 'OUTRO';

// ---------------------------------------------------------------------------
// Regras de movimento
// ---------------------------------------------------------------------------

/** Resultado da avaliação de um movimento de etapa (`tipos.ts`). */
export type Avaliacao =
  | { resultado: 'LIVRE'; tipo: TipoHistoricoEsteira; exigeMotivo?: boolean }
  | { resultado: 'JUSTIFICATIVA'; tipo: 'CORRECAO' | 'REATIVACAO' }
  | { resultado: 'EXCECAO'; pendencias: string[] }
  | { resultado: 'PROIBIDO'; motivo: string };

/** Para cada etapa ativa da operação, o resultado de mover para ela (a atual é PROIBIDO). */
export type Destinos = Partial<Record<ChaveEtapa, Avaliacao['resultado']>>;

export type AvisoVinculo = 'DADOS_PENDENTES' | 'SUGERE_DESCARTE' | 'PRONTO_DESFEITO';

/** Códigos de erro do `POST .../mover` (o `details` traz `pendencias`/`resultado`). */
export type CodigoErroMovimento = 'TRANSICAO_PROIBIDA' | 'EXCECAO_NAO_AUTORIZADA' | 'EXIGE_JUSTIFICATIVA' | 'EXIGE_MOTIVO';

// ---------------------------------------------------------------------------
// Estrutura (`GET /esteiras/:operacao/estrutura`)
// ---------------------------------------------------------------------------

export type Opcao = { valor: string; rotulo: string };

export type ColunaEsteira = {
  chave: string;
  rotulo: string;
  /** `booleano`: Sim/Não (coluna não nula); `booleano3`: Sim/Não/— (nulo = não respondido). */
  tipo: 'texto' | 'data' | 'booleano' | 'booleano3' | 'enum' | 'numero';
  opcoes?: Opcao[];
  editavel: boolean;
  /** Onde a coluna se edita no PATCH do vínculo (`responsavelId`, `observacoes`, `campos.<campo>`). */
  campo?: string;
  /** Visível quando o usuário ainda não escolheu as colunas. */
  padrao: boolean;
  ordenavel: boolean;
};

export type FiltroEspecifico = { chave: string; rotulo: string; tipo: 'enum' | 'booleano'; multiplo: boolean; opcoes?: Opcao[] };

export type EtapaEsteira = {
  chave: ChaveEtapa;
  /** Nome atual (renomeável pelo ADMIN). */
  nome: string;
  tipo: TipoEtapa;
  ordem: number;
  papel: PapelDoEstagio | null;
  /** Posição no trilho principal; desvios e saídas: nulo. */
  trilho: number | null;
  id: string;
  /** Limite configurado; `diasParadoEfetivo` é o em vigor (padrão 7; saída: nulo). */
  diasParado: number | null;
  diasParadoEfetivo: number | null;
  ativa: boolean;
};

export type EstruturaEsteira = {
  operacao: Operacao;
  etapas: EtapaEsteira[];
  colunas: ColunaEsteira[];
  motivosPerda: Array<{ valor: MotivoPerdaStarlink; rotulo: string; classe: ClasseMotivo }>;
  filtrosEspecificos: FiltroEspecifico[];
  /** Valores aceitos no filtro comum `origem`. */
  origens: Opcao[];
  /** Ausente no JSON quando indefinido. */
  nivel?: NivelOperacao;
  podeForcar: boolean;
};

// ---------------------------------------------------------------------------
// Vínculo (card, linha, detalhe)
// ---------------------------------------------------------------------------

export type VinculoResumo = {
  id: string;
  operacao: Operacao;
  parceiro: {
    contatoId: string;
    contaId: string | null;
    nome: string;
    cnpj: string | null;
    cpf: string | null;
    telefone: string | null;
    cidade: string | null;
    uf: string | null;
  };
  responsavel: { id: string; nome: string } | null;
  etapa: { chave: ChaveEtapa | null; nome: string; tipo: TipoEtapa; diasParado: number | null };
  diasNaEtapa: number;
  parado: boolean;
  ultimaInteracaoEm: string;
  etiquetas: string[];
  destinos: Destinos;
};

export type ValorColuna = string | number | boolean | null;

/** Linha da Lista: o resumo sem destinos mais o valor de cada coluna da operação. */
export type VinculoLinha = Omit<VinculoResumo, 'destinos'> & { valores: Record<string, ValorColuna> };

export type CamposTim = {
  origem: OrigemTim | null;
  flagTrafegoPago: boolean;
  statusDescritivo: string | null;
  dep: DepTim | null;
  dataCredenciamento: string | null;
  matriculaSappdv: string | null;
  promoStatus: string | null;
  tipoCarteira: string | null;
  sistemaTimVendas: boolean | null;
  sistemaGn: boolean | null;
  sistemaTimFormaMais: boolean | null;
  sistemaPortalFornecedor: boolean | null;
  sistemaMeuTim: boolean | null;
  compraChip: StatusItemTim | null;
  treinamento: StatusItemTim | null;
  statusParceria: StatusParceria | null;
};

/** Tri-estados: `null` = não respondido, nunca NÃO. */
export type CamposStarlink = {
  tipoCaptacao: TipoCaptacao | null;
  primeiroContatoEm: string | null;
  cnpjApto: boolean | null;
  mei: boolean | null;
  altCnae: boolean | null;
  vsm: boolean | null;
  treinamento: boolean | null;
  parceiro: boolean | null;
  contrato: boolean | null;
  prontoVenda: boolean | null;
  perdido: boolean | null;
  vivensisStatus: VivensisStatus | null;
  motivoPerda: MotivoPerdaStarlink | null;
};

export type VendedorPdv = {
  id: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  status: string;
  criadoEm: string;
  atualizadoEm: string;
};

export type HistoricoVinculo = {
  id: string;
  tipo: TipoHistoricoEsteira;
  de: { id: string; nome: string; chave: string | null } | null;
  para: { id: string; nome: string; chave: string | null };
  motivo: string | null;
  observacao: string | null;
  usuario: { id: string; nome: string } | null;
  segundosNoEstagio: number | null;
  criadoEm: string;
};

export type VinculoDetalhe = VinculoResumo & {
  campos: CamposTim | CamposStarlink;
  /** Só TIM. */
  vendedores?: VendedorPdv[];
  notas: Array<{ id: string; texto: string; autorId: string | null; criadoEm: string }>;
  historico: HistoricoVinculo[];
  auditoria: Array<{ id: string; campo: string; de: unknown; para: unknown; usuarioId: string | null; criadoEm: string }>;
  situacao: Situacao;
  motivoSituacao: string | null;
  classeMotivo: ClasseMotivo | null;
  situacaoDesde: string | null;
  observacoes: string | null;
  criadoEm: string;
  /** Só TIM. */
  prontoTim?: boolean;
  avisos: AvisoVinculo[];
};

// ---------------------------------------------------------------------------
// Respostas das consultas
// ---------------------------------------------------------------------------

export type ColunaKanban = { chave: ChaveEtapa; total: number; itens: VinculoResumo[]; proximoCursor: string | null };
export type RespostaKanban = { colunas: ColunaKanban[] };
export type RespostaKanbanColuna = { chave: ChaveEtapa; itens: VinculoResumo[]; proximoCursor: string | null };
export type RespostaLista = { total: number; pagina: number; linhas: VinculoLinha[] };

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
export type FunilDoPeriodo = {
  periodo: { desde: string; ate: string; ateExclusivo: boolean };
  total: number;
  etapas: EtapaFunil[];
};
/** `comparado` só quando a consulta traz `compararDesde` e `compararAte`. */
export type RespostaFunil = { atual: FunilDoPeriodo; comparado?: FunilDoPeriodo };

/** Escritas do vínculo devolvem o detalhe atualizado. */
export type RespostaVinculo = { vinculo: VinculoDetalhe };

export type ResultadoImportacao = {
  cabecalhos: string[];
  mapa: Record<string, string | null>;
  total: number;
  validas: number;
  criadas: number;
  atualizadas: number;
  erros: Array<{ linha: number; erros: string[] }>;
  avisos: Array<{ linha: number; avisos: string[] }>;
};

// ---------------------------------------------------------------------------
// Corpos das escritas
// ---------------------------------------------------------------------------

export type CriarVinculoInput = {
  contatoId?: string;
  contaId?: string | null;
  nome?: string;
  empresa?: string;
  cnpj?: string;
  cpf?: string;
  telefone?: string;
  email?: string;
  cidade?: string;
  uf?: string;
  responsavelId?: string | null;
  observacoes?: string | null;
  /** Só Starlink. */
  tipoCaptacao?: TipoCaptacao;
};

export type MoverVinculoInput = {
  paraChave: ChaveEtapa;
  justificativa?: string;
  motivo?: string;
  motivoPerda?: MotivoPerdaStarlink;
};

/** `campos` aceita só os editáveis da operação (TIM: sem `origem`/`statusParceria`). */
export type EditarVinculoInput = {
  campos?: Partial<CamposTim> | Partial<CamposStarlink>;
  responsavelId?: string | null;
  observacoes?: string | null;
  justificativa?: string;
};

// ---------------------------------------------------------------------------
// Filtros (estado da tela; vão na query string no formato de `parseFiltros`)
// ---------------------------------------------------------------------------

/**
 * Filtros da esteira. Datas são dias (`AAAA-MM-DD`, Brasília): `ate` inclui o dia
 * inteiro. Na query string as listas vão em CSV e os específicos de operação
 * vão achatados (`dep`, `vsm`…) — ver `queryDosFiltros`.
 */
export type FiltrosEsteira = {
  busca?: string;
  responsavelIds?: string[];
  ufs?: string[];
  cidades?: string[];
  etapas?: ChaveEtapa[];
  /** Passou (ao menos) por esta etapa do trilho — a mesma regra do Funil. */
  passouPorEtapa?: ChaveEtapa;
  situacoes?: Situacao[];
  periodoCampo?: 'criadoEm' | 'estagioDesde';
  desde?: string;
  ate?: string;
  paradoHaMaisDe?: number;
  origem?: string[];
  tim?: { dep?: DepTim[]; trafegoPago?: boolean; vendaLiberada?: boolean };
  starlink?: { tipoCaptacao?: TipoCaptacao[]; vivensis?: VivensisStatus[]; vsm?: 'SIM' | 'NAO' | 'VAZIO' };
};
