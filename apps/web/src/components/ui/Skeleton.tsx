/**
 * Placeholders de carregamento com a mesma silhueta do conteudo real.
 *
 * Um retangulo cinza generico nao ajuda ninguem a prever o que esta chegando;
 * a silhueta certa (uma linha de tabela, um card) deixa a tela "pronta" antes
 * mesmo do dado responder, o que e o ponto todo do skeleton.
 */

/** Peca base — exportada pra compor silhuetas proprias (avatar+linhas, etc.) sem reinventar o pulso. */
export function SkeletonBloco({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200 ${className}`} />;
}

/** Linhas de texto empilhadas — a ultima mais curta, como texto de verdade termina. */
export function SkeletonTexto({ linhas = 1 }: { linhas?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: linhas }, (_, i) => (
        <SkeletonBloco key={i} className={`h-3 ${i === linhas - 1 && linhas > 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  );
}

/** Uma linha de `<tbody>` com uma celula por coluna real da tabela. */
export function SkeletonLinhaTabela({ colunas }: { colunas: number }) {
  return (
    <tr aria-hidden="true">
      {Array.from({ length: colunas }, (_, i) => (
        <td key={i} className="py-3">
          <SkeletonBloco className="h-3.5 w-full max-w-40" />
        </td>
      ))}
    </tr>
  );
}

/** Silhueta de um `Card` com titulo e duas linhas de corpo. */
export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5" aria-hidden="true">
      <SkeletonBloco className="h-4 w-1/3" />
      <div className="mt-3 space-y-2">
        <SkeletonBloco className="h-3 w-full" />
        <SkeletonBloco className="h-3 w-5/6" />
      </div>
    </div>
  );
}
