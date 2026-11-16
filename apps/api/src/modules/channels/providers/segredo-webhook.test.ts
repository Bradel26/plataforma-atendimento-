import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { redigirTexto } from '../../../lib/redacao';
import type { RequisicaoDeWebhook } from './channel-provider';
import { webhookGowaAutentico } from './gowa/gowa.webhook';
import { segredoRecebido, segredosIguais } from './segredo-webhook';
import { webhookWahaAutentico } from './waha/waha.webhook';

const SEGREDO = 'segredo-de-teste-0123456789';
const corpo = Buffer.from('{"event":"message"}');

function req(opcoes: { query?: Record<string, unknown>; headers?: Record<string, string> } = {}): RequisicaoDeWebhook {
  const h = Object.fromEntries(Object.entries(opcoes.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  return { corpoBruto: corpo, query: opcoes.query ?? {}, header: (nome) => h[nome.toLowerCase()] };
}
const hmac512 = (b: Buffer, s = SEGREDO) => createHmac('sha512', s).update(b).digest('hex');

describe('segredoRecebido / segredosIguais', () => {
  it('prefere o cabecalho e ignora a URL quando o cabecalho existe', () => {
    expect(segredoRecebido(req({ headers: { 'X-Webhook-Secret': 'a' }, query: { secret: 'b' } }))).toBe('a');
  });
  it('sem cabecalho, usa a query', () => {
    expect(segredoRecebido(req({ query: { secret: 'b' } }))).toBe('b');
  });
  it('query repetida (array) e ignorada, nao aceita parcialmente', () => {
    expect(segredoRecebido(req({ query: { secret: ['a', 'b'] } }))).toBeNull();
  });
  it('vazio, ausente ou configuracao vazia nunca conferem', () => {
    expect(segredosIguais(null, SEGREDO)).toBe(false);
    expect(segredosIguais('', SEGREDO)).toBe(false);
    expect(segredosIguais(SEGREDO, null)).toBe(false);
    expect(segredosIguais(SEGREDO, '')).toBe(false);
  });
  it('tamanhos diferentes nao lancam (timingSafeEqual exigiria o mesmo tamanho)', () => {
    expect(() => segredosIguais('curto', SEGREDO)).not.toThrow();
    expect(segredosIguais('curto', SEGREDO)).toBe(false);
  });
});

describe('GOWA — fail-closed', () => {
  it('aceita pela URL (compatibilidade) e pelo cabecalho', () => {
    expect(webhookGowaAutentico(req({ query: { secret: SEGREDO } }), SEGREDO)).toBe(true);
    expect(webhookGowaAutentico(req({ headers: { 'x-webhook-secret': SEGREDO } }), SEGREDO)).toBe(true);
  });
  it('recusa ausente, errado e vazio', () => {
    expect(webhookGowaAutentico(req(), SEGREDO)).toBe(false);
    expect(webhookGowaAutentico(req({ query: { secret: 'errado' } }), SEGREDO)).toBe(false);
    expect(webhookGowaAutentico(req({ query: { secret: '' } }), SEGREDO)).toBe(false);
  });
  it('sem segredo configurado nada passa, nem "vazio igual a vazio"', () => {
    expect(webhookGowaAutentico(req({ query: { secret: '' } }), null)).toBe(false);
    expect(webhookGowaAutentico(req({ query: { secret: SEGREDO } }), null)).toBe(false);
    expect(webhookGowaAutentico(req(), '')).toBe(false);
  });
  it('segredo errado no cabecalho nao e salvo por um certo na URL', () => {
    expect(webhookGowaAutentico(req({ headers: { 'x-webhook-secret': 'errado' }, query: { secret: SEGREDO } }), SEGREDO)).toBe(false);
  });
});

describe('WAHA — HMAC tem prioridade e nunca e contornado', () => {
  it('HMAC valido passa', () => {
    expect(webhookWahaAutentico(req({ headers: { 'X-Webhook-Hmac': hmac512(corpo) } }), SEGREDO)).toBe(true);
    expect(webhookWahaAutentico(req({ headers: { 'X-Webhook-Hmac': `sha512=${hmac512(corpo)}` } }), SEGREDO)).toBe(true);
  });
  it('HMAC invalido e recusado MESMO com o segredo certo na URL (ninguem assina errado por engano)', () => {
    expect(webhookWahaAutentico(req({ headers: { 'X-Webhook-Hmac': 'deadbeef' }, query: { secret: SEGREDO } }), SEGREDO)).toBe(false);
  });
  it('HMAC de outro corpo (replay com corpo adulterado) e recusado', () => {
    const outro = hmac512(Buffer.from('{"event":"outra"}'));
    expect(webhookWahaAutentico(req({ headers: { 'X-Webhook-Hmac': outro } }), SEGREDO)).toBe(false);
  });
  it('HMAC calculado com outro segredo e recusado', () => {
    expect(webhookWahaAutentico(req({ headers: { 'X-Webhook-Hmac': hmac512(corpo, 'outro') } }), SEGREDO)).toBe(false);
  });
  it('sem assinatura, vale a URL ou o cabecalho de segredo; errado ou ausente nao', () => {
    expect(webhookWahaAutentico(req({ query: { secret: SEGREDO } }), SEGREDO)).toBe(true);
    expect(webhookWahaAutentico(req({ headers: { 'x-webhook-secret': SEGREDO } }), SEGREDO)).toBe(true);
    expect(webhookWahaAutentico(req({ query: { secret: 'errado' } }), SEGREDO)).toBe(false);
    expect(webhookWahaAutentico(req(), SEGREDO)).toBe(false);
  });
  it('sem segredo configurado nada passa', () => {
    expect(webhookWahaAutentico(req({ query: { secret: '' } }), null)).toBe(false);
    expect(webhookWahaAutentico(req({ headers: { 'X-Webhook-Hmac': hmac512(corpo, '') } }), null)).toBe(false);
  });
});

describe('segredos nao vazam em texto de log', () => {
  it('mascara credencial em query string independentemente do formato do valor', () => {
    const texto = 'POST /api/webhooks/wppconnect?secret=abc123&x=1 falhou; GET /api/arquivos/a/b.png?t=1700000000000.abcd';
    const saida = redigirTexto(texto);
    expect(saida).not.toContain('abc123');
    expect(saida).not.toContain('1700000000000.abcd');
    expect(saida).toContain('secret=[omitido]');
    expect(saida).toContain('x=1');
  });
  it('nao mexe em parametros comuns', () => {
    expect(redigirTexto('/api/conversas?limite=20&status=EM_ESPERA')).toBe('/api/conversas?limite=20&status=EM_ESPERA');
  });
});
