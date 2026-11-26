import { beforeEach, describe, expect, it, vi } from 'vitest';

type Entrada = { v: string; ate: number };
const h = vi.hoisted(() => {
  const mapa = new Map<string, Entrada>();
  const cliente = {
    set: async (k: string, v: string, _px: 'PX', ttl: number, _nx: 'NX') => {
      const e = mapa.get(k);
      if (e && e.ate > Date.now()) return null;
      mapa.set(k, { v, ate: Date.now() + ttl });
      return 'OK' as const;
    },
    del: async (k: string) => mapa.delete(k),
    eval: async (_s: string, _n: number, k: string, token: string) => {
      const e = mapa.get(k);
      if (e && e.v === token) return mapa.delete(k) ? 1 : 0;
      return 0;
    },
  };
  return {
    mapa,
    cliente,
    enfileirar: vi.fn(async () => 'id'),
    pendentes: [] as { id: string }[],
    handler: null as null | ((d: { itemId: string }, c: { tentativa: number; ultimaTentativa: boolean }) => Promise<void>),
    enviar: vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 25));
    }),
    update: vi.fn(async () => ({})),
    statusItem: 'PENDENTE',
  };
});

vi.mock('../../lib/redis', () => ({ redis: {} }));
vi.mock('../../lib/fila', () => ({
  enfileirar: h.enfileirar,
  aguardarVaga: async () => undefined,
  registrarHandler: (_tipo: string, fn: typeof h.handler) => {
    h.handler = fn;
  },
}));
vi.mock('../../lib/tenant', () => ({ organizacaoAtual: () => 'org-1' }));
vi.mock('../../lib/storage', () => ({ urlAssinada: vi.fn(), caminhoDe: vi.fn() }));
vi.mock('../channels/outbound.service', () => ({
  exigeEnvioExterno: () => true,
  enviarParaCanal: h.enviar,
  enviarArquivoParaCanal: vi.fn(),
}));
vi.mock('../../lib/prisma', () => ({
  prisma: {
    campaign: {
      findUnique: vi.fn(async () => ({ id: 'c1', status: 'ATIVA', canal: 'WHATSAPP' })),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    campaignItem: {
      findMany: vi.fn(async () => h.pendentes),
      count: vi.fn(async () => 1),
      findUnique: vi.fn(async () => ({
        id: 'i1',
        campanhaId: 'c1',
        status: h.statusItem,
        textoEnviadoEm: null,
        anexosEnviados: [],
        contato: { telefone: '5511999990000', nome: 'Ana' },
        campanha: { status: 'ATIVA', canal: 'WHATSAPP', mensagem: 'Ola', anexos: [] },
      })),
      update: h.update,
    },
  },
}));
vi.mock('../../lib/trava', async () => {
  const real = await vi.importActual<typeof import('../../lib/trava')>('../../lib/trava');
  return { trava: real.criarTrava(h.cliente) };
});

import { trava } from '../../lib/trava';
import { chaveFilaItem, dispararCampanha } from './campaigns.service';
import './campaigns.worker';

const ctx = { tentativa: 1, ultimaTentativa: false };

beforeEach(() => {
  h.mapa.clear();
  h.enfileirar.mockClear();
  h.enviar.mockClear();
  h.update.mockClear();
  h.statusItem = 'PENDENTE';
  h.pendentes = Array.from({ length: 20 }, (_, i) => ({ id: `item-${i}` }));
});

describe('trava', () => {
  it('com 50 tentativas simultaneas so uma adquire a chave', async () => {
    const r = await Promise.all(Array.from({ length: 50 }, () => trava.adquirir('k', 1000)));
    expect(r.filter(Boolean)).toHaveLength(1);
  });

  it('so o dono libera; token errado nao solta a trava', async () => {
    const token = (await trava.adquirir('k2', 1000))!;
    await trava.liberar('k2', 'token-de-outro');
    expect(await trava.adquirir('k2', 1000)).toBeNull();
    await trava.liberar('k2', token);
    expect(await trava.adquirir('k2', 1000)).not.toBeNull();
  });

  it('expira sozinha (processo que morreu nao bloqueia para sempre)', async () => {
    vi.useFakeTimers();
    try {
      expect(await trava.adquirir('k3', 1000)).not.toBeNull();
      expect(await trava.adquirir('k3', 1000)).toBeNull();
      vi.advanceTimersByTime(1001);
      expect(await trava.adquirir('k3', 1000)).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('dispararCampanha: duplo clique e requisicoes simultaneas', () => {
  it('dois disparos ao mesmo tempo enfileiram cada item uma unica vez', async () => {
    const [a, b] = await Promise.all([dispararCampanha('c1'), dispararCampanha('c1')]);
    expect(h.enfileirar).toHaveBeenCalledTimes(20);
    expect(a.enfileirados + b.enfileirados).toBe(20);
    expect(a.jaNaFila + b.jaNaFila).toBe(20);
  });

  it('cinco disparos simultaneos continuam enfileirando 20 itens no total', async () => {
    await Promise.all(Array.from({ length: 5 }, () => dispararCampanha('c1')));
    expect(h.enfileirar).toHaveBeenCalledTimes(20);
  });

  it('depois que o item sai da fila, um novo disparo legitimo enfileira de novo', async () => {
    await dispararCampanha('c1');
    expect(h.enfileirar).toHaveBeenCalledTimes(20);
    for (const p of h.pendentes) await trava.remover(chaveFilaItem(p.id));
    await dispararCampanha('c1');
    expect(h.enfileirar).toHaveBeenCalledTimes(40);
  });

  it('falha ao enfileirar libera a marca para a proxima tentativa', async () => {
    h.pendentes = [{ id: 'x1' }];
    h.enfileirar.mockRejectedValueOnce(new Error('redis fora'));
    await expect(dispararCampanha('c1')).rejects.toThrow('redis fora');
    await dispararCampanha('c1');
    expect(h.enfileirar).toHaveBeenCalledTimes(2);
  });
});

describe('worker: varios workers e jobs duplicados', () => {
  it('dois workers processando o mesmo item ao mesmo tempo enviam uma unica mensagem', async () => {
    await Promise.all([h.handler!({ itemId: 'i1' }, ctx), h.handler!({ itemId: 'i1' }, ctx)]);
    expect(h.enviar).toHaveBeenCalledTimes(1);
  });

  it('item ja enviado (job reentregue depois) nao reenvia', async () => {
    h.statusItem = 'ENVIADO';
    await h.handler!({ itemId: 'i1' }, ctx);
    expect(h.enviar).not.toHaveBeenCalled();
  });

  it('libera a trava ao terminar, inclusive quando o envio falha e a fila vai tentar de novo', async () => {
    h.enviar.mockRejectedValueOnce(new Error('rede'));
    await expect(h.handler!({ itemId: 'i1' }, ctx)).rejects.toThrow('rede');
    await h.handler!({ itemId: 'i1' }, { tentativa: 2, ultimaTentativa: false });
    expect(h.enviar).toHaveBeenCalledTimes(2);
  });

  it('reinicio: trava de um processo que morreu expira e o item volta a ser processavel', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); // so o relogio: o envio simulado usa setTimeout real
    try {
      await trava.adquirir('campanha:proc:i1', 5 * 60_000);
      await h.handler!({ itemId: 'i1' }, ctx);
      expect(h.enviar).not.toHaveBeenCalled();
      vi.setSystemTime(Date.now() + 5 * 60_000 + 1);
      await h.handler!({ itemId: 'i1' }, ctx);
      expect(h.enviar).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
