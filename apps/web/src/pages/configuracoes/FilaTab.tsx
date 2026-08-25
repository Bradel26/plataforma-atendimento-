import { useCallback, useEffect, useState } from 'react';
import { Alerta, Button, Card } from '../../components/ui';
import { StatTile } from '../../components/viz/StatTile';
import { ApiError, api } from '../../lib/api';
import { ESTADO } from '../../lib/viz';
import type { EstadoFila } from '../../lib/types';

/**
 * Fila de trabalho: quantos trabalhos estao esperando, quantos desistiram e o
 * botao que devolve os que desistiram para a fila.
 *
 * Fila sem visibilidade e caixa preta: quando uma campanha nao chega, a primeira
 * pergunta e quantos trabalhos estao presos — e a segunda e como tentar de novo
 * sem entrar no servidor.
 */
export function FilaTab() {
  const [fila, setFila] = useState<EstadoFila | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [reprocessando, setReprocessando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const { fila: estado } = await api.get<{ fila: EstadoFila }>('/health/fila');
      setFila(estado);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao ler o estado da fila');
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const reprocessar = async () => {
    setReprocessando(true);
    setAviso(null);
    try {
      const r = await api.post<{ devolvidos: number; descartados: number; fila: EstadoFila }>(
        '/health/fila/reprocessar',
      );
      setFila(r.fila);
      setAviso(
        r.devolvidos === 0
          ? 'Nenhum trabalho foi devolvido.'
          : `${r.devolvidos} trabalho(s) de volta na fila${r.descartados > 0 ? `, ${r.descartados} sem handler ou corrompido(s)` : ''}.`,
      );
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao reprocessar');
    } finally {
      setReprocessando(false);
    }
  };

  return (
    <div className="space-y-5">
      {erro && <Alerta>{erro}</Alerta>}
      {aviso && <Alerta tipo="sucesso">{aviso}</Alerta>}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile rotulo="Prontos" valor={fila?.prontos ?? '—'} detalhe="aguardando o worker" />
        <StatTile
          rotulo="Atrasados"
          valor={fila?.atrasados ?? '—'}
          detalhe="esperando nova tentativa"
          estado={fila && fila.atrasados > 0 ? ESTADO.atencao : undefined}
        />
        <StatTile
          rotulo="Desistiram"
          valor={fila?.mortos ?? '—'}
          detalhe="depois de todas as tentativas"
          estado={fila && fila.mortos > 0 ? ESTADO.grave : undefined}
        />
      </div>

      <Card
        titulo="Trabalhos que desistiram"
        descricao="Reprocessar devolve ate 50 por vez, com a contagem de tentativas zerada."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={reprocessar} disabled={reprocessando || !fila || fila.mortos === 0}>
            {reprocessando ? 'Reprocessando...' : 'Reprocessar'}
          </Button>
          <Button variante="neutro" onClick={() => void carregar()} disabled={reprocessando}>
            Atualizar
          </Button>
          {fila?.mortos === 0 && <span className="text-sm text-slate-500">Nada para reprocessar.</span>}
        </div>

        {fila && fila.ultimosMortos.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4 font-medium">Tipo</th>
                  <th className="py-2 pr-4 font-medium">Tentativas</th>
                  <th className="py-2 font-medium">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {fila.ultimosMortos.map((m) => (
                  <tr key={m.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4 font-mono text-xs text-slate-700">{m.tipo}</td>
                    <td className="py-2 pr-4 tabular-nums text-slate-600">{m.tentativa + 1}</td>
                    <td className="py-2 text-slate-600">{m.erro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
