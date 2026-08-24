import type { ReactNode } from 'react';

/**
 * Numero unico com rotulo. Nao e grafico: uma metrica isolada se le mais rapido
 * como texto grande do que como barra de um item.
 *
 * O valor usa cor de texto, nao cor de serie — a cor entra so quando o proprio
 * numero representa um estado (ex.: SLA vencido).
 */
export function StatTile({
  rotulo,
  valor,
  detalhe,
  estado,
  destaque,
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: string;
  estado?: string;
  destaque?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p
        className={`mt-1 font-semibold tabular-nums ${destaque ? 'text-3xl' : 'text-2xl'}`}
        style={{ color: estado ?? '#0f172a' }}
      >
        {valor}
      </p>
      {detalhe && <p className="mt-0.5 text-xs text-slate-500">{detalhe}</p>}
    </div>
  );
}
