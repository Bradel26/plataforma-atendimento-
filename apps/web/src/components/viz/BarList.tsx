import { useId, useState } from 'react';

type Item = { rotulo: string; valor: number; cor?: string };

/**
 * Barras horizontais para magnitude por categoria.
 *
 * Horizontal porque os rotulos sao palavras (WHATSAPP, EM_ATENDIMENTO) — na
 * vertical eles girariam. Cada barra carrega nome e valor visiveis: alem de ser
 * mais rapido de ler que um eixo, e o que satisfaz a regra de contraste dos tons
 * mais claros da paleta.
 *
 * Toda barra tem tabela equivalente. Nao e enfeite de acessibilidade: quem usa
 * leitor de tela nao le comprimento, e quem quer conferir numero exato tambem
 * prefere a tabela. A barra fica marcada como decorativa, e a tabela e a fonte.
 */
export function BarList({
  itens,
  vazio = 'Sem dados no periodo',
  unidade,
}: {
  itens: Item[];
  vazio?: string;
  unidade?: string;
}) {
  const [comoTabela, setComoTabela] = useState(false);
  const idTabela = useId();

  const total = itens.reduce((acc, i) => acc + i.valor, 0);
  const maximo = Math.max(...itens.map((i) => i.valor), 1);

  if (itens.length === 0 || total === 0) {
    return <p className="py-2 text-sm text-slate-500">{vazio}</p>;
  }

  const proporcao = (valor: number) => Math.round((valor / total) * 100);
  const comUnidade = (valor: number) => `${valor}${unidade ? ` ${unidade}` : ''}`;

  return (
    <div>
      {comoTabela ? (
        <table className="w-full text-sm" id={idTabela}>
          <caption className="sr-only">Valores por categoria, com participacao no total</caption>
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="py-1.5 pr-4 font-medium">Categoria</th>
              <th scope="col" className="py-1.5 pr-4 text-right font-medium">Valor</th>
              <th scope="col" className="py-1.5 text-right font-medium">Parte</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => (
              <tr key={item.rotulo} className="border-b border-slate-100 last:border-0">
                <th scope="row" className="py-1.5 pr-4 text-left font-normal text-slate-700">{item.rotulo}</th>
                <td className="py-1.5 pr-4 text-right tabular-nums font-medium text-slate-800">{comUnidade(item.valor)}</td>
                <td className="py-1.5 text-right tabular-nums text-slate-500">{proporcao(item.valor)}%</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="pt-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Total</th>
              <td className="pt-2 text-right tabular-nums text-xs font-medium text-slate-600">{comUnidade(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      ) : (
        <ul className="space-y-2.5">
          {itens.map((item) => (
            <li key={item.rotulo} className="group">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate text-slate-700">{item.rotulo}</span>
                <span className="shrink-0 tabular-nums font-medium text-slate-800">
                  {comUnidade(item.valor)}
                  <span className="ml-1.5 text-xs font-normal text-slate-400">{proporcao(item.valor)}%</span>
                </span>
              </div>
              {/* Trilha recessiva + extremidade arredondada de 4px, ancorada na base.
                  Decorativa: o numero ao lado ja foi lido, a barra so da a escala. */}
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                <div
                  className="h-full rounded-full transition-all group-hover:brightness-110"
                  style={{
                    width: `${Math.max((item.valor / maximo) * 100, 2)}%`,
                    backgroundColor: item.cor ?? '#2a78d6',
                  }}
                  title={`${item.rotulo}: ${item.valor} (${proporcao(item.valor)}% de ${total})`}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setComoTabela((v) => !v)}
        aria-expanded={comoTabela}
        aria-controls={comoTabela ? idTabela : undefined}
        className="mt-3 text-xs text-slate-500 underline decoration-dotted underline-offset-2 transition hover:text-slate-700"
      >
        {comoTabela ? 'Ver como grafico' : 'Ver como tabela'}
      </button>
    </div>
  );
}
