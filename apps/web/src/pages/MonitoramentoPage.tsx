import { useCallback, useEffect, useState } from 'react';
import { Alerta } from '../components/ui';
import { CabecalhoPagina, Pilula, iniciais } from '../components/ui/Pagina';
import { ApiError, api, getAccessToken } from '../lib/api';
import { EVENTOS, conectar } from '../lib/realtime';
import { COR_STATUS_AGENTE, duracao } from '../lib/viz';
import { LABEL_PERFIL, LABEL_STATUS, type AgenteMonitorado } from '../lib/types';
import { PainelEquipes } from '../features/monitor/PainelEquipes';
import { AlertasResposta } from '../features/monitor/AlertasResposta';
import { useAuth } from '../features/auth/AuthProvider';

const STATUS_RESUMO = [
  { status: 'DISPONIVEL', rotulo: 'Disponíveis' },
  { status: 'EM_ATENDIMENTO', rotulo: 'Em atendimento' },
  { status: 'PAUSA', rotulo: 'Em pausa' },
  { status: 'OFFLINE', rotulo: 'Offline' },
] as const;

/** Painel do supervisor: quem esta online, em que status e com quanta carga. */
export function MonitoramentoPage() {
  const { temPerfil } = useAuth();
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
  const ativas = agentes.reduce((acc, a) => acc + a.conversasAtivas, 0);
  const verAlertas = temPerfil('ADMIN', 'SUPERVISOR');

  const detalheDo = (status: string) =>
    status === 'EM_ATENDIMENTO'
      ? `${ativas} conversa(s) ativa(s)`
      : status === 'DISPONIVEL'
        ? 'prontos para receber'
        : status === 'PAUSA'
          ? 'fora da fila por agora'
          : 'fora do turno';

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina titulo="Operação agora" descricao="Quem está online, com quanta carga e quem espera resposta">
        <span
          className={`inline-flex h-8 items-center gap-2 rounded-full px-3 text-[12.5px] font-semibold ${
            atualizadoEm ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
          }`}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: atualizadoEm ? COR_STATUS_AGENTE.DISPONIVEL : COR_STATUS_AGENTE.OFFLINE }}
            aria-hidden="true"
          />
          {atualizadoEm ? `Ao vivo · atualizado às ${atualizadoEm.toLocaleTimeString('pt-BR')}` : 'Carregando...'}
        </span>
      </CabecalhoPagina>

      <section aria-label="Resumo da equipe" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.35fr_repeat(4,minmax(0,1fr))]">
        {/* Capacidade numa linha: o gestor bate o olho e sabe se a operacao
            aguenta receber mais parceiros agora. */}
        <div className="flex min-w-0 flex-col gap-2.5 rounded-2xl border border-slate-200 bg-white px-5 py-4 sm:col-span-2 xl:col-span-1">
          <span className="text-[13px] font-semibold text-slate-700">Capacidade da equipe</span>
          <span className="text-[30px] font-bold leading-none tracking-[-0.03em] text-slate-900 [font-variant-numeric:proportional-nums]">
            {online} <span className="text-[15px] font-medium tracking-normal text-slate-500">de {agentes.length} online</span>
          </span>
          <div role="img" aria-label={STATUS_RESUMO.map((s) => `${s.rotulo}: ${porStatus(s.status)}`).join(', ')} className="flex h-2 gap-0.5">
            {agentes.length === 0 ? (
              <span className="flex-1 rounded-[3px] bg-slate-100" />
            ) : (
              STATUS_RESUMO.filter((s) => porStatus(s.status) > 0).map((s) => (
                <span
                  key={s.status}
                  className="rounded-[3px]"
                  style={{ flex: `${porStatus(s.status)} 1 0`, backgroundColor: COR_STATUS_AGENTE[s.status] }}
                />
              ))
            )}
          </div>
          <span className={`text-[12.5px] font-semibold ${aguardando > 0 ? 'text-amber-700' : 'text-slate-500'}`}>
            {aguardando > 0 ? `${aguardando} conversa(s) aguardando resposta` : 'Ninguém aguardando resposta'}
          </span>
        </div>
        {STATUS_RESUMO.map((s) => (
          <div key={s.status} className="flex flex-col gap-1.5 rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <span className="flex items-center gap-2 text-[13px] font-semibold text-slate-700">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COR_STATUS_AGENTE[s.status] }} aria-hidden="true" />
              {s.rotulo}
            </span>
            <span className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-slate-900 tabular-nums">{porStatus(s.status)}</span>
            <span className="text-xs text-slate-500">{detalheDo(s.status)}</span>
          </div>
        ))}
      </section>

      <div className={`grid items-start gap-4 ${verAlertas ? 'xl:grid-cols-[minmax(0,1fr)_minmax(0,480px)]' : ''}`}>
        <PainelEquipes />
        {verAlertas && <AlertasResposta />}
      </div>

      {erro && <Alerta>{erro}</Alerta>}

      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-labelledby="monitor-consultores">
        <div className="flex flex-wrap items-baseline gap-2.5 px-5 py-4">
          <h2 id="monitor-consultores" className="text-[15px] font-bold text-slate-900">Consultores em tempo real</h2>
          <span className="text-[12.5px] text-slate-500">{agentes.length} pessoa(s)</span>
        </div>
        {agentes.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-slate-500">Nenhum agente ativo cadastrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="border-y border-slate-200 bg-slate-50 text-[11.5px] text-slate-500">
                <tr>
                  {['Consultor', 'Status', 'No status', 'Ativas', 'Aguardando', 'Mais antigo', 'Última atividade', 'Protocolos', 'Filas'].map((h) => (
                    <th key={h} className="whitespace-nowrap px-4 py-2.5 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {agentes.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2.5">
                        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">
                          {iniciais(a.nome)}
                          <span
                            className="absolute -bottom-px -right-px h-[11px] w-[11px] rounded-full border-2 border-white"
                            style={{ backgroundColor: COR_STATUS_AGENTE[a.status] }}
                            aria-hidden="true"
                          />
                        </span>
                        <span className="min-w-0">
                          <span className="block whitespace-nowrap font-bold text-slate-900">{a.nome}</span>
                          <span className="text-xs text-slate-500">{LABEL_PERFIL[a.perfil]}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Pilula cor={COR_STATUS_AGENTE[a.status] ?? COR_STATUS_AGENTE.OFFLINE!}>{LABEL_STATUS[a.status]}</Pilula>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{duracao(a.segundosNoStatus)}</td>
                    <td className="px-4 py-2.5 tabular-nums">{a.conversasAtivas}</td>
                    <td className={`px-4 py-2.5 tabular-nums ${a.aguardandoResposta ? 'font-bold text-amber-700' : ''}`}>
                      {a.aguardandoResposta ?? 0}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{duracao(a.segundosAtendimentoMaisAntigo ?? null)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                      {a.ultimaAtividadeEm
                        ? new Date(a.ultimaAtividadeEm).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{a.protocolosAbertos}</td>
                    <td className="px-4 py-2.5">
                      <span className="flex flex-wrap gap-1">
                        {a.filas.length === 0 ? (
                          <span className="text-xs text-slate-500">sem fila</span>
                        ) : (
                          a.filas.map((f) => (
                            <span key={f.id} className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{f.nome}</span>
                          ))
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
