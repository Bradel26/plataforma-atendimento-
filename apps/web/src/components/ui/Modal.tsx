import { useEffect, useId, type ReactNode } from 'react';

/** Diálogo central reutilizável; Escape e clique fora apenas fecham o modal. */
export function Modal({
  aberto,
  titulo,
  aoFechar,
  children,
  rodape,
  largura = 'max-w-md',
}: {
  aberto: boolean;
  titulo: string;
  aoFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
  largura?: string;
}) {
  const idTitulo = useId();

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') aoFechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={idTitulo}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      onClick={aoFechar}
    >
      <div
        className={`anim-entrada-dialogo flex max-h-[90vh] w-full ${largura} flex-col rounded-xl border border-slate-200 bg-white shadow-xl`}
        onClick={(evento) => evento.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 id={idTitulo} className="text-sm font-semibold text-slate-800">{titulo}</h2>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded px-2 text-lg leading-none text-slate-400 hover:text-slate-600">
            ×
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {rodape && <footer className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{rodape}</footer>}
      </div>
    </div>
  );
}
