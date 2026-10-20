import type { ComponentType } from 'react';
import type { Perfil } from '../../lib/types';
import {
  IconAtendimento,
  IconAuditoria,
  IconCampanhas,
  IconChamadoTi,
  IconConfiguracoes,
  IconCrm,
  IconDashboards,
  IconEsteira,
  IconGestao,
  IconMonitoramento,
  IconRelatorios,
  IconTelefonia,
} from './icons';

export type NavItem = {
  rota: string;
  label: string;
  icone: ComponentType<{ className?: string }>;
  /** Microanimacao do icone ao passar o mouse (ver `.icone-menu` em index.css). */
  animacao?: AnimacaoIcone;
  fase: number;
  /**
   * Rotas de registro que pertencem a este modulo — `/contatos/:id` e do CRM.
   *
   * Ficam aqui, e nao numa tabela propria de rotas, porque o menu ja e a fonte
   * unica de "que rota existe e quem pode ver". Uma lista paralela deixaria a
   * permissao da rota de detalhe divergir da permissao do modulo sem que nada
   * reclamasse — e a URL digitada a mao e justamente o caminho que nao passa
   * pelo menu.
   *
 * `perfis` na subrota restringe quem tem o modulo, para páginas de processo
 * comercial que não devem ser expostas a todos os usuários do CRM.
   */
  subrotas?: SubRota[];
};

export type AnimacaoIcone = 'pulo' | 'balancar' | 'girar' | 'inclinar' | 'deslizar' | 'pulsar';

export type SubRota = {
  rota: string;
  /** Restrição complementar à permissão do módulo, quando a rota exigir. */
  perfis?: Perfil[];
};

/** Perfis efetivos de uma subrota: os dela, ou os do modulo. */
export const perfisDaSubrota = (_item: NavItem, sub: SubRota): Perfil[] => sub.perfis ?? [];

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
    (item) =>
      combina(pathname, item.rota) || (item.subrotas ?? []).some((s) => combina(pathname, s.rota)),
  );
}

/** A subrota que responde por esta URL, se houver. */
export function subrotaDaRota(pathname: string): { item: NavItem; sub: SubRota } | undefined {
  for (const item of NAV) {
    const sub = (item.subrotas ?? []).find((s) => combina(pathname, s.rota));
    if (sub) return { item, sub };
  }
  return undefined;
}

/** Menu lateral fixo — ordem definida no SCOPE.md (Fase 0). */
export const NAV: NavItem[] = [
  { rota: '/dashboards', label: 'Dashboards', icone: IconDashboards, animacao: 'pulo', fase: 3 },
  { rota: '/atendimento', label: 'Atendimento', icone: IconAtendimento, animacao: 'balancar', fase: 1 },
  { rota: '/telefonia', label: 'Telefonia', icone: IconTelefonia, animacao: 'balancar', fase: 1 },
  // Esteira de Credenciamento logo depois do Atendimento: e a ordem de trabalho
  // da operacao TIM/Starlink (SUGESTOES.docx). So aparece para a organizacao
  // que tem funil ESTEIRA — ver o filtro em Sidebar.tsx.
  {
    rota: '/esteira',
    label: 'Esteira',
    icone: IconEsteira,
    animacao: 'deslizar',
    fase: 5,
  },
  { rota: '/monitoramento', label: 'Monitoramento', icone: IconMonitoramento, animacao: 'pulsar', fase: 3 },
  { rota: '/auditoria', label: 'Auditoria', icone: IconAuditoria, animacao: 'pulo', fase: 3 },
  { rota: '/gestao', label: 'Área da Gestão', icone: IconGestao, animacao: 'pulsar', fase: 3 },
  // GESTOR e COMERCIAL entram aqui pelo mesmo motivo que entravam na aba Leads
  // do CRM antes dela mudar de casa: leitura/trabalho do proprio funil.
  { rota: '/campanhas', label: 'Campanhas', icone: IconCampanhas, animacao: 'inclinar', fase: 4 },
  { rota: '/relatorios', label: 'Desempenho Operacional', icone: IconRelatorios, animacao: 'deslizar', fase: 3 },
  {
    rota: '/crm',
    label: 'CRM',
    icone: IconCrm,
    animacao: 'pulo',
    fase: 1,
    // Cada registro principal com endereco proprio, para poder ser mandado por
    // mensagem e sobreviver a um F5. A tela e a mesma: `/crm` continua sendo a
    // lista, e a rota de detalhe so diz qual aba abrir e qual registro carregar.
    subrotas: [
      { rota: '/contatos/:id' },
      { rota: '/clientes/:id' },
      // Oportunidade e processo comercial: o AGENTE ve o CRM, mas nao esta rota.
      // Ele continua vendo informacao comercial resumida na ficha do cliente.
      { rota: '/jornadas/:id', perfis: ['ADMIN', 'SUPERVISOR', 'GESTOR', 'COMERCIAL'] },
      // Endereco antigo da mesma tela, mantido para nao quebrar link salvo.
      { rota: '/oportunidades/:id', perfis: ['ADMIN', 'SUPERVISOR', 'GESTOR', 'COMERCIAL'] },
    ],
  },
  { rota: '/configuracoes', label: 'Configurações', icone: IconConfiguracoes, animacao: 'girar', fase: 0 },
  // Visivel a todo perfil, de proposito: problema de sistema afeta
  // qualquer pessoa que usa a plataforma, nao so quem administra.
  {
    rota: '/chamado-ti',
    label: 'Chamado de TI',
    icone: IconChamadoTi,
    animacao: 'girar',
    fase: 6,
  },
];
