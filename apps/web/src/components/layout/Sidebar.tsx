import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthProvider';
import { useBranding } from '../../features/branding/BrandingProvider';
import { NAV, itemDaRota } from './nav';

/** Menu lateral fixo com os 10 modulos do produto. */
export function Sidebar() {
  const { temPerfil } = useAuth();
  const { branding } = useBranding();
  const { pathname } = useLocation();
  const itens = NAV.filter((item) => temPerfil(...item.perfis));
  /**
   * O item ativo vem do proprio menu, nao do `isActive` do NavLink.
   *
   * O NavLink compara com o `to` dele, entao em `/contatos/abc` nenhum link
   * casaria e o menu apareceria inteiro apagado — a pessoa esta no CRM e o
   * menu diria que ela nao esta em lugar nenhum.
   */
  const ativo = itemDaRota(pathname)?.rota;

  return (
    <aside
      className="flex w-60 shrink-0 flex-col text-slate-300"
      style={{ backgroundColor: 'var(--brand-secondary)' }}
    >
      <div className="flex h-16 items-center gap-2.5 px-5">
        {branding.logoUrl ? (
          <img src={branding.logoUrl} alt="" className="h-8 w-8 rounded object-contain" />
        ) : (
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {branding.appName.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="truncate text-sm font-semibold text-white">{branding.appName}</span>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        {itens.map(({ rota, label, icone: Icone }) => {
          const estaAtivo = rota === ativo;
          return (
            <Link
              key={rota}
              to={rota}
              aria-current={estaAtivo ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                estaAtivo ? 'font-medium text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
              style={estaAtivo ? { backgroundColor: 'var(--brand-primary)' } : undefined}
            >
              <Icone />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-5 py-3 text-xs text-slate-500">MVP - Fase 0</div>
    </aside>
  );
}
