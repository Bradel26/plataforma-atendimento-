import { useCallback, useEffect, useState } from 'react';
import { Alerta, Card, EmptyState, Field, Input } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import { LABEL_TIPO_ATIVIDADE, TIPOS_ATIVIDADE, type CelulaProdutividade, type MatrizProdutividade } from '../../lib/types';

/**
 * Matriz de produtividade (item 3.3): usuario x tipo de atividade, no formato
 * `feitas / agendadas`.
 *
 * "Agendada" e ter prazo — a mesma definicao da Agenda da semana. Celula sem
 * nenhuma atividade agendada mostra travessao, e nao "0/0" nem "0%": zero por
 * cento afirmaria que a pessoa combinou tarefas e nao cumpriu nenhuma, e aqui
 * nao ha nada combinado para medir.
 */

const mesCorrente = () => new Date().toISOString().slice(0, 7);

const nomeDoMes = (iso: string) =>
  new Date(`${iso}-01T00:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const dataBr = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

/** Cor pelo desempenho: sem exagero de semaforo, so o suficiente para o olho ir direto ao que falta. */
const corDoPercentual = (p: number) =>
  p >= 80 ? 'text-emerald-700 bg-emerald-50' : p >= 40 ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50';

type Selecao = { usuarioNome: string; tipoLabel: string; celula: CelulaProdutividade };

function CelulaBotao({
  celula,
  onClick,
}: {
  celula: CelulaProdutividade | null;
  onClick: () => void;
}) {
  if (!celula) return <span className="text-slate-300">—</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2 py-1 text-xs font-medium transition hover:opacity-80 ${corDoPercentual(celula.percentual)}`}
    >
      {celula.feitas}/{celula.agendadas} <span className="opacity-70">({celula.percentual}%)</span>
    </button>
  );
}

export function ProdutividadeTab() {
  const [mes, setMes] = useState(mesCorrente());
  const [matriz, setMatriz] = useState<MatrizProdutividade | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [selecao, setSelecao] = useState<Selecao | null>(null);

  const carregar = useCallback(async () => {
    try {
      setMatriz(await api.get<MatrizProdutividade>(`/produtividade?mes=${mes}`));
      setSelecao(null);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar a matriz');
    }
  }, [mes]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <div className="space-y-4">
      <Card titulo="Produtividade" descricao="Atividades com prazo, feitas contra agendadas, por pessoa e por tipo">
        <Field label="Mes">
          <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="max-w-[180px]" />
        </Field>
      </Card>

      {erro && <Alerta>{erro}</Alerta>}

      <Card
        titulo="Matriz"
        descricao={matriz ? `${nomeDoMes(matriz.mes)} — clique num valor para ver as tarefas` : undefined}
      >
        {matriz === null ? (
          <p className="text-sm text-slate-500">Carregando...</p>
        ) : matriz.linhas.length === 0 ? (
          <EmptyState
            titulo="Nada agendado neste mes"
            descricao="Ninguem tem atividade com prazo neste periodo, dentro do que voce pode ver."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Matriz de produtividade do mes</caption>
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="py-1.5 pr-3 font-medium">Pessoa</th>
                  {TIPOS_ATIVIDADE.map((tipo) => (
                    <th key={tipo} className="py-1.5 px-2 text-center font-medium">
                      {LABEL_TIPO_ATIVIDADE[tipo]}
                    </th>
                  ))}
                  <th className="py-1.5 pl-2 text-center font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {matriz.linhas.map((linha) => (
                  <tr key={linha.usuarioId}>
                    <td className="py-2 pr-3 text-slate-800">{linha.usuarioNome}</td>
                    {TIPOS_ATIVIDADE.map((tipo) => (
                      <td key={tipo} className="py-2 px-2 text-center">
                        <CelulaBotao
                          celula={linha.porTipo[tipo]}
                          onClick={() =>
                            linha.porTipo[tipo] &&
                            setSelecao({ usuarioNome: linha.usuarioNome, tipoLabel: LABEL_TIPO_ATIVIDADE[tipo], celula: linha.porTipo[tipo]! })
                          }
                        />
                      </td>
                    ))}
                    <td className="py-2 pl-2 text-center">
                      <CelulaBotao
                        celula={linha.total}
                        onClick={() => setSelecao({ usuarioNome: linha.usuarioNome, tipoLabel: 'Total', celula: linha.total })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selecao && (
        <Card titulo={`${selecao.usuarioNome} — ${selecao.tipoLabel}`} descricao={`${selecao.celula.feitas} feita(s) de ${selecao.celula.agendadas} agendada(s)`}>
          <ul className="divide-y divide-slate-100 text-sm">
            {selecao.celula.atividades.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-slate-800">{a.titulo}</p>
                  <p className="text-xs text-slate-500">Prazo: {dataBr(a.prazo)}</p>
                </div>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${a.concluidoEm ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                  {a.concluidoEm ? `Feita em ${dataBr(a.concluidoEm)}` : 'Em aberto'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
