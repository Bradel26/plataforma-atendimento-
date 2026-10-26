import { proximoTriEstado } from './gavetaVinculo';

/**
 * Tri-estado SIM/NÃO (spec 4.6): `null` = não respondido. Clicar no valor
 * ativo volta para vazio; NULL nunca é mostrado nem gravado como NÃO.
 */
export function BotaoTriEstado({
  rotulo,
  valor,
  aoMudar,
  desabilitado = false,
  dica,
}: {
  rotulo: string;
  valor: boolean | null;
  aoMudar: (novo: boolean | null) => void;
  desabilitado?: boolean;
  dica?: string;
}) {
  const opcoes = [
    { valor: true, texto: 'Sim', ativo: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { valor: false, texto: 'Não', ativo: 'bg-red-50 text-red-700 border-red-200' },
  ] as const;
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-slate-700">{rotulo}</span>
        {dica && <span className="block text-xs text-slate-500">{dica}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {valor === null && (
          <span className="text-xs text-slate-400" aria-hidden="true">
            —
          </span>
        )}
        <span role="group" aria-label={`${rotulo}: ${valor === true ? 'Sim' : valor === false ? 'Não' : 'não respondido'}`} className="flex gap-1">
          {opcoes.map((o) => {
            const ativo = valor === o.valor;
            return (
              <button
                key={o.texto}
                type="button"
                aria-pressed={ativo}
                disabled={desabilitado}
                title={ativo ? 'Clique de novo para deixar sem resposta' : undefined}
                onClick={() => aoMudar(proximoTriEstado(valor, o.valor))}
                className={`anel-de-foco h-8 min-w-12 rounded-lg border px-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  ativo ? o.ativo : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {o.texto}
              </button>
            );
          })}
        </span>
      </span>
    </div>
  );
}
