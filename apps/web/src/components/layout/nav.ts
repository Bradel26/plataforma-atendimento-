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
  /**
   * Rotas de registro que pertencem a este modulo — `/contatos/:id` e do CRM.
   *
   * Ficam aqui, e nao numa tabela propria de rotas, porque o menu ja e a fonte
   * unica de "que rota existe e quem pode ver". Uma lista paralela deixaria a
   * permissao da rota de detalhe divergir da permissao do modulo sem que nada
   * reclamasse — e a URL digitada a mao e justamente o caminho que nao passa
   * pelo menu.
   */
  subrotas?: string[];
};

/**
 * A rota casa com o padrao?
 *
 * Compara apenas o trecho estatico antes do parametro: `/contatos/:id` casa com
 * `/contatos/abc`, e nao com `/contatos` sozinho — sem id nao existe registro
 * para abrir.
 */
function combina(pathname: string, padrao: string): boolean {
  const corte = padrao.indexOf('/:');
  if (corte < 0) return pathname === padrao || pathname.startsWith(`${padrao}/`);
  const prefixo = padrao.slice(0, corte + 1);
  return pathname.startsWith(prefixo) && pathname.length > prefixo.length;
}

/**
 * Qual modulo do menu responde por esta URL.
 *
 * Usada pelo menu lateral (para marcar o item ativo), pelo cabecalho (para o
 * titulo) e pelas rotas (para a permissao). Tres lugares que antes decidiam
 * cada um por conta propria — e o `startsWith` do cabecalho marcava
 * `/configuracoes` como ativo em `/configuracoes-antigas` se ela existisse.
 */
export function itemDaRota(pathname: string): NavItem | undefined {
  return NAV.find(
    (item) => combina(pathname, item.rota) || (item.subrotas ?? []).some((s) => combina(pathname, s)),
  );
}

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
  {
    rota: '/crm',
    label: 'CRM',
    icone: IconCrm,
    perfis: ['ADMIN', 'SUPERVISOR', 'AGENTE'],
    fase: 1,
    // Cada registro principal com endereco proprio, para poder ser mandado por
    // mensagem e sobreviver a um F5. A tela e a mesma: `/crm` continua sendo a
    // lista, e a rota de detalhe so diz qual aba abrir e qual registro carregar.
    subrotas: ['/contatos/:id', '/clientes/:id', '/oportunidades/:id'],
  },
  { rota: '/configuracoes', label: 'Configuracoes', icone: IconConfiguracoes, perfis: ['ADMIN'], fase: 0 },
];
