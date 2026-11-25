/**
 * Auxiliares puros da gravacao de voz e da camera do campo de resposta.
 * Sem DOM, para serem testados sem navegador.
 */

/** Gravacao maxima de uma mensagem de voz (segundos). */
export const LIMITE_GRAVACAO_SEGUNDOS = 10 * 60;

/** "0:07", "12:34". */
export function formatarTempo(segundos: number): string {
  const total = Math.max(0, Math.floor(segundos));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Formato de audio da gravacao, na ordem de preferencia do WhatsApp: ogg/opus
 * (o das mensagens de voz), depois mp4/aac (m4a, que o WhatsApp aceita) e, por ultimo,
 * webm (o Chrome mais antigo; o WhatsApp Web recusou esse formato em 25/11/2026).
 * `suporta` e `MediaRecorder.isTypeSupported`, injetado para testar.
 */
export function escolherMimeDeAudio(suporta: (mime: string) => boolean): string | null {
  const preferidos = ['audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
  return preferidos.find((m) => suporta(m)) ?? null;
}

/** Extensao do arquivo gravado, pelo tipo (ignora o `;codecs=...`). */
export function extensaoDoMime(mime: string): string {
  const base = mime.split(';')[0]!.trim().toLowerCase();
  if (base === 'audio/ogg') return 'ogg';
  if (base === 'audio/mp4') return 'm4a';
  if (base === 'image/jpeg') return 'jpg';
  return 'webm';
}

/** Nome do arquivo gravado/capturado, ex.: `audio-20261125-143005.ogg`. */
export function nomeDeArquivoCapturado(prefixo: 'audio' | 'foto', mime: string, agora = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const data = `${agora.getFullYear()}${p(agora.getMonth() + 1)}${p(agora.getDate())}-${p(agora.getHours())}${p(agora.getMinutes())}${p(agora.getSeconds())}`;
  return `${prefixo}-${data}.${extensaoDoMime(mime)}`;
}

/**
 * O microfone fica escondido por padrao: o WhatsApp Web recusou o audio webm que o
 * Chrome grava (erro 502 do conector em 25/11/2026). Quem esta testando liga com
 * `?microfone=1` na URL (fica salvo no navegador) e desliga com `?microfone=0`.
 * `storage` e injetado para testar sem navegador.
 */
export const CHAVE_MICROFONE = 'plataforma:microfone';

export function microfoneLiberado(
  busca: string,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null,
): boolean {
  const pedido = new URLSearchParams(busca).get('microfone');
  try {
    if (pedido === '1') storage?.setItem(CHAVE_MICROFONE, '1');
    if (pedido === '0') storage?.removeItem(CHAVE_MICROFONE);
    if (pedido === '1') return true;
    if (pedido === '0') return false;
    return storage?.getItem(CHAVE_MICROFONE) === '1';
  } catch {
    return pedido === '1';
  }
}
