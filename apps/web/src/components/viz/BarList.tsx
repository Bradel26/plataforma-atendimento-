type Item = { rotulo: string; valor: number; cor?: string };

/**
 * Barras horizontais para magnitude por categoria.
 *
 * Horizontal porque os rotulos sao palavras (WHATSAPP, EM_ATENDIMENTO) — na
 * vertical eles girariam. Cada barra carrega nome e valor visiveis: alem de ser
 * mais rapido de ler que um eixo, e o que satisfaz a regra de contraste dos tons
 * mais claros da paleta.
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
  const total = itens.reduce((acc, i) => acc + i.valor, 0);
  const maximo = Math.max(...itens.map((i) => i.valor), 1);

  if (itens.length === 0 || total === 0) {
    return <p className="py-2 text-sm text-slate-500">{vazio}</p>;
  }

  return (
    <ul className="space-y-2.5">
      {itens.map((item) => {
        const proporcao = Math.round((item.valor / total) * 100);
        return (
          <li key={item.rotulo} className="group">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-slate-700">{item.rotulo}</span>
              <span className="shrink-0 tabular-nums font-medium text-slate-800">
                {item.valor}
                {unidade ? ` ${unidade}` : ''}
                <span className="ml-1.5 text-xs font-normal text-slate-400">{proporcao}%</span>
              </span>
            </div>
            {/* Trilha recessiva + extremidade arredondada de 4px, ancorada na base. */}
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full transition-all group-hover:brightness-110"
                style={{
                  width: `${Math.max((item.valor / maximo) * 100, 2)}%`,
                  backgroundColor: item.cor ?? '#2a78d6',
                }}
                title={`${item.rotulo}: ${item.valor} (${proporcao}% de ${total})`}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
