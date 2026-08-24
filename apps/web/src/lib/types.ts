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

export type ConversaDetalhe = ConversaBase & { mensagens: Mensagem[] };

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
