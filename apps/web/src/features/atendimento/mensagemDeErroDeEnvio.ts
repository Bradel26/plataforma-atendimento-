import { ApiError } from '../../lib/api';

/**
 * Texto de erro de envio para o atendente.
 *
 * Quando o conector do WhatsApp recusa o envio, o texto que ele devolve vem do
 * proprio WhatsApp Web e pode ser um fragmento sem sentido (ja apareceu "t" na
 * tela). Mensagem sem palavra ou muito curta e trocada por uma explicacao; erro
 * claro do servidor (ex.: "Janela de 24 horas fechada") passa como veio.
 */
export const MSG_RECUSA_DO_WHATSAPP =
  'O WhatsApp não aceitou este envio. Se for um áudio ou vídeo, o formato pode não ser aceito: tente enviar como documento ou use outro arquivo.';

export function textoDoErroDeEnvio(err: unknown, padrao: string): string {
  if (!(err instanceof ApiError)) return padrao;
  const msg = (err.message ?? '').trim();
  const semSentido = msg.length < 12 || !/\s/.test(msg);
  if ((err.code === 'WEBJS_LOCAL_RECUSOU' || err.status === 502) && semSentido) return MSG_RECUSA_DO_WHATSAPP;
  return msg || padrao;
}
