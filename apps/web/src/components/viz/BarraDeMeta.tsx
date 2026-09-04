import type { SituacaoMeta } from '../../lib/types';

/**
 * Barra de progresso de uma meta: uma serie so (o percentual, capado a 100%
 * de largura mas rotulado com o real), nunca "realizado" e "meta" como duas
 * barras ou dois eixos — as duas tem escalas diferentes (fluxo do periodo x
 * alvo), e combina-las sugeriria uma comparacao que nao e assim que a meta se
 * le. Compartilhada entre a aba Metas e o dashboard (item 4.2) para as duas
 * telas lerem "progresso" da mesma forma visual.
 */
export function BarraDeMeta({ percentual, situacao }: { percentual: number | null; situacao: SituacaoMeta }) {
  if (percentual === null) return <span className="text-xs text-slate-400">sem meta</span>;
  const largura = Math.min(100, Math.max(0, percentual * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
        {/* A cor segue a SITUACAO, nao a posicao na lista. */}
        <div
          className={`h-full rounded-full ${
            situacao === 'ATINGIDA'
              ? 'bg-emerald-500'
              : situacao === 'NO_RITMO'
                ? 'bg-[var(--brand-primary)]'
                : 'bg-amber-400'
          }`}
          style={{ width: `${largura}%` }}
        />
      </div>
      <span className="text-xs text-slate-500">{Math.round(percentual * 100)}%</span>
    </div>
  );
}
