import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Button } from '../../components/ui';
import { Modal } from '../../components/ui/Modal';
import { BOTAO_ICONE, usePopover } from './FerramentasResposta';
import {
  IconeCadeado,
  IconeCamera,
  IconeClipe,
  IconeDocumento,
  IconeFones,
  IconeImagem,
  IconeLixeira,
  IconeRaio,
} from './icones';
import { LIMITE_GRAVACAO_SEGUNDOS, escolherMimeDeAudio, formatarTempo, nomeDeArquivoCapturado } from './gravacao';

/** Cores dos icones do menu, no espirito do menu de anexos do WhatsApp. */
const COR = {
  documento: 'text-violet-500',
  midia: 'text-blue-500',
  camera: 'text-pink-500',
  audio: 'text-orange-500',
  rapida: 'text-amber-500',
  nota: 'text-amber-600',
} as const;

type ItemDoMenu = { chave: string; rotulo: string; icone: ReactNode; cor: string; desabilitado?: boolean; aoSelecionar: () => void };

/**
 * Clipe do campo de resposta: abre o menu de anexos (Documento, Fotos e videos,
 * Camera, Audio) e os atalhos "Mensagem rapida" e "Nota interna".
 *
 * Todos os arquivos saem pelo mesmo caminho de sempre (`aoArquivo` -> anexar).
 * Contato, Enquete, Pix, Evento e Figurinha do WhatsApp ficam de fora: o envio
 * deles nao existe no servidor.
 */
export function MenuAnexos({
  desabilitado,
  aoArquivo,
  aoAbrirCamera,
  rapidasDisponiveis,
  aoRapidas,
  aoNotaInterna,
  semRapidas,
}: {
  desabilitado?: boolean;
  aoArquivo: (arquivo: File) => void;
  aoAbrirCamera: () => void;
  rapidasDisponiveis: boolean;
  aoRapidas: () => void;
  aoNotaInterna?: () => void;
  /** Na nota interna nao ha mensagem rapida: esconde o item. */
  semRapidas?: boolean;
}) {
  const { aberto, setAberto, ref } = usePopover();
  const inputDocumento = useRef<HTMLInputElement>(null);
  const inputMidia = useRef<HTMLInputElement>(null);
  const inputAudio = useRef<HTMLInputElement>(null);

  const itens: ItemDoMenu[] = [
    { chave: 'documento', rotulo: 'Documento', icone: <IconeDocumento tamanho={18} />, cor: COR.documento, aoSelecionar: () => inputDocumento.current?.click() },
    { chave: 'midia', rotulo: 'Fotos e vídeos', icone: <IconeImagem tamanho={18} />, cor: COR.midia, aoSelecionar: () => inputMidia.current?.click() },
    { chave: 'camera', rotulo: 'Câmera', icone: <IconeCamera tamanho={18} />, cor: COR.camera, aoSelecionar: aoAbrirCamera },
    { chave: 'audio', rotulo: 'Áudio', icone: <IconeFones tamanho={18} />, cor: COR.audio, aoSelecionar: () => inputAudio.current?.click() },
    ...(semRapidas ? [] : [{ chave: 'rapida', rotulo: 'Mensagem rápida', icone: <IconeRaio tamanho={18} />, cor: COR.rapida, desabilitado: !rapidasDisponiveis, aoSelecionar: aoRapidas }]),
    ...(aoNotaInterna
      ? [{ chave: 'nota', rotulo: 'Nota interna', icone: <IconeCadeado tamanho={18} />, cor: COR.nota, aoSelecionar: aoNotaInterna }]
      : []),
  ];

  const aoEscolher = (e: ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (arquivo) aoArquivo(arquivo);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={desabilitado}
        onClick={() => setAberto((v) => !v)}
        aria-label="Anexar"
        aria-haspopup="menu"
        aria-expanded={aberto}
        title="Anexar"
        className={`${BOTAO_ICONE} ${aberto ? 'bg-slate-100' : ''}`}
      >
        <IconeClipe tamanho={20} />
      </button>
      <input ref={inputDocumento} type="file" className="hidden" onChange={aoEscolher} />
      <input ref={inputMidia} type="file" accept="image/*,video/*" className="hidden" onChange={aoEscolher} />
      <input ref={inputAudio} type="file" accept="audio/*" className="hidden" onChange={aoEscolher} />
      {aberto && (
        <div
          role="menu"
          aria-label="Anexar"
          className="absolute bottom-full left-0 z-30 mb-2 w-52 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl"
        >
          {itens.map((item) => (
            <button
              key={item.chave}
              type="button"
              role="menuitem"
              disabled={item.desabilitado}
              onClick={() => {
                setAberto(false);
                item.aoSelecionar();
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className={item.cor}>{item.icone}</span>
              {item.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Foto pela camera do computador: mostra a previa, captura e devolve um JPEG. */
export function ModalCamera({ aberto, aoFechar, aoCapturar }: { aberto: boolean; aoFechar: () => void; aoCapturar: (arquivo: File) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pronta, setPronta] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    let stream: MediaStream | null = null;
    let cancelado = false;
    setErro(null);
    setPronta(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setErro('Este navegador não permite usar a câmera aqui.');
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((s) => {
        if (cancelado) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play().then(() => setPronta(true)).catch(() => setPronta(true));
        }
      })
      .catch(() => setErro('Não foi possível acessar a câmera. Permita o acesso no navegador e tente de novo.'));
    return () => {
      cancelado = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [aberto]);

  const capturar = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')?.drawImage(v, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        aoCapturar(new File([blob], nomeDeArquivoCapturado('foto', 'image/jpeg'), { type: 'image/jpeg' }));
        aoFechar();
      },
      'image/jpeg',
      0.9,
    );
  };

  return (
    <Modal
      aberto={aberto}
      titulo="Tirar foto"
      aoFechar={aoFechar}
      largura="max-w-lg"
      rodape={
        <div className="flex justify-end gap-2">
          <Button variante="neutro" onClick={aoFechar}>Cancelar</Button>
          <Button onClick={capturar} disabled={!pronta || Boolean(erro)}>Capturar</Button>
        </div>
      }
    >
      {erro ? (
        <p role="alert" className="text-sm text-red-700">{erro}</p>
      ) : (
        <video ref={video} muted playsInline className="w-full rounded-lg bg-black" aria-label="Previa da câmera" />
      )}
    </Modal>
  );
}

/**
 * Gravador de mensagem de voz (microfone do campo de resposta). Grava no
 * navegador e entrega um arquivo pronto para o mesmo caminho dos anexos.
 * `suportado` e falso sem MediaRecorder/microfone: a tela esconde o botao.
 */
export function useGravadorDeVoz(aoFinalizar: (arquivo: File) => void) {
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const pedacos = useRef<Blob[]>([]);
  const descartar = useRef(false);
  const relogio = useRef<ReturnType<typeof setInterval> | null>(null);
  const aoFinalizarRef = useRef(aoFinalizar);
  aoFinalizarRef.current = aoFinalizar;

  const suportado =
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    escolherMimeDeAudio((m) => MediaRecorder.isTypeSupported(m)) !== null;

  const limpar = useCallback(() => {
    if (relogio.current) clearInterval(relogio.current);
    relogio.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    recorder.current = null;
    setGravando(false);
    setSegundos(0);
  }, []);

  const parar = useCallback((enviar: boolean) => {
    descartar.current = !enviar;
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
    else limpar();
  }, [limpar]);

  const iniciar = useCallback(async () => {
    setErro(null);
    const mime = escolherMimeDeAudio((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) return;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = s;
      const rec = new MediaRecorder(s, { mimeType: mime });
      pedacos.current = [];
      descartar.current = false;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) pedacos.current.push(e.data);
      };
      rec.onstop = () => {
        const tipo = mime.split(';')[0]!;
        const gravado = pedacos.current;
        const foiDescartada = descartar.current;
        limpar();
        if (!foiDescartada && gravado.length > 0) {
          aoFinalizarRef.current(new File(gravado, nomeDeArquivoCapturado('audio', mime), { type: tipo }));
        }
      };
      recorder.current = rec;
      rec.start();
      setGravando(true);
      setSegundos(0);
      relogio.current = setInterval(() => {
        setSegundos((atual) => {
          if (atual + 1 >= LIMITE_GRAVACAO_SEGUNDOS) parar(true);
          return atual + 1;
        });
      }, 1000);
    } catch {
      limpar();
      setErro('Não foi possível usar o microfone. Permita o acesso no navegador e tente de novo.');
    }
  }, [limpar, parar]);

  // Sair da conversa com a gravacao aberta descarta o audio e solta o microfone.
  useEffect(() => () => parar(false), [parar]);

  return { suportado, gravando, segundos, erro, iniciar, enviar: () => parar(true), cancelar: () => parar(false) };
}

/** Barra que substitui o campo de texto enquanto grava: cancelar, tempo e enviar. */
export function BarraDeGravacao({ segundos, aoCancelar }: { segundos: number; aoCancelar: () => void }) {
  return (
    <div className="flex min-h-[40px] min-w-0 flex-1 items-center gap-3 px-1" role="status" aria-live="polite">
      <button type="button" onClick={aoCancelar} aria-label="Cancelar gravação" title="Cancelar" className={`${BOTAO_ICONE} text-red-600`}>
        <IconeLixeira tamanho={19} />
      </button>
      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" aria-hidden="true" />
      <span className="text-sm tabular-nums text-slate-700">{formatarTempo(segundos)}</span>
      <span className="truncate text-xs text-slate-500">Gravando… clique em enviar para mandar</span>
    </div>
  );
}
