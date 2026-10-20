import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alerta, Button, Card, Input } from '../../components/ui';
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

  return (
    <Card titulo="Conversas aguardando resposta" descricao="O tempo conta desde a última mensagem do cliente e zera quando a equipe responde.">
      <div className="space-y-4">
        {erro && <Alerta>{erro}</Alerta>}
        <form onSubmit={salvar} className="flex flex-wrap items-end gap-3 rounded-lg bg-slate-50 p-3">
          <label className="space-y-1 text-xs text-slate-600">
            <span>Alerta após (minutos)</span>
            <Input type="number" min={1} max={240} required value={rascunho.alertaRespostaMinutos}
              onChange={(e) => setRascunho((atual) => ({ ...atual, alertaRespostaMinutos: Number(e.target.value) }))} />
          </label>
          <label className="space-y-1 text-xs text-slate-600">
            <span>Crítico após (minutos)</span>
            <Input type="number" min={2} max={240} required value={rascunho.criticoRespostaMinutos}
              onChange={(e) => setRascunho((atual) => ({ ...atual, criticoRespostaMinutos: Number(e.target.value) }))} />
          </label>
          <Button type="submit" disabled={salvando || rascunho.criticoRespostaMinutos <= rascunho.alertaRespostaMinutos}>
            {salvando ? 'Salvando...' : 'Salvar limites'}
          </Button>
          {salvo && <span role="status" className="text-xs text-emerald-700">Limites salvos.</span>}
          {rascunho.criticoRespostaMinutos <= rascunho.alertaRespostaMinutos && (
            <span className="text-xs text-red-700">O limite crítico deve ser maior que o alerta.</span>
          )}
        </form>

        {conversas.length === 0 ? (
          <p className="py-3 text-sm text-slate-500">Nenhuma conversa atribuída está aguardando resposta.</p>
        ) : (
          <ul className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto">
            {conversas.map((conversa) => {
              const segundos = Math.max(0, Math.floor((agora - new Date(conversa.aguardandoDesde).getTime()) / 1000));
              const minutos = segundos / 60;
              const nivel = minutos >= config.criticoRespostaMinutos ? 'critico'
                : minutos >= config.alertaRespostaMinutos ? 'alerta' : 'normal';
              const visual = nivel === 'critico'
                ? 'border-red-300 bg-red-50 text-red-900'
                : nivel === 'alerta'
                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : 'border-slate-200 bg-white text-slate-800';
              const rotulo = nivel === 'critico' ? 'Atrasada' : nivel === 'alerta' ? 'Atenção' : 'No prazo';

              return (
                <li key={conversa.id} className="py-2 first:pt-0 last:pb-0">
                  <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-3 py-2.5 ${visual}`}>
                    <div className="min-w-40 flex-1">
                      <p className="font-medium">{conversa.contato}</p>
                      <p className="text-xs opacity-80">
                        Aguardando {conversa.agente.nome}{conversa.fila ? ` · ${conversa.fila.nome}` : ''}
                        {conversa.protocolo ? ` · ${conversa.protocolo}` : ''}
                      </p>
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wide">{rotulo}</span>
                    <span className="min-w-16 text-right font-mono text-sm font-semibold tabular-nums">{duracao(segundos)}</span>
                    <Link to={`/atendimento?conversa=${encodeURIComponent(conversa.id)}`} className="text-sm font-medium underline underline-offset-2">
                      Abrir conversa
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
