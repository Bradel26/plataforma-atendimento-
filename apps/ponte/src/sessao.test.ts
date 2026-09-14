import { describe, expect, it } from 'vitest';
import { jid, lembrarJid, numeroDoJid } from './sessao.js';

/**
 * O WhatsApp passou a identificar alguns contatos por "LID" (endereco
 * @lid, opaco, por privacidade) em vez do numero de telefone (@s.whatsapp.net).
 * Responder um contato assim reconstruindo "<digitos>@s.whatsapp.net" manda a
 * mensagem para um endereco que nao existe: o envio nao da erro nenhum, e a
 * mensagem nunca chega. `lembrarJid` guarda o endereco de onde uma mensagem
 * realmente chegou, para a resposta usar o MESMO endereco.
 */
describe('jid de resposta', () => {
  it('sem nada lembrado, usa o formato padrao de numero de telefone', () => {
    expect(jid('5511999998888')).toBe('5511999998888@s.whatsapp.net');
  });

  it('depois de lembrado, responde pelo mesmo jid completo que chegou (ex.: @lid)', () => {
    lembrarJid('79233992933473', '79233992933473@lid');
    expect(jid('79233992933473')).toBe('79233992933473@lid');
  });

  it('numero nunca visto continua caindo no formato padrao', () => {
    expect(jid('5521988887777')).toBe('5521988887777@s.whatsapp.net');
  });
});

describe('numeroDoJid', () => {
  it('extrai so os digitos de um jid @s.whatsapp.net', () => {
    expect(numeroDoJid('5511999998888@s.whatsapp.net')).toBe('5511999998888');
  });

  it('extrai so os digitos de um jid @lid', () => {
    expect(numeroDoJid('79233992933473@lid')).toBe('79233992933473');
  });
});
