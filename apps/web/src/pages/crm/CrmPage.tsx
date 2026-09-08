import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Dropdown } from '../../components/ui/Dropdown';
import { TabsDeNavegacao } from '../../components/ui/Tabs';
import { useAuth } from '../../features/auth/AuthProvider';
import type { Perfil } from '../../lib/types';
import { ComercialTab } from './ComercialTab';
import { MetasTab } from './MetasTab';
import { ProdutividadeTab } from './ProdutividadeTab';
import { ContasTab } from './ContasTab';
import { DadosTab } from './DadosTab';
import { AgendaDaSemana } from './AgendaDaSemana';
import { ContatosTab } from './ContatosTab';
import { LeadsTab } from './LeadsTab';
import { OportunidadesTab } from './OportunidadesTab';
import { EtiquetasTab } from './EtiquetasTab';
import { ProdutosTab } from './ProdutosTab';

/**
 * `perfis` na aba restringe quem a ve.
 *
 * Esconder e melhor que deixar clicar e receber erro: lead e oportunidade sao
 * processo comercial, a API recusa por perfil, e uma aba que sempre falha e uma
 * aba que nao deveria estar la. Ausente = todos que ja chegaram ao CRM.
 *
 * `grupo` separa o que e trabalho do dia a dia (aba direta, sempre visivel)
 * do que e leitura de gestao ou administracao (agrupado em "Mais"). O corte
 * segue o que o proprio codigo das telas ja documentava antes desta fase:
 * comercial/metas/produtividade sao descritas como "painel de gestao" nos
 * comentarios originais, e produtos/etiquetas/dados sao tarefas de
 * configuracao com o mesmo perfil de acesso (ADMIN/SUPERVISOR). Nenhuma
 * dessas seis e o que faz alguem abrir o CRM no meio de um atendimento.
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
  { id: 'agenda', label: 'Agenda', grupo: 'direta' },
  { id: 'contatos', label: 'Contatos', grupo: 'direta' },
  { id: 'contas', label: 'Contas', grupo: 'direta' },
  { id: 'leads', label: 'Leads', perfis: ['ADMIN', 'SUPERVISOR', 'GESTOR', 'COMERCIAL'], grupo: 'direta' },
  { id: 'oportunidades', label: 'Oportunidades', perfis: ['ADMIN', 'SUPERVISOR', 'GESTOR', 'COMERCIAL'], grupo: 'direta' },
  // Mesmos perfis do `requireRole` das rotas `/comercial/*`: a aba que sempre
  // recebe 403 e uma aba que nao deveria existir para aquele perfil.
  { id: 'comercial', label: 'Leitura comercial', perfis: ['ADMIN', 'SUPERVISOR', 'GESTOR'], grupo: 'mais' },
  // Ler o painel de metas e trabalho de gestao (inclui GESTOR); DEFINIR meta e
  // ADMIN/SUPERVISOR, e o formulario da rampa se esconde dentro da aba. Mesmo
  // corte da politica de desconto e do processo do funil.
  { id: 'metas', label: 'Metas', perfis: ['ADMIN', 'SUPERVISOR', 'GESTOR'], grupo: 'mais' },
  // Mesmo corte de leitura de metas e da leitura comercial: e painel de gestao.
  { id: 'produtividade', label: 'Produtividade', perfis: ['ADMIN', 'SUPERVISOR', 'GESTOR'], grupo: 'mais' },
  { id: 'produtos', label: 'Produtos e precos', perfis: ['ADMIN', 'SUPERVISOR'], grupo: 'mais' },
  // Renomear e remover etiqueta alcancam registros que quem clica nao ve, entao
  // a aba segue o mesmo perfil da rota: ADMIN e SUPERVISOR.
  { id: 'etiquetas', label: 'Etiquetas', perfis: ['ADMIN', 'SUPERVISOR'], grupo: 'mais' },
  { id: 'dados', label: 'Importar / Exportar', perfis: ['ADMIN', 'SUPERVISOR'], grupo: 'mais' },
] as const satisfies ReadonlyArray<{ id: string; label: string; perfis?: readonly Perfil[]; grupo: 'direta' | 'mais' }>;

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
  oportunidades: { base: '/oportunidades', aba: 'oportunidades' },
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
  const abaDaBusca = new URLSearchParams(search).get('aba');
  // Aba pedida na URL so vale se o perfil a enxerga: `?aba=leads` digitado por
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

  const diretas = abasVisiveis.filter((a) => a.grupo === 'direta');
  const agrupadas = abasVisiveis.filter((a) => a.grupo === 'mais');
  const abaAgrupadaAtiva = agrupadas.find((a) => a.id === aba);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
        <TabsDeNavegacao
          itens={diretas.map(({ id: abaId, label }) => ({
            rota: hrefDaAba(abaId),
            rotulo: label,
            ativo: aba === abaId,
          }))}
        />

        {/*
          Leitura de gestao e tarefas administrativas — nao e o que faz
          alguem abrir o CRM no meio do dia, mas continuam a um clique, nunca
          escondidas atras de uma segunda tela. Preserva a mesma URL
          (`?aba=`) que a aba direta usaria: so muda quem desenha o link.
        */}
        {agrupadas.length > 0 && (
          <div className="mb-1">
            <Dropdown
              rotulo={abaAgrupadaAtiva ? abaAgrupadaAtiva.label : 'Mais'}
              ativo={Boolean(abaAgrupadaAtiva)}
              itens={agrupadas.map(({ id: abaId, label }) => ({
                chave: abaId,
                rotulo: label,
                aoSelecionar: () => trocarAba(abaId),
              }))}
            />
          </div>
        )}
      </div>

      {aba === 'agenda' && <AgendaDaSemana />}
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
      {aba === 'leads' && <LeadsTab />}
      {aba === 'oportunidades' && (
        <OportunidadesTab
          selecionadoId={registro?.base === '/oportunidades' ? (id ?? null) : null}
          aoAbrir={abrir('/oportunidades')}
          aoFechar={fechar('oportunidades')}
        />
      )}
      {aba === 'comercial' && <ComercialTab />}
      {aba === 'metas' && <MetasTab />}
      {aba === 'produtividade' && <ProdutividadeTab />}
      {aba === 'produtos' && <ProdutosTab />}
      {aba === 'etiquetas' && <EtiquetasTab />}
      {aba === 'dados' && <DadosTab />}
    </div>
  );
}
