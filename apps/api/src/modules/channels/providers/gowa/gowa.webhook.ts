import type { RequisicaoDeWebhook } from '../channel-provider';
import { segredoRecebido, segredosIguais } from '../segredo-webhook';

/**
 * Autenticacao do webhook do GOWA — fail-closed.
 *
 * Ao contrario do WAHA, o GOWA de referencia (go-whatsapp-web-multidevice)
 * nao assina eventos (sem HMAC) — mesma situacao do WPPConnect. O segredo e a
 * UNICA prova; sem segredo configurado, nada passa. Vale o cabecalho
 * `X-Webhook-Secret` ou, para quem nao consegue enviar cabecalho, `?secret=`
 * (ver `segredoRecebido`).
 */
export function webhookGowaAutentico(req: RequisicaoDeWebhook, segredo: string | null): boolean {
  if (!segredo) return false;
  return segredosIguais(segredoRecebido(req), segredo);
}
