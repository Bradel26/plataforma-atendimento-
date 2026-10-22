import { useCallback, useEffect, useRef, useState } from 'react';
import { Alerta } from '../components/ui';
import { HistoricoDeChamadas } from './telefonia/HistoricoDeChamadas';
import { PainelLigacoes, relogio, type PosLigacao } from './telefonia/PainelLigacoes';
import { WhatsAppWebCallPanel } from './telefonia/WhatsAppWebCallPanel';
import { Selo, type Tom } from './dashboard/blocos';
import { ApiError, api, getAccessToken } from '../lib/api';
import { conectar, EVENTOS } from '../lib/realtime';
import { telefoneLegivel } from '../lib/telefone';
import {
  moeda,
  type Chamada,
  type IndicadoresVoz,
} from '../lib/types';

const custoCurto = (v: number | null | undefined) => v == null ? '—' : `R$ ${v.toFixed(4).replace('.', ',')}`;
const STATUS_EM_CURSO = new Set(['CHAMANDO', 'EM_ANDAMENTO']);

/** Mesmo alvo do Dashboards: abaixo disto a operacao esta perdendo ligacao. */
const TAXA_ATENDIMENTO_ALVO = 90;
const TAXA_ATENDIMENTO_CRITICA = 80;

const numeroLegivel = (numero: string) => (/^\d+$/.test(numero) ? telefoneLegivel(numero) : numero);

export function TelefoniaPage() {
  const [chamadas, setChamadas] = useState<Chamada[]>([]);
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
  const [sessaoChamadasWeb, setSessaoChamadasWeb] = useState('teste-local');
  const [linhaWebId, setLinhaWebId] = useState<string | null>(null);
  const [linhaWebAtiva, setLinhaWebAtiva] = useState(false);
  const [transcricaoAtiva, setTranscricaoAtiva] = useState(false);
  const [abaPainel, setAbaPainel] = useState<'receber' | 'fazer'>('fazer');
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
    void api.get<{ numero: { id?: string; modo?: string | null; ativo?: boolean; ponteSessao?: string | null; phoneNumberId?: string | null; whatsappCallingHabilitado?: boolean; transcricaoAutomaticaAtiva?: boolean } | null }>('/canais/numeros/meu')
      .then(({ numero }) => {
        setLinhaCloudAtiva(Boolean(numero?.ativo && numero.modo === 'OFICIAL' && numero.phoneNumberId && numero.whatsappCallingHabilitado));
        const usaWeb = Boolean(numero?.modo === 'NAO_OFICIAL' && numero.ativo && numero.id && numero.ponteSessao);
        setLinhaWebAtiva(usaWeb);
        setLinhaWebId(usaWeb ? numero!.id! : null);
        if (usaWeb && numero?.ponteSessao) setSessaoChamadasWeb(numero.ponteSessao);
        setTranscricaoAtiva(Boolean(numero?.transcricaoAutomaticaAtiva));
      })
      .catch(() => { setLinhaCloudAtiva(false); setLinhaWebAtiva(false); setLinhaWebId(null); });
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
          {linhaCloudAtiva
            ? 'WhatsApp Calling ativo na sua linha'
            : import.meta.env.DEV
              ? 'Chamadas pelo conector WhatsApp Web local'
              : 'Chamadas WhatsApp aguardando ativação da Meta'}
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

      <div className="flex flex-col gap-5">
        <div className="w-full">
          {linhaWebAtiva && linhaWebId ? <WhatsAppWebCallPanel sessao={sessaoChamadasWeb} numeroId={linhaWebId} /> : linhaCloudAtiva || !import.meta.env.DEV ? <PainelLigacoes
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
          /> : <WhatsAppWebCallPanel sessao={sessaoChamadasWeb} />}
        </div>
        <HistoricoDeChamadas chamadas={chamadas} cursor={cursor} onCarregarMais={() => void carregarMais()} />
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
