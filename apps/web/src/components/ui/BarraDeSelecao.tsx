import type { ReactNode } from 'react';

/**
 * Barra de acoes em lote — aparece quando ha selecao, some quando nao ha.
 *
 * Nao e um `Card` proprio nem um modal: fica embutida no topo da lista que
 * ela afeta, porque a acao em lote so faz sentido no contexto de "estes
 * itens, desta lista, agora". Um modal separado obrigaria a lembrar quantos e
 * quais estavam selecionados depois de fechar e reabrir.
 */
export function BarraDeSelecao({
  contagem,
  aoLimpar,
  children,
}: {
  contagem: number;
  aoLimpar: () => void;
  children: ReactNode;
}) {
  if (contagem === 0) return null;
  return (
    <div
      role="toolbar"
      aria-label="Acoes em lote"
      className="anim-entrada-suave mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/5 px-3 py-2 text-sm"
    >
      <span className="font-medium text-slate-700">
        {contagem} selecionado{contagem === 1 ? '' : 's'}
      </span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <button
        type="button"
        onClick={aoLimpar}
        className="anel-de-foco ml-auto rounded px-1 text-xs text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
      >
        Limpar selecao
      </button>
    </div>
  );
}
