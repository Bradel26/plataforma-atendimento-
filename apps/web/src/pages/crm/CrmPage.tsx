import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthProvider';
import type { Perfil } from '../../lib/types';
import { ContasTab } from './ContasTab';
import { DadosTab } from './DadosTab';
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
 */
const ABAS = [
  { id: 'contatos', label: 'Contatos' },
  { id: 'contas', label: 'Contas' },
  { id: 'leads', label: 'Leads', perfis: ['ADMIN', 'SUPERVISOR', 'GESTOR', 'COMERCIAL'] },
  { id: 'oportunidades', label: 'Oportunidades', perfis: ['ADMIN', 'SUPERVISOR', 'GESTOR', 'COMERCIAL'] },
  { id: 'produtos', label: 'Produtos e precos', perfis: ['ADMIN', 'SUPERVISOR'] },
  // Renomear e remover etiqueta alcancam registros que quem clica nao ve, entao
  // a aba segue o mesmo perfil da rota: ADMIN e SUPERVISOR.
  { id: 'etiquetas', label: 'Etiquetas', perfis: ['ADMIN', 'SUPERVISOR'] },
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

  return (
    <div className="space-y-5">
      <nav className="flex flex-wrap gap-1 border-b border-slate-200">
        {abasVisiveis.map(({ id: abaId, label }) => (
          <button
            key={abaId}
            type="button"
            onClick={() => trocarAba(abaId)}
            aria-current={aba === abaId ? 'page' : undefined}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm transition ${
              aba === abaId
                ? 'border-[var(--brand-primary)] font-medium text-[var(--brand-primary)]'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

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
      {aba === 'produtos' && <ProdutosTab />}
      {aba === 'etiquetas' && <EtiquetasTab />}
      {aba === 'dados' && <DadosTab />}
    </div>
  );
}
