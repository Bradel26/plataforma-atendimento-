import { describe, expect, it } from 'vitest';
import { webhookGowaAutentico } from './gowa.webhook';

function req(query: Record<string, unknown> = {}): Parameters<typeof webhookGowaAutentico>[0] {
  return { corpoBruto: Buffer.from('{}'), header: () => undefined, query };
}

describe('webhookGowaAutentico', () => {
  it('sem segredo configurado, nada passa (fail-closed)', () => {
    expect(webhookGowaAutentico(req({ secret: 'qualquer' }), null)).toBe(false);
  });

  it('secret da URL igual ao configurado: autentica', () => {
    expect(webhookGowaAutentico(req({ secret: 's3gr3d0' }), 's3gr3d0')).toBe(true);
  });

  it('secret da URL diferente: recusa', () => {
    expect(webhookGowaAutentico(req({ secret: 'errado' }), 's3gr3d0')).toBe(false);
  });

  it('sem secret na URL: recusa', () => {
    expect(webhookGowaAutentico(req({}), 's3gr3d0')).toBe(false);
  });

  it('secret nao-string na query: recusa', () => {
    expect(webhookGowaAutentico(req({ secret: ['s3gr3d0'] }), 's3gr3d0')).toBe(false);
  });
});
