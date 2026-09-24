import { describe, expect, it } from 'vitest';
import {
  chatIdDoDestino,
  estadoDoStatusWaha,
  idDaMensagemEnviada,
  interpretarEventoWaha,
  statusDoAck,
} from './waha.mapper';

/** Formato do evento `message` do WAHA NOWEB, como o Deskcomm registra em producao. */
const MENSAGEM = {
  event: 'message',
  session: 'vendedor-1a2b3c4d',
  me: { id: '5562988887777@c.us', pushName: 'Loja' },
  payload: {
    id: 'false_5562999990000@c.us_3EB0A238AC2DE5AE1C5D04',
    from: '5562999990000@c.us',
    fromMe: false,
    body: 'Oi, quero um orcamento',
    hasMedia: false,
    _data: { notifyName: 'Maria' },
  },
};

describe('estadoDoStatusWaha', () => {
  it.each([
    ['STARTING', 'CONECTANDO'],
    ['SCAN_QR_CODE', 'AGUARDANDO_QR'],
    ['WORKING', 'CONECTADO'],
    ['STOPPED', 'DESCONECTADO'],
    ['FAILED', 'FALHOU'],
    ['QUALQUER', 'DESCONHECIDO'],
    [undefined, 'DESCONHECIDO'],
  ])('%s -> %s', (status, esperado) => {
    expect(estadoDoStatusWaha(status)).toBe(esperado);
  });
});

describe('interpretarEventoWaha', () => {
  it('mensagem de texto vira mensagem.recebida no formato que registrarMensagemEntrante consome', () => {
    const [evento] = interpretarEventoWaha(MENSAGEM);

    expect(evento).toEqual({
      tipo: 'mensagem.recebida',
      sessaoExterna: 'vendedor-1a2b3c4d',
      mensagem: {
        canal: 'WHATSAPP',
        enderecoExterno: '5562999990000@c.us',
        nomeExibicao: 'Maria',
        telefone: '5562999990000',
        idExterno: 'false_5562999990000@c.us_3EB0A238AC2DE5AE1C5D04',
        conteudo: 'Oi, quero um orcamento',
        tipoAnexo: 'TEXTO',
        anexoUrl: null,
        anexoIdExterno: null,
        anexoNome: null,
        identificadorDestino: 'vendedor-1a2b3c4d',
      },
    });
  });

  it('chat @lid mantem o @lid como endereco e tira o telefone de remoteJidAlt', () => {
    const [evento] = interpretarEventoWaha({
      ...MENSAGEM,
      payload: {
        ...MENSAGEM.payload,
        from: '70192801575156@lid',
        _data: { pushName: 'Joao', key: { remoteJidAlt: '5581983647258@s.whatsapp.net' } },
      },
    });

    expect(evento).toMatchObject({
      tipo: 'mensagem.recebida',
      mensagem: { enderecoExterno: '70192801575156@lid', telefone: '5581983647258', nomeExibicao: 'Joao' },
    });
  });

  it('@lid sem remoteJidAlt fica sem telefone (nunca inventa numero)', () => {
    const [evento] = interpretarEventoWaha({ ...MENSAGEM, payload: { ...MENSAGEM.payload, from: '70192801575156@lid' } });
    expect(evento).toMatchObject({ mensagem: { telefone: null } });
  });

  it.each(['120363000000000000@g.us', 'status@broadcast', '120363000000@newsletter'])(
    'chat fora do atendimento (%s) e ignorado',
    (from) => {
      const [evento] = interpretarEventoWaha({ ...MENSAGEM, payload: { ...MENSAGEM.payload, from } });
      expect(evento?.tipo).toBe('ignorado');
    },
  );

  it('mensagem digitada no proprio celular vira mensagem.propria, nao entrada', () => {
    const [evento] = interpretarEventoWaha({ ...MENSAGEM, payload: { ...MENSAGEM.payload, fromMe: true } });
    expect(evento).toEqual({
      tipo: 'mensagem.propria',
      sessaoExterna: 'vendedor-1a2b3c4d',
      idExterno: MENSAGEM.payload.id,
    });
  });

  it('anexo sem legenda entra como texto descritivo, para a mensagem nao sumir', () => {
    const [evento] = interpretarEventoWaha({
      ...MENSAGEM,
      payload: { ...MENSAGEM.payload, body: '', hasMedia: true, media: { mimetype: 'image/jpeg' } },
    });
    expect(evento).toMatchObject({ mensagem: { conteudo: '[Imagem recebida]', tipoAnexo: 'TEXTO' } });
  });

  it('mensagem sem texto e sem anexo e ignorada', () => {
    const [evento] = interpretarEventoWaha({ ...MENSAGEM, payload: { ...MENSAGEM.payload, body: '' } });
    expect(evento?.tipo).toBe('ignorado');
  });

  it('session.status WORKING traz o telefone conectado a partir de me', () => {
    const [evento] = interpretarEventoWaha({
      event: 'session.status',
      session: 'vendedor-1a2b3c4d',
      me: { id: '5562988887777@c.us' },
      payload: { name: 'vendedor-1a2b3c4d', status: 'WORKING' },
    });
    expect(evento).toEqual({
      tipo: 'sessao.estado',
      sessaoExterna: 'vendedor-1a2b3c4d',
      situacao: { estado: 'CONECTADO', detalhe: 'WORKING', telefone: '5562988887777' },
    });
  });

  it('session.status SCAN_QR_CODE nao expoe telefone', () => {
    const [evento] = interpretarEventoWaha({
      event: 'session.status',
      session: 's',
      me: { id: '5562988887777@c.us' },
      payload: { status: 'SCAN_QR_CODE' },
    });
    expect(evento).toMatchObject({ situacao: { estado: 'AGUARDANDO_QR', telefone: null } });
  });

  it('message.ack vira mensagem.status', () => {
    const [evento] = interpretarEventoWaha({ event: 'message.ack', session: 's', payload: { id: 'true_x@c.us_ABC', ack: 3 } });
    expect(evento).toEqual({ tipo: 'mensagem.status', sessaoExterna: 's', idExterno: 'true_x@c.us_ABC', status: 'LIDA' });
  });

  it('evento sem sessao, corpo invalido ou evento desconhecido sao ignorados', () => {
    expect(interpretarEventoWaha(null)[0]?.tipo).toBe('ignorado');
    expect(interpretarEventoWaha({ event: 'message', payload: {} })[0]?.tipo).toBe('ignorado');
    expect(interpretarEventoWaha({ event: 'presence.update', session: 's' })[0]?.tipo).toBe('ignorado');
  });
});

describe('statusDoAck', () => {
  it.each([
    [-1, 'FALHOU'],
    [0, 'PENDENTE'],
    [1, 'ENVIADA'],
    [2, 'ENTREGUE'],
    [3, 'LIDA'],
    [4, 'LIDA'],
    ['3', null],
  ])('%s -> %s', (ack, esperado) => {
    expect(statusDoAck(ack)).toBe(esperado);
  });
});

describe('idDaMensagemEnviada', () => {
  it.each([
    [{ id: 'ABC' }, 'ABC'],
    [{ id: { _serialized: 'true_x@c.us_ABC' } }, 'true_x@c.us_ABC'],
    [{ id: { id: 'ABC' } }, 'ABC'],
    [{ key: { id: 'ABC' } }, 'ABC'],
    [{}, null],
    [null, null],
  ])('%j -> %s', (resposta, esperado) => {
    expect(idDaMensagemEnviada(resposta)).toBe(esperado);
  });
});

describe('chatIdDoDestino', () => {
  it('endereco que ja e chatId vai como esta', () => {
    expect(chatIdDoDestino('70192801575156@lid')).toBe('70192801575156@lid');
    expect(chatIdDoDestino('5562999990000@c.us')).toBe('5562999990000@c.us');
  });

  it('numero cru vira <digitos>@c.us com o pais', () => {
    expect(chatIdDoDestino('(62) 99999-0000')).toBe('5562999990000@c.us');
  });

  it('o que nao e telefone e recusado', () => {
    expect(chatIdDoDestino('123')).toBeNull();
  });
});
