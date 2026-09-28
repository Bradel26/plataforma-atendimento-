import { useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, Card } from '../components/ui';
import { StatTile } from '../components/viz/StatTile';
import { ApiError, api, getAccessToken } from '../lib/api';
import { EVENTOS, conectar } from '../lib/realtime';
import { COR_STATUS_AGENTE, duracao } from '../lib/viz';
import { LABEL_PERFIL, LABEL_STATUS, type AgenteMonitorado } from '../lib/types';

/** Painel do supervisor: quem esta online, em que status e com quanta carga. */
export function MonitoramentoPage() {
  const [agentes, setAgentes] = useState<AgenteMonitorado[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);

  const carregar = useCallback(async () => {
    try {
      const { agentes: lista } = await api.get<{ agentes: AgenteMonitorado[] }>('/metricas/agentes');
      setAgentes(lista);
      setAtualizadoEm(new Date());
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar agentes');
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const socket = conectar({ token });
    const recarregar = () => void carregar();

    socket.on(EVENTOS.agenteStatus, recarregar);
    socket.on(EVENTOS.conversaAtualizada, recarregar);
    return () => {
      socket.disconnect();
    };
  }, [carregar]);

  const porStatus = (status: string) => agentes.filter((a) => a.status === status).length;
  const online = agentes.filter((a) => a.status !== 'OFFLINE').length;
  const aguardando = agentes.reduce((acc, a) => acc + (a.aguardandoResposta ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile rotulo="Disponiveis" valor={porStatus('DISPONIVEL')} estado={COR_STATUS_AGENTE.DISPONIVEL} />
        <StatTile rotulo="Em atendimento" valor={porStatus('EM_ATENDIMENTO')} estado={COR_STATUS_AGENTE.EM_ATENDIMENTO} />
        <StatTile rotulo="Em pausa" valor={porStatus('PAUSA')} estado={COR_STATUS_AGENTE.PAUSA} />
        <StatTile rotulo="Offline" valor={porStatus('OFFLINE')} estado={COR_STATUS_AGENTE.OFFLINE} />
      </div>

      {/* Capacidade da equipe numa linha: o gestor bate o olho e sabe se a
          operacao aguenta receber mais parceiros agora. */}
      <p className="text-sm text-slate-600">
        <span className="font-semibold text-slate-800">{online} consultor(es) online</span> ·{' '}
        {porStatus('EM_ATENDIMENTO')} em atendimento · {porStatus('DISPONIVEL')} disponivel(is) · {porStatus('PAUSA')}{' '}
        em pausa
        {aguardando > 0 && (
          <span className="text-amber-700"> · {aguardando} conversa(s) aguardando resposta</span>
        )}
      </p>

      {erro && <Alerta>{erro}</Alerta>}

      <Card
        titulo="Consultores em tempo real"
        descricao={atualizadoEm ? `Atualizado as ${atualizadoEm.toLocaleTimeString('pt-BR')}` : 'Carregando...'}
      >
        {agentes.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum agente ativo cadastrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2 font-medium">Agente</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">No status</th>
                  <th className="pb-2 font-medium">Ativos</th>
                  <th className="pb-2 font-medium">Aguardando resposta</th>
                  <th className="pb-2 font-medium">Mais antigo</th>
                  <th className="pb-2 font-medium">Ultima atividade</th>
                  <th className="pb-2 font-medium">Protocolos</th>
                  <th className="pb-2 font-medium">Filas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {agentes.map((a) => (
                  <tr key={a.id}>
                    <td className="py-3">
                      <p className="font-medium text-slate-800">{a.nome}</p>
                      <p className="text-xs text-slate-500">{LABEL_PERFIL[a.perfil]}</p>
                    </td>
                    <td className="py-3">
                      <span className="inline-flex items-center gap-2 text-slate-700">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: COR_STATUS_AGENTE[a.status] }}
                          aria-hidden
                        />
                        {LABEL_STATUS[a.status]}
                      </span>
                    </td>
                    <td className="py-3 tabular-nums text-slate-600">{duracao(a.segundosNoStatus)}</td>
                    <td className="py-3 tabular-nums text-slate-600">{a.conversasAtivas}</td>
                    <td
                      className={`py-3 tabular-nums ${a.aguardandoResposta ? 'font-semibold text-amber-700' : 'text-slate-600'}`}
                    >
                      {a.aguardandoResposta ?? 0}
                    </td>
                    <td className="py-3 tabular-nums text-slate-600">{duracao(a.segundosAtendimentoMaisAntigo ?? null)}</td>
                    <td className="py-3 tabular-nums text-slate-600">
                      {a.ultimaAtividadeEm
                        ? new Date(a.ultimaAtividadeEm).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </td>
                    <td className="py-3 tabular-nums text-slate-600">{a.protocolosAbertos}</td>
                    <td className="py-3">
                      <span className="flex flex-wrap gap-1">
                        {a.filas.length === 0 ? (
                          <span className="text-xs text-slate-500">sem fila</span>
                        ) : (
                          a.filas.map((f) => <Badge key={f.id}>{f.nome}</Badge>)
                        )}
                      </span>
                    </td>
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
