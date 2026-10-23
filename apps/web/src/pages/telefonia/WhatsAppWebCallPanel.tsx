import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { IconeCheck, IconeDesligar, IconeMicrofone, IconeMicrofoneMudo, IconeTelefone } from './icones';

type Evento = { type: string; data?: any };
type ChamadaAtiva = { from: string; fromMe: boolean; conectado?: boolean };
type ResumoChamada = { from: string; fromMe: boolean; segundos: number; gravacao: string | null };
type RegistroAtivo = { callId: string; direcao: 'ENTRANTE' | 'SAINTE'; telefone: string; iniciadoEm: string; atendidoEm?: string | null; encerradoEm?: string | null; duracao?: number | null; status?: string };
type ParteTranscricao = { speaker: string; text: string; file?: string };
type AnaliseChamada = { base: string; transcript: string; transcriptOriginal?: string; parts: ParteTranscricao[]; resumo: string; pontosPrincipais: string[]; proximasAcoes: string[]; confiancaTranscricao?: 'ALTA' | 'MEDIA' | 'BAIXA'; trechosIncertos?: string[]; correcoesAplicadas?: string[]; sentimento: 'POSITIVO' | 'NEUTRO' | 'NEGATIVO' | null; analyzedAt: string; engine: string };

const SERVICO_LOCAL = 'http://127.0.0.1:4174';
const ANALISE_LOCAL = 'http://127.0.0.1:4175';

function formatarTempo(segundos: number) {
  const min = Math.floor(segundos / 60).toString().padStart(2, '0');
  const seg = (segundos % 60).toString().padStart(2, '0');
  return `${min}:${seg}`;
}

function nomeCurto(valor: string) {
  const limpo = valor.replace(/@(c\.us|lid|g\.us)$/i, '').replace(/\D/g, '');
  return limpo || valor;
}

/** Painel integrado para o conector Web testado localmente. */
export function WhatsAppWebCallPanel({ somenteRecebidas = false, sessao = 'teste-local', numeroId = null }: { somenteRecebidas?: boolean; sessao?: string; numeroId?: string | null }) {
  const [status, setStatus] = useState('verificando conex?o');
  const [qr, setQr] = useState<string | null>(null);
  const [destino, setDestino] = useState('');
  const [chamada, setChamada] = useState<ChamadaAtiva | null>(null);
  const [conectada, setConectada] = useState(false);
  const [etapaLigacao, setEtapaLigacao] = useState(0);
  const [inicioLigacao, setInicioLigacao] = useState<number | null>(null);
  const [segundos, setSegundos] = useState(0);
  const [resumo, setResumo] = useState<ResumoChamada | null>(null);
  const [gravacaoAtual, setGravacaoAtual] = useState<string | null>(null);
  const [analise, setAnalise] = useState<AnaliseChamada | null>(null);
  const [baseAnalise, setBaseAnalise] = useState<string | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [erroAnalise, setErroAnalise] = useState<string | null>(null);
  const [transcricaoAberta, setTranscricaoAberta] = useState(false);
  const [transcricaoOriginalAberta, setTranscricaoOriginalAberta] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [microfoneAtivo, setMicrofoneAtivo] = useState(false);
  const [mudo, setMudo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [eventos, setEventos] = useState<string[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const nextPlaybackRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mudoRef = useRef(false);
  const chamadaRef = useRef<ChamadaAtiva | null>(null);
  const inicioRef = useRef<number | null>(null);
  const gravacaoRef = useRef<string | null>(null);
  const destinoRef = useRef('');
  const baseGravacaoRef = useRef<string | null>(null);
  const registroRef = useRef<RegistroAtivo | null>(null);
  const registroQueueRef = useRef<Promise<void>>(Promise.resolve());
  const plataformaCallIdRef = useRef<string | null>(null);

  const querySessao = `?session=${encodeURIComponent(sessao)}`;

  function registrar(texto: string) {
    setEventos((anteriores) => [texto, ...anteriores].slice(0, 4));
  }

  async function persistirHistorico(extra: Record<string, unknown> = {}) {
    if (!numeroId || !registroRef.current) return;
    const registro = { ...registroRef.current };
    const dataIso = (valor?: string | null) => {
      if (!valor) return null;
      const data = new Date(valor);
      return Number.isNaN(data.getTime()) ? null : data.toISOString();
    };
    const corpo = {
        callId: String(registro.callId || `webjs-${Date.now()}`).slice(0, 200),
        direcao: registro.direcao === 'ENTRANTE' ? 'ENTRANTE' : 'SAINTE',
        telefone: String(registro.telefone || chamadaRef.current?.from || 'WhatsApp').slice(0, 200),
        status: ['CHAMANDO', 'EM_ANDAMENTO', 'COMPLETADA', 'NAO_ATENDIDA', 'OCUPADA', 'FALHOU', 'CANCELADA'].includes(registro.status || '') ? registro.status : 'CHAMANDO',
        ...(dataIso(registro.iniciadoEm) ? { iniciadoEm: dataIso(registro.iniciadoEm)! } : {}),
        atendidoEm: dataIso(registro.atendidoEm),
        encerradoEm: dataIso(registro.encerradoEm),
        duracao: registro.duracao == null ? null : Math.max(0, Math.min(86_400, Math.round(registro.duracao))),
        ...extra,
    };
    const operacao = registroQueueRef.current.then(async () => {
      const salvo = await api.post<{ chamadaId?: string }>(`/canais/numeros/${encodeURIComponent(numeroId)}/webjs-call/registro`, corpo);
      if (salvo.chamadaId) plataformaCallIdRef.current = salvo.chamadaId;
      window.dispatchEvent(new CustomEvent('voice-calls-updated'));
    }).catch((e) => {
      setErro(e instanceof Error ? `A chamada aconteceu, mas não foi possível salvar no histórico: ${e.message}` : 'Não foi possível salvar a chamada no histórico.');
    });
    registroQueueRef.current = operacao;
    await operacao;
  }

  async function requisitar(caminho: string, corpo?: Record<string, unknown>) {
    if (numeroId) {
      const base = `/canais/numeros/${encodeURIComponent(numeroId)}/webjs-call`;
      if (caminho.startsWith('/api/status')) return api.get<Record<string, any>>(`${base}/status`);
      if (caminho === '/api/call') return api.post<Record<string, any>>(`${base}/originar`, { phone: corpo?.phone });
      const acao = caminho.match(/^\/api\/call\/(accept|reject|hangup)$/)?.[1];
      if (acao) return api.post<Record<string, any>>(`${base}/action/${acao}`, {});
      throw new Error('Ação de chamada desconhecida.');
    }
    const resposta = await fetch(`${SERVICO_LOCAL}${caminho}`, {
      method: corpo ? 'POST' : 'GET',
      headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
      body: corpo ? JSON.stringify({ ...corpo, session: sessao }) : undefined,
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(dados.error || `Conector respondeu ${resposta.status}`);
    return dados;
  }

  function limparAudio() {
    processorRef.current?.disconnect(); processorRef.current = null;
    sourceRef.current?.disconnect(); sourceRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
    setMicrofoneAtivo(false); setMudo(false); setConectada(false); setChamada(null);
    chamadaRef.current = null;
    inicioRef.current = null;
    setInicioLigacao(null);
  }

  function finalizarChamada(gravacao = gravacaoRef.current) {
    const atual = chamadaRef.current;
    if (atual) {
      const inicio = inicioRef.current;
      const duracao = inicio ? Math.max(0, Math.floor((Date.now() - inicio) / 1000)) : segundos;
      setResumo({ from: atual.from, fromMe: atual.fromMe, segundos: duracao, gravacao });
      registrar('Ligação encerrada.');
    }
    limparAudio();
  }

  useEffect(() => {
    let vivo = true;
    let ws: WebSocket | null = null;
    void (async () => {
      let url: string;
      if (numeroId) {
        const { ticket } = await api.post<{ ticket: string }>(`/canais/numeros/${encodeURIComponent(numeroId)}/webjs-call/audio-ticket`, {});
        const protocolo = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        url = `${protocolo}//${window.location.host}/api/canais/whatsapp/chamadas/audio?ticket=${encodeURIComponent(ticket)}`;
      } else {
        url = `ws://127.0.0.1:4174/audio${querySessao}`;
      }
      if (!vivo) return;
      ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      socketRef.current = ws;
      ws.onopen = () => { setErro(null); void requisitar(`/api/status${querySessao}`).then((d) => {
        setStatus(d.status ?? 'desconectado');
        if (d.call) {
          const atual = { from: d.call.from, fromMe: Boolean(d.call.fromMe) };
          chamadaRef.current = atual;
          setChamada(atual);
        }
      }).catch(() => undefined); };
    ws.onmessage = async (event) => {
      if (typeof event.data !== 'string') {
        try {
          const audio = contextRef.current ?? new AudioContext({ sampleRate: 16000 });
          contextRef.current = audio;
          if (audio.state === 'suspended') await audio.resume();
          const pcm = new Int16Array(event.data as ArrayBuffer);
          const buffer = audio.createBuffer(1, pcm.length, 16000);
          const dados = buffer.getChannelData(0);
          for (let i = 0; i < pcm.length; i += 1) dados[i] = pcm[i]! / 32768;
          const source = audio.createBufferSource(); source.buffer = buffer; source.connect(audio.destination);
          const now = audio.currentTime; nextPlaybackRef.current = Math.max(nextPlaybackRef.current, now + 0.04);
          source.start(nextPlaybackRef.current); nextPlaybackRef.current += buffer.duration;
        } catch { setErro('Não foi poss?vel reproduzir o áudio recebido.'); }
        return;
      }
      let msg: Evento;
      try { msg = JSON.parse(event.data) as Evento; } catch { return; }
      if (msg.type === 'status') setStatus(String(msg.data));
      if (msg.type === 'qr') setQr(String(msg.data));
      if (msg.type === 'call') {
        if (msg.data?.callId && msg.data?.direcao && msg.data?.iniciadoEm) {
          registroRef.current = {
            callId: String(msg.data.callId),
            direcao: msg.data.direcao === 'ENTRANTE' ? 'ENTRANTE' : 'SAINTE',
            telefone: String(msg.data.telefone || msg.data.from || ''),
            iniciadoEm: String(msg.data.iniciadoEm),
            status: 'CHAMANDO',
          };
          void persistirHistorico();
        }
        const numero = Boolean(msg.data.fromMe) && destinoRef.current ? destinoRef.current : String(msg.data.from ?? 'Contato do WhatsApp');
        const atual = { from: numero, fromMe: Boolean(msg.data.fromMe) };
        chamadaRef.current = atual;
        gravacaoRef.current = null;
        setGravacaoAtual(null);
        setResumo(null);
        setChamada(atual);
        setInicioLigacao(null);
        setEtapaLigacao(1);
        inicioRef.current = null;
        setSegundos(0);
        setConectada(false);
        registrar(atual.fromMe ? `Chamando ${nomeCurto(numero)}` : `Ligação recebida de ${nomeCurto(numero)}`);
      }
      if (msg.type === 'call-active') {
        if (registroRef.current) {
          registroRef.current = { ...registroRef.current, status: 'EM_ANDAMENTO', atendidoEm: String(msg.data?.atendidoEm || new Date().toISOString()) };
          void persistirHistorico();
        }
        setChamada((c) => {
          const atual = c ? { ...c, from: String(msg.data?.from || c.from), conectado: true } : null;
          chamadaRef.current = atual;
          return atual;
        });
        inicioRef.current = Date.now();
        setInicioLigacao(inicioRef.current);
        setSegundos(0);
        setConectada(true);
        setEtapaLigacao(2);
        setQr(null);
      }
      if (msg.type === 'call-ended') {
        if (registroRef.current) {
          registroRef.current = {
            ...registroRef.current,
            status: String(msg.data?.status || 'COMPLETADA'),
            atendidoEm: msg.data?.atendidoEm ?? registroRef.current.atendidoEm ?? null,
            encerradoEm: String(msg.data?.encerradoEm || new Date().toISOString()),
            duracao: Number(msg.data?.duracao ?? 0),
          };
          void persistirHistorico();
        }
        finalizarChamada();
        if (baseGravacaoRef.current) void analisarGravacao(baseGravacaoRef.current);
      }
      if (msg.type === 'recording') {
        const arquivo = String(msg.data?.name ?? 'Gravação WAV');
        const base = arquivo.match(/^(sessao-[a-zA-Z0-9_-]+-chamada-.+?)-(?:audio-remoto|microfone-atendente|audio-completo)\.wav$/)?.[1];
        if (base) baseGravacaoRef.current = base;
        gravacaoRef.current = arquivo;
        setGravacaoAtual(arquivo);
        setResumo((atual) => atual ? { ...atual, gravacao: arquivo } : atual);
        registrar(`Gravação salva: ${arquivo}`);
      }
      if (msg.type === 'recordings-ready' && msg.data?.base) {
        const base = String(msg.data.base);
        const nomeCompleto = `${base}-audio-completo.wav`;
        if (Array.isArray(msg.data.files) && msg.data.files.includes(nomeCompleto)) {
          void persistirHistorico({ recordingName: nomeCompleto });
        }
        void analisarGravacao(base);
      }
      if (msg.type === 'error') setErro(String(msg.data));
    };
      ws.onerror = () => { setStatus('conector indisponível'); setErro(numeroId ? 'O serviço de chamadas não respondeu. Tente recarregar a página.' : 'Inicie o serviço local de chamadas na porta 4174.'); };
    ws.onclose = () => { if (socketRef.current === ws) setStatus(numeroId ? 'conector desconectado' : 'conector local desconectado'); };
    })().catch((e) => {
      if (vivo) setErro(e instanceof Error ? e.message : 'Não foi possível conectar o áudio da chamada.');
    });
    return () => {
      vivo = false;
      ws?.close();
      if (socketRef.current === ws) socketRef.current = null;
      limparAudio();
      void contextRef.current?.close(); contextRef.current = null;
    };
  }, [querySessao, sessao, numeroId]);

  useEffect(() => { mudoRef.current = mudo; }, [mudo]);
  useEffect(() => {
    if (!inicioLigacao) return;
    const atualizar = () => setSegundos(Math.max(0, Math.floor((Date.now() - inicioLigacao) / 1000)));
    atualizar();
    const timer = window.setInterval(atualizar, 1000);
    return () => window.clearInterval(timer);
  }, [inicioLigacao]);

  async function habilitarMicrofone() {
    try {
      const audio = contextRef.current ?? new AudioContext({ sampleRate: 16000 }); contextRef.current = audio;
      await audio.resume();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      streamRef.current = stream;
      const source = audio.createMediaStreamSource(stream); sourceRef.current = source;
      const processor = audio.createScriptProcessor(4096, 1, 1); processorRef.current = processor;
      processor.onaudioprocess = (event) => {
        const ws = socketRef.current;
        if (mudoRef.current || ws?.readyState !== WebSocket.OPEN) return;
        const floats = event.inputBuffer.getChannelData(0); const pcm = new Int16Array(floats.length);
        for (let i = 0; i < floats.length; i += 1) pcm[i] = Math.max(-1, Math.min(1, floats[i]!)) * 32767;
        ws.send(pcm.buffer);
      };
      source.connect(processor); processor.connect(audio.destination); setMicrofoneAtivo(true); setErro(null);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível habilitar o microfone.'); }
  }

  async function acao(caminho: string) {
    setOcupado(true); setErro(null);
    try {
      await requisitar(caminho, {});
      if (caminho.endsWith('/reject') || caminho.endsWith('/hangup')) {
        if (chamadaRef.current) finalizarChamada();
      }
    } catch (e) { setErro(e instanceof Error ? e.message : 'A ação da chamada falhou.'); }
    finally { setOcupado(false); }
  }

  async function ligar(e: React.FormEvent) {
    e.preventDefault(); setOcupado(true); setErro(null);
    destinoRef.current = destino;
    plataformaCallIdRef.current = null;
    baseGravacaoRef.current = null;
    setResumo(null);
    setAnalise(null);
    setBaseAnalise(null);
    setErroAnalise(null);
    const iniciada = { from: destino, fromMe: true };
    chamadaRef.current = iniciada;
    setChamada(iniciada);
    setEtapaLigacao(0);
    setSegundos(0);
    try { await requisitar('/api/call', { phone: destino }); setDestino(''); }
    catch (err) {
      chamadaRef.current = null;
      setChamada(null);
      setErro(err instanceof Error ? err.message : 'Não foi possível iniciar a chamada.');
    }
    finally { setOcupado(false); }
  }

  async function analisarGravacao(base: string) {
    setBaseAnalise(base);
    setAnalisando(true);
    setErroAnalise(null);
    setAnalise(null);
    setTranscricaoAberta(false);
    setTranscricaoOriginalAberta(false);
    try {
      let resultado: AnaliseChamada;
      if (numeroId) {
        await registroQueueRef.current;
        if (!plataformaCallIdRef.current) throw new Error('O registro da chamada ainda n?o foi salvo na plataforma. Tente novamente em instantes.');
        resultado = await api.post<AnaliseChamada>(`/canais/numeros/${encodeURIComponent(numeroId)}/webjs-call/recordings/${encodeURIComponent(base)}/analyze`, {
          ...(plataformaCallIdRef.current ? { plataformaCallId: plataformaCallIdRef.current } : {}),
        });
      } else {
        const response = await fetch(`${ANALISE_LOCAL}/api/recordings/${encodeURIComponent(base)}/analyze`, { method: 'POST' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || `Análise local respondeu ${response.status}`);
        resultado = body as AnaliseChamada;
      }
      setAnalise(resultado);
    } catch (e) {
      setErroAnalise(e instanceof Error ? e.message : 'Não foi possível analisar esta chamada.');
    } finally {
      setAnalisando(false);
    }
  }
  const conectadoAoWhatsApp = status === 'conectado';
  const etapaAtual = resumo ? 3 : conectada ? 2 : chamada ? etapaLigacao : -1;
  const chamadaPendente = Boolean(chamada && !conectada);
  const etapas = chamada?.fromMe === false || resumo?.fromMe === false
    ? ['Ligação recebida', 'Aguardando atendimento', 'Em ligação', 'Encerrada']
    : ['Ligação iniciada', 'Chamando', 'Em ligação', 'Encerrada'];
  const contatoAtual = chamada ? nomeCurto(chamada.from) : resumo ? nomeCurto(resumo.from) : '';
  const inicial = (contatoAtual || 'W').replace(/\D/g, '').slice(-1) || (contatoAtual[0] || 'W').toUpperCase();

  if (somenteRecebidas && !chamada) return null;

  return (
    <aside className={`${somenteRecebidas ? 'fixed bottom-5 right-5 z-[100] w-[min(420px,calc(100vw-2.5rem))] shadow-2xl' : ''} flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5`} aria-label="Chamadas do WhatsApp Web">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {chamada ? (conectada ? 'Chamada em andamento' : chamada.fromMe ? 'Chamada de saída' : 'Chamada recebida') : 'Fazer chamada pelo WhatsApp'}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {chamada ? 'Acompanhe a chamada e o áudio nesta tela.' : 'Digite o número do cliente com o código do país.'}
          </p>
        </div>
        <span className={`inline-flex h-7 items-center gap-2 rounded-full px-3 text-xs font-semibold ${conectadoAoWhatsApp ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
          <span className={`h-2 w-2 rounded-full ${conectadoAoWhatsApp ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          {conectadoAoWhatsApp ? 'WhatsApp Web conectado' : status}
        </span>
      </div>

      {etapaAtual >= 0 && (
        <ol aria-label="Etapas da ligação" className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {etapas.map((etapa, indice) => {
            const concluida = indice < etapaAtual;
            const ativa = indice === etapaAtual;
            return (
              <li key={etapa} aria-current={ativa ? 'step' : undefined} className={`flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${ativa ? 'border-blue-200 bg-blue-50 text-blue-700' : concluida ? 'border-emerald-100 bg-emerald-50/70 text-emerald-700' : 'border-slate-100 bg-slate-50 text-slate-400'}`}>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${concluida ? 'bg-emerald-500 text-white' : ativa ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                  {concluida ? <IconeCheck tamanho={12} /> : indice + 1}
                </span>
                {etapa}
              </li>
            );
          })}
        </ol>
      )}

      {!somenteRecebidas && !conectadoAoWhatsApp && !chamada && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 p-5 text-center">
          {qr ? <img src={qr} alt="QR para conectar o WhatsApp" className="h-44 w-44" /> : <p className="text-sm text-slate-600">Conecte a mesma linha do Atendimento para fazer e receber chamadas.</p>}
          <a href="/atendimento" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            {qr ? 'Escaneie o mesmo QR no Atendimento' : 'Ir ao Atendimento para conectar'}
          </a>
        </div>
      )}

      {chamada && chamadaPendente && (
        <section aria-label={chamada.fromMe ? 'Chamada de saída' : 'Chamada recebida'} className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:px-6 md:py-5">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xl font-bold text-blue-700 ring-4 ring-white">{inicial}</span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold uppercase tracking-wide text-amber-700">{chamada.fromMe ? 'Chamando pelo WhatsApp' : 'Tocando no WhatsApp'}</span>
              <span className="mt-1 block truncate text-lg font-bold text-slate-900">{contatoAtual}</span>
              <span className="mt-0.5 block text-xs text-slate-500">Aguardando atendimento para conectar o áudio</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            {!chamada.fromMe && <button type="button" disabled={ocupado} onClick={() => void acao('/api/call/accept')} className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"><IconeTelefone tamanho={16} />Atender no painel</button>}
            <button type="button" disabled={ocupado} onClick={() => void acao(chamada.fromMe ? '/api/call/hangup' : '/api/call/reject')} className="h-10 rounded-xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">{chamada.fromMe ? 'Cancelar chamada' : 'Recusar'}</button>
            {!microfoneAtivo && <button type="button" onClick={() => void habilitarMicrofone()} className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100">Ativar microfone</button>}
          </div>
        </section>
      )}

      {conectada && chamada && (
        <section aria-label="Chamada conectada" className="grid gap-4 rounded-2xl bg-slate-900 p-5 text-white md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:px-7 md:py-6">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-blue-900 text-2xl font-bold ring-4 ring-slate-800">{inicial}</span>
            <span className="min-w-0">
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-950 px-2.5 py-1 text-[11px] font-semibold text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />áudio conectado</span>
              <span className="mt-2 block truncate text-lg font-bold">{contatoAtual}</span>
              <span className="mt-0.5 block text-xs text-slate-300">WhatsApp ? {nomeCurto(chamada.from)}</span>
              <span className="mt-1 block text-3xl font-bold tabular-nums tracking-tight">{formatarTempo(segundos)}</span>
              <span className="mt-0.5 block text-xs text-red-300">? Gravando para o hist?rico</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            <button type="button" onClick={() => setMudo((v) => !v)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-600 px-4 text-sm font-semibold text-white hover:bg-slate-800">
              {mudo ? <IconeMicrofone tamanho={17} /> : <IconeMicrofoneMudo tamanho={17} />}{mudo ? 'Ativar microfone' : 'Silenciar'}
            </button>
            {!microfoneAtivo && <button type="button" onClick={() => void habilitarMicrofone()} className="h-11 rounded-xl border border-slate-600 px-4 text-sm font-semibold text-slate-100 hover:bg-slate-800">Habilitar microfone</button>}
            <button type="button" disabled={ocupado} onClick={() => void acao('/api/call/hangup')} className="inline-flex h-11 items-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"><IconeDesligar tamanho={16} />Desligar</button>
          </div>
        </section>
      )}

      {resumo && !chamada && (
        <section aria-label="Ligação encerrada" className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:px-6 md:py-5">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><IconeCheck tamanho={22} /></span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-slate-900">Ligação encerrada · {formatarTempo(resumo.segundos)}</span>
              <span className="mt-1 block truncate text-xs text-slate-500">{resumo.fromMe ? 'Chamada feita' : 'Chamada recebida'} · {nomeCurto(resumo.from)}</span>
              <span className="mt-2 inline-flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <IconeCheck tamanho={14} className={resumo.gravacao ? 'text-emerald-600' : 'text-slate-400'} />
                {resumo.gravacao ? (numeroId ? 'Gravação sendo salva no histórico da plataforma' : 'Gravação salva neste computador') : 'Sem gravação nesta ligação'}
              </span>
            </span>
          </div>
          {!somenteRecebidas && <button type="button" onClick={() => { setResumo(null); setGravacaoAtual(null); gravacaoRef.current = null; }} className="h-10 rounded-xl bg-slate-900 px-5 text-sm font-bold text-white hover:bg-slate-700">Nova chamada</button>}
        </section>
      )}

      {!somenteRecebidas && conectadoAoWhatsApp && !chamada && !resumo && (
        <form onSubmit={(e) => void ligar(e)} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="min-w-0 text-xs font-medium text-slate-600">Número do cliente
            <input aria-label="Telefone para ligar" value={destino} onChange={(e) => setDestino(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="+55 62 9 0000-0000" className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500" />
          </label>
          <button type="submit" disabled={ocupado || destino.replace(/\D/g, '').length < 10} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"><IconeTelefone tamanho={16} />{ocupado ? 'Chamando…' : 'Ligar pelo WhatsApp'}</button>
        </form>
      )}

      {(resumo || analise || analisando || erroAnalise) && <section aria-label="Transcrição e resumo da chamada" className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Transcrição e resumo</h3>
              <p className="mt-1 text-xs text-slate-500">Análise local da conversa, separada por participante.</p>
            </div>
            {analise ? <span className={`rounded-full px-3 py-1 text-xs font-semibold ${analise.sentimento ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{analise.sentimento === 'POSITIVO' ? 'Sentimento positivo' : analise.sentimento === 'NEGATIVO' ? 'Sentimento negativo' : analise.sentimento === 'NEUTRO' ? 'Sentimento neutro' : 'Sentimento não analisado'}</span> : <span className={`rounded-full px-3 py-1 text-xs font-medium ${analisando ? 'bg-blue-50 text-blue-700' : erroAnalise ? 'bg-amber-50 text-amber-800' : resumo ? 'bg-slate-100 text-slate-500' : 'bg-violet-50 text-violet-700'}`}>{analisando ? 'Analisando chamada' : erroAnalise ? 'Análise pendente' : resumo ? 'Preparando análise' : 'Exemplo fictício'}</span>}
          </div>
          <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <div className="space-y-4">
              {analise ? <>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Resumo</h4>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{analise.resumo}</p>
                </div>
                <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-900">
                  Transcrição revisada com apoio de IA · confiança estimada: {analise.confiancaTranscricao === 'ALTA' ? 'alta' : analise.confiancaTranscricao === 'BAIXA' ? 'baixa' : analise.confiancaTranscricao === 'MEDIA' ? 'média' : 'não informada'}.
                  {analise.trechosIncertos?.length ? <ul className="mt-1 list-disc pl-4">{analise.trechosIncertos.map((trecho, i) => <li key={`${i}-${trecho}`}>{trecho}</li>)}</ul> : null}
                  {analise.correcoesAplicadas?.length ? <p className="mt-1">Ajustes: {analise.correcoesAplicadas.join('; ')}</p> : null}
                </div>
                {analise.pontosPrincipais?.length > 0 && <div>
                  <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Pontos principais</h4>
                  <ul className="mt-2 space-y-2">{analise.pontosPrincipais.map((ponto, i) => <li key={`${i}-${ponto}`} className="flex gap-2 text-sm text-slate-700"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />{ponto}</li>)}</ul>
                </div>}
                {analise.proximasAcoes?.length > 0 && <div>
                  <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Próximos passos</h4>
                  <ul className="mt-2 space-y-2">{analise.proximasAcoes.map((acao, i) => <li key={`${i}-${acao}`} className="flex gap-2 text-sm text-slate-700"><IconeCheck tamanho={15} className="mt-0.5 shrink-0 text-emerald-600" />{acao}</li>)}</ul>
                </div>}
              </> : analisando ? <div className="flex min-h-36 flex-col justify-center rounded-xl bg-blue-50 p-4">
                <p className="text-sm font-semibold text-blue-900">Preparando a transcrição e o resumo…</p>
                <p className="mt-1 text-xs leading-relaxed text-blue-700">O áudio está sendo processado neste computador. Chamadas longas podem levar alguns minutos.</p>
              </div> : erroAnalise ? <div className="rounded-xl bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-900">A an?lise ainda não ficou pronta</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-800">{erroAnalise}</p>
                {baseAnalise && <button type="button" onClick={() => void analisarGravacao(baseAnalise)} className="mt-3 rounded-lg bg-amber-900 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-800">Tentar novamente</button>}
              </div> : <div className="flex min-h-36 items-center rounded-xl bg-slate-50 p-4">
                <p className="text-sm text-slate-600">A gravação e a transcrição desta chamada estão sendo preparadas.</p>
              </div>}
              {analise && <p className="text-[11px] text-slate-400">{analise.engine} ? processado neste computador</p>}
            </div>
            <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-slate-800">Gravações da chamada</h4>
                {analise && <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={() => setTranscricaoAberta((aberta) => !aberta)} className="text-xs font-semibold text-blue-700 hover:underline">{transcricaoAberta ? 'Ocultar transcrição revisada' : 'Ver transcrição revisada'}</button>
                  {analise.transcriptOriginal && <button type="button" onClick={() => setTranscricaoOriginalAberta((aberta) => !aberta)} className="text-xs font-medium text-slate-600 hover:underline">{transcricaoOriginalAberta ? 'Ocultar texto original reconhecido' : 'Comparar com o reconhecimento original'}</button>}
                </div>}
              </div>
              {analise?.parts?.map((parte) => {
                const arquivo = parte.file || `${analise.base}${parte.speaker === 'Cliente' ? '-audio-remoto.wav' : '-microfone-atendente.wav'}`;
                return <div key={parte.speaker} className="mt-3">
                <p className="mb-1 text-xs font-medium text-slate-500">{parte.speaker}</p>
                <audio controls preload="none" className="h-9 w-full" src={numeroId
                  ? `/api/canais/numeros/${encodeURIComponent(numeroId)}/webjs-call/recordings/${encodeURIComponent(arquivo)}/audio`
                  : `${ANALISE_LOCAL}/api/recordings/${encodeURIComponent(arquivo)}/audio`} />
              </div>;
              })}
              {transcricaoAberta && analise && <div className="mt-4 max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-700">
                <p className="whitespace-pre-wrap">{analise.transcript}</p>
              </div>}
              {transcricaoOriginalAberta && analise?.transcriptOriginal && <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-dashed border-slate-300 bg-white p-3 text-xs leading-relaxed text-slate-500">
                <p className="mb-1 font-semibold">Reconhecimento automático antes da revisão</p>
                <p className="whitespace-pre-wrap">{analise.transcriptOriginal}</p>
              </div>}
              {!analise && !analisando && !erroAnalise && resumo && <p className="mt-3 text-xs text-slate-500">A gravação e a transcrição desta chamada ainda não estão disponíveis.</p>}
            </div>
          </div>
      </section>}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <p className="text-xs leading-relaxed text-slate-500">{numeroId ? 'Após a chamada, o áudio e a transcrição são salvos no histórico da Telefonia para consulta.' : 'Áudio e gravação desta prova de conceito ficam neste computador.'}</p>
        {gravacaoAtual && chamada && <span className="text-xs font-medium text-emerald-700">Gravação em andamento</span>}
      </div>
      {erro && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      {eventos.length > 0 && chamada && <div className="sr-only" aria-live="polite">{eventos[0]}</div>}
    </aside>
  );
}
