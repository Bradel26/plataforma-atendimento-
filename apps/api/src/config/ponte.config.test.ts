import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const VARS = ['PONTE_URL', 'PONTE_TOKEN', 'PONTE_SEGREDO'] as const;

function limparEnv() {
  for (const nome of VARS) delete process.env[nome];
}

describe('obterConfigGlobalPonte', () => {
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

  it('devolve null quando nenhuma variavel esta definida (instalacao so com linha compartilhada legada)', async () => {
    const { obterConfigGlobalPonte } = await import('./ponte.config');
    expect(obterConfigGlobalPonte()).toBeNull();
  });

  it('devolve a config quando as 3 variaveis estao definidas', async () => {
    process.env.PONTE_URL = 'http://ponte:3100';
    process.env.PONTE_TOKEN = 'token-global';
    process.env.PONTE_SEGREDO = 'segredo-global';

    const { obterConfigGlobalPonte } = await import('./ponte.config');
    expect(obterConfigGlobalPonte()).toEqual({
      ponteUrl: 'http://ponte:3100',
      ponteToken: 'token-global',
      ponteSegredo: 'segredo-global',
    });
  });

  it('lanca erro claro quando so parte das 3 variaveis esta definida', async () => {
    process.env.PONTE_URL = 'http://ponte:3100';
    process.env.PONTE_TOKEN = 'token-global';
    // PONTE_SEGREDO ausente de proposito

    const { obterConfigGlobalPonte } = await import('./ponte.config');
    expect(() => obterConfigGlobalPonte()).toThrow(/PONTE_URL.*PONTE_TOKEN.*PONTE_SEGREDO/s);
  });
});
