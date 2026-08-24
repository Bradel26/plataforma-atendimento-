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
