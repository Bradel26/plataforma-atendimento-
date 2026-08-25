import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { assinaturaValida } from './channels.service';

const SEGREDO = 'segredo-do-app-meta';
const corpo = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account', entry: [] }));
const assinaturaDe = (dados: Buffer, segredo = SEGREDO) =>
  `sha256=${createHmac('sha256', segredo).update(dados).digest('hex')}`;

/**
 * A assinatura do webhook e a unica coisa que separa "mensagem da Meta" de
 * "qualquer um postando na rota publica". Estes casos existem para que nenhuma
 * refatoracao afrouxe a verificacao sem o teste reclamar.
 */
describe('assinatura do webhook', () => {
  it('aceita a assinatura correta sobre o corpo bruto', () => {
    expect(assinaturaValida(corpo, assinaturaDe(corpo), SEGREDO)).toBe(true);
  });

  it('recusa assinatura de outro segredo', () => {
    expect(assinaturaValida(corpo, assinaturaDe(corpo, 'segredo-errado'), SEGREDO)).toBe(false);
  });

  it('recusa quando o corpo mudou um unico byte', () => {
    const outro = Buffer.from(JSON.stringify({ object: 'instagram', entry: [] }));
    expect(assinaturaValida(outro, assinaturaDe(corpo), SEGREDO)).toBe(false);
  });

  it('recusa assinatura ausente, vazia ou sem o prefixo sha256', () => {
    expect(assinaturaValida(corpo, undefined, SEGREDO)).toBe(false);
    expect(assinaturaValida(corpo, '', SEGREDO)).toBe(false);
    const semPrefixo = assinaturaDe(corpo).replace('sha256=', '');
    expect(assinaturaValida(corpo, semPrefixo, SEGREDO)).toBe(false);
  });

  it('recusa assinatura de tamanho diferente sem estourar', () => {
    expect(assinaturaValida(corpo, 'sha256=abc', SEGREDO)).toBe(false);
  });
});
