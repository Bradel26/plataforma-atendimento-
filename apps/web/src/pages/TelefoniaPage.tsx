import { useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, Button, Card, Field, Input } from '../components/ui';
import { StatTile } from '../components/viz/StatTile';
import { ApiError, api } from '../lib/api';
import { ESTADO } from '../lib/viz';
import { LABEL_CHAMADA_STATUS, type Chamada, type IndicadoresVoz } from '../lib/types';

const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR');

const duracaoCurta = (segundos: number | null) => {
  if (segundos === null) return '—';
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

/** Chamada perdida e problema de operacao, entao ganha tom de alerta. */
const TOM: Partial<Record<string, 'sucesso' | 'alerta' | 'neutro'>> = {
  COMPLETADA: 'sucesso',
  EM_ANDAMENTO: 'sucesso',
  NAO_ATENDIDA: 'alerta',
  OCUPADA: 'alerta',
  FALHOU: 'alerta',
};

export function TelefoniaPage() {
  const [chamadas, setChamadas] = useState<Chamada[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [indicadores, setIndicadores] = useState<IndicadoresVoz | null>(null);
  const [destino, setDestino] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [lista, ind] = await Promise.all([
        api.get<{ chamadas: Chamada[]; proximoCursor: string | null }>('/voz/chamadas?limite=25'),
        api
          .get<{ indicadores: IndicadoresVoz }>('/voz/indicadores')
          .catch(() => ({ indicadores: null as IndicadoresVoz | null })),
      ]);
      setChamadas(lista.chamadas);
      setCursor(lista.proximoCursor);
      setIndicadores(ind.indicadores);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar as chamadas');
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const ligar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      await api.post('/voz/chamadas', { destino: destino.trim() });
      setAviso(`Chamando ${destino.trim()}...`);
      setDestino('');
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao originar a chamada');
    } finally {
      setOcupado(false);
    }
  };

  const carregarMais = async () => {
    if (!cursor) return;
    const { chamadas: mais, proximoCursor } = await api.get<{
      chamadas: Chamada[];
      proximoCursor: string | null;
    }>(`/voz/chamadas?limite=25&cursor=${encodeURIComponent(cursor)}`);
    setChamadas((atual) => [...atual, ...mais.filter((c) => !atual.some((a) => a.id === c.id))]);
    setCursor(proximoCursor);
  };

  return (
    <div className="space-y-5">
      {erro && <Alerta>{erro}</Alerta>}
      {aviso && <Alerta tipo="sucesso">{aviso}</Alerta>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          rotulo="Chamadas (24h)"
          valor={indicadores?.total ?? '—'}
          detalhe={`${indicadores?.entrantes ?? 0} entrantes · ${indicadores?.saintes ?? 0} saintes`}
        />
        <StatTile rotulo="Atendidas" valor={indicadores?.atendidas ?? '—'} detalhe="chamadas que conversaram" />
        <StatTile
          rotulo="Taxa de atendimento"
          valor={indicadores?.taxaAtendimento == null ? '—' : `${indicadores.taxaAtendimento}%`}
          detalhe="abaixo de 80% a operacao esta perdendo chamada"
          estado={
            indicadores?.taxaAtendimento != null && indicadores.taxaAtendimento < 80 ? ESTADO.atencao : undefined
          }
        />
        <StatTile rotulo="TMA de voz" valor={duracaoCurta(indicadores?.tma ?? null)} detalhe="media das atendidas" />
      </div>

      <Card titulo="Ligar" descricao="Clique-para-ligar pelo numero configurado na plataforma">
        <form onSubmit={ligar} className="flex flex-wrap items-end gap-2">
          <Field label="Numero de destino">
            <Input required placeholder="+5511988887777" value={destino} onChange={(e) => setDestino(e.target.value)} />
          </Field>
          <Button type="submit" disabled={ocupado || destino.trim().length < 8}>
            Ligar
          </Button>
        </form>
        <p className="mt-2 text-xs text-slate-400">
          Softphone no navegador, ramais e URA dependem do provedor contratado — ver "Voz" no SCOPE.md.
        </p>
      </Card>

      <Card titulo="Chamadas" descricao={`${chamadas.length} registro(s)`}>
        {chamadas.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhuma chamada registrada. Configure o provedor em Configuracoes &rarr; Voz.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-2 pr-3">Inicio</th>
                  <th className="py-2 pr-3">Direcao</th>
                  <th className="py-2 pr-3">Numero</th>
                  <th className="py-2 pr-3">Contato</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Duracao</th>
                  <th className="py-2">Gravacao</th>
                </tr>
              </thead>
              <tbody>
                {chamadas.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 whitespace-nowrap text-slate-600">{dataHora(c.iniciadoEm)}</td>
                    <td className="py-2 pr-3">
                      <Badge tom="neutro">{c.direcao === 'ENTRANTE' ? 'Entrante' : 'Sainte'}</Badge>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {c.direcao === 'ENTRANTE' ? c.numeroOrigem : c.numeroDestino}
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{c.contato?.nome ?? '—'}</td>
                    <td className="py-2 pr-3">
                      <Badge tom={TOM[c.status] ?? 'neutro'}>{LABEL_CHAMADA_STATUS[c.status]}</Badge>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{duracaoCurta(c.duracao)}</td>
                    <td className="py-2">
                      {c.gravacaoUrl?.startsWith('/api/arquivos/') ? (
                        <audio controls src={c.gravacaoUrl} className="h-8 w-44" />
                      ) : (
                        <span className="text-xs text-slate-400">{c.gravacaoUrl ? 'no provedor' : '—'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {cursor && (
          <Button variante="neutro" className="mt-3" onClick={() => void carregarMais()}>
            Carregar chamadas anteriores
          </Button>
        )}
      </Card>
    </div>
  );
}
