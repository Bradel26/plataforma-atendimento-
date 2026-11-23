import { beforeEach, describe, expect, it, vi } from 'vitest';

const count = vi.fn();
vi.mock('../../lib/prisma', () => ({ prisma: { channelConfig: { count: (...a: unknown[]) => count(...a) } } }));

import { exigirSemNumeroConectado } from './numeroConectado';

describe('exigirSemNumeroConectado', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passa quando o usuario nao tem numero conectado', async () => {
    count.mockResolvedValue(0);
    await expect(exigirSemNumeroConectado('u-1')).resolves.toBeUndefined();
  });

  it('consulta so linhas ativas do proprio usuario', async () => {
    count.mockResolvedValue(0);
    await exigirSemNumeroConectado('u-1');
    expect(count).toHaveBeenCalledWith({ where: { donoId: 'u-1', ativo: true } });
  });

  it('recusa com 409 quando ha um numero conectado', async () => {
    count.mockResolvedValue(1);
    await expect(exigirSemNumeroConectado('u-1')).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('1 número de WhatsApp conectado'),
    });
  });

  it('recusa com 409 e pluraliza quando ha varios', async () => {
    count.mockResolvedValue(3);
    await expect(exigirSemNumeroConectado('u-1')).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('3 números de WhatsApp conectados'),
    });
  });
});
