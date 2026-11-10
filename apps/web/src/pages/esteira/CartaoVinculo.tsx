import { iniciais } from '../../components/ui/Pagina';
import type { VinculoResumo } from '../../lib/esteiraTypes';
import { ESTADO } from '../../lib/viz';
import type { CampoOcultavel } from './estadoEsteira';
import { textoParado, textoUltimaInteracao } from './regrasMovimento';

/**
 * Cartão do vínculo no Kanban (spec 6.1). Só tons que o tema escuro remapeia
 * (`slate-*`, `*-50`/`*-700`, `--brand-*`). Arraste HTML5 nativo no `<li>`;
 * o clique (ou Enter) no botão abre a gaveta.
 */
export function CartaoVinculo({
  vinculo: v,
  densidade,
  ocultos,
  arrastavel,
  arrastando,
  aoIniciarArraste,
  aoTerminarArraste,
  aoAbrir,
}: {
  vinculo: VinculoResumo;
  densidade: 'compacta' | 'detalhada';
  ocultos: ReadonlySet<CampoOcultavel>;
  arrastavel: boolean;
  arrastando: boolean;
  aoIniciarArraste: (v: VinculoResumo) => void;
  aoTerminarArraste: () => void;
  aoAbrir: (v: VinculoResumo) => void;
}) {
  const detalhada = densidade === 'detalhada';
  const local = [v.parceiro.cidade, v.parceiro.uf].filter(Boolean).join('/');
  const mostrar = (c: CampoOcultavel) => !ocultos.has(c);

  return (
    <li
      draggable={arrastavel}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        // Firefox só inicia o arraste com algum dado.
        e.dataTransfer.setData('text/plain', v.id);
        aoIniciarArraste(v);
      }}
      onDragEnd={aoTerminarArraste}
      className={`rounded-xl border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition hover:-translate-y-px hover:shadow-md ${
        arrastavel ? 'cursor-grab active:cursor-grabbing' : ''
      } ${v.parado ? 'border-red-200' : 'border-slate-200'} ${arrastando ? 'opacity-40' : ''}`}
    >
      <button
        type="button"
        onClick={() => aoAbrir(v)}
        aria-label={`Abrir ${v.parceiro.nome}`}
        className={`anel-de-foco flex w-full flex-col rounded-xl text-left ${detalhada ? 'gap-2 p-3' : 'gap-1 px-3 py-2'}`}
      >
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-bold text-slate-900">{v.parceiro.nome}</span>
          {mostrar('cidade') && (
            <span className="mt-0.5 block truncate text-xs text-slate-500">{local || 'Sem cidade/UF'}</span>
          )}
        </span>

        {(v.parado || (detalhada && mostrar('etiquetas') && v.etiquetas.length > 0)) && (
          <span className="flex flex-wrap items-center gap-1.5">
            {v.parado && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 py-0.5 pl-1.5 pr-2 text-[11.5px] font-semibold text-red-700">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ESTADO.grave }} aria-hidden="true" />
                {textoParado(v.diasNaEtapa)}
              </span>
            )}
            {detalhada &&
              mostrar('etiquetas') &&
              v.etiquetas.map((t) => (
                <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11.5px] font-medium text-slate-600">
                  {t}
                </span>
              ))}
          </span>
        )}

        {detalhada && (mostrar('responsavel') || mostrar('ultimaInteracao')) && (
          <span className="flex items-center gap-2 border-t border-slate-100 pt-2">
            {mostrar('responsavel') &&
              (v.responsavel ? (
                <>
                  <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary-soft)] text-[10px] font-bold text-[var(--brand-primary)]">
                    {iniciais(v.responsavel.nome) || '?'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-600">{v.responsavel.nome}</span>
                </>
              ) : (
                <span className="min-w-0 flex-1 text-xs text-slate-500">Sem responsável</span>
              ))}
            {mostrar('ultimaInteracao') && (
              <span
                className={`shrink-0 text-[11.5px] tabular-nums text-slate-500 ${mostrar('responsavel') ? '' : 'flex-1'}`}
                title="Última interação"
              >
                {textoUltimaInteracao(v.ultimaInteracaoEm)}
              </span>
            )}
          </span>
        )}
      </button>
    </li>
  );
}
