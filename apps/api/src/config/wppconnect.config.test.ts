import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const VARS = ['WPP_CONNECT_URL', 'WPP_CONNECT_SECRET_KEY', 'WPP_CONNECT_TOKEN'] as const;

function limparEnv() {
  for (const nome of VARS) delete process.env[nome];
}

describe('obterConfigWppConnect', () => {
  const originais: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const nome of VARS) originais[nome] = process.env[nome];
    limparEnv();
  });

  afterEach(() => {
    for (const nome of VARS) {
      if (originais[nome] === undefined) delete process.env[nome];
      else process.env[nome] = originais[nome];
    }
  });

  it('devolve null quando WPP_CONNECT_URL nao esta definida (WPPConnect nao esta em uso)', async () => {
    const { obterConfigWppConnect } = await import('./wppconnect.config');
    expect(obterConfigWppConnect()).toBeNull();
  });

  it('devolve a config quando URL e secret key estao definidas', async () => {
    process.env.WPP_CONNECT_URL = 'http://wppconnect:21465';
    process.env.WPP_CONNECT_SECRET_KEY = 'minha-secret-key';

    const { obterConfigWppConnect } = await import('./wppconnect.config');
    expect(obterConfigWppConnect()).toEqual({
      url: 'http://wppconnect:21465',
      secretKey: 'minha-secret-key',
      token: null,
    });
  });

  it('devolve a config quando URL e token fixo estao definidos', async () => {
    process.env.WPP_CONNECT_URL = 'http://wppconnect:21465';
    process.env.WPP_CONNECT_TOKEN = 'token-fixo';

    const { obterConfigWppConnect } = await import('./wppconnect.config');
    expect(obterConfigWppConnect()).toEqual({
      url: 'http://wppconnect:21465',
      secretKey: null,
      token: 'token-fixo',
    });
  });

  it('lanca erro claro quando ha URL mas nenhuma forma de autenticacao', async () => {
    process.env.WPP_CONNECT_URL = 'http://wppconnect:21465';
    // nem WPP_CONNECT_SECRET_KEY nem WPP_CONNECT_TOKEN, de proposito

    const { obterConfigWppConnect } = await import('./wppconnect.config');
    expect(() => obterConfigWppConnect()).toThrow(/WPP_CONNECT_SECRET_KEY.*WPP_CONNECT_TOKEN/s);
  });
});
