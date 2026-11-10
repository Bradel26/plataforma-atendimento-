import type { ColunaEsteira } from '../../lib/esteiraTypes';
import { Popover } from './BarraDeFiltros';
import { alternarColuna, reordenarColunas } from './listaEsteira';

/**
 * Colunas da Lista (spec 6.3): mostrar/ocultar e mudar a ordem por botões
 * subir/descer (caminho de teclado e toque; no desktop também dá para arrastar
 * o cabeçalho). Visíveis primeiro, na ordem da tela; depois as ocultas.
 */
export function SeletorDeColunas({
  colunas,
  visiveis,
  aoMudar,
}: {
  colunas: ColunaEsteira[];
  /** Chaves visíveis, na ordem. */
  visiveis: string[];
  aoMudar: (chaves: string[]) => void;
}) {
  const porChave = new Map(colunas.map((c) => [c.chave, c]));
  const mostradas = visiveis.filter((k) => porChave.has(k));
  const ocultas = colunas.filter((c) => !mostradas.includes(c.chave));
  const padrao = colunas.filter((c) => c.padrao).map((c) => c.chave);
  const ehPadrao = padrao.length === mostradas.length && padrao.every((k, i) => mostradas[i] === k);

  const botaoSeta = (rotulo: string, desabilitado: boolean, aoClicar: () => void, caminho: string) => (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      disabled={desabilitado}
      onClick={aoClicar}
      className="anel-de-foco grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path d={caminho} />
      </svg>
    </button>
  );

  return (
    <Popover rotulo={`Colunas (${mostradas.length})`} ativo={!ehPadrao} largura="w-72">
      {() => (
        <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
          <fieldset>
            <legend className="px-1 pb-1 text-xs font-semibold text-slate-500">Visíveis, na ordem da tabela</legend>
            <ul className="flex flex-col">
              {mostradas.map((chave, i) => {
                const c = porChave.get(chave)!;
                return (
                  <li key={chave} className="flex items-center gap-1 rounded-md px-1 hover:bg-slate-50">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked
                        disabled={mostradas.length === 1}
                        onChange={() => aoMudar(alternarColuna(mostradas, chave))}
                      />
                      <span className="truncate">{c.rotulo}</span>
                    </label>
                    {botaoSeta(`Subir ${c.rotulo}`, i === 0, () => aoMudar(reordenarColunas(mostradas, chave, mostradas[i - 1]!)), 'm18 15-6-6-6 6')}
                    {botaoSeta(
                      `Descer ${c.rotulo}`,
                      i === mostradas.length - 1,
                      () => aoMudar(reordenarColunas(mostradas, chave, mostradas[i + 1]!)),
                      'm6 9 6 6 6-6',
                    )}
                  </li>
                );
              })}
            </ul>
          </fieldset>
          {ocultas.length > 0 && (
            <fieldset className="border-t border-slate-100 pt-2">
              <legend className="sr-only">Ocultas</legend>
              <p aria-hidden="true" className="px-1 pb-1 text-xs font-semibold text-slate-500">
                Ocultas
              </p>
              <ul className="flex flex-col">
                {ocultas.map((c) => (
                  <li key={c.chave}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm text-slate-700 hover:bg-slate-50">
                      <input type="checkbox" checked={false} onChange={() => aoMudar(alternarColuna(mostradas, c.chave))} />
                      <span className="truncate">{c.rotulo}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}
          <button
            type="button"
            disabled={ehPadrao}
            onClick={() => aoMudar(padrao)}
            className="anel-de-foco self-start rounded-md px-1 py-1 text-xs font-semibold text-[var(--brand-primary)] hover:underline disabled:text-slate-400 disabled:no-underline"
          >
            Restaurar colunas padrão
          </button>
        </div>
      )}
    </Popover>
  );
}
