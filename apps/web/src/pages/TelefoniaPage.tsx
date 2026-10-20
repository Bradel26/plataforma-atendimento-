import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Alerta, Button } from '../components/ui';
import { AssistenteDaLigacao } from './telefonia/AssistenteDaLigacao';
import { PainelLigacoes, relogio, type PosLigacao } from './telefonia/PainelLigacoes';
import { IconeChevron, IconeFeita, IconePlay, IconeRecebida } from './telefonia/icones';
import { Selo, type Tom } from './dashboard/blocos';
import { ApiError, api, getAccessToken } from '../lib/api';
import { conectar, EVENTOS } from '../lib/realtime';
import { telefoneLegivel } from '../lib/telefone';
import { ESTADO } from '../lib/viz';
import {
  LABEL_CHAMADA_STATUS,
  LABEL_SENTIMENTO,
  moeda,
  type CallStatus,
  type Chamada,
  type IndicadoresVoz,
  type SentimentoDaLigacao,
} from '../lib/types';

const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const custoCurto = (v: number | null | undefined) => v == null ? '—' : `R$ ${v.toFixed(4).replace('.', ',')}`;
const STATUS_EM_CURSO = new Set(['CHAMANDO', 'EM_ANDAMENTO']);
const STATUS_PERDIDA = new Set<CallStatus>(['NAO_ATENDIDA', 'OCUPADA', 'FALHOU', 'CANCELADA']);

/** Mesmo alvo do Dashboards: abaixo disto a operacao esta perdendo ligacao. */
const TAXA_ATENDIMENTO_ALVO = 90;
const TAXA_ATENDIMENTO_CRITICA = 80;

// So tons que o tema escuro remapeia em index.css.
const CLASSE_STATUS: Record<CallStatus, string> = {
  INICIANDO: 'bg-blue-50 text-blue-700',
  CHAMANDO: 'bg-blue-50 text-blue-700',
  EM_ANDAMENTO: 'bg-blue-50 text-blue-700',
  COMPLETADA: 'bg-emerald-50 text-emerald-700',
  NAO_ATENDIDA: 'bg-amber-50 text-amber-700',
  OCUPADA: 'bg-amber-50 text-amber-700',
  FALHOU: 'bg-red-50 text-red-700',
  CANCELADA: 'bg-slate-100 text-slate-600',
};

const COR_SENTIMENTO: Record<SentimentoDaLigacao, string> = {
  POSITIVO: ESTADO.bom,
  NEUTRO: ESTADO.neutro,
  NEGATIVO: ESTADO.grave,
};

type Filtro = 'todas' | 'recebidas' | 'feitas' | 'perdidas';
const FILTROS: Array<{ id: Filtro; rotulo: string }> = [
  { id: 'todas', rotulo: 'Todas' },
  { id: 'recebidas', rotulo: 'Recebidas' },
  { id: 'feitas', rotulo: 'Feitas' },
  { id: 'perdidas', rotulo: 'Perdidas' },
];
const passaNoFiltro = (c: Chamada, f: Filtro) =>
  f === 'todas' ||
  (f === 'recebidas' && c.direcao === 'ENTRANTE') ||
  (f === 'feitas' && c.direcao === 'SAINTE') ||
  (f === 'perdidas' && STATUS_PERDIDA.has(c.status));

const numeroLegivel = (numero: string) => (/^\d+$/.test(numero) ? telefoneLegivel(numero) : numero);

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
  const [abaPainel, setAbaPainel] = useState<'receber' | 'fazer'>('fazer');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [ouvindo, setOuvindo] = useState<string | null>(null);
  /** Numero a quem a plataforma acabou de pedir autorizacao para ligar. */
  const [autorizacaoPendente, setAutorizacaoPendente] = useState<string | null>(null);
  const [posLigacao, setPosLigacao] = useState<PosLigacao | null>(null);
  const [inicioAudio, setInicioAudio] = useState<number | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const audioRef = useRef<HTMLAudioElement>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const microfoneRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gravadorRef = useRef<MediaRecorder | null>(null);
  const partesGravacaoRef = useRef<Blob[]>([]);
  const idChamadaRef = useRef<string | null>(null);
  const destinoPendenteRef = useRef<string | null>(null);
  const nomeLigacaoRef = useRef<string | null>(null);
  const inicioAudioRef = useRef<number | null>(null);

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
  // Cronometro da ligacao: so roda enquanto ha chamada ativa.
  useEffect(() => {
    if (!chamadaAtivaId) return;
    const timer = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [chamadaAtivaId]);

  const ligar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (ocupado || chamadaAtivaId) return;
    setErro(null); setAviso(null); setAutorizacaoPendente(null); setPosLigacao(null); setOcupado(true);
    try {
      const telefone = destino.trim();
      const permissao = await api.get<{ permitida: boolean; podeSolicitar: boolean }>(`/voz/chamadas/whatsapp/permissao?destino=${encodeURIComponent(telefone)}`);
      if (!permissao.permitida) {
        if (permissao.podeSolicitar) {
          const pedido = await api.post<{ permitida: boolean; solicitada: boolean }>('/voz/chamadas/whatsapp/permissao', { destino: telefone });
          if (pedido.permitida) {
            setAviso('O cliente já autorizou chamadas. Iniciando a ligação…');
          } else if (pedido.solicitada) {
            // O painel mostra o passo a passo do pedido no lugar do aviso de texto.
            setAutorizacaoPendente(telefone);
            return;
          } else {
            setAviso('Ainda não há autorização para ligar. Peça para o cliente ligar primeiro pelo WhatsApp ou tente novamente mais tarde.');
            return;
          }
        } else {
          setAviso('Este contato ainda não autorizou chamadas ou a Meta não permite um novo pedido agora. Peça para o cliente ligar primeiro pelo WhatsApp e tente novamente após o aceite.');
          return;
        }
      }
      const pc = await prepararPeer();
      const oferta = await pc.createOffer();
      await pc.setLocalDescription(oferta);
      await aguardarIce(pc);
      const resposta = await api.post<{ chamada: Chamada }>('/voz/chamadas/whatsapp/originar', {
        destino: destino.trim(), sdp: pc.localDescription?.sdp,
      });
      definirChamadaAtiva(resposta.chamada.id);
      destinoPendenteRef.current = destino.trim();
      nomeLigacaoRef.current = resposta.chamada.contato?.nome ?? destino.trim();
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
      if (inicioAudioRef.current === null) {
        inicioAudioRef.current = Date.now();
        setInicioAudio(inicioAudioRef.current);
      }
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
            ? 'Gravação salva. A transcrição está sendo processada no servidor.'
            : resultado.transcricaoSolicitada
              ? 'Gravação salva no histórico; a transcrição será anexada assim que terminar.'
              : 'Gravação salva no histórico do contato.');
          setPosLigacao((p) => p && {
            ...p,
            gravacao: 'salva',
            transcricao: resultado.transcricaoPendente || resultado.transcricaoSolicitada ? 'processando' : null,
          });
          return carregar();
        }).catch((erro) => {
          setPosLigacao((p) => p && { ...p, gravacao: 'falhou' });
          setErro(erro instanceof ApiError ? erro.message : 'A chamada terminou, mas não foi possível salvar a gravação.');
        });
      } else {
        setPosLigacao((p) => p && { ...p, gravacao: 'sem' });
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
    setErro(null); setPosLigacao(null); setOcupado(true);
    try {
      const recebida = chamadas.find((c) => c.id === id);
      nomeLigacaoRef.current = recebida?.contato?.nome ?? (recebida ? numeroLegivel(recebida.numeroOrigem) : null);
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
    // Resumo pos-ligacao so quando houve audio: falha antes de conectar nao e "ligacao encerrada".
    if (inicioAudioRef.current !== null) {
      setPosLigacao({
        nome: nomeLigacaoRef.current ?? 'Ligação',
        segundos: Math.round((Date.now() - inicioAudioRef.current) / 1000),
        gravacao: gravadorRef.current ? 'enviando' : 'sem',
        transcricao: null,
      });
    }
    inicioAudioRef.current = null;
    setInicioAudio(null);
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
  const visiveis = chamadas.filter((c) => passaNoFiltro(c, filtro));

  const taxa = indicadores?.taxaAtendimento ?? null;
  const estadoTaxa: { tom: Tom; texto: string } | null =
    taxa === null ? null
      : taxa < TAXA_ATENDIMENTO_CRITICA ? { tom: 'grave', texto: 'Crítico' }
        : taxa < TAXA_ATENDIMENTO_ALVO ? { tom: 'atencao', texto: 'Abaixo do alvo' }
          : { tom: 'bom', texto: 'No alvo' };

  const kpis: Array<{ rotulo: string; valor: string; detalhe: string; selo?: { tom: Tom; texto: string } | null; destaque?: string }> = [
    {
      rotulo: 'Chamadas',
      valor: String(indicadores?.total ?? '—'),
      detalhe: `${indicadores?.entrantes ?? 0} recebidas · ${indicadores?.saintes ?? 0} feitas`,
    },
    {
      rotulo: 'Atendidas',
      valor: taxa === null ? String(indicadores?.atendidas ?? '—') : `${taxa}%`,
      detalhe: `${indicadores?.atendidas ?? 0} de ${indicadores?.entrantes ?? 0} recebidas · alvo ${TAXA_ATENDIMENTO_ALVO}%`,
      selo: estadoTaxa,
    },
    {
      rotulo: 'Perdidas',
      valor: String(indicadores?.naoAtendidas ?? '—'),
      detalhe: 'não atendidas ou ocupadas',
      destaque: indicadores && indicadores.naoAtendidas > 0 ? 'text-red-700' : undefined,
    },
    { rotulo: 'Tempo médio', valor: relogio(indicadores?.tma ?? null), detalhe: 'por ligação atendida' },
    {
      rotulo: 'Custo',
      valor: indicadores?.custoTotal == null ? '—' : moeda(indicadores.custoTotal),
      detalhe: indicadores?.chamadasComCusto
        ? `média ${custoCurto(indicadores.custoMedio)} · ${indicadores.chamadasComCusto} com custo`
        : 'O provedor não informou custo',
    },
  ];

  return (
    <div className="mx-auto flex max-w-[1360px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-slate-900">Ligações</h1>
          <p className="mt-1.5 text-[13px] text-slate-600">
            Chamadas de WhatsApp atendidas e feitas no navegador, com gravação no histórico do contato.
          </p>
        </div>
        <span
          className={`inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold ${
            linhaCloudAtiva ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${linhaCloudAtiva ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          {linhaCloudAtiva ? 'WhatsApp Calling ativo na sua linha' : 'Conecte e habilite sua linha WhatsApp Cloud'}
        </span>
      </div>

      {erro && <Alerta>{erro}</Alerta>}
      {aviso && <Alerta tipo="sucesso">{aviso}</Alerta>}

      <section aria-label="Indicadores das últimas 24 horas" className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.rotulo} className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white px-[18px] py-4">
            <div className="flex min-h-[22px] items-center justify-between gap-1.5">
              <span className="text-[13px] font-semibold text-slate-700">{k.rotulo}</span>
              {k.selo && <Selo tom={k.selo.tom}>{k.selo.texto}</Selo>}
            </div>
            <span className={`text-[28px] font-bold leading-tight tracking-[-0.02em] ${k.destaque ?? 'text-slate-900'}`}>{k.valor}</span>
            <span className="text-[12.5px] text-slate-500">{k.detalhe}</span>
          </div>
        ))}
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_344px]">
        <section aria-labelledby="titulo-historico" className="order-2 min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white xl:order-1">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 pb-3.5 pt-[18px]">
            <div>
              <h2 id="titulo-historico" className="text-base font-semibold text-slate-900">Histórico de chamadas</h2>
              <p className="mt-0.5 text-[12.5px] text-slate-500">Cada ligação também aparece na linha do tempo do contato no CRM.</p>
            </div>
            <div role="group" aria-label="Filtrar chamadas" className="flex flex-wrap gap-1.5">
              {FILTROS.map((f) => {
                const ativo = filtro === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => setFiltro(f.id)}
                    className={`inline-flex h-[30px] items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition ${
                      ativo ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {f.rotulo}
                    {/* Com mais paginas por carregar, a contagem seria so da parte ja carregada. */}
                    {!cursor && <span className="tabular-nums opacity-75">{chamadas.filter((c) => passaNoFiltro(c, f.id)).length}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {visiveis.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">
              {chamadas.length === 0 ? 'Nenhuma chamada registrada.' : 'Nenhuma chamada neste filtro.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-[13px]">
                <thead>
                  <tr className="border-b border-slate-200 text-[11.5px] font-semibold text-slate-500">
                    <th scope="col" className="px-5 py-2.5 font-semibold">Contato</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Horário</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Resultado</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold">Duração</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Gravação</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold">Custo</th>
                    <th scope="col" className="py-2.5 pl-3 pr-5 font-semibold">Análise</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((c) => {
                    const recebida = c.direcao === 'ENTRANTE';
                    const numero = recebida ? c.numeroOrigem : c.numeroDestino;
                    const perdidaRecebida = recebida && STATUS_PERDIDA.has(c.status);
                    const analisada = Boolean(c.analisadoEm || c.resumo || c.sentimento || c.transcricao);
                    const aberta = assistente === c.id;
                    const gravacaoLocal = c.gravacaoUrl?.startsWith('/api/arquivos/');
                    return (
                      <Fragment key={c.id}>
                        <tr className={`border-b border-slate-100 transition ${aberta ? 'bg-slate-50' : 'hover:bg-slate-50'}`}>
                          <td className="py-3 pl-5 pr-3">
                            <span className="flex items-center gap-3">
                              <span
                                role="img"
                                aria-label={recebida ? 'Recebida' : 'Feita'}
                                className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full ${
                                  perdidaRecebida ? 'bg-red-50 text-red-700' : recebida ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {recebida ? <IconeRecebida tamanho={16} /> : <IconeFeita tamanho={16} />}
                              </span>
                              <span className="min-w-0 max-w-[220px]">
                                <span className="block truncate font-semibold text-slate-900">
                                  {c.contato?.nome ?? numeroLegivel(numero)}
                                </span>
                                <span className="mt-0.5 block truncate text-xs tabular-nums text-slate-500">
                                  {recebida ? 'Recebida' : 'Feita'} · {numeroLegivel(numero)}
                                  {c.linha ? ` · linha ${c.linha.nome ?? c.linha.donoNome ?? 'WhatsApp'}` : ''}
                                </span>
                              </span>
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-700">{dataHora(c.iniciadoEm)}</td>
                          <td className="px-3 py-3">
                            <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${CLASSE_STATUS[c.status]}`}>
                              {LABEL_CHAMADA_STATUS[c.status]}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-700">{relogio(c.duracao)}</td>
                          <td className="px-3 py-3">
                            {gravacaoLocal ? (
                              ouvindo === c.id ? (
                                <audio controls autoPlay src={c.gravacaoUrl!} className="h-8 w-48" aria-label={`Gravação da ligação com ${c.contato?.nome ?? numero}`} />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setOuvindo(c.id)}
                                  aria-label={`Ouvir gravação da ligação com ${c.contato?.nome ?? numeroLegivel(numero)}`}
                                  className="inline-flex h-[30px] items-center gap-1.5 rounded-full border border-slate-200 bg-white pl-1.5 pr-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                                >
                                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--brand-primary)] texto-sobre-cor-fixa">
                                    <IconePlay />
                                  </span>
                                  Ouvir
                                </button>
                              )
                            ) : (
                              <span className="whitespace-nowrap text-slate-500">{c.gravacaoUrl ? 'No provedor' : '—'}</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-700">{custoCurto(c.custo)}</td>
                          <td className="py-3 pl-3 pr-4">
                            {analisada ? (
                              <button
                                type="button"
                                onClick={() => setAssistente((a) => (a === c.id ? null : c.id))}
                                aria-expanded={aberta}
                                className={`inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-[12.5px] font-semibold transition ${
                                  aberta ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                {c.sentimento && (
                                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COR_SENTIMENTO[c.sentimento] }} aria-hidden="true" />
                                )}
                                {c.sentimento ? LABEL_SENTIMENTO[c.sentimento] : 'Ver análise'}
                                <IconeChevron tamanho={14} className={`transition ${aberta ? 'rotate-180' : ''}`} />
                              </button>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                        </tr>
                        {aberta && (
                          <tr className="border-b border-slate-200 bg-slate-50">
                            <td colSpan={7} className="px-5 pb-5 pt-4 md:pl-[66px]">
                              <AssistenteDaLigacao chamadaId={c.id} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <span className="text-xs text-slate-500">Duração e gravação chegam ao histórico quando o provedor envia esses dados.</span>
            {cursor && (
              <Button variante="neutro" tamanho="sm" onClick={() => void carregarMais()}>
                Carregar chamadas anteriores
              </Button>
            )}
          </div>
        </section>

        <div className="order-1 xl:sticky xl:top-0 xl:order-2">
          <PainelLigacoes
            linhaCloudAtiva={linhaCloudAtiva}
            transcricaoAtiva={transcricaoAtiva}
            aba={abaPainel}
            aoTrocarAba={setAbaPainel}
            destino={destino}
            aoMudarDestino={setDestino}
            aoLigar={(e) => void ligar(e)}
            ocupado={ocupado}
            recebida={chamadaAtivaId ? undefined : recebidaTocando}
            aoAtender={(id) => void atender(id)}
            aoRecusar={(id) => void recusar(id)}
            emLigacao={
              chamadaAtivaId
                ? {
                    nome: emCurso?.contato?.nome ?? nomeLigacaoRef.current ?? destinoPendenteRef.current ?? 'Ligação',
                    conectado: audioConectado,
                    segundos: inicioAudio === null ? null : Math.max(0, Math.floor((agora - inicioAudio) / 1000)),
                    mudo: microfoneMudo,
                    gravando: audioConectado,
                  }
                : null
            }
            aoAlternarMudo={alternarMicrofone}
            aoDesligar={() => void desligar()}
            autorizacaoPendente={autorizacaoPendente}
            aoLigarDeNovo={() => void ligar()}
            aoFecharAutorizacao={() => setAutorizacaoPendente(null)}
            posLigacao={posLigacao}
            aoNovaChamada={() => { setPosLigacao(null); setAbaPainel('fazer'); }}
          />
        </div>
      </div>
      <audio ref={audioRef} autoPlay className="hidden" />
    </div>
  );
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
