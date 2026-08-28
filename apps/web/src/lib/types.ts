export type Perfil = 'ADMIN' | 'SUPERVISOR' | 'AGENTE';

export type AgentStatus = 'OFFLINE' | 'DISPONIVEL' | 'EM_ATENDIMENTO' | 'PAUSA';

export type Canal = 'WEBCHAT' | 'WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK' | 'EMAIL' | 'VOZ';

export type Usuario = {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  status: AgentStatus;
  ativo: boolean;
  ultimoLogin: string | null;
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
};

type ConversaBase = {
  id: string;
  canal: Canal;
  status: ConversaStatus;
  assunto: string | null;
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
  site: string | null;
  telefone: string | null;
  email: string | null;
  observacoes: string | null;
  criadoEm: string;
  totalContatos?: number;
  totalLeads?: number;
  totalOportunidades?: number;
  contatos?: Contato[];
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
};

export type Estagio = { id: string; nome: string; ordem: number; probabilidade: number };

export type Funil = {
  id: string;
  nome: string;
  ativo: boolean;
  estagios: Estagio[];
  totalOportunidades?: number;
};

export type OportunidadeItem = {
  id: string;
  quantidade: number;
  precoUnitario: number;
  total: number;
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
  /** Contados na API, para os dois numeros virem do mesmo relogio. */
  estagioDesde?: string;
  diasNoEstagio?: number;
  diasAberta?: number;
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
  custo: number | null;
  motivoFalha: string | null;
  contato: { id: string; nome: string } | null;
  agente: { id: string; nome: string } | null;
  fila: { id: string; nome: string } | null;
};

export type IndicadoresVoz = {
  total: number;
  entrantes: number;
  saintes: number;
  atendidas: number;
  naoAtendidas: number;
  taxaAtendimento: number | null;
  tma: number | null;
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

export const TIPOS_ATIVIDADE = ['NOTA', 'LIGACAO', 'WHATSAPP', 'EMAIL', 'REUNIAO', 'VISITA', 'PROPOSTA'] as const;

export type TipoAtividade = (typeof TIPOS_ATIVIDADE)[number];

export const LABEL_TIPO_ATIVIDADE: Record<TipoAtividade, string> = {
  NOTA: 'Nota',
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
};

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
