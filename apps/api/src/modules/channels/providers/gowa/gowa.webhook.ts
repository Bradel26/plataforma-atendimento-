import { timingSafeEqual } from 'node:crypto';
import type { RequisicaoDeWebhook } from '../channel-provider';

/**
 * Autenticacao do webhook do GOWA — fail-closed, so por `?secret=` na URL.
 *
 * Ao contrario do WAHA, o GOWA de referencia (go-whatsapp-web-multidevice)
 * nao assina eventos (sem HMAC) — mesma situacao do WPPConnect. O segredo na
 * URL e a UNICA prova; sem segredo configurado, nada passa.
 */
export function webhookGowaAutentico(req: RequisicaoDeWebhook, segredo: string | null): boolean {
  if (!segredo) return false;
  const recebido = typeof req.query.secret === 'string' ? req.query.secret : null;
  return recebido !== null && iguais(recebido, segredo);
}

/** Comparacao em tempo constante; tamanhos diferentes ja sao diferentes. */
function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}
