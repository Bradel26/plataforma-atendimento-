import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { twilio } from './twilio.provider';

const TOKEN = 'token-de-teste-do-provedor';
const URL = 'https://exemplo.com.br/api/webhooks/voz/eventos';

const assinar = (url: string, parametros: Record<string, string>) =>
  createHmac('sha1', TOKEN)
    .update(
      url +
        Object.keys(parametros)
          .sort()
          .map((k) => k + parametros[k])
          .join(''),
      'utf8',
    )
    .digest('base64');

/**
 * A assinatura e o que separa "evento do provedor" de "qualquer um postando na
 * rota publica". Estes casos existem para que uma refatoracao nao afrouxe isso.
 */
describe('assinatura do provedor de voz', () => {
  const parametros = { CallSid: 'CA1', CallStatus: 'completed', From: '+551', To: '+552' };

  it('aceita a assinatura correta', () => {
    expect(
      twilio.assinaturaValida({ url: URL, parametros, assinatura: assinar(URL, parametros), authToken: TOKEN }),
    ).toBe(true);
  });

  it('a ordem dos parametros nao importa (a conferencia ordena)', () => {
    const invertido = { To: '+552', From: '+551', CallStatus: 'completed', CallSid: 'CA1' };
    expect(
      twilio.assinaturaValida({ url: URL, parametros: invertido, assinatura: assinar(URL, parametros), authToken: TOKEN }),
    ).toBe(true);
  });

  it('recusa quando um parametro muda', () => {
    expect(
      twilio.assinaturaValida({
        url: URL,
        parametros: { ...parametros, CallStatus: 'no-answer' },
        assinatura: assinar(URL, parametros),
        authToken: TOKEN,
      }),
    ).toBe(false);
  });

  it('recusa quando a URL muda', () => {
    expect(
      twilio.assinaturaValida({
        url: `${URL}?extra=1`,
        parametros,
        assinatura: assinar(URL, parametros),
        authToken: TOKEN,
      }),
    ).toBe(false);
  });

  it('recusa token errado, assinatura ausente e tamanho diferente', () => {
    expect(twilio.assinaturaValida({ url: URL, parametros, assinatura: assinar(URL, parametros), authToken: 'outro' })).toBe(false);
    expect(twilio.assinaturaValida({ url: URL, parametros, assinatura: undefined, authToken: TOKEN })).toBe(false);
    expect(twilio.assinaturaValida({ url: URL, parametros, assinatura: 'abc', authToken: TOKEN })).toBe(false);
  });
});

describe('normalizacao do evento', () => {
  it('traduz o status do provedor para o vocabulario interno', () => {
    const casos: Array<[string, string]> = [
      ['queued', 'INICIANDO'],
      ['ringing', 'CHAMANDO'],
      ['in-progress', 'EM_ANDAMENTO'],
      ['completed', 'COMPLETADA'],
      ['no-answer', 'NAO_ATENDIDA'],
      ['busy', 'OCUPADA'],
      ['failed', 'FALHOU'],
      ['canceled', 'CANCELADA'],
    ];
    for (const [bruto, esperado] of casos) {
      expect(twilio.normalizarEvento({ CallSid: 'CA1', CallStatus: bruto })?.status).toBe(esperado);
    }
  });

  /** "inbound" e a chamada que chegou ao numero da empresa. */
  it('le a direcao do ponto de vista da operacao', () => {
    expect(twilio.normalizarEvento({ CallSid: 'CA1', Direction: 'inbound' })?.direcao).toBe('ENTRANTE');
    expect(twilio.normalizarEvento({ CallSid: 'CA1', Direction: 'outbound-api' })?.direcao).toBe('SAINTE');
  });

  it('converte duracao e custo, descartando valor vazio', () => {
    const evento = twilio.normalizarEvento({ CallSid: 'CA1', CallStatus: 'completed', CallDuration: '95', Price: '-0.0410' });
    expect(evento?.duracao).toBe(95);
    // O provedor manda o custo como debito; o relatorio mostra valor positivo.
    expect(evento?.custo).toBeCloseTo(0.041);
    expect(twilio.normalizarEvento({ CallSid: 'CA1', CallDuration: '' })?.duracao).toBeNull();
  });

  it('completa a URL da gravacao com a extensao do audio', () => {
    expect(twilio.normalizarEvento({ CallSid: 'CA1', RecordingUrl: 'https://api/x' })?.gravacaoUrl).toBe('https://api/x.mp3');
    expect(twilio.normalizarEvento({ CallSid: 'CA1' })?.gravacaoUrl).toBeNull();
  });

  it('devolve nulo quando nao ha como identificar a chamada', () => {
    expect(twilio.normalizarEvento({ CallStatus: 'completed' })).toBeNull();
  });
});
