import { describe, expect, it } from 'vitest';
import { semWebchat } from './recursos';

describe('semWebchat', () => {
  it('tira o Webchat das opcoes quando ele esta desligado (padrao)', () => {
    expect(semWebchat(['WEBCHAT', 'WHATSAPP'], (c) => c)).toEqual(['WHATSAPP']);
    expect(semWebchat([{ valor: 'WEBCHAT' }, { valor: 'VOZ' }], (c) => c.valor)).toEqual([{ valor: 'VOZ' }]);
  });
});
