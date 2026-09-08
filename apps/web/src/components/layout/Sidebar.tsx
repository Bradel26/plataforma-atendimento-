import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Tooltip } from '../ui/Tooltip';
import { useAuth } from '../../features/auth/AuthProvider';
import { useBranding } from '../../features/branding/BrandingProvider';
import { NAV, itemDaRota } from './nav';

const CHAVE_COLAPSO = 'plataforma:sidebar-colapsada';

/**
 * Menu lateral.
 *
 * Tres comportamentos, um componente:
 * - >=768px (`md`): fica no fluxo, ao lado do conteudo. Pode ser recolhida
 *   pra so icone+tooltip — nunca por padrao, so quando a pessoa pede (e a
 *   escolha fica salva).
 * - <768px: vira um drawer posicionado por cima do conteudo, fechado por
 *   padrao — uma sidebar fixa não deveria comer a largura inteira de um
 *   celular o tempo todo. Abre pelo botao no Topbar (`aberta`/`aoFechar` vem
 *   de la, porque o botao que abre mora fora deste componente).
 */
export function Sidebar({ aberta, aoFechar }: { aberta: boolean; aoFechar: () => void }) {
  const { temPerfil } = useAuth();
  const { branding } = useBranding();
  const { pathname } = useLocation();
  const [colapsada, setColapsada] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_COLAPSO) === '1';
    } catch {
      return false;
    }
  });
  const navRef = useRef<HTMLElement>(null);

  const itens = NAV.filter((item) => temPerfil(...item.perfis));
  /**
   * O item ativo vem do proprio menu, nao do `isActive` do NavLink.
   *
   * O NavLink compara com o `to` dele, entao em `/contatos/abc` nenhum link
   * casaria e o menu apareceria inteiro apagado — a pessoa esta no CRM e o
   * menu diria que ela nao esta em lugar nenhum.
   */
  const ativo = itemDaRota(pathname)?.rota;

  const alternarColapso = () => {
    setColapsada((atual) => {
      const proximo = !atual;
      try {
        localStorage.setItem(CHAVE_COLAPSO, proximo ? '1' : '0');
      } catch {
        // Preferencia de UI, nao dado — se o navegador bloquear localStorage, so nao lembra da proxima vez.
      }
      return proximo;
    });
  };

  // Fecha o drawer mobile ao trocar de rota — sem isto, navegar por um link
  // deixaria o menu aberto tampando a tela que acabou de abrir.
  useEffect(() => {
    if (aberta) aoFechar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Esc fecha o drawer mobile; o foco vai pro primeiro link ao abrir.
  useEffect(() => {
    if (!aberta) return;
    navRef.current?.querySelector<HTMLElement>('a')?.focus();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberta, aoFechar]);

  const link = (item: (typeof itens)[number]) => {
    const estaAtivo = item.rota === ativo;
    const Icone = item.icone;
    const conteudo = (
      <Link
        key={item.rota}
        to={item.rota}
        aria-current={estaAtivo ? 'page' : undefined}
        aria-label={colapsada ? item.label : undefined}
        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
          estaAtivo ? 'font-medium text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
        } ${colapsada ? 'md:justify-center' : ''}`}
        style={estaAtivo ? { backgroundColor: 'var(--brand-primary)' } : undefined}
      >
        <Icone />
        {/*
          So esconde a partir de `md` — no drawer mobile o rotulo sempre
          aparece, colapso e conceito exclusivo do modo em fluxo. O link
          continua com nome acessivel de sobra: `aria-label` quando
          recolhido, texto visivel quando nao.
        */}
        <span className={`truncate ${colapsada ? 'md:sr-only' : ''}`}>{item.label}</span>
      </Link>
    );
    return colapsada ? (
      <Tooltip key={item.rota} texto={item.label}>
        {conteudo}
      </Tooltip>
    ) : (
      conteudo
    );
  };

  return (
    <>
      {/* Backdrop do drawer mobile — so existe abaixo de `md`, onde a sidebar
          sai do fluxo e vira overlay. `black`, nao `slate-900`: a escala
          slate inverte no tema escuro e um overlay tem que escurecer nos
          dois temas. */}
      {aberta && (
        <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={aoFechar} aria-hidden="true" />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col text-slate-300 transition-transform duration-150 md:static md:z-auto md:translate-x-0 ${
          aberta ? 'translate-x-0' : '-translate-x-full'
        } ${colapsada ? 'md:w-16' : ''}`}
        style={{ backgroundColor: 'var(--brand-secondary)' }}
      >
        <div className={`flex h-16 items-center gap-2.5 px-5 ${colapsada ? 'md:justify-center md:px-0' : ''}`}>
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt="" className="h-8 w-8 shrink-0 rounded object-contain" />
          ) : (
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {branding.appName.charAt(0).toUpperCase()}
            </span>
          )}
          {/*
            So esconde a partir de `md`, e so quando recolhida: no drawer
            mobile o nome sempre aparece, colapso e conceito exclusivo do
            modo em fluxo.
          */}
          <span className={`truncate text-sm font-semibold text-white ${colapsada ? 'md:hidden' : ''}`}>
            {branding.appName}
          </span>
        </div>

        <nav ref={navRef} className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
          {itens.map(link)}
        </nav>

        {/* So existe no modo em fluxo (>=768px) — no drawer mobile recolher
            nao faz sentido, o botao que fecha e o de fora (Topbar) ou o Esc. */}
        <button
          type="button"
          onClick={alternarColapso}
          aria-expanded={!colapsada}
          aria-label={colapsada ? 'Expandir menu' : 'Recolher menu'}
          className="anel-de-foco hidden items-center justify-center border-t border-white/10 py-3 text-slate-400 hover:bg-white/5 hover:text-slate-200 md:flex"
        >
          {colapsada ? '»' : '« Recolher'}
        </button>
      </aside>
    </>
  );
}
