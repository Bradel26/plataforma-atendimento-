import type { Server } from 'node:http';
import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { env } from './env';

/**
 * Modo em que a propria API serve o front (VPS onde outro proxy e o dono das
 * portas 80 e 443). Sobe o app de verdade numa porta livre e fala HTTP com ele:
 * o que importa aqui e o cabecalho que sai na resposta, e isso nao se verifica
 * chamando funcao.
 *
 * Depende de `npm run build` ter rodado. Sem a pasta, o teste se declara
 * pulado em vez de passar em falso.
 */
const temFront = existsSync(`${env.STATIC_DIR}/index.html`);

describe.skipIf(!temFront)('API servindo o front', () => {
  let servidor: Server;
  let base: string;

  beforeAll(async () => {
    servidor = createApp().listen(0);
    await new Promise((ok) => servidor.once('listening', ok));
    const porta = (servidor.address() as { port: number }).port;
    base = `http://127.0.0.1:${porta}`;
  });

  afterAll(async () => {
    await new Promise((ok) => servidor.close(ok));
  });

  it('serve o index na raiz', async () => {
    const res = await fetch(base + '/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('<div id="root">');
  });

  it('devolve o index em rota do SPA, para o React resolver o caminho', async () => {
    const res = await fetch(base + '/atendimento');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
  });

  it('nao engole rota de API inexistente: 404 em JSON, nao o index', async () => {
    const res = await fetch(base + '/api/rota-que-nao-existe');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('nunca cacheia o index', async () => {
    const res = await fetch(base + '/');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  /**
   * Este e o motivo do arquivo existir. Servido por nginx, o front nao passava
   * pelo helmet; servido pela API, passa — e o helmet proibia enquadrar a
   * pagina, o que mata o widget no site do cliente.
   */
  it('libera o enquadramento no webchat, que vive num iframe de terceiro', async () => {
    const res = await fetch(base + '/webchat');
    expect(res.headers.get('x-frame-options')).toBeNull();
    expect(res.headers.get('content-security-policy')).toContain('frame-ancestors *');
  });

  it('mantem o resto do app protegido contra clickjacking', async () => {
    for (const rota of ['/', '/atendimento', '/configuracoes']) {
      const res = await fetch(base + rota);
      expect(res.headers.get('x-frame-options'), rota).toBe('SAMEORIGIN');
      expect(res.headers.get('content-security-policy'), rota).toContain("frame-ancestors 'self'");
    }
  });
});
