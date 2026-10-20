import { useEffect, useId, type ReactNode } from 'react';

/** Painel lateral direito; Escape e clique no fundo fecham a gaveta. */
export function Gaveta({
  aberta,
  titulo,
  aoFechar,
  children,
  rodape,
}: {
  aberta: boolean;
  titulo: string;
  aoFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
}) {
  const idTitulo = useId();

  useEffect(() => {
    if (!aberta) return;
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') aoFechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberta, aoFechar]);

  if (!aberta) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={idTitulo}
      className="fixed inset-0 z-50 flex justify-end bg-black/30"
      onClick={aoFechar}
    >
      <aside className="flex h-full w-full max-w-sm flex-col bg-white shadow-xl" onClick={(evento) => evento.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 id={idTitulo} className="text-sm font-semibold text-slate-800">{titulo}</h2>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded px-2 text-lg leading-none text-slate-400 hover:text-slate-600">
            ×
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {rodape && <footer className="flex justify-between gap-2 border-t border-slate-100 px-5 py-3">{rodape}</footer>}
      </aside>
    </div>
  );
}
