import { useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { TabsDeNavegacao } from '../../components/ui/Tabs';
import { useAuth } from '../../features/auth/AuthProvider';
import type { Perfil } from '../../lib/types';
import { MetasTab } from './MetasTab';
import { ProdutividadeTab } from './ProdutividadeTab';
import { ContasTab } from './ContasTab';
import { DadosTab } from './DadosTab';
import { AgendaDaSemana } from './AgendaDaSemana';
import { ContatosTab } from './ContatosTab';
import { OportunidadesTab } from './OportunidadesTab';
import { PainelVendedorTab } from './PainelVendedorTab';
import { HistoricoTab } from './HistoricoTab';
import { AcompanhamentosTab } from './AcompanhamentosTab';
import { CicloParceiroTab } from './CicloParceiroTab';
import { JornadasTab } from './JornadasTab';

/**
 * `perfis` na aba restringe quem a ve.
 *
 * Esconder e melhor que deixar clicar e receber erro: lead e oportunidade sao
 * processo comercial, a API recusa por perfil, e uma aba que sempre falha e uma
 * aba que nao deveria estar la. Ausente = todos que ja chegaram ao CRM.
 *
 * Todas na mesma barra, sem agrupamento em "Mais": a barra ja rola na
 * horizontal (ver `TabsDeNavegacao`/`CLASSE_CONTAINER`), entao esconder metade
 * das abas atras de um segundo clique so custava descoberta, sem ganhar espaco.
 */
const ABAS = [
  /*
   * A agenda vem primeiro (item E.5).
   *
   * E a unica aba que responde "o que eu faco agora?" — as outras respondem "quem
   * e essa pessoa" e "como esta o funil", que sao perguntas de consulta. Por isso
   * ela e a primeira da fila.
   *
   * A aba PADRAO continua sendo contatos, e de proposito: `/crm` e o endereco que
   * a navegacao e os atalhos ja abrem, e trocar o destino dele mudaria o
   * comportamento de quem digita o endereco de cor. Quem quer a agenda clica nela
   * ou usa `/crm?aba=agenda`.
   *
   * Sem perfil restrito: cada um ve a propria agenda pela politica de atividades.
   */
  { id: 'agenda', label: 'Agenda' },
  { id: 'contatos', label: 'Contatos' },
  /*
   * Agenda | Contatos | Historico | Acompanhamentos (SUGESTOES.docx, CRM).
   *
   * Historico e a linha do tempo 360 do parceiro; Acompanhamentos lista quem
   * precisa de acao. Acompanhamentos le a esteira, e a esteira nao e do AGENTE
   * (mesmo corte de `/credenciamentos`), entao a aba segue o mesmo perfil.
   */
  { id: 'historico', label: 'Historico' },
  { id: 'acompanhamentos', label: 'Acompanhamentos', perfis: ['ADMIN', 'SUPERVISOR', 'GESTOR', 'COMERCIAL'] },
  // Ciclo de vida do parceiro depois de credenciado. Le a esteira, entao segue o mesmo perfil.
  { id: 'ciclo-parceiro', label: 'Ciclo do parceiro', perfis: ['ADMIN', 'SUPERVISOR', 'GESTOR', 'COMERCIAL'] },
  { id: 'contas', label: 'Empresas' },
  // Leads mudou para a aba Campanhas (mesmo funil de captacao); nao mora mais aqui.
  { id: 'jornadas', label: 'Jornadas', perfis: ['ADMIN', 'SUPERVISOR', 'GESTOR', 'COMERCIAL'] },
  // Ler o painel de metas e trabalho de gestao (inclui GESTOR); DEFINIR meta e
  // ADMIN/SUPERVISOR, e o formulario da rampa se esconde dentro da aba. Mesmo
  // corte da politica de desconto e do processo do funil.
  // COMERCIAL entra para ver as proprias metas de operacao; as comerciais seguem restritas a gestao.
  { id: 'metas', label: 'Metas', perfis: ['ADMIN', 'SUPERVISOR', 'GESTOR', 'COMERCIAL'] },
  // Mesmo corte de leitura de metas e da leitura comercial: e painel de gestao.
  { id: 'produtividade', label: 'Produtividade', perfis: ['ADMIN', 'SUPERVISOR', 'GESTOR'] },
  // Mesmo corte de leitura de metas e produtividade: e painel de gestao. COMERCIAL
  // entra tambem porque, ao contrario das outras tres, esta aba serve para a propria
  // pessoa ver o proprio resumo — nao so para quem gerencia.
  { id: 'painel-vendedor', label: 'Painel do vendedor', perfis: ['ADMIN', 'SUPERVISOR', 'GESTOR', 'COMERCIAL'] },
  // Renomear e remover etiqueta alcancam registros que quem clica nao ve, entao
  // a aba segue o mesmo perfil da rota: ADMIN e SUPERVISOR.
  { id: 'dados', label: 'Importar / Exportar', perfis: ['ADMIN', 'SUPERVISOR'] },
] as const satisfies ReadonlyArray<{ id: string; label: string; perfis?: readonly Perfil[] }>;

type AbaId = (typeof ABAS)[number]['id'];

/**
 * Onde cada registro mora, e em que aba ele aparece.
 *
 * `/clientes/:id` abre a aba Contas: "cliente" e a palavra de quem usa, "conta"
 * e a do modelo de dados. A URL fala a lingua de fora.
 */
const REGISTROS = {
  contatos: { base: '/contatos', aba: 'contatos' },
  clientes: { base: '/clientes', aba: 'contas' },
  jornadas: { base: '/jornadas', aba: 'jornadas' },
  // Endereco antigo: abre a mesma aba.
  oportunidades: { base: '/oportunidades', aba: 'jornadas' },
} as const satisfies Record<string, { base: string; aba: AbaId }>;

const POR_PREFIXO = Object.values(REGISTROS);

/**
 * A aba e o registro aberto vem da URL, nao de `useState`.
 *
 * Era estado local, e por isso um F5 devolvia a tela em branco e um link
 * colado no chat nao abria nada. Com a URL como fonte, recarregar, voltar e
 * mandar o endereco para outra pessoa passam a funcionar de graca — e nenhum
 * componente da ficha precisou mudar.
 */
export function CrmPage() {
  const { pathname, search } = useLocation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { temPerfil } = useAuth();

  const abasVisiveis = ABAS.filter((a) => ('perfis' in a ? temPerfil(...a.perfis) : true));

  const registro = POR_PREFIXO.find((r) => pathname.startsWith(`${r.base}/`));
  const abaPedida = new URLSearchParams(search).get('aba');
  // `?aba=oportunidades` e o endereco antigo da aba Jornadas.
  const abaDaBusca = abaPedida === 'oportunidades' ? 'jornadas' : abaPedida;
  // Endereco antigo: troca a URL para o novo sem criar entrada no historico do navegador.
  useEffect(() => {
    if (abaPedida === 'oportunidades') navigate('/crm?aba=jornadas', { replace: true });
  }, [abaPedida, navigate]);
  // Aba pedida na URL so vale se o perfil a enxerga: `?aba=metas` digitado por
  // um agente cai em Contatos, e nao numa aba que a API vai recusar.
  const aba: AbaId =
    registro?.aba ??
    (abasVisiveis.some((a) => a.id === abaDaBusca) ? (abaDaBusca as AbaId) : 'contatos');

  // Trocar de aba volta para a lista: a rota de detalhe pertence a uma aba, e
  // ficar em `/contatos/abc` mostrando a aba Contas seria a URL mentindo.
  const trocarAba = (proxima: AbaId) =>
    navigate(proxima === 'contatos' ? '/crm' : `/crm?aba=${proxima}`);

  const abrir = (base: string) => (registroId: string) => navigate(`${base}/${registroId}`);
  const fechar = (proxima: AbaId) => () => trocarAba(proxima);

  /** Mesmo endereco que `trocarAba` ja monta — a URL nao muda, so quem a desenha. */
  const hrefDaAba = (abaId: AbaId) => (abaId === 'contatos' ? '/crm' : `/crm?aba=${abaId}`);

  return (
    <div className="space-y-5">
      <TabsDeNavegacao
        itens={abasVisiveis.map(({ id: abaId, label }) => ({
          rota: hrefDaAba(abaId),
          rotulo: label,
          ativo: aba === abaId,
        }))}
      />

      {aba === 'agenda' && <AgendaDaSemana />}
      {aba === 'historico' && <HistoricoTab />}
      {aba === 'acompanhamentos' && <AcompanhamentosTab />}
      {aba === 'ciclo-parceiro' && <CicloParceiroTab />}
      {aba === 'contatos' && (
        <ContatosTab
          selecionadoId={registro?.base === '/contatos' ? (id ?? null) : null}
          aoAbrir={abrir('/contatos')}
          aoFechar={fechar('contatos')}
        />
      )}
      {aba === 'contas' && (
        <ContasTab
          selecionadoId={registro?.base === '/clientes' ? (id ?? null) : null}
          aoAbrir={abrir('/clientes')}
          aoFechar={fechar('contas')}
        />
      )}
      {/*
        Jornadas = etapa do parceiro na relacao com a empresa, sem valores. O funil
        de vendas antigo so aparece para abrir uma oportunidade que ja existe
        (`/oportunidades/:id`), para nao quebrar link salvo.
      */}
      {aba === 'jornadas' && !((registro?.base === '/jornadas' || registro?.base === '/oportunidades') && id) && <JornadasTab />}
      {aba === 'jornadas' && (registro?.base === '/jornadas' || registro?.base === '/oportunidades') && id && (
        <OportunidadesTab
          selecionadoId={id ?? null}
          aoAbrir={abrir('/jornadas')}
          aoFechar={fechar('jornadas')}
        />
      )}
      {aba === 'metas' && <MetasTab />}
      {aba === 'produtividade' && <ProdutividadeTab />}
      {aba === 'painel-vendedor' && <PainelVendedorTab />}
      {aba === 'dados' && <DadosTab />}
    </div>
  );
}
