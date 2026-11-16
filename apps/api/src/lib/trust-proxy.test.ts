import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { resolverTrustProxy } from './trust-proxy';

describe('resolverTrustProxy', () => {
  it('vazio e false nao confiam em proxy', () => {
    expect(resolverTrustProxy(undefined)).toEqual({ valor: false, modoLegado: false });
    expect(resolverTrustProxy('')).toEqual({ valor: false, modoLegado: false });
    expect(resolverTrustProxy('false')).toEqual({ valor: false, modoLegado: false });
    expect(resolverTrustProxy('0')).toEqual({ valor: false, modoLegado: false });
  });

  it('true continua aceito mas e marcado como legado', () => {
    expect(resolverTrustProxy('true')).toEqual({ valor: true, modoLegado: true });
  });

  it('numero vira quantidade de saltos', () => {
    expect(resolverTrustProxy('1')).toEqual({ valor: 1, modoLegado: false });
    expect(resolverTrustProxy('2')).toEqual({ valor: 2, modoLegado: false });
  });

  it('lista de CIDR e apelidos e normalizada', () => {
    expect(resolverTrustProxy('10.0.0.0/8,  172.16.0.0/12 , loopback').valor).toBe('10.0.0.0/8, 172.16.0.0/12, loopback');
  });

  it('rejeita entradas invalidas em vez de ignora-las', () => {
    expect(() => resolverTrustProxy('300.1.1.1')).toThrow(/invalida/);
    expect(() => resolverTrustProxy('10.0.0.0/40')).toThrow(/invalida/);
    expect(() => resolverTrustProxy('qualquercoisa')).toThrow(/invalida/);
    expect(() => resolverTrustProxy('99')).toThrow(/saltos/);
  });
});

/*
 * Comportamento de ponta a ponta no Express. O servidor de teste escuta em
 * 127.0.0.1, entao a "conexao" vem de 127.0.0.1 — o papel do proxy da frente.
 * O X-Forwarded-For enviado pelo teste simula o que um cliente malicioso escreve.
 */
describe('IP do cliente atras do proxy', () => {
  let fechar: (() => void) | null = null;
  afterEach(() => { fechar?.(); fechar = null; });

  async function ipVisto(trustProxy: string, cabecalho: string | null) {
    const app = express();
    const conf = resolverTrustProxy(trustProxy);
    if (conf.valor !== false) app.set('trust proxy', conf.valor);
    app.get('/ip', (req, res) => res.json({ ip: req.ip }));
    const servidor = app.listen(0, '127.0.0.1');
    await new Promise((ok) => servidor.once('listening', ok));
    fechar = () => servidor.close();
    const { port } = servidor.address() as AddressInfo;
    const resposta = await fetch(`http://127.0.0.1:${port}/ip`, {
      headers: cabecalho ? { 'X-Forwarded-For': cabecalho } : {},
    });
    return ((await resposta.json()) as { ip: string }).ip.replace('::ffff:', '');
  }

  it('sem confianca em proxy, o cabecalho forjado e ignorado', async () => {
    expect(await ipVisto('false', '6.6.6.6')).toBe('127.0.0.1');
  });

  it('com 1 salto, o IP vem da entrada que o proxy acrescentou, nao da forjada pelo cliente', async () => {
    // O cliente mandou "6.6.6.6"; o proxy acrescentou o IP real (203.0.113.9).
    expect(await ipVisto('1', '6.6.6.6, 203.0.113.9')).toBe('203.0.113.9');
  });

  it('varias tentativas forjadas continuam resolvendo para o mesmo IP real (nao escapam do limite)', async () => {
    const a = await ipVisto('1', '1.1.1.1, 203.0.113.9');
    const b = await ipVisto('1', '2.2.2.2, 203.0.113.9');
    expect(a).toBe(b);
  });

  it('por CIDR, para no primeiro endereco que nao e proxy confiavel', async () => {
    expect(await ipVisto('127.0.0.1/32, 10.0.0.0/8', '6.6.6.6, 203.0.113.9, 10.1.2.3')).toBe('203.0.113.9');
  });

  it('DOCUMENTA o defeito do modo legado: com true, o cliente escolhe o proprio IP', async () => {
    expect(await ipVisto('true', '6.6.6.6, 203.0.113.9')).toBe('6.6.6.6');
  });
});
