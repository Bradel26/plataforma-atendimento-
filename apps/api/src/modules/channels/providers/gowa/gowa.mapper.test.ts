import { describe, expect, it } from 'vitest';
import { idDaMensagemEnviada, interpretarEventoGowa, numeroDoDestino, situacaoDaSessaoGowa } from './gowa.mapper';

describe('situacaoDaSessaoGowa', () => {
  it('nao logado -> AGUARDANDO_QR', () => {
    expect(situacaoDaSessaoGowa({ conectado: false, logado: false }, null).estado).toBe('AGUARDANDO_QR');
  });

  it('logado mas socket caido -> CONECTANDO (nao AGUARDANDO_QR de novo)', () => {
    expect(situacaoDaSessaoGowa({ conectado: false, logado: true }, null).estado).toBe('CONECTANDO');
  });

  it('conectado e logado -> CONECTADO, com o telefone', () => {
    const situacao = situacaoDaSessaoGowa({ conectado: true, logado: true }, '5511999990000');
    expect(situacao.estado).toBe('CONECTADO');
    expect(situacao.telefone).toBe('5511999990000');
  });

  it('status nulo (GOWA fora do ar) -> DESCONHECIDO', () => {
    expect(situacaoDaSessaoGowa(null, null).estado).toBe('DESCONHECIDO');
  });
});

describe('interpretarEventoGowa', () => {
  it('mensagem individual vira mensagem.recebida', () => {
    const eventos = interpretarEventoGowa(
      { event: 'message', payload: { id: 'M1', chat_id: '5511999990000@s.whatsapp.net', from_name: 'Cliente', body: 'oi', is_from_me: false } },
      'vendedor-1',
    );
    expect(eventos).toEqual([
      expect.objectContaining({
        tipo: 'mensagem.recebida',
        sessaoExterna: 'vendedor-1',
        mensagem: expect.objectContaining({ conteudo: 'oi', telefone: '5511999990000', idExterno: 'M1' }),
      }),
    ]);
  });

  it('mensagem de grupo (@g.us) e ignorada', () => {
    const eventos = interpretarEventoGowa(
      { event: 'message', payload: { id: 'M2', chat_id: '123456-group@g.us', body: 'oi turma', is_from_me: false } },
      'vendedor-1',
    );
    expect(eventos).toEqual([expect.objectContaining({ tipo: 'ignorado' })]);
  });

  it('mensagem propria (is_from_me) vira mensagem.propria', () => {
    const eventos = interpretarEventoGowa(
      { event: 'message', payload: { id: 'M3', chat_id: '5511999990000@s.whatsapp.net', body: 'oi', is_from_me: true } },
      'vendedor-1',
    );
    expect(eventos).toEqual([{ tipo: 'mensagem.propria', sessaoExterna: 'vendedor-1', idExterno: 'M3' }]);
  });

  it('anexo sem legenda vira texto descritivo (sem baixar o binario)', () => {
    const eventos = interpretarEventoGowa(
      { event: 'message', payload: { id: 'M4', chat_id: '5511999990000@s.whatsapp.net', image: { mimetype: 'image/jpeg' }, is_from_me: false } },
      'vendedor-1',
    );
    expect(eventos[0]).toMatchObject({ tipo: 'mensagem.recebida', mensagem: { conteudo: '[Imagem recebida]' } });
  });

  it('message.ack "delivered" vira mensagem.status ENTREGUE, um evento por id', () => {
    const eventos = interpretarEventoGowa(
      { event: 'message.ack', payload: { receipt_type: 'delivered', ids: ['A1', 'A2'] } },
      'vendedor-1',
    );
    expect(eventos).toEqual([
      { tipo: 'mensagem.status', sessaoExterna: 'vendedor-1', idExterno: 'A1', status: 'ENTREGUE' },
      { tipo: 'mensagem.status', sessaoExterna: 'vendedor-1', idExterno: 'A2', status: 'ENTREGUE' },
    ]);
  });

  it('message.ack "read" vira mensagem.status LIDA', () => {
    const eventos = interpretarEventoGowa({ event: 'message.ack', payload: { receipt_type: 'read', ids: ['A3'] } }, 'vendedor-1');
    expect(eventos).toEqual([{ tipo: 'mensagem.status', sessaoExterna: 'vendedor-1', idExterno: 'A3', status: 'LIDA' }]);
  });

  it('evento nao tratado (ex.: message.reaction) e ignorado', () => {
    const eventos = interpretarEventoGowa({ event: 'message.reaction', payload: {} }, 'vendedor-1');
    expect(eventos).toEqual([expect.objectContaining({ tipo: 'ignorado' })]);
  });

  it('corpo que nao e objeto e ignorado', () => {
    expect(interpretarEventoGowa(null, 'vendedor-1')).toEqual([expect.objectContaining({ tipo: 'ignorado' })]);
  });
});

describe('idDaMensagemEnviada', () => {
  it('le de results.message_id', () => {
    expect(idDaMensagemEnviada({ results: { message_id: 'X1' } })).toBe('X1');
  });
  it('le de results.id quando nao tem message_id', () => {
    expect(idDaMensagemEnviada({ results: { id: 'X2' } })).toBe('X2');
  });
  it('null quando nao acha nenhum dos dois', () => {
    expect(idDaMensagemEnviada({ results: {} })).toBeNull();
    expect(idDaMensagemEnviada(null)).toBeNull();
  });
});

describe('numeroDoDestino', () => {
  it('numero cru -> so digitos, com DDI', () => {
    expect(numeroDoDestino('(11) 99999-0000')).toBe('5511999990000');
  });
  it('numero invalido -> null (nunca envia pra destino incerto)', () => {
    expect(numeroDoDestino('abc')).toBeNull();
  });
});
