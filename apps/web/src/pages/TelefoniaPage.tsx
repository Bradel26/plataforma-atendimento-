import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Alerta, Badge, Button, Field, Input } from '../components/ui';
import { AssistenteDaLigacao } from './telefonia/AssistenteDaLigacao';
import { ApiError, api, getAccessToken } from '../lib/api';
import { conectar, EVENTOS } from '../lib/realtime';
import { LABEL_CHAMADA_STATUS, type Chamada, type IndicadoresVoz } from '../lib/types';

const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const duracaoCurta = (segundos: number | null) => {
  if (segundos === null) return '—';
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};
const custoCurto = (v: number | null | undefined) => v == null ? '—' : `R$ ${v.toFixed(4).replace('.', ',')}`;
const TOM: Partial<Record<string, 'sucesso' | 'alerta' | 'neutro'>> = {
  COMPLETADA: 'sucesso', EM_ANDAMENTO: 'sucesso', NAO_ATENDIDA: 'alerta', OCUPADA: 'alerta', FALHOU: 'alerta',
};
const STATUS_EM_CURSO = new Set(['CHAMANDO', 'EM_ANDAMENTO']);

export function TelefoniaPage() {
  const [chamadas, setChamadas] = useState<Chamada[]>([]);
  const [assistente, setAssistente] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [indicadores, setIndicadores] = useState<IndicadoresVoz | null>(null);
  const [destino, setDestino] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [chamadaAtivaId, setChamadaAtivaId] = useState<string | null>(null);
  const [microfoneMudo, setMicrofoneMudo] = useState(false);
  const [audioConectado, setAudioConectado] = useState(false);
  const [linhaCloudAtiva, setLinhaCloudAtiva] = useState(false);
  const [transcricaoAtiva, setTranscricaoAtiva] = useState(false);
  const [abaPainel, setAbaPainel] = useState<'receber' | 'fazer'>('receber');
  const audioRef = useRef<HTMLAudioElement>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const microfoneRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gravadorRef = useRef<MediaRecorder | null>(null);
  const partesGravacaoRef = useRef<Blob[]>([]);
  const idChamadaRef = useRef<string | null>(null);
  const destinoPendenteRef = useRef<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [lista, ind] = await Promise.all([
        api.get<{ chamadas: Chamada[]; proximoCursor: string | null }>('/voz/chamadas?limite=25'),
        api.get<{ indicadores: IndicadoresVoz }>('/voz/indicadores').catch(() => ({ indicadores: null as IndicadoresVoz | null })),
      ]);
      setChamadas(lista.chamadas);
      setCursor(lista.proximoCursor);
      setIndicadores(ind.indicadores);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar as chamadas');
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => {
    void api.get<{ numero: { modo?: string | null; ativo?: boolean; phoneNumberId?: string | null; whatsappCallingHabilitado?: boolean; transcricaoAutomaticaAtiva?: boolean } | null }>('/canais/numeros/meu')
      .then(({ numero }) => {
        setLinhaCloudAtiva(Boolean(numero?.ativo && numero.modo === 'OFICIAL' && numero.phoneNumberId && numero.whatsappCallingHabilitado));
        setTranscricaoAtiva(Boolean(numero?.transcricaoAutomaticaAtiva));
      })
      .catch(() => setLinhaCloudAtiva(false));
  }, []);
  useEffect(() => () => {
    peerRef.current?.close();
    microfoneRef.current?.getTracks().forEach((track) => track.stop());
    if (gravadorRef.current?.state !== 'inactive') gravadorRef.current?.stop();
    void audioContextRef.current?.close();
  }, []);
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const socket = conectar({ token });
    socket.on(EVENTOS.chamadaAtualizada, () => void carregar());
    return () => { socket.disconnect(); };
  }, [carregar]);
  useEffect(() => {
    if (!chamadaAtivaId) return;
    const atual = chamadas.find((chamada) => chamada.id === chamadaAtivaId);
    if (atual && ['COMPLETADA', 'NAO_ATENDIDA', 'OCUPADA', 'FALHOU', 'CANCELADA'].includes(atual.status)) {
      void encerrarLocal();
    }
  }, [chamadas, chamadaAtivaId]);

  const ligar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ocupado || chamadaAtivaId) return;
    setErro(null); setAviso(null); setOcupado(true);
    try {
      const pc = await prepararPeer();
      const oferta = await pc.createOffer();
      await pc.setLocalDescription(oferta);
      await aguardarIce(pc);
      const resposta = await api.post<{ chamada: Chamada }>('/voz/chamadas/whatsapp/originar', {
        destino: destino.trim(), sdp: pc.localDescription?.sdp,
      });
      definirChamadaAtiva(resposta.chamada.id);
      destinoPendenteRef.current = destino.trim();
      setAviso(`Chamando ${destino.trim()} pelo WhatsApp…`);
      setDestino('');
      void aguardarRespostaDaMeta(resposta.chamada.id, pc);
      await carregar();
    } catch (e) {
      await encerrarLocal();
      setErro(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Falha ao iniciar a ligação WhatsApp');
    } finally { setOcupado(false); }
  };

  function definirChamadaAtiva(id: string | null) {
    idChamadaRef.current = id;
    setChamadaAtivaId(id);
  }

  async function prepararPeer() {
    const microfone = await navigator.mediaDevices.getUserMedia({ audio: true });
    microfoneRef.current = microfone;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    peerRef.current = pc;
    microfone.getAudioTracks().forEach((track) => pc.addTrack(track, microfone));
    pc.ontrack = (evento) => {
      const remoto = evento.streams[0] ?? new MediaStream([evento.track]);
      if (audioRef.current) {
        audioRef.current.srcObject = remoto;
        void audioRef.current.play().catch(() => undefined);
      }
      iniciarGravacao(microfone, remoto);
      setAudioConectado(true);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        setAudioConectado(false);
      }
    };
    return pc;
  }

  function iniciarGravacao(microfone: MediaStream, remoto: MediaStream) {
    if (gravadorRef.current) return;
    if (typeof MediaRecorder === 'undefined') {
      setErro('Este navegador não oferece suporte à gravação da chamada. Use uma versão atualizada do Chrome.');
      return;
    }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((tipo) => MediaRecorder.isTypeSupported(tipo));
    if (!mime) {
      setErro('Este navegador não oferece um formato compatível para gravar a chamada.');
      return;
    }
    const contexto = new AudioContext();
    audioContextRef.current = contexto;
    const destinoAudio = contexto.createMediaStreamDestination();
    contexto.createMediaStreamSource(microfone).connect(destinoAudio);
    contexto.createMediaStreamSource(remoto).connect(destinoAudio);
    const gravador = new MediaRecorder(destinoAudio.stream, { mimeType: mime });
    partesGravacaoRef.current = [];
    gravador.ondataavailable = (evento) => { if (evento.data.size > 0) partesGravacaoRef.current.push(evento.data); };
    gravador.onstop = () => {
      const id = idChamadaRef.current;
      const tipo = gravador.mimeType || mime;
      const extensao = tipo.includes('mp4') ? 'm4a' : 'webm';
      const arquivo = new File(partesGravacaoRef.current, `chamada-${id ?? 'whatsapp'}.${extensao}`, { type: tipo.split(';')[0] });
      partesGravacaoRef.current = [];
      if (id && arquivo.size > 0) {
        void api.upload<{ transcricaoPendente: boolean; transcricaoSolicitada: boolean }>(`/voz/chamadas/${id}/whatsapp/gravacao`, arquivo).then((resultado) => {
          setAviso(resultado.transcricaoPendente
            ? 'Gravação salva. Configure OPENAI_API_KEY no servidor para gerar a transcrição automática.'
            : resultado.transcricaoSolicitada
              ? 'Gravação e transcrição salvas no histórico do contato.'
              : 'Gravação salva no histórico do contato.');
          return carregar();
        }).catch((erro) => {
          setErro(erro instanceof ApiError ? erro.message : 'A chamada terminou, mas não foi possível salvar a gravação.');
        });
      }
    };
    gravadorRef.current = gravador;
    gravador.start(1000);
  }

  async function aguardarRespostaDaMeta(id: string, pc: RTCPeerConnection) {
    for (let tentativa = 0; tentativa < 30 && idChamadaRef.current === id; tentativa += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      try {
        const { oferta } = await api.get<{ oferta: { sdp: string } }>(`/voz/chamadas/${id}/whatsapp/oferta`);
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription({ type: 'answer', sdp: oferta.sdp });
          return;
        }
      } catch {
        // A Meta só envia o SDP quando a chamada de saída progride; continua consultando.
      }
    }
    if (idChamadaRef.current === id && !audioConectado) {
      setErro('A Meta não conectou o áudio desta chamada. Verifique se a permissão de ligação está ativa para o contato.');
      await api.post(`/voz/chamadas/${id}/whatsapp/acao`, { acao: 'terminate' }).catch(() => undefined);
      await encerrarLocal();
    }
  }

  async function atender(id: string) {
    setErro(null); setOcupado(true);
    try {
      const { oferta } = await api.get<{ oferta: { sdp: string } }>(`/voz/chamadas/${id}/whatsapp/oferta`);
      const pc = await prepararPeer();
      await pc.setRemoteDescription({ type: 'offer', sdp: oferta.sdp });
      const resposta = await pc.createAnswer();
      await pc.setLocalDescription(resposta);
      await aguardarIce(pc);
      await api.post(`/voz/chamadas/${id}/whatsapp/acao`, { acao: 'accept', sdp: pc.localDescription?.sdp });
      definirChamadaAtiva(id);
      setAviso('Chamada atendida pelo navegador.');
      await carregar();
    } catch (e) {
      await encerrarLocal();
      setErro(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Não foi possível atender a chamada');
    } finally { setOcupado(false); }
  }

  async function recusar(id: string) {
    setErro(null); setOcupado(true);
    try {
      await api.post(`/voz/chamadas/${id}/whatsapp/acao`, { acao: 'reject' });
      await carregar();
    } catch (e) { setErro(e instanceof ApiError ? e.message : 'Não foi possível recusar a chamada'); }
    finally { setOcupado(false); }
  }

  async function desligar() {
    const id = idChamadaRef.current;
    try {
      if (id) await api.post(`/voz/chamadas/${id}/whatsapp/acao`, { acao: 'terminate' });
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'A chamada foi encerrada no navegador; a Meta não confirmou o encerramento.');
    } finally {
      await encerrarLocal();
      await carregar();
    }
  }

  async function encerrarLocal() {
    const gravador = gravadorRef.current;
    gravadorRef.current = null;
    if (gravador && gravador.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        gravador.addEventListener('stop', () => resolve(), { once: true });
        gravador.stop();
      });
    }
    peerRef.current?.close(); peerRef.current = null;
    microfoneRef.current?.getTracks().forEach((track) => track.stop()); microfoneRef.current = null;
    await audioContextRef.current?.close().catch(() => undefined); audioContextRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    definirChamadaAtiva(null);
    setMicrofoneMudo(false);
    setAudioConectado(false);
  }

  function alternarMicrofone() {
    const mudo = !microfoneMudo;
    microfoneRef.current?.getAudioTracks().forEach((track) => { track.enabled = !mudo; });
    setMicrofoneMudo(mudo);
  }

  const carregarMais = async () => {
    if (!cursor) return;
    const { chamadas: mais, proximoCursor } = await api.get<{ chamadas: Chamada[]; proximoCursor: string | null }>(`/voz/chamadas?limite=25&cursor=${encodeURIComponent(cursor)}`);
    setChamadas((atual) => [...atual, ...mais.filter((c) => !atual.some((a) => a.id === c.id))]);
    setCursor(proximoCursor);
  };

  const emCurso = chamadas.find((c) => STATUS_EM_CURSO.has(c.status));
  const recebidaTocando = chamadas.find((c) => c.direcao === 'ENTRANTE' && c.status === 'CHAMANDO');
  const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

  return (
    <div className="space-y-4">
      {erro && <Alerta>{erro}</Alerta>}
      {aviso && <Alerta tipo="sucesso">{aviso}</Alerta>}

      <section className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgb(15_23_42/0.05)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <div><h2 className="text-sm font-semibold text-slate-900">Chamadas</h2><p className="mt-0.5 text-xs text-slate-500">Acompanhe o histórico e inicie chamadas pelo provedor configurado.</p></div>
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600"><span className={`h-2 w-2 rounded-full ${linhaCloudAtiva ? 'bg-emerald-500' : 'bg-amber-400'}`} /> {linhaCloudAtiva ? 'WhatsApp Calling ativo na sua linha' : 'Conecte e habilite sua linha WhatsApp Cloud'}</span>
        </header>
        <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="CHAMADAS (24H)" value={indicadores?.total ?? '—'} detail={`${indicadores?.entrantes ?? 0} recebidas`} />
              <Metric label="ATENDIDAS" value={indicadores?.atendidas ?? '—'} detail="por você e sua equipe" />
              <Metric label="TEMPO MÉDIO" value={duracaoCurta(indicadores?.tma ?? null)} detail="por ligação atendida" />
            </div>

            <section className="min-h-[390px] rounded-xl border border-slate-200 bg-white">
              <header className="border-b border-slate-100 px-4 py-3"><h3 className="text-sm font-semibold text-slate-900">Histórico de chamadas</h3><p className="mt-1 text-xs text-slate-500">Registro vinculado ao contato e à linha do tempo do CRM.</p></header>
              {chamadas.length === 0 ? <p className="p-4 text-sm text-slate-500">Nenhuma chamada registrada.</p> : <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-xs">
                  <thead><tr className="border-b border-slate-100 text-[10px] font-medium uppercase text-slate-500">{['Horário', 'Contato', 'Direção', 'Resultado', 'Duração', 'Gravação', 'Custo', 'Assistente'].map((x) => <th key={x} className="px-3 py-2">{x}</th>)}</tr></thead>
                  <tbody>{chamadas.map((c) => <Fragment key={c.id}>
                    <tr className="border-b border-slate-100 last:border-0">
                      <td className="whitespace-nowrap px-3 py-3 text-slate-600">{dataHora(c.iniciadoEm)}</td>
                      <td className="px-3 py-3"><div className="font-medium text-slate-800">{c.contato?.nome ?? (c.direcao === 'ENTRANTE' ? c.numeroOrigem : c.numeroDestino)}</div><div className="mt-0.5 text-[10px] text-slate-500">WhatsApp · {c.direcao === 'ENTRANTE' ? c.numeroOrigem : c.numeroDestino}{c.linha ? ` · linha ${c.linha.nome ?? c.linha.donoNome ?? 'WhatsApp'}` : ''}</div></td>
                      <td className="px-3 py-3 text-slate-700">{c.direcao === 'ENTRANTE' ? 'Recebida' : 'Realizada'}</td>
                      <td className="px-3 py-3"><Badge tom={TOM[c.status] ?? 'neutro'}>{LABEL_CHAMADA_STATUS[c.status]}</Badge></td>
                      <td className="px-3 py-3 tabular-nums text-slate-700">{duracaoCurta(c.duracao)}</td>
                      <td className="px-3 py-3">{c.gravacaoUrl?.startsWith('/api/arquivos/') ? <audio controls src={c.gravacaoUrl} className="h-7 w-28" /> : <span className="text-slate-400">{c.gravacaoUrl ? 'No provedor' : '—'}</span>}</td>
                      <td className="px-3 py-3 text-slate-600">{custoCurto(c.custo)}</td>
                      <td className="px-3 py-3">{c.analisadoEm || c.resumo || c.sentimento || c.transcricao ? <button type="button" onClick={() => setAssistente((a) => a === c.id ? null : c.id)} className="text-blue-700 hover:underline">{assistente === c.id ? 'Fechar' : 'Abrir'}</button> : <span className="text-slate-400">—</span>}</td>
                    </tr>
                    {assistente === c.id && <tr className="border-b border-slate-100 bg-slate-50"><td colSpan={8} className="p-3"><AssistenteDaLigacao chamadaId={c.id} /></td></tr>}
                  </Fragment>)}</tbody>
                </table>
              </div>}
              {cursor && <div className="border-t border-slate-100 p-3"><Button variante="neutro" onClick={() => void carregarMais()}>Carregar chamadas anteriores</Button></div>}
              <p className="border-t border-slate-100 px-4 py-2.5 text-[10px] text-slate-500">Ao encerrar, duração e gravação ficam disponíveis no histórico do contato quando o provedor envia esses dados.</p>
            </section>
          </div>

          <aside className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-900">Painel de ligações</h3><span className={`text-[10px] ${linhaCloudAtiva ? 'text-emerald-700' : 'text-amber-600'}`}>{linhaCloudAtiva ? 'Cloud API' : 'Configuração pendente'}</span></div>
            <div className="mt-3 grid grid-cols-2 rounded-lg bg-slate-50 p-1 text-center text-[11px]">
              <button type="button" onClick={() => setAbaPainel('receber')} className={`rounded-md px-2 py-2 ${abaPainel === 'receber' ? 'bg-white font-medium text-slate-800 shadow-sm' : 'text-slate-500'}`}>Receber chamadas</button>
              <button type="button" onClick={() => setAbaPainel('fazer')} className={`rounded-md px-2 py-2 ${abaPainel === 'fazer' ? 'bg-white font-medium text-slate-800 shadow-sm' : 'text-slate-500'}`}>Fazer chamada</button>
            </div>

            {abaPainel === 'receber' && <>
            <h4 className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Chamada recebida</h4>
            {recebidaTocando ? <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              <div className="flex items-center gap-2"><Avatar nome={recebidaTocando.contato?.nome ?? recebidaTocando.numeroOrigem} /><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-800">{recebidaTocando.contato?.nome ?? recebidaTocando.numeroOrigem}</p><p className="text-[10px] text-slate-500">WhatsApp · {recebidaTocando.numeroOrigem}</p></div></div>
              <p className="mt-3 flex items-center gap-1.5 text-[10px] text-amber-700"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" /> Ligação recebida no WhatsApp</p>
              <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" disabled={ocupado || Boolean(chamadaAtivaId) || !linhaCloudAtiva} onClick={() => void atender(recebidaTocando.id)} className="rounded-md bg-emerald-600 px-2 py-2 text-[10px] font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400">{ocupado ? 'Conectando…' : 'Atender'}</button><button type="button" disabled={ocupado || !linhaCloudAtiva} onClick={() => void recusar(recebidaTocando.id)} className="rounded-md border border-red-200 bg-white px-2 py-2 text-[10px] font-semibold text-red-600 disabled:text-slate-400">Recusar</button></div>
            </div> : <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-[11px] text-slate-500">{emCurso ? `Ligação ${LABEL_CHAMADA_STATUS[emCurso.status].toLocaleLowerCase()} registrada.` : 'Nenhuma chamada recebida no momento.'}</div>}
            </>}

            <h4 className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Durante a ligação</h4>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between text-[11px]"><span className="flex items-center gap-1.5 font-medium text-slate-700"><span className={`h-1.5 w-1.5 rounded-full ${audioConectado ? 'bg-emerald-500' : 'bg-amber-400'}`} />{audioConectado ? 'Áudio conectado' : emCurso?.status === 'EM_ANDAMENTO' ? 'Ligação em andamento' : chamadaAtivaId ? 'Chamando…' : 'Aguardando ligação'}</span><span className="font-semibold tabular-nums text-slate-700">{duracaoCurta(emCurso?.duracao ?? null)}</span></div>
              <p className="mt-1 text-[10px] text-slate-500">{emCurso?.contato?.nome ?? (chamadaAtivaId ? destinoPendenteRef.current : 'O áudio do navegador aparecerá aqui.')}</p>
              <div className="mt-3 grid grid-cols-2 gap-1.5"><button type="button" disabled={!chamadaAtivaId} onClick={alternarMicrofone} className="rounded-md border border-slate-200 bg-white px-1 py-1.5 text-[9px] text-slate-700 disabled:text-slate-400">{microfoneMudo ? 'Ativar microfone' : 'Silenciar'}</button><button type="button" disabled={!chamadaAtivaId} onClick={() => void desligar()} className="rounded-md bg-red-600 px-1 py-1.5 text-[9px] font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400">Desligar</button></div>
            </div>

            {abaPainel === 'fazer' && <form onSubmit={ligar} className="mt-4">
              <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Fazer chamada</h4>
              <Field label="Número ou contato"><Input value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="Digite um número" className="!py-2 !text-xs" /></Field>
              <div className="mt-2 grid grid-cols-3 gap-1.5">{teclas.map((tecla) => <button key={tecla} type="button" onClick={() => setDestino((d) => `${d}${tecla}`)} className="rounded-md border border-slate-200 bg-slate-50 py-1.5 text-xs text-slate-700 hover:bg-slate-100">{tecla}</button>)}</div>
              <Button type="submit" disabled={ocupado || Boolean(chamadaAtivaId) || !linhaCloudAtiva || destino.trim().length < 10} className="mt-2 w-full !py-2 text-xs">{ocupado ? 'Conectando…' : 'Ligar pelo WhatsApp'}</Button>
              <p className="mt-2 text-[9px] leading-relaxed text-slate-500">Use o telefone com código do país. A Meta pode exigir permissão de ligação concedida pelo contato.</p>
              {!transcricaoAtiva && <p className="mt-1 text-[9px] leading-relaxed text-amber-700">A gravação será salva; a transcrição automática depende de configurar OPENAI_API_KEY no servidor.</p>}
            </form>}
          </aside>
        </div>
      </section>
      <audio ref={audioRef} autoPlay className="hidden" />
      <div className="grid gap-3 sm:grid-cols-2">
        <SmallMetric label="Custo (24h)" value={custoCurto(indicadores?.custoTotal)} detail={indicadores?.chamadasComCusto ? `${indicadores.chamadasComCusto} chamada(s) com custo informado` : 'O provedor não informou custo'} />
        <SmallMetric label="Custo médio" value={custoCurto(indicadores?.custoMedio)} detail="Por chamada com custo informado" />
      </div>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3"><p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">{label}</p><div className="mt-1 flex items-baseline gap-2"><strong className="text-xl leading-none text-slate-900">{value}</strong><span className="text-[9px] text-slate-500">{detail}</span></div></div>;
}
function SmallMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white px-4 py-3"><p className="text-[10px] font-medium uppercase text-slate-500">{label}</p><strong className="mt-1 block text-xl text-slate-900">{value}</strong><p className="mt-1 text-[10px] text-slate-500">{detail}</p></div>;
}
function Avatar({ nome }: { nome: string }) {
  return <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-100 text-[10px] font-semibold text-blue-700">{nome.trim().charAt(0).toLocaleUpperCase()}</span>;
}

function aguardarIce(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = window.setTimeout(done, 8000);
    function done() {
      window.clearTimeout(timeout);
      pc.removeEventListener('icegatheringstatechange', mudou);
      resolve();
    }
    function mudou() {
      if (pc.iceGatheringState === 'complete') done();
    }
    pc.addEventListener('icegatheringstatechange', mudou);
  });
}
