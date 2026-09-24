import { createHmac, timingSafeEqual } from 'node:crypto';
import { log } from '../../../../lib/log';
import type { RequisicaoDeWebhook } from '../channel-provider';

/**
 * Autenticacao do webhook do WAHA — fail-closed.
 *
 * Duas provas possiveis, e a regra de combinacao e a licao do Deskcomm (que
 * era fail-open e aceitou mensagem forjada com `curl` sem header nenhum):
 *
 *  1. `X-Webhook-Hmac` PRESENTE: tem de conferir (HMAC-SHA512 do corpo cru
 *     com o segredo). Assinatura errada e sempre rejeitada — ninguem assina
 *     errado por engano.
 *  2. Sem assinatura: vale o `?secret=` da URL, que o proprio CRM grava na
 *     sessao ao cria-la. E a prova que sempre existe, porque o WAHA Core nao
 *     assina (medido pelo Deskcomm na 2026.7.2).
 *
 * Sem segredo configurado, nada passa: um webhook aberto deixaria qualquer um
 * injetar mensagem no atendimento e escolher para quem o CRM responde.
 */
export function webhookWahaAutentico(req: RequisicaoDeWebhook, segredo: string | null): boolean {
  if (!segredo) return false;

  const assinatura = req.header('x-webhook-hmac');
  if (assinatura) {
    const esperado = createHmac('sha512', segredo).update(req.corpoBruto).digest('hex');
    const confere = iguais(assinatura.replace(/^sha512=/i, '').trim().toLowerCase(), esperado);
    // Log proprio: se uma versao do WAHA passar a assinar num formato diferente,
    // TODA mensagem seria recusada — e "autenticacao invalida" generico nao
    // apontaria para a assinatura. Nunca loga a assinatura nem o segredo.
    if (!confere) {
      log.warn('webhook', 'assinatura X-Webhook-Hmac do WAHA nao confere', {
        provider: 'waha',
        algoritmo: req.header('x-webhook-hmac-algorithm') ?? null,
        tamanhoDaAssinatura: assinatura.length,
      });
    }
    return confere;
  }

  const recebido = typeof req.query.secret === 'string' ? req.query.secret : null;
  return recebido !== null && iguais(recebido, segredo);
}

/** Comparacao em tempo constante; tamanhos diferentes ja sao diferentes. */
function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}
