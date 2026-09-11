export type Perfil = 'ADMIN' | 'SUPERVISOR' | 'GESTOR' | 'COMERCIAL' | 'AGENTE';

export type AgentStatus = 'OFFLINE' | 'DISPONIVEL' | 'EM_ATENDIMENTO' | 'PAUSA';

export type Canal = 'WEBCHAT' | 'WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK' | 'EMAIL' | 'VOZ';

/**
 * Quao quente esta a negociacao, na leitura de quem esta nela.
 *
 * Tres degraus e nao cinco: escala fina vira ruido num funil de cem cartoes —
 * todo mundo marca o meio. Nulo e um valor de verdade: "ninguem leu ainda".
 */
export type Temperatura = 'FRIA' | 'MORNA' | 'QUENTE';

export type Usuario = {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  status: AgentStatus;
  ativo: boolean;
  ultimoLogin: string | null;
  criadoEm: string;
  /** Filial desta pessoa (item 6.5). Nulo = sem filial atribuida. */
  filialId?: string | null;
};

export type EntidadeCampoCustomizado = 'CONTA' | 'LEAD' | 'OPORTUNIDADE';
export type TipoCampoCustomizado = 'TEXTO' | 'NUMERO' | 'DATA' | 'BOOLEANO' | 'SELECAO';

/** Definicao de campo customizado (item 6.4), como o CRUD de Configuracoes le e grava. */
export type CampoCustomizadoDef = {
  id: string;
  entidade: EntidadeCampoCustomizado;
  nome: string;
  chave: string;
  tipo: TipoCampoCustomizado;
  opcoes: string[];
  obrigatorio: boolean;
  valorUnico: boolean;
  secao: string | null;
  ordem: number;
  ativo: boolean;
  criadoEm: string;
};

/** Definicao + valor atual, como a ficha de conta/lead/oportunidade devolve. */
export type ValorCampoCustomizado = {
  id: string;
  nome: string;
  chave: string;
  tipo: TipoCampoCustomizado;
  opcoes: string[];
  obrigatorio: boolean;
  secao: string | null;
  ordem: number;
  ativo: boolean;
  valor: string | number | boolean | null;
};

/**
 * Filial (item 6.5): unidade fisica da organizacao. So classificacao — nao
 * muda quem ve o que, ver o comentario em `Filial` no schema da API.
 */
export type Filial = {
  id: string;
  nome: string;
  cidade: string | null;
  uf: string | null;
  ativa: boolean;
  criadoEm: string;
};

export type Fila = {
  id: string;
  nome: string;
  descricao: string | null;
  canalPadrao: Canal;
  ativa: boolean;
  criadoEm: string;
  agentes: Usuario[];
};

export type Branding = {
  id: string;
  appName: string;
  logoUrl: string | null;
  corPrimaria: string;
  corSecundaria: string;
  corDestaque: string;
};

export const LABEL_PERFIL: Record<Perfil, string> = {
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  GESTOR: 'Gestor',
  COMERCIAL: 'Comercial',
  AGENTE: 'Agente',
};

export const LABEL_STATUS: Record<AgentStatus, string> = {
  OFFLINE: 'Offline',
  DISPONIVEL: 'Disponivel',
  EM_ATENDIMENTO: 'Em atendimento',
  PAUSA: 'Em pausa',
};

export const COR_STATUS: Record<AgentStatus, string> = {
  OFFLINE: 'bg-slate-400',
  DISPONIVEL: 'bg-emerald-500',
  EM_ATENDIMENTO: 'bg-blue-500',
  PAUSA: 'bg-amber-500',
};

// --------------------------------------------------------------------------
// Fase 1 — Atendimento
// --------------------------------------------------------------------------

export type ConversaStatus = 'EM_ESPERA' | 'ATRIBUIDO' | 'EM_ATENDIMENTO' | 'FINALIZADO';

export type AutorMensagem = 'CLIENTE' | 'AGENTE' | 'SISTEMA';

export type Mensagem = {
  id: string;
  conversaId: string;
  autor: AutorMensagem;
  autorId: string | null;
  conteudo: string;
  tipoAnexo: 'TEXTO' | 'IMAGEM' | 'AUDIO' | 'VIDEO' | 'ARQUIVO';
  anexoUrl: string | null;
  criadoEm: string;
};

export type Contato = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  canalOrigem?: Canal;
  tags?: string[];
  observacoes?: string | null;
  criadoEm?: string;
  atualizadoEm?: string;
  totalConversas?: number;
  /**
   * Ciclo de vida (item E.4), DERIVADO dos fatos — nao e um campo digitado.
   *
   * Por isso nao existe seletor para mudar: quem muda o degrau e o que
   * acontece com o contato (uma conversa, uma negociacao, uma venda). Nulo
   * aparece quando a resposta nao foi calculada nesta consulta.
   */
  cicloDeVida?: CicloDeVida | null;
  /** Papel desta pessoa na conta (item 5.2). Nulo = ninguem classificou. */
  papelNaConta?: PapelNaConta | null;
  /** O que a Receita registra, palavra por palavra. */
  qualificacaoQsa?: string | null;
};

type ConversaBase = {
  id: string;
  canal: Canal;
  status: ConversaStatus;
  assunto: string | null;
  /**
   * Etiquetas de assunto. Compartilham o vocabulario com contato e conta —
   * `assunto` continua sendo o texto livre daquele atendimento.
   */
  tags: string[];
  naoLidas: number;
  criadoEm: string;
  atribuidoEm: string | null;
  finalizadoEm: string | null;
  ultimaMensagemEm: string;
  contato: Contato;
  fila: { id: string; nome: string } | null;
  agente: { id: string; nome: string } | null;
};

export type ConversaResumo = ConversaBase & { ultimaMensagem: Mensagem | null };

export type ConversaDetalhe = ConversaBase & {
  mensagens: Mensagem[];
  /** O detalhe traz as ultimas 50; o resto vem por /conversas/:id/mensagens. */
  temHistoricoAnterior?: boolean;
  cursorAnterior?: string | null;
};

export type Contadores = Record<ConversaStatus, number>;

/** Uma linha do relatorio de atendimentos por assunto (etiqueta da conversa). */
export type LinhaAssunto = {
  tag: string;
  conversas: number;
  finalizadas: number;
  /** TMA das finalizadas com esta etiqueta, em segundos. Nulo sem finalizada. */
  tmaSegundos: number | null;
};

export type RelatorioAssuntos = {
  assuntos: LinhaAssunto[];
  /**
   * Atendimentos do periodo sem etiqueta nenhuma.
   *
   * Vem junto de proposito: as linhas descrevem so o que foi classificado, e sem
   * este numero um relatorio com 10% de cobertura parece igual a um com 100%.
   */
  semEtiqueta: number;
  total: number;
};

export const LABEL_CONVERSA_STATUS: Record<ConversaStatus, string> = {
  EM_ESPERA: 'Em espera',
  ATRIBUIDO: 'Atribuido',
  EM_ATENDIMENTO: 'Em atendimento',
  FINALIZADO: 'Finalizado',
};

export const ABAS_ATENDIMENTO: ConversaStatus[] = [
  'EM_ESPERA',
  'ATRIBUIDO',
  'EM_ATENDIMENTO',
  'FINALIZADO',
];

// --------------------------------------------------------------------------
// Fase 2 — CRM completo
// --------------------------------------------------------------------------

export type LeadFase = 'NOVO' | 'QUALIFICACAO' | 'PROPOSTA' | 'NEGOCIACAO' | 'GANHO' | 'PERDIDO';
export type LeadTipo = 'INBOUND' | 'OUTBOUND' | 'INDICACAO' | 'PARCEIRO';
export type MotivoPerda =
  | 'PRECO'
  | 'SEM_INTERESSE'
  | 'CONCORRENTE'
  | 'SEM_BUDGET'
  | 'SEM_RESPOSTA'
  | 'OUTRO';
export type OportunidadeStatus = 'ABERTA' | 'GANHA' | 'PERDIDA';

type Referencia = { id: string; nome: string };

export type Conta = {
  id: string;
  nome: string;
  cnpj: string | null;
  segmento: string | null;
  /** Etiquetas do cliente, independentes das do contato. */
  tags?: string[];
  site: string | null;
  telefone: string | null;
  email: string | null;
  observacoes: string | null;
  criadoEm: string;
  totalContatos?: number;
  totalLeads?: number;
  totalOportunidades?: number;
  contatos?: Contato[];
  /** Preenchidos pela consulta publica de CNPJ (item 5.2). */
  razaoSocial?: string | null;
  situacaoCadastral?: string | null;
  atividadePrincipal?: string | null;
  enriquecidoEm?: string | null;
  /** Filial que atende esta conta (item 6.5). Nulo = sem filial atribuida. */
  filialId?: string | null;
};

export type TipoGarantia = 'LEGAL' | 'CONTRATUAL' | 'COMPRESSOR' | 'OUTRA';

/**
 * Estado da garantia de um componente (item 5.1).
 *
 * `SEM_DATA_INICIO` e `REQUISITO_NAO_INFORMADO` sao estados proprios, e nao
 * "vencida": ausencia de dado nunca vira um degrau negativo, so um degrau com
 * nome. `NAO_APLICAVEL` e a garantia CONTRATUAL que nunca chegou a existir,
 * por faltar instalador credenciado ou nota fiscal (regra Philco).
 */
export type StatusGarantia = 'VIGENTE' | 'VENCIDA' | 'SEM_DATA_INICIO' | 'REQUISITO_NAO_INFORMADO' | 'NAO_APLICAVEL';

export type ComponenteGarantia = {
  id: string;
  tipo: TipoGarantia;
  nome: string | null;
  prazoDias: number;
  dataInicio: string | null;
  observacao: string | null;
  status: StatusGarantia;
  vencimento: string | null;
};

export type ProdutoInstalado = {
  id: string;
  contaId: string;
  modelo: string;
  numeroSerie: string | null;
  dataInstalacao: string | null;
  instaladorNome: string | null;
  instaladorCredenciado: boolean | null;
  notaFiscalNumero: string | null;
  observacoes: string | null;
  criadoEm: string;
  atualizadoEm: string;
  componentes: ComponenteGarantia[];
};

export type Lead = {
  id: string;
  fase: LeadFase;
  tipo: LeadTipo;
  prazo: string | null;
  canalOrigem: Canal;
  motivoPerda: MotivoPerda | null;
  valorEstimado: number | null;
  observacoes: string | null;
  criadoEm: string;
  atualizadoEm: string;
  fechadoEm: string | null;
  contato: Contato;
  conta: Referencia | null;
  responsavel: Referencia | null;
  /** So no detalhe (`GET /leads/:id`) — ausente na listagem/kanban. */
  camposCustomizados?: ValorCampoCustomizado[];
};

export type Estagio = {
  id: string;
  nome: string;
  ordem: number;
  probabilidade: number;
  /**
   * Titulo da tarefa que a etapa exige antes de o negocio avancar (item 3.1).
   * Nulo = etapa sem exigencia. Ausente = API antiga.
   */
  tarefaObrigatoria?: string | null;
};

export type Funil = {
  id: string;
  nome: string;
  ativo: boolean;
  estagios: Estagio[];
  totalOportunidades?: number;
};

export type Recorrencia = 'UNICO' | 'MENSAL';

/**
 * Situacao da alcada de desconto.
 *
 * `NAO_REQUER` e `APROVADA` sao diferentes: o primeiro diz que o desconto caiu
 * dentro do teto, o segundo que alguem com alcada olhou e liberou.
 */
export type AprovacaoDesconto = 'NAO_REQUER' | 'PENDENTE' | 'APROVADA' | 'REPROVADA';

/**
 * Rotulos da alcada.
 *
 * `NAO_REQUER` le "dentro da alcada", e nao "nao requer": a tela fala do
 * desconto, nao do estado interno do registro.
 */
export const LABEL_APROVACAO_DESCONTO: Record<AprovacaoDesconto, string> = {
  NAO_REQUER: 'Dentro da alcada',
  PENDENTE: 'Aguardando aprovacao',
  APROVADA: 'Aprovado',
  REPROVADA: 'Reprovado',
};

export type OportunidadeItem = {
  id: string;
  quantidade: number;
  precoUnitario: number;
  acrescimo: number;
  desconto: number;
  recorrencia: Recorrencia;
  /** Nulo = custo nao informado. Diferente de zero. */
  custoUnitario: number | null;
  /** Quantidade x preco, antes de acrescimo e desconto. */
  bruto: number;
  /** O liquido da linha — o que se cobra. Nome antigo, mantido. */
  total: number;
  custo: number | null;
  margem: number | null;
  margemPercentual: number | null;
  produto: { id: string; nome: string; sku: string };
};

export type Oportunidade = {
  id: string;
  titulo: string;
  valor: number;
  status: OportunidadeStatus;
  motivoPerda: MotivoPerda | null;
  previsaoFechamento: string | null;
  criadoEm: string;
  fechadoEm: string | null;
  conta: Referencia;
  funil: Referencia;
  estagio: Estagio;
  responsavel: Referencia | null;
  itens: OportunidadeItem[];
  totalItens: number;
  valorUnico?: number;
  valorMensal?: number;
  mesesRecorrencia?: number;
  valorInformado?: number | null;
  /** Digitado a mao discorda do que os itens somam — a tela avisa. */
  divergeDoInformado?: boolean;
  totais?: {
    bruto: number;
    descontoTotal: number;
    acrescimoTotal: number;
    custoTotal: number | null;
    margem: number | null;
    margemPercentual: number | null;
    itensComCusto: number;
  };
  aprovacaoDesconto?: AprovacaoDesconto;
  aprovadoPor?: Referencia | null;
  aprovadoEm?: string | null;
  /** Condicoes que vao para a proposta impressa (item 2.2). */
  condicaoPagamento?: string | null;
  prazoEntrega?: string | null;
  /**
   * Temperatura e origem, que o cartao do funil mostra sem exigir clique.
   *
   * Nulo nos dois nao e um degrau: temperatura nula e "ninguem leu ainda", e
   * origem nula e "nao registrada". A tela nao preenche nenhum dos dois por
   * conta propria — ver `pages/crm/temperatura.ts`.
   */
  temperatura?: Temperatura | null;
  canalOrigem?: Canal | null;
  /** Contados na API, para os dois numeros virem do mesmo relogio. */
  estagioDesde?: string;
  diasNoEstagio?: number;
  diasAberta?: number;
  /** Tarefas com prazo ainda em aberto. Zero significa "nenhum proximo passo". */
  tarefasAbertas?: number;
  /** Prazo mais proximo entre as tarefas abertas; no passado, ha tarefa atrasada. */
  proximoPrazo?: string | null;
  /**
   * Titulos das tarefas que a etapa atual exige e que estao em aberto (item 3.1).
   *
   * Lista, e nao booleano, para o cartao dizer o que falta sem uma segunda
   * chamada. Vazia e um zero de verdade; ausente e "API antiga".
   */
  tarefaDaEtapaPendente?: string[];
  /** So no detalhe (`GET /oportunidades/:id`) — ausente no kanban. */
  camposCustomizados?: ValorCampoCustomizado[];
};

export type ColunaFunil = {
  estagio: Estagio;
  oportunidades: Oportunidade[];
  total: number;
  valorTotal: number;
  valorPonderado: number;
};

export type Produto = {
  id: string;
  nome: string;
  sku: string;
  descricao: string | null;
  ativo: boolean;
  precos: Array<{ catalogo: { id: string; nome: string; moeda: string }; preco: number }>;
};

export type Catalogo = {
  id: string;
  nome: string;
  moeda: string;
  ativo: boolean;
  itens: Array<{ id: string; produto: { id: string; nome: string; sku: string }; preco: number }>;
};

export const FASES_LEAD: LeadFase[] = ['NOVO', 'QUALIFICACAO', 'PROPOSTA', 'NEGOCIACAO', 'GANHO', 'PERDIDO'];

export const LABEL_FASE_LEAD: Record<LeadFase, string> = {
  NOVO: 'Novo',
  QUALIFICACAO: 'Qualificacao',
  PROPOSTA: 'Proposta',
  NEGOCIACAO: 'Negociacao',
  GANHO: 'Ganho',
  PERDIDO: 'Perdido',
};

export const LABEL_TIPO_LEAD: Record<LeadTipo, string> = {
  INBOUND: 'Inbound',
  OUTBOUND: 'Outbound',
  INDICACAO: 'Indicacao',
  PARCEIRO: 'Parceiro',
};

/** Campos que a trilha de auditoria da oportunidade sabe nomear (item 3.2). */
export const CAMPOS_AUDITADOS = [
  'TITULO',
  'VALOR_INFORMADO',
  'MESES_RECORRENCIA',
  'RESPONSAVEL',
  'PREVISAO_FECHAMENTO',
  'CONDICAO_PAGAMENTO',
  'PRAZO_ENTREGA',
  'ORIGEM',
  'ITENS',
  'STATUS',
  'APROVACAO_DESCONTO',
] as const;

export type CampoAuditado = (typeof CAMPOS_AUDITADOS)[number];

export const LABEL_CAMPO_AUDITADO: Record<CampoAuditado, string> = {
  TITULO: 'Titulo',
  VALOR_INFORMADO: 'Valor informado',
  MESES_RECORRENCIA: 'Meses de recorrencia',
  RESPONSAVEL: 'Responsavel',
  PREVISAO_FECHAMENTO: 'Previsao de fechamento',
  CONDICAO_PAGAMENTO: 'Condicao de pagamento',
  PRAZO_ENTREGA: 'Prazo de entrega',
  ORIGEM: 'Origem',
  ITENS: 'Proposta',
  STATUS: 'Situacao',
  APROVACAO_DESCONTO: 'Aprovacao do desconto',
};

/**
 * Valor de um campo auditado, no tipo natural dele.
 *
 * `{id, nome}` e referencia a usuario; `{quantidade, total}` e o retrato da
 * proposta. A API guarda assim — nao como texto pronto — para a leitura
 * continuar numerica e a formatacao ficar na tela.
 */
export type ValorAuditado =
  | string
  | number
  | null
  | { id: string; nome: string }
  | { quantidade: number; total: number };

export type EventoAuditoria = {
  id: string;
  /** `ETAPA` vem do historico de estagio, que e outra tabela e ja existia. */
  tipo: 'CAMPO' | 'ETAPA';
  campo: CampoAuditado | null;
  de: ValorAuditado;
  para: ValorAuditado;
  autor: string | null;
  ocorridoEm: string;
};

export const LABEL_MOTIVO_PERDA: Record<MotivoPerda, string> = {
  PRECO: 'Preco',
  SEM_INTERESSE: 'Sem interesse',
  CONCORRENTE: 'Concorrente',
  SEM_BUDGET: 'Sem budget',
  SEM_RESPOSTA: 'Sem resposta',
  OUTRO: 'Outro',
};

export const moeda = (valor: number | null, sigla = 'BRL') =>
  valor === null
    ? '—'
    : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: sigla }).format(valor);

// --------------------------------------------------------------------------
// Fase 2 — Protocolo / Chamados
// --------------------------------------------------------------------------

export type TicketStatus = 'ABERTO' | 'EM_ANDAMENTO' | 'AGUARDANDO_CLIENTE' | 'RESOLVIDO' | 'FECHADO';
export type TicketPrioridade = 'BAIXA' | 'NORMAL' | 'ALTA' | 'URGENTE';

export type ProtocoloComentario = {
  id: string;
  conteudo: string;
  interno: boolean;
  criadoEm: string;
  autor: { id: string; nome: string } | null;
};

export type ProtocoloAnexo = {
  id: string;
  nome: string;
  url: string;
  tipo: string | null;
  tamanho: number | null;
  criadoEm: string;
};

export type ProtocoloAgendamento = {
  id: string;
  titulo: string;
  inicio: string;
  fim: string | null;
  concluido: boolean;
  responsavel: { id: string; nome: string } | null;
};

export type Protocolo = {
  id: string;
  numero: number;
  titulo: string;
  descricao: string;
  status: TicketStatus;
  prioridade: TicketPrioridade;
  prazoSla: string | null;
  criadoEm: string;
  atualizadoEm: string;
  resolvidoEm: string | null;
  fechadoEm: string | null;
  conversaId: string | null;
  contato: { id: string; nome: string; email: string | null } | null;
  conta: { id: string; nome: string } | null;
  responsavel: { id: string; nome: string } | null;
  fila: { id: string; nome: string } | null;
  comentarios: ProtocoloComentario[];
  anexos: ProtocoloAnexo[];
  agendamentos: ProtocoloAgendamento[];
  slaVencido: boolean;
};

export const STATUS_PROTOCOLO: TicketStatus[] = [
  'ABERTO',
  'EM_ANDAMENTO',
  'AGUARDANDO_CLIENTE',
  'RESOLVIDO',
  'FECHADO',
];

export const LABEL_STATUS_PROTOCOLO: Record<TicketStatus, string> = {
  ABERTO: 'Aberto',
  EM_ANDAMENTO: 'Em andamento',
  AGUARDANDO_CLIENTE: 'Aguardando cliente',
  RESOLVIDO: 'Resolvido',
  FECHADO: 'Fechado',
};

export const PRIORIDADES_PROTOCOLO: TicketPrioridade[] = ['BAIXA', 'NORMAL', 'ALTA', 'URGENTE'];

export const LABEL_PRIORIDADE: Record<TicketPrioridade, string> = {
  BAIXA: 'Baixa',
  NORMAL: 'Normal',
  ALTA: 'Alta',
  URGENTE: 'Urgente',
};

export const COR_PRIORIDADE: Record<TicketPrioridade, string> = {
  BAIXA: 'bg-slate-100 text-slate-600',
  NORMAL: 'bg-blue-50 text-blue-700',
  ALTA: 'bg-amber-50 text-amber-700',
  URGENTE: 'bg-red-50 text-red-700',
};

// --------------------------------------------------------------------------
// Fase 3 — Gestao, Relatorios e Escalas
// --------------------------------------------------------------------------

export type Indicadores = {
  periodo: { desde: string; ate: string };
  conversas: {
    emEspera: number;
    atribuidas: number;
    emAtendimento: number;
    finalizadas: number;
    novasNoPeriodo: number;
    mensagensNoPeriodo: number;
    porCanal: Record<string, number>;
  };
  tempos: { tmeSegundos: number | null; tmaSegundos: number | null };
  agentes: { total: number; porStatus: Record<string, number> };
  protocolos: { porStatus: Record<string, number>; slaVencidos: number };
  voz: IndicadoresVoz;
  satisfacao: {
    csat: number | null;
    csatRespostas: number;
    nps: number | null;
    npsRespostas: number;
  };
};

export type AgenteMonitorado = {
  id: string;
  nome: string;
  perfil: Perfil;
  status: AgentStatus;
  ultimoLogin: string | null;
  filas: Array<{ id: string; nome: string }>;
  conversasAtivas: number;
  protocolosAbertos: number;
  segundosNoStatus: number | null;
};

export type Relatorio = {
  titulo: string;
  periodo: { desde: string; ate: string };
  colunas: Array<{ chave: string; rotulo: string }>;
  linhas: Array<Record<string, string | number>>;
  totais?: Record<string, string | number>;
};

export type Escala = {
  id: string;
  agenteId: string;
  diaSemana: number;
  diaNome: string;
  inicio: string;
  fim: string;
  ativo: boolean;
  cargaMinutos: number;
  agente: { id: string; nome: string; perfil: Perfil };
};

export type Jornada = {
  id: string;
  nome: string;
  disponivel: number;
  emAtendimento: number;
  pausa: number;
  offline: number;
  trabalhado: number;
};

export type ResultadosPesquisa = {
  enviadas: number;
  entregues: number;
  naoEntregues: number;
  respondidas: number;
  taxaResposta: number | null;
  porAgente: Array<{ id: string; nome: string; respostas: number; media: number }>;
  comentarios: Array<{
    nota: number | null;
    tipo: 'CSAT' | 'NPS';
    comentario: string | null;
    cliente: string;
    agente: string | null;
    respondidoEm: string | null;
  }>;
};

export const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];

// --------------------------------------------------------------------------
// Fase 4 — Campanhas e Chatbot
// --------------------------------------------------------------------------

export type CampanhaStatus = 'RASCUNHO' | 'ATIVA' | 'PAUSADA' | 'CONCLUIDA';

export type CampanhaItemStatus = 'PENDENTE' | 'ENVIADO' | 'FALHOU' | 'RESPONDIDO' | 'IGNORADO';

export type Campanha = {
  id: string;
  nome: string;
  canal: Canal;
  mensagem: string;
  status: CampanhaStatus;
  fila: { id: string; nome: string } | null;
  criadoPor: { id: string; nome: string } | null;
  agendadaPara: string | null;
  iniciadaEm: string | null;
  concluidaEm: string | null;
  criadoEm: string;
  total: number;
  contagens: Record<CampanhaItemStatus, number>;
};

export type CampanhaItem = {
  id: string;
  status: CampanhaItemStatus;
  erro: string | null;
  enviadoEm: string | null;
  contato: { id: string; nome: string; telefone: string | null; email: string | null };
};

export type BotAcao = 'RESPONDER' | 'TRANSFERIR' | 'ENCERRAR';

export type BotPasso = {
  id?: string;
  ordem?: number;
  gatilhos: string[];
  resposta: string;
  acao: BotAcao;
  filaId?: string | null;
  fila?: { id: string; nome: string } | null;
};

export type Bot = {
  id: string;
  nome: string;
  ativo: boolean;
  canal: Canal | null;
  mensagemBoasVindas: string;
  fallback: string;
  limiteSemResposta: number;
  passos: BotPasso[];
};

export const LABEL_CAMPANHA_STATUS: Record<CampanhaStatus, string> = {
  RASCUNHO: 'Rascunho',
  ATIVA: 'Ativa',
  PAUSADA: 'Pausada',
  CONCLUIDA: 'Concluida',
};

export const LABEL_ITEM_STATUS: Record<CampanhaItemStatus, string> = {
  PENDENTE: 'Pendente',
  ENVIADO: 'Enviado',
  FALHOU: 'Falhou',
  RESPONDIDO: 'Respondido',
  IGNORADO: 'Ignorado',
};

export type PoliticaRetencao = {
  id: string;
  ativa: boolean;
  diasConversas: number;
  diasProtocolos: number;
  diasPresenca: number;
  ultimoExpurgoEm: string | null;
  atualizadoEm: string;
};

export type ResumoExpurgo = {
  simulacao: boolean;
  politica: { diasConversas: number; diasProtocolos: number; diasPresenca: number };
  corte: { conversas: string; protocolos: string; presenca: string };
  conversas: number;
  mensagens: number;
  protocolos: number;
  comentarios: number;
  anexos: number;
  presenca: number;
  titulares: number;
  arquivosOrfaos: number;
  arquivosApagados: number;
};

export type RegistroLgpd = {
  id: string;
  acao: 'EXPURGO' | 'ANONIMIZACAO' | 'EXPORTACAO';
  contatoId: string | null;
  detalhe: unknown;
  autor: string;
  criadoEm: string;
};

// --------------------------------------------------------------------------
// Fase 4 — Voz
// --------------------------------------------------------------------------

export type CallStatus =
  | 'INICIANDO'
  | 'CHAMANDO'
  | 'EM_ANDAMENTO'
  | 'COMPLETADA'
  | 'NAO_ATENDIDA'
  | 'OCUPADA'
  | 'FALHOU'
  | 'CANCELADA';

export type Chamada = {
  id: string;
  idExterno: string;
  direcao: 'ENTRANTE' | 'SAINTE';
  status: CallStatus;
  numeroOrigem: string;
  numeroDestino: string;
  iniciadoEm: string;
  atendidoEm: string | null;
  encerradoEm: string | null;
  duracao: number | null;
  gravacaoUrl: string | null;
  gravacaoDuracao: number | null;
  transcricao: string | null;
  /**
   * Custo cobrado pelo provedor. Nulo = o provedor nao informou (item 6.6).
   *
   * Diferente de zero: chamada nao atendida costuma custar nada mesmo, e "sem
   * informacao" nao pode virar "de graca".
   */
  custo: number | null;
  motivoFalha: string | null;
  contato: { id: string; nome: string } | null;
  agente: { id: string; nome: string } | null;
  fila: { id: string; nome: string } | null;
  /** Nota de 1 a 5 de quem ouviu. Nulo = ninguem classificou, nao "ruim". */
  classificacao?: number | null;
  classificadoEm?: string | null;
  classificadoPor?: Referencia | null;
  /**
   * Assistente da ligacao (item E.2): resumo, sentimento e a procedencia deles.
   *
   * `sentimento` nulo significa **ninguem analisou esta chamada** — nunca
   * NEUTRO. A plataforma nao transcreve nem interpreta: quem faz isso e um motor
   * externo, e `analisadoPor` diz qual, porque resumo sem autor nao se discute.
   */
  resumo?: string | null;
  sentimento?: SentimentoDaLigacao | null;
  analisadoPor?: string | null;
  analisadoEm?: string | null;
};

export type SentimentoDaLigacao = 'POSITIVO' | 'NEUTRO' | 'NEGATIVO';

export const LABEL_SENTIMENTO: Record<SentimentoDaLigacao, string> = {
  POSITIVO: 'Positivo',
  NEUTRO: 'Neutro',
  NEGATIVO: 'Negativo',
};

/** O que aconteceu com uma proxima acao sugerida pelo motor. */
export type EstadoDaAcao = 'PENDENTE' | 'VIROU_TAREFA' | 'DESCARTADA';

export type AcaoSugerida = {
  id: string;
  texto: string;
  ordem: number;
  estado: EstadoDaAcao;
  atividadeId: string | null;
  descartadoEm: string | null;
  /** Por que o botao nao esta disponivel. Nulo = pode virar tarefa. */
  impedimento: string | null;
};

export type AnaliseDaLigacao = {
  chamadaId: string;
  /**
   * `SEM_ANALISE` e diferente de "analisada e sem proxima acao".
   *
   * Motor que ouviu e nao achou nada a fazer produziu resultado legitimo; a tela
   * nao pode mostrar isso como "nenhum motor analisou esta ligacao".
   */
  estado: 'SEM_ANALISE' | 'ANALISADA';
  transcricao: string | null;
  resumo: string | null;
  sentimento: SentimentoDaLigacao | null;
  analisadoPor: string | null;
  analisadoEm: string | null;
  contato: Referencia | null;
  acoes: AcaoSugerida[];
};

export type IndicadoresVoz = {
  total: number;
  entrantes: number;
  saintes: number;
  atendidas: number;
  naoAtendidas: number;
  taxaAtendimento: number | null;
  tma: number | null;
  /*
   * Custo e nota do periodo (item 6.6).
   *
   * As duas medias vem de bases DIFERENTES, e os dois contadores dizem quais:
   * custo medio sobre as chamadas que tem custo, nota media sobre as que tem
   * nota. Sem os contadores, "nota media 5" com uma chamada avaliada de cem
   * pareceria resultado da operacao inteira.
   */
  custoTotal?: number | null;
  custoMedio?: number | null;
  chamadasComCusto?: number;
  notaMedia?: number | null;
  chamadasComNota?: number;
  /**
   * Sentimento do periodo (item E.2).
   *
   * `semAnalise` nao e detalhe: sem ele, "70% neutro" pode ser 7 de 10 chamadas
   * ou 7 de 700 nao analisadas, e as duas frases pedem decisoes opostas.
   */
  sentimento?: {
    positivo: number;
    neutro: number;
    negativo: number;
    analisadas: number;
    semAnalise: number;
    /** Nulo quando nada foi analisado. Zero afirmaria que nada correu mal. */
    fracaoNegativa: number | null;
  };
  /** Quantas ainda faltam ouvir. E a fila de trabalho de quem classifica. */
  semNota?: number;
};

export type ConfigVoz = {
  id: string;
  ativo: boolean;
  provedor: string;
  contaSid: string | null;
  numeroPadrao: string | null;
  urlWebhook: string | null;
  filaId: string | null;
  guardarGravacao: boolean;
  fila: { id: string; nome: string } | null;
  authTokenMascarado: string | null;
  configurado: boolean;
  provedoresDisponiveis: string[];
};

export const LABEL_CHAMADA_STATUS: Record<CallStatus, string> = {
  INICIANDO: 'Iniciando',
  CHAMANDO: 'Chamando',
  EM_ANDAMENTO: 'Em andamento',
  COMPLETADA: 'Completada',
  NAO_ATENDIDA: 'Nao atendida',
  OCUPADA: 'Ocupada',
  FALHOU: 'Falhou',
  CANCELADA: 'Cancelada',
};

export type TrabalhoMorto = {
  id: string;
  tipo: string;
  tentativa: number;
  dados: unknown;
  erro: string;
};

export type EstadoFila = {
  prontos: number;
  atrasados: number;
  mortos: number;
  ultimosMortos: TrabalhoMorto[];
};

/* ── Ficha 360 ─────────────────────────────────────────────────────────── */

export const TIPOS_EVENTO = [
  'CONVERSA',
  'CHAMADA',
  'ATIVIDADE',
  'PROTOCOLO',
  'OPORTUNIDADE',
  'ETAPA',
  'LEAD',
  'PESQUISA',
] as const;

export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export const LABEL_TIPO_EVENTO: Record<TipoEvento, string> = {
  CONVERSA: 'Conversa',
  CHAMADA: 'Ligacao',
  ATIVIDADE: 'Atividade',
  PROTOCOLO: 'Protocolo',
  OPORTUNIDADE: 'Oportunidade',
  ETAPA: 'Etapa do funil',
  LEAD: 'Lead',
  PESQUISA: 'Pesquisa',
};

/**
 * Um evento da linha do tempo. As oito fontes projetam a mesma forma, entao a
 * tela renderiza um tipo so — e um tipo novo no back nao exige componente novo
 * aqui, apenas um rotulo.
 */
export type EventoFicha = {
  tipo: TipoEvento;
  id: string;
  ocorridoEm: string;
  titulo: string;
  detalhe: string | null;
  canal: Canal | null;
  situacao: string | null;
  valor: number | null;
  referencia: string | null;
  /** De quem e o evento: do proprio contato ou da empresa dele. */
  escopo: 'CONTATO' | 'CONTA';
  usuario: string | null;
};

export type Timeline = { eventos: EventoFicha[]; proximoCursor: string | null };

export const TIPOS_ATIVIDADE = ['NOTA', 'TAREFA', 'LIGACAO', 'WHATSAPP', 'EMAIL', 'REUNIAO', 'VISITA', 'PROPOSTA'] as const;

export type TipoAtividade = (typeof TIPOS_ATIVIDADE)[number];

export const LABEL_TIPO_ATIVIDADE: Record<TipoAtividade, string> = {
  NOTA: 'Nota',
  TAREFA: 'Tarefa',
  LIGACAO: 'Ligacao',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'E-mail',
  REUNIAO: 'Reuniao',
  VISITA: 'Visita',
  PROPOSTA: 'Proposta',
};

export type Atividade = {
  id: string;
  tipo: TipoAtividade;
  titulo: string;
  descricao: string | null;
  /** Nulo = registro do que aconteceu. Preenchido = tarefa com prazo. */
  prazo: string | null;
  concluidoEm: string | null;
  criadoEm: string;
  responsavel: { id: string; nome: string } | null;
  criadoPor?: { id: string; nome: string } | null;
  /** Exigida por uma etapa do funil (item 3.1): nao da para avancar sem concluir. */
  obrigatoria?: boolean;
  /*
   * Check-in e check-out de visita (item 6.7).
   *
   * Coordenada e opcional de proposito: o tecnico pode estar num subsolo, com
   * GPS negado ou sem sinal, e recusar o registro nesse caso o impediria
   * justamente na visita mais dificil. A tela diz quando veio sem localizacao.
   */
  checkinEm?: string | null;
  checkinLat?: number | null;
  checkinLng?: number | null;
  checkoutEm?: string | null;
  checkoutLat?: number | null;
  checkoutLng?: number | null;
};

/** Uma atividade agendada, para o drill-down da matriz de produtividade (item 3.3). */
export type AtividadeDaCelula = { id: string; titulo: string; prazo: string; concluidoEm: string | null };

/**
 * `feitas / agendadas` de uma combinacao usuario x tipo. Nulo no lugar da
 * celula (nao neste tipo) significa "nenhuma atividade agendada" — nao 0%.
 */
export type CelulaProdutividade = {
  feitas: number;
  agendadas: number;
  percentual: number;
  atividades: AtividadeDaCelula[];
};

export type LinhaProdutividade = {
  usuarioId: string;
  usuarioNome: string;
  porTipo: Record<TipoAtividade, CelulaProdutividade | null>;
  total: CelulaProdutividade;
};

export type MatrizProdutividade = { mes: string; linhas: LinhaProdutividade[] };

export type IndicadoresFicha = {
  conversas: number;
  chamadas: number;
  protocolosAbertos: number;
  oportunidadesAbertas: number;
  oportunidadesGanhas: number;
  valorGanho: number;
  atividadesAbertas: number;
};

export type FichaContato = {
  contato: Contato & { conta: { id: string; nome: string } | null };
  indicadores: IndicadoresFicha;
  atividadesAbertas: Atividade[];
};

/* ── Ponte com o motor de IA externo ──────────────────────────────────── */

export type TokenIntegracao = {
  id: string;
  nome: string;
  /** Primeiros caracteres, para identificar qual token esta na configuracao. */
  prefixo: string;
  escopo: 'IA';
  ativo: boolean;
  criadoEm: string;
  ultimoUsoEm: string | null;
  revogadoEm: string | null;
};

export type EstadoIa = {
  canal: Canal;
  ativa: boolean;
  webhook: string | null;
  /** Se ha segredo gravado. O valor nunca volta da API. */
  assinado: boolean;
  /** Janela em que o canal aceita texto livre. Zero = sem janela. */
  janelaHoras: number;
};

/** Canais em que a ponte de IA pode ser ligada (voz fica de fora). */
export const CANAIS_IA = ['WEBCHAT', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'EMAIL'] as const;

/* ── Metas mensais (item 4.1) ─────────────────────────────────────────────── */

export type EscopoMeta = 'INDIVIDUAL' | 'EQUIPE';

export type SituacaoMeta = 'ATINGIDA' | 'NO_RITMO' | 'ABAIXO' | 'SEM_META';

/**
 * Progresso de uma meta no mes.
 *
 * Os nulos sao significativos e a tela **nao** pode transforma-los em zero:
 * `percentual` nulo e "nao ha meta contra o que medir", e `projecao` nula e "nao
 * ha o que projetar" (mes futuro, ou mes encerrado sem ritmo a extrapolar).
 */
export type ProgressoMeta = {
  meta: number;
  realizado: number;
  percentual: number | null;
  falta: number;
  projecao: number | null;
  variacao: number | null;
  ritmoNecessario: number | null;
  situacao: SituacaoMeta;
};

export type LinhaDeMeta = ProgressoMeta & {
  usuarioId: string;
  nome: string;
  escopo: EscopoMeta;
  /** So nas metas de equipe: quantas pessoas o numero cobre. */
  integrantes?: number;
};

export type PainelDeMetas = {
  mes: string;
  individuais: LinhaDeMeta[];
  equipes: LinhaDeMeta[];
  /** Vendeu no mes e nao tem meta individual — apontado, nao escondido. */
  semMeta: Array<{ usuarioId: string; nome: string; realizado: number }>;
};

/** Um mes da rampa. `valor` nulo = ninguem definiu (diferente de zero). */
export type MesDaRampa = { mes: string; valor: number | null };

/** `GET /metas/minha` (item 4.2): o progresso do proprio usuario, para o dashboard. */
export type MinhaMeta = ProgressoMeta & { mes: string; definida: boolean };

export const LABEL_SITUACAO_META: Record<SituacaoMeta, string> = {
  ATINGIDA: 'Atingida',
  NO_RITMO: 'No ritmo',
  ABAIXO: 'Abaixo do ritmo',
  SEM_META: 'Sem meta',
};

export const TOM_SITUACAO_META: Record<SituacaoMeta, 'sucesso' | 'marca' | 'alerta' | 'neutro'> = {
  ATINGIDA: 'sucesso',
  NO_RITMO: 'marca',
  ABAIXO: 'alerta',
  // Cinza, nao ambar: sem meta nao e falha de quem vendeu — e falha de quem nao
  // definiu, e o aviso ambar acusaria a pessoa errada.
  SEM_META: 'neutro',
};

/* ── Visoes salvas (item 6.1) ──────────────────────────────────────────────── */

export type EntidadeVisao = 'CONTA' | 'LEAD' | 'OPORTUNIDADE';

/** Filtro de Contas: o mesmo par busca+etiqueta que a tela ja usa. */
export type FiltroContaSalvo = { busca?: string; tags?: string[] };
/** Filtro de Leads: o mesmo que o card "Filtros" ja usa. */
export type FiltroLeadSalvo = { tipo?: LeadTipo; responsavelId?: string; atrasados?: boolean; busca?: string };
/** Filtro de Oportunidades: hoje so o funil, porque e so o que o kanban expoe. */
export type FiltroOportunidadeSalvo = { funilId?: string };

export type VisaoSalva<F = Record<string, unknown>> = {
  id: string;
  entidade: EntidadeVisao;
  nome: string;
  cor: string;
  filtro: F;
  criadoPor: { id: string; nome: string } | null;
  criadoEm: string;
  atualizadoEm: string;
};

/** Paleta fixa para a cor da visao — nao e livre, para as abas nao virarem um arco-iris sem critério. */
export const PALETA_VISAO = ['#64748b', '#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#db2777'] as const;

/* ── Quadro societario e enriquecimento por CNPJ (item 5.2) ───────────────── */

export const PAPEIS_NA_CONTA = [
  'SOCIO',
  'ADMINISTRADOR',
  'DECISOR',
  'TECNICO',
  'FINANCEIRO',
  'COMPRAS',
  'OUTRO',
] as const;

export type PapelNaConta = (typeof PAPEIS_NA_CONTA)[number];

export const LABEL_PAPEL_NA_CONTA: Record<PapelNaConta, string> = {
  SOCIO: 'Socio',
  ADMINISTRADOR: 'Administrador',
  DECISOR: 'Decisor',
  TECNICO: 'Tecnico',
  FINANCEIRO: 'Financeiro',
  COMPRAS: 'Compras',
  OUTRO: 'Outro',
};

export type DadosPublicosCnpj = {
  cnpj: string;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  situacaoCadastral: string | null;
  atividadePrincipal: string | null;
  telefone: string | null;
  email: string | null;
  socios: Array<{ nome: string; qualificacao: string | null }>;
};

export type PlanoDeEnriquecimento = {
  camposParaPreencher: Record<string, string>;
  contatosParaCriar: Array<{ nome: string; papelNaConta: PapelNaConta; qualificacaoQsa: string | null }>;
  contatosParaClassificar: Array<{
    id: string;
    nome: string;
    papelNaConta: PapelNaConta;
    qualificacaoQsa: string | null;
  }>;
  /** Onde a consulta discorda do gravado. Reportado, nunca aplicado. */
  conflitos: Array<{ campo: string; atual: string; publico: string }>;
};

export type PreviaEnriquecimento = {
  dados: DadosPublicosCnpj;
  plano: PlanoDeEnriquecimento;
  enriquecidoEm: string | null;
};

/** Rotulos dos campos da conta, para a previa nao mostrar nome de coluna. */
export const LABEL_CAMPO_CONTA: Record<string, string> = {
  razaoSocial: 'Razao social',
  telefone: 'Telefone',
  email: 'E-mail',
  situacaoCadastral: 'Situacao cadastral',
  atividadePrincipal: 'Atividade principal',
};

/* ── Medidor de consumo de IA (item 6.8) ──────────────────────────────────── */

export type RecursoIA = 'TRANSCRICAO' | 'RESUMO' | 'SUGESTAO_RESPOSTA' | 'CLASSIFICACAO' | 'OUTRO';

export const LABEL_RECURSO_IA: Record<RecursoIA, string> = {
  TRANSCRICAO: 'Transcricao de audio',
  RESUMO: 'Resumo',
  SUGESTAO_RESPOSTA: 'Resposta do agente de IA',
  CLASSIFICACAO: 'Classificacao',
  OUTRO: 'Outro',
};

/** Unidade de cada recurso — nao existe unidade universal entre eles. */
export const UNIDADE_RECURSO_IA: Record<RecursoIA, string> = {
  TRANSCRICAO: 'min de audio',
  RESUMO: 'mil tokens',
  SUGESTAO_RESPOSTA: 'mil tokens',
  CLASSIFICACAO: 'mil tokens',
  OUTRO: 'unidades',
};

export type SituacaoCicloIa = 'SEM_TETO' | 'DENTRO' | 'PROJETA_ESTOURO' | 'ESTOUROU' | 'SEM_CONSUMO';

export type ConsumoDeIa = {
  mes: string;
  /**
   * Existe ALGUM registro de consumo na organizacao, em qualquer mes.
   *
   * E o que distingue "a IA nao esta ligada" de "esta ligada e este mes nao teve
   * uso" — dois estados que um zero nao separa, e o primeiro nao deve aparecer
   * como "R$ 0,00".
   */
  ligado: boolean;
  teto: number | null;
  custoTotal: number | null;
  unidadesTotais: number;
  usos: number;
  usosComCusto: number;
  porRecurso: Array<{ recurso: RecursoIA; usos: number; unidades: number; custo: number | null }>;
  projecao: number | null;
  fracaoDoTeto: number | null;
  diasDecorridos: number;
  diasNoMes: number;
  situacao: SituacaoCicloIa;
};

/* ── Ciclo de vida do contato (item E.4) ──────────────────────────────────── */

/** Os degraus, do mais avancado para o menos — a mesma ordem da API. */
export const CICLOS_DE_VIDA = [
  'CLIENTE',
  'EM_NEGOCIACAO',
  'PERDIDO',
  'QUALIFICADO',
  'CONTATADO',
  'LEAD',
] as const;

export type CicloDeVida = (typeof CICLOS_DE_VIDA)[number];

export const LABEL_CICLO_DE_VIDA: Record<CicloDeVida, string> = {
  CLIENTE: 'Cliente',
  EM_NEGOCIACAO: 'Em negociacao',
  PERDIDO: 'Perdido',
  QUALIFICADO: 'Qualificado',
  CONTATADO: 'Contatado',
  LEAD: 'Lead',
};

/** O que cada degrau significa, para a tela nao precisar de manual. */
export const AJUDA_CICLO_DE_VIDA: Record<CicloDeVida, string> = {
  CLIENTE: 'Tem oportunidade ganha. Compra nao expira: cliente que sumiu continua tendo comprado.',
  EM_NEGOCIACAO: 'Tem negociacao aberta agora.',
  PERDIDO: 'Perdeu e nao tem nada aberto.',
  QUALIFICADO: 'Lead que passou da triagem, ainda sem oportunidade.',
  CONTATADO: 'Ja houve conversa, ou existe lead na entrada.',
  LEAD: 'Cadastro e mais nada — nunca houve conversa.',
};

export type FunilDeCicloDeVida = {
  total: number;
  degraus: Array<{
    ciclo: CicloDeVida;
    total: number;
    /** Nulo quando nao ha base para calcular fracao; zero e um valor legitimo. */
    fracao: number | null;
  }>;
};

export type VendedorOpcao = { id: string; nome: string };

export type ResumoVendedor = {
  vendedor: { id: string; nome: string };
  mes: string;
  clientesAtendidos: number;
  conversas: { total: number; abertas: number; encerradas: number };
  tempos: { tmeSegundos: number | null; tmaSegundos: number | null };
  oportunidades: { abertas: number; ganhas: number; perdidas: number };
  propostas: number;
  vendas: { quantidade: number; valor: number };
  conversao: number | null;
  meta: { valor: number; definida: boolean };
  whatsapp: Array<{ id: string; nome: string | null; ativo: boolean; modo: string | null }>;
};
