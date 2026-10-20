import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alerta, Button, Input } from '../../components/ui';
import { ApiError, api, getAccessToken } from '../../lib/api';
import { EVENTOS, conectar } from '../../lib/realtime';

type ConversaAguardando = {
  id: string;
  protocolo: string | null;
  contato: string;
  agente: { id: string; nome: string };
  fila: { id: string; nome: string } | null;
  aguardandoDesde: string;
  atrasoSegundos: number;
};
type Config = { alertaRespostaMinutos: number; criticoRespostaMinutos: number };
type Resposta = { config: Config; conversas: ConversaAguardando[] };

function duracao(segundos: number) {
  if (segundos < 60) return `${segundos}s`;
  const minutos = Math.floor(segundos / 60);
  const horas = Math.floor(minutos / 60);
  return horas ? `${horas}h ${minutos % 60}min` : `${minutos}min`;
}

// So tons que o tema escuro remapeia (index.css); a barra lateral usa cor fixa.
const VISUAL = {
  critico: { fundo: 'bg-red-50', texto: 'text-red-700', barra: '#DC2626', rotulo: 'Atrasada' },
  alerta: { fundo: 'bg-amber-50', texto: 'text-amber-700', barra: '#F59E0B', rotulo: 'Atenção' },
  normal: { fundo: 'bg-slate-50', texto: 'text-slate-700', barra: '#94A3B8', rotulo: 'No prazo' },
} as const;

export function AlertasResposta() {
  const [conversas, setConversas] = useState<ConversaAguardando[]>([]);
  const [config, setConfig] = useState<Config>({ alertaRespostaMinutos: 10, criticoRespostaMinutos: 20 });
  const [rascunho, setRascunho] = useState(config);
  const configRef = useRef(config);
  const rascunhoRef = useRef(rascunho);
  const [agora, setAgora] = useState(Date.now());
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [editandoLimites, setEditandoLimites] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const resposta = await api.get<Resposta>('/metricas/alertas-resposta');
      setConversas(resposta.conversas);
      setConfig(resposta.config);
      if (
        rascunhoRef.current.alertaRespostaMinutos === configRef.current.alertaRespostaMinutos &&
        rascunhoRef.current.criticoRespostaMinutos === configRef.current.criticoRespostaMinutos
      ) {
        setRascunho(resposta.config);
      }
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar alertas de resposta');
    }
  }, []);

  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { rascunhoRef.current = rascunho; }, [rascunho]);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => {
    const intervalo = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(intervalo);
  }, []);
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const socket = conectar({ token });
    const atualizar = () => void carregar();
    socket.on(EVENTOS.mensagemNova, atualizar);
    socket.on(EVENTOS.conversaAtualizada, atualizar);
    const intervalo = window.setInterval(atualizar, 30_000);
    return () => { window.clearInterval(intervalo); socket.disconnect(); };
  }, [carregar]);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setSalvo(false);
    setSalvando(true);
    try {
      const resposta = await api.put<{ config: Config }>('/metricas/alertas-resposta/config', rascunho);
      setConfig(resposta.config);
      setRascunho(resposta.config);
      setSalvo(true);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao salvar os limites');
    } finally {
      setSalvando(false);
    }
  };

  const limitesInvalidos = rascunho.criticoRespostaMinutos <= rascunho.alertaRespostaMinutos;

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-labelledby="monitor-aguardando">
      <div className="flex flex-wrap items-start gap-2.5 border-b border-slate-100 px-4 pb-3 pt-4">
        <div className="min-w-0 flex-1">
          <h2 id="monitor-aguardando" className="text-[15px] font-bold text-slate-900">
            Aguardando resposta{conversas.length > 0 && <span className="ml-1.5 tabular-nums text-slate-500">· {conversas.length}</span>}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-slate-500">Conta desde a última mensagem do cliente e zera quando a equipe responde</p>
        </div>
        <button
          type="button"
          aria-expanded={editandoLimites}
          onClick={() => setEditandoLimites((a) => !a)}
          className="inline-flex h-[30px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          Limites: {config.alertaRespostaMinutos} / {config.criticoRespostaMinutos} min
        </button>
      </div>

      <div className="flex flex-col gap-3 p-3">
        {erro && <Alerta>{erro}</Alerta>}
        {editandoLimites && (
          <form onSubmit={salvar} className="flex flex-wrap items-end gap-3 rounded-xl bg-slate-50 p-3">
            <label className="space-y-1 text-xs font-medium text-slate-600">
              <span>Alerta após (minutos)</span>
              <Input type="number" min={1} max={240} required value={rascunho.alertaRespostaMinutos} className="w-28"
                onChange={(e) => setRascunho((atual) => ({ ...atual, alertaRespostaMinutos: Number(e.target.value) }))} />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-600">
              <span>Crítico após (minutos)</span>
              <Input type="number" min={2} max={240} required value={rascunho.criticoRespostaMinutos} className="w-28"
                onChange={(e) => setRascunho((atual) => ({ ...atual, criticoRespostaMinutos: Number(e.target.value) }))} />
            </label>
            <Button type="submit" disabled={salvando || limitesInvalidos}>
              {salvando ? 'Salvando...' : 'Salvar limites'}
            </Button>
            {salvo && <span role="status" className="text-xs text-emerald-700">Limites salvos.</span>}
            {limitesInvalidos && (
              <span className="text-xs text-red-700">O limite crítico deve ser maior que o alerta.</span>
            )}
          </form>
        )}

        {conversas.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-slate-500">Nenhuma conversa atribuída está aguardando resposta.</p>
        ) : (
          <ul className="flex max-h-[32rem] flex-col gap-1.5 overflow-y-auto">
            {conversas.map((conversa) => {
              const segundos = Math.max(0, Math.floor((agora - new Date(conversa.aguardandoDesde).getTime()) / 1000));
              const minutos = segundos / 60;
              const nivel = minutos >= config.criticoRespostaMinutos ? 'critico'
                : minutos >= config.alertaRespostaMinutos ? 'alerta' : 'normal';
              const visual = VISUAL[nivel];

              return (
                <li
                  key={conversa.id}
                  className={`grid grid-cols-[4px_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl py-2.5 pr-2.5 ${visual.fundo}`}
                >
                  <span className="self-stretch rounded-r" style={{ backgroundColor: visual.barra }} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-bold text-slate-900">{conversa.contato}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {conversa.agente.nome}{conversa.fila ? ` · ${conversa.fila.nome}` : ''}
                      {conversa.protocolo ? ` · ${conversa.protocolo}` : ''}
                    </span>
                  </span>
                  <span className={`text-right ${visual.texto}`}>
                    <span className="block text-[15px] font-bold tabular-nums">{duracao(segundos)}</span>
                    <span className="text-[11px] font-bold uppercase tracking-wide">{visual.rotulo}</span>
                  </span>
                  <Link
                    to={`/atendimento?conversa=${encodeURIComponent(conversa.id)}`}
                    className="relative inline-flex h-[30px] items-center rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-blue-700 hover:bg-slate-50"
                  >
                    Abrir<span className="sr-only"> conversa de {conversa.contato}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
