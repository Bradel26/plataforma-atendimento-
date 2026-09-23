import { describe, expect, it } from 'vitest';
import { descreverErroDeDesconexao, stackSeguro } from './sessao.js';

/**
 * Cobre a extracao SEGURA de diagnostico de `lastDisconnect.error` em
 * `connection.update`/`connection.close`.
 *
 * Motivo: o teste real de pareamento da sessao "vendedor-a06db3d6" mostrou
 * `statusCode="sem codigo" motivo="desconhecido"` — ou seja, o `.output.
 * statusCode` que o codigo ja lia veio vazio, e o log anterior nao guardava
 * mais nada sobre o erro (nem `.constructor.name`, nem `.message`, nem
 * `.data`) para investigar por que. Estas funcoes puras extraem o que for
 * seguro do objeto de erro, sem nunca expor credencial/token/QR.
 */
describe('descreverErroDeDesconexao', () => {
  it('sem erro nenhum (lastDisconnect.error undefined): presente=false', () => {
    expect(descreverErroDeDesconexao(undefined)).toEqual({ presente: false });
  });

  it('erro tipo Boom (o caso normal do Baileys): extrai nome, mensagem e o statusCode do output', () => {
    class Boom extends Error {
      output: { statusCode: number };
      constructor(mensagem: string, statusCode: number) {
        super(mensagem);
        this.name = 'Boom';
        this.output = { statusCode };
      }
    }
    const erro = new Boom('Connection Closed', 428);

    const resultado = descreverErroDeDesconexao(erro);

    expect(resultado.presente).toBe(true);
    expect(resultado).toMatchObject({
      nome: 'Boom',
      mensagem: 'Connection Closed',
      outputStatusCode: 428,
      statusCodeDerivado: 428,
      dataStatusCode: null,
      causa: null,
    });
  });

  it('erro SEM output.statusCode (o caso real de "vendedor-a06db3d6"): outputStatusCode nulo, mas statusCodeDerivado usa a heuristica do proprio Baileys (getCodeFromWSError)', () => {
    const erro = new Error('socket hang up');

    const resultado = descreverErroDeDesconexao(erro);

    expect(resultado.presente).toBe(true);
    expect(resultado).toMatchObject({
      nome: 'Error',
      mensagem: 'socket hang up',
      outputStatusCode: null,
      // Sem "timed out" na mensagem nem `.code` iniciando com "E": a
      // heuristica de `getCodeFromWSError` cai no default (500).
      statusCodeDerivado: 500,
    });
  });

  it('erro de rede tipico (ECONNRESET): statusCodeDerivado reconhece o padrao de timeout/rede (408)', () => {
    const erro = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });

    const resultado = descreverErroDeDesconexao(erro);

    expect(resultado.statusCodeDerivado).toBe(408);
  });

  it('erro com data.statusCode: extrai tambem esse campo separadamente', () => {
    const erro = Object.assign(new Error('WebSocket Error'), {
      data: { statusCode: 1006 },
    });

    const resultado = descreverErroDeDesconexao(erro);

    expect(resultado.dataStatusCode).toBe(1006);
  });

  it('erro com cause: extrai a causa como texto', () => {
    const erro = new Error('falhou', { cause: 'rede indisponivel' });

    const resultado = descreverErroDeDesconexao(erro);

    expect(resultado.causa).toBe('rede indisponivel');
  });

  it('nunca inclui credencial/token/segredo — mesmo que estivessem no erro', () => {
    const erro = new Error('falha ao autenticar com token=abc123.def456.ghi789');

    const resultado = descreverErroDeDesconexao(erro);

    // A mensagem crua ainda aparece (e informativa), mas o STACK — que pode
    // conter argumentos completos de chamadas internas — e omitido quando
    // qualquer palavra sensivel aparece nele.
    expect(resultado.stack).toBe('stack_omitido_por_seguranca');
  });
});

describe('stackSeguro', () => {
  it('erro sem stack (nao e Error de verdade): nulo', () => {
    expect(stackSeguro('so uma string')).toBeNull();
    expect(stackSeguro(undefined)).toBeNull();
  });

  it('stack normal (sem palavra sensivel): devolve resumido, sem credencial nenhuma para vazar', () => {
    const erro = new Error('Connection Closed');
    expect(stackSeguro(erro)).toContain('Connection Closed');
  });

  it('stack com palavra sensivel (token/segredo/senha/bearer/cookie): omite por completo', () => {
    expect(stackSeguro(new Error('token invalido'))).toBe('stack_omitido_por_seguranca');
    expect(stackSeguro(new Error('Bearer xyz'))).toBe('stack_omitido_por_seguranca');
    expect(stackSeguro(new Error('cookie de sessao expirado'))).toBe('stack_omitido_por_seguranca');
  });
});
