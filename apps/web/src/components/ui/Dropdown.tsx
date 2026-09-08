import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type ItemDropdown = {
  chave: string;
  rotulo: ReactNode;
  aoSelecionar: () => void;
  desabilitado?: boolean;
};

/**
 * Menu de acoes/navegacao secundaria — pra quando ha mais opcoes do que cabe
 * visivel, ou acoes de contexto de uma linha. Duas ou tres opcoes que
 * caberiam como botao nao devem virar Dropdown: esconder o que caberia a
 * vista so custa um clique a mais sem ganhar nada.
 *
 * Fecha no Esc, no clique fora e ao selecionar; abre com o primeiro item
 * focado, pra quem usa seta logo em seguida.
 */
export function Dropdown({
  rotulo,
  itens,
  ativo = false,
}: {
  rotulo: ReactNode;
  itens: ItemDropdown[];
  /**
   * O item selecionado mora dentro do menu (ex.: navegacao agrupada em
   * "Mais"). Prop dedicada, e nao `className` livre: cor de fundo/borda
   * teria que competir com as classes fixas do botao por precedencia no CSS
   * gerado, que nao segue a ordem em que os utilitarios aparecem no atributo
   * — o mesmo variante-fechado que o `Button` ja usa pra isso.
   */
  ativo?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberto) return;

    const aoClicarFora = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setAberto(false);
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAberto(false);
        botaoRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', aoClicarFora);
    window.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('mousedown', aoClicarFora);
      window.removeEventListener('keydown', aoTeclar);
    };
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    containerRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [aberto]);

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        ref={botaoRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
        className={`anel-de-foco inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition ${
          ativo
            ? 'border-transparent bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]'
            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
        }`}
      >
        {rotulo}
      </button>
      {aberto && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-40 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {itens.map((item) => (
            <button
              key={item.chave}
              type="button"
              role="menuitem"
              disabled={item.desabilitado}
              onClick={() => {
                item.aoSelecionar();
                setAberto(false);
                botaoRef.current?.focus();
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  (e.currentTarget.nextElementSibling as HTMLElement | null)?.focus();
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  (e.currentTarget.previousElementSibling as HTMLElement | null)?.focus();
                }
              }}
              className="anel-de-foco block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {item.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
