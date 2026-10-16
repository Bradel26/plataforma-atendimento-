import { describe, expect, it } from 'vitest';
import { chatValido, contatoValido, jidLembrado, lembrarJid, numeroDoJid, statusDoAckBaileys } from './sessao.js';

/**
 * O WhatsApp passou a identificar alguns contatos por "LID" (endereco
 * @lid, opaco, por privacidade) em vez do numero de telefone (@s.whatsapp.net).
 * Responder um contato assim reconstruindo "<digitos>@s.whatsapp.net" manda a
 * mensagem para um endereco que nao existe: o envio nao da erro nenhum, e a
 * mensagem nunca chega. `lembrarJid` guarda o endereco de onde uma mensagem
 * realmente chegou, para a resposta usar o MESMO endereco.
 */
/**
 * De-para do ack numerico do Baileys (`proto.WebMessageInfo.Status`) para o
 * vocabulario do CRM. A numeracao do Baileys desloca tudo +1 em relacao ao
 * `ack` do wwebjs/WAHA porque inclui ERROR=0 — por isso tem mapper proprio,
 * em vez de reaproveitar `statusDoAck` do provider WAHA.
 */
describe('statusDoAckBaileys', () => {
  it('mapeia cada valor conhecido do enum do Baileys', () => {
    expect(statusDoAckBaileys(0)).toBe('FALHOU');
    expect(statusDoAckBaileys(1)).toBe('PENDENTE');
    expect(statusDoAckBaileys(2)).toBe('ENVIADA');
    expect(statusDoAckBaileys(3)).toBe('ENTREGUE');
    expect(statusDoAckBaileys(4)).toBe('LIDA');
    expect(statusDoAckBaileys(5)).toBe('LIDA'); // PLAYED (audio/video) conta como lida
  });

  it('valor desconhecido ou ausente: null, nunca lanca', () => {
    expect(statusDoAckBaileys(99)).toBeNull();
    expect(statusDoAckBaileys(null)).toBeNull();
    expect(statusDoAckBaileys(undefined)).toBeNull();
  });
});

describe('jid lembrado por sessao', () => {
  it('mantem o endereco LID recebido na sessao correspondente', () => {
    lembrarJid('linha-a', '79233992933473', '79233992933473@lid');
    expect(jidLembrado('linha-a', '79233992933473')).toBe('79233992933473@lid');
    expect(jidLembrado('linha-b', '79233992933473')).toBeNull();
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

/**
 * Importacao de contatos do celular (evento `contacts.upsert` do Baileys).
 * `contatoValido` decide, por contato bruto, se ele entra na importacao e com
 * qual nome — sem tocar em rede nem no socket, para dar para testar isolado.
 */
describe('contatoValido', () => {
  it('contato @s.whatsapp.net com nome salvo no celular usa esse nome', () => {
    expect(contatoValido({ id: '5511999998888@s.whatsapp.net', name: 'Fulano da Silva', notify: 'Fulano' })).toEqual({
      numero: '5511999998888',
      nome: 'Fulano da Silva',
    });
  });

  it('sem nome salvo no celular, usa o nome que a propria pessoa definiu no WhatsApp (notify)', () => {
    expect(contatoValido({ id: '5511999998888@s.whatsapp.net', notify: 'Fulano' })).toEqual({
      numero: '5511999998888',
      nome: 'Fulano',
    });
  });

  it('sem nome nem notify, usa o proprio numero como nome', () => {
    expect(contatoValido({ id: '5511999998888@s.whatsapp.net' })).toEqual({
      numero: '5511999998888',
      nome: '5511999998888',
    });
  });

  it('contato @lid (sem numero de telefone) fica de fora', () => {
    expect(contatoValido({ id: '79233992933473@lid', name: 'Fulano' })).toBeNull();
  });

  it('jid sem digitos suficientes (menos de 10) fica de fora', () => {
    expect(contatoValido({ id: '123@s.whatsapp.net', name: 'Fulano' })).toBeNull();
  });
});

describe('chatValido', () => {
  it('chat @s.whatsapp.net com nome e timestamp validos entra na sincronizacao', () => {
    expect(
      chatValido({ id: '5511999998888@s.whatsapp.net', name: 'Fulano', unreadCount: 2 }),
    ).toEqual({ numero: '5511999998888', nome: 'Fulano', naoLidas: 2 });
  });

  it('sem nome, usa o proprio numero', () => {
    expect(chatValido({ id: '5511999998888@s.whatsapp.net', unreadCount: 0 })).toEqual({
      numero: '5511999998888',
      nome: '5511999998888',
      naoLidas: 0,
    });
  });

  it('sem unreadCount, assume zero nao lidas', () => {
    expect(chatValido({ id: '5511999998888@s.whatsapp.net', name: 'Fulano' })).toEqual({
      numero: '5511999998888',
      nome: 'Fulano',
      naoLidas: 0,
    });
  });

  it('chat @lid fica de fora, mesma regra de contatoValido', () => {
    expect(chatValido({ id: '79233992933473@lid', name: 'Fulano' })).toBeNull();
  });

  it('chat de grupo (@g.us) fica de fora', () => {
    expect(chatValido({ id: '123456-78901234@g.us', name: 'Grupo da Firma' })).toBeNull();
  });
});
