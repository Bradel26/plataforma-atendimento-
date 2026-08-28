import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ContasTab } from './ContasTab';
import { DadosTab } from './DadosTab';
import { ContatosTab } from './ContatosTab';
import { LeadsTab } from './LeadsTab';
import { OportunidadesTab } from './OportunidadesTab';
import { ProdutosTab } from './ProdutosTab';

const ABAS = [
  { id: 'contatos', label: 'Contatos' },
  { id: 'contas', label: 'Contas' },
  { id: 'leads', label: 'Leads' },
  { id: 'oportunidades', label: 'Oportunidades' },
  { id: 'produtos', label: 'Produtos e precos' },
  { id: 'dados', label: 'Importar / Exportar' },
] as const;

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

  const registro = POR_PREFIXO.find((r) => pathname.startsWith(`${r.base}/`));
  const abaDaBusca = new URLSearchParams(search).get('aba');
  const aba: AbaId =
    registro?.aba ??
    (ABAS.some((a) => a.id === abaDaBusca) ? (abaDaBusca as AbaId) : 'contatos');

  // Trocar de aba volta para a lista: a rota de detalhe pertence a uma aba, e
  // ficar em `/contatos/abc` mostrando a aba Contas seria a URL mentindo.
  const trocarAba = (proxima: AbaId) =>
    navigate(proxima === 'contatos' ? '/crm' : `/crm?aba=${proxima}`);

  const abrir = (base: string) => (registroId: string) => navigate(`${base}/${registroId}`);
  const fechar = (proxima: AbaId) => () => trocarAba(proxima);

  return (
    <div className="space-y-5">
      <nav className="flex flex-wrap gap-1 border-b border-slate-200">
        {ABAS.map(({ id: abaId, label }) => (
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
      {aba === 'dados' && <DadosTab />}
    </div>
  );
}
