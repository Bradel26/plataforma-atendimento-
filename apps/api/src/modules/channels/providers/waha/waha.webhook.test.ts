import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { webhookWahaAutentico } from './waha.webhook';

const SEGREDO = 'segredo-do-webhook-bem-longo';
const CORPO = Buffer.from('{"event":"message","session":"s"}');

function req(opts: { headers?: Record<string, string>; secret?: string } = {}) {
  return {
    corpoBruto: CORPO,
    header: (nome: string) => opts.headers?.[nome.toLowerCase()],
    query: opts.secret === undefined ? {} : { secret: opts.secret },
  };
}

const hmac = (segredo: string) => createHmac('sha512', segredo).update(CORPO).digest('hex');

describe('webhookWahaAutentico', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  it('aceita o segredo certo na URL (WAHA Core, que nao assina)', () => {
    expect(webhookWahaAutentico(req({ secret: SEGREDO }), SEGREDO)).toBe(true);
  });

  it('recusa segredo errado ou ausente', () => {
    expect(webhookWahaAutentico(req({ secret: 'outro' }), SEGREDO)).toBe(false);
    expect(webhookWahaAutentico(req(), SEGREDO)).toBe(false);
  });

  it('aceita assinatura HMAC-SHA512 valida', () => {
    expect(webhookWahaAutentico(req({ headers: { 'x-webhook-hmac': hmac(SEGREDO) } }), SEGREDO)).toBe(true);
  });

  it('assinatura presente e errada e recusada mesmo com o segredo certo na URL', () => {
    const r = req({ headers: { 'x-webhook-hmac': hmac('segredo-de-outra-pessoa') }, secret: SEGREDO });
    expect(webhookWahaAutentico(r, SEGREDO)).toBe(false);
  });

  it('sem segredo configurado, nada passa (fail-closed)', () => {
    expect(webhookWahaAutentico(req({ secret: '' }), null)).toBe(false);
    expect(webhookWahaAutentico(req({ secret: 'qualquer' }), null)).toBe(false);
  });
});
