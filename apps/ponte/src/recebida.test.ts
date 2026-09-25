import { describe, expect, it, vi } from 'vitest';
import type { WAMessage } from '@whiskeysockets/baileys';
import type { Sessao } from './sessao.js';
import type { MensagemRecebida } from './plataforma.js';

const entregarMock = vi.fn(async (_m: MensagemRecebida) => {});
vi.mock('./plataforma.js', () => ({ entregar: (m: MensagemRecebida) => entregarMock(m) }));

const { receber } = await import('./recebida.js');

function sessaoComSock(sock: Sessao['sock']): Sessao {
  return {
    nome: 'teste',
    sock,
    situacao: 'CONECTADO',
    detalhe: null,
    qr: null,
    numero: '5511999998888',
    iniciando: null,
    reconectando: null,
  };
}

function msgTexto(remoteJid: string, texto: string): WAMessage {
  return {
    key: { remoteJid, fromMe: false, id: 'MSGID1' },
    message: { conversation: texto },
  } as unknown as WAMessage;
}

describe('receber — contato enderecado por @lid', () => {
  it('resolve o numero real via lidMapping e entrega com o telefone, nao os digitos do lid', async () => {
    entregarMock.mockClear();
    const sock = {
      signalRepository: {
        lidMapping: {
          getPNForLID: vi.fn(async () => '5562996714844:0@s.whatsapp.net'),
        },
      },
    } as unknown as Sessao['sock'];

    await receber(sessaoComSock(sock), msgTexto('79233992933473@lid', 'oi'));

    expect(entregarMock).toHaveBeenCalledTimes(1);
    const chamada = entregarMock.mock.calls[0]![0];
    expect(chamada.numero).toBe('5562996714844');
  });

  it('sem mapeamento conhecido, descarta a mensagem em vez de inventar um numero a partir do lid', async () => {
    entregarMock.mockClear();
    const sock = {
      signalRepository: {
        lidMapping: {
          getPNForLID: vi.fn(async () => null),
        },
      },
    } as unknown as Sessao['sock'];

    await receber(sessaoComSock(sock), msgTexto('79233992933473@lid', 'oi'));

    expect(entregarMock).not.toHaveBeenCalled();
  });

  it('mensagem de numero normal (@s.whatsapp.net) continua entregando sem chamar lidMapping', async () => {
    entregarMock.mockClear();
    const getPNForLID = vi.fn(async () => null);
    const sock = { signalRepository: { lidMapping: { getPNForLID } } } as unknown as Sessao['sock'];

    await receber(sessaoComSock(sock), msgTexto('5511999998888@s.whatsapp.net', 'oi'));

    expect(getPNForLID).not.toHaveBeenCalled();
    expect(entregarMock).toHaveBeenCalledTimes(1);
    const chamada = entregarMock.mock.calls[0]![0];
    expect(chamada.numero).toBe('5511999998888');
  });
});
