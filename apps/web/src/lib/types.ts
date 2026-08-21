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
