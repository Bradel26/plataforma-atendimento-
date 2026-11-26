import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('./config.js', () => ({
  config: { token: 'token-de-teste-123', porta: 0, diretorioDeSessoes: '.', chaveDeCifra: 'x'.repeat(32) },
}));
vi.mock('./sessao.js', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return {
    ...real,
    listar: () => [{ nome: 'linha-comercial', estado: 'conectado', numero: '5511999990000' }],
  };
});

import { criarServidor } from './servidor.js';

let base = '';
let fechar: () => void = () => undefined;

beforeAll(async () => {
  const app = criarServidor();
  const server = await new Promise<import('node:http').Server>((ok) => {
    const s = app.listen(0, '127.0.0.1', () => ok(s));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  fechar = () => server.close();
});
afterAll(() => fechar());

describe('/saude da ponte', () => {
  it('publica so o minimo operacional, sem nome de sessao nem numero', async () => {
    const r = await fetch(`${base}/saude`);
    const corpo = await r.text();
    expect(r.status).toBe(200);
    expect(JSON.parse(corpo)).toEqual({ ok: true });
    expect(corpo).not.toContain('linha-comercial');
    expect(corpo).not.toContain('5511999990000');
  });

  it('detalhe exige token', async () => {
    expect((await fetch(`${base}/saude/detalhe`)).status).toBe(401);
    expect((await fetch(`${base}/saude/detalhe`, { headers: { authorization: 'Bearer errado' } })).status).toBe(401);
    expect((await fetch(`${base}/saude/detalhe`, { headers: { authorization: 'Bearer ' } })).status).toBe(401);
  });

  it('detalhe com o token correto devolve as sessoes', async () => {
    const r = await fetch(`${base}/saude/detalhe`, { headers: { authorization: 'Bearer token-de-teste-123' } });
    expect(r.status).toBe(200);
    expect(((await r.json()) as { sessoes: { nome: string }[] }).sessoes[0]!.nome).toBe('linha-comercial');
  });
});
