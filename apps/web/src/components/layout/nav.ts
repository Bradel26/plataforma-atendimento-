import type { ComponentType } from 'react';
import type { Perfil } from '../../lib/types';
import {
  IconAtendimento,
  IconCampanhas,
  IconConfiguracoes,
  IconCrm,
  IconDashboards,
  IconEscalas,
  IconGestao,
  IconMonitoramento,
  IconProtocolo,
  IconRelatorios,
  IconTelefonia,
} from './icons';

export type NavItem = {
  rota: string;
  label: string;
  icone: ComponentType<{ className?: string }>;
  perfis: Perfil[];
  fase: number;
};

/** Menu lateral fixo — ordem definida no SCOPE.md (Fase 0). */
export const NAV: NavItem[] = [
  { rota: '/dashboards', label: 'Dashboards', icone: IconDashboards, perfis: ['ADMIN', 'SUPERVISOR'], fase: 3 },
  { rota: '/atendimento', label: 'Atendimento', icone: IconAtendimento, perfis: ['ADMIN', 'SUPERVISOR', 'AGENTE'], fase: 1 },
  { rota: '/protocolo', label: 'Protocolo', icone: IconProtocolo, perfis: ['ADMIN', 'SUPERVISOR', 'AGENTE'], fase: 2 },
  { rota: '/monitoramento', label: 'Monitoramento', icone: IconMonitoramento, perfis: ['ADMIN', 'SUPERVISOR'], fase: 3 },
  { rota: '/gestao', label: 'Area da Gestao', icone: IconGestao, perfis: ['ADMIN', 'SUPERVISOR'], fase: 3 },
  { rota: '/campanhas', label: 'Campanhas', icone: IconCampanhas, perfis: ['ADMIN', 'SUPERVISOR'], fase: 4 },
  { rota: '/relatorios', label: 'Relatorios', icone: IconRelatorios, perfis: ['ADMIN', 'SUPERVISOR'], fase: 3 },
  { rota: '/escalas', label: 'Escalas', icone: IconEscalas, perfis: ['ADMIN', 'SUPERVISOR'], fase: 3 },
  { rota: '/telefonia', label: 'Telefonia', icone: IconTelefonia, perfis: ['ADMIN', 'SUPERVISOR', 'AGENTE'], fase: 4 },
  { rota: '/crm', label: 'CRM', icone: IconCrm, perfis: ['ADMIN', 'SUPERVISOR', 'AGENTE'], fase: 1 },
  { rota: '/configuracoes', label: 'Configuracoes', icone: IconConfiguracoes, perfis: ['ADMIN'], fase: 0 },
];
