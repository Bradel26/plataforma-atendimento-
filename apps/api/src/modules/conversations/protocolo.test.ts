import { beforeEach, describe, expect, it, vi } from 'vitest';
import { comOrganizacao } from '../../lib/tenant';

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }));
vi.mock('../../lib/prisma', () => ({ prisma: { $queryRaw: queryRaw } }));

const { diaDoProtocolo, formatarProtocolo, reservarProtocolo } = await import('./protocolo');

describe('diaDoProtocolo', () => {
  it('usa o dia de Brasilia, nao o de UTC (23:30 de 08/10 em Brasilia = 02:30 UTC de 09/10)', () => {
    expect(diaDoProtocolo(new Date('2026-10-09T02:30:00Z'))).toBe('261008');
  });

  it('meio-dia em Brasilia fica no mesmo dia', () => {
    expect(diaDoProtocolo(new Date('2026-01-05T15:00:00Z'))).toBe('260105');
  });
});

describe('formatarProtocolo', () => {
  it('preenche o sequencial com 5 digitos', () => {
    expect(formatarProtocolo('261008', 42)).toBe('261008-00042');
  });

  it('nao corta sequencial com mais de 5 digitos', () => {
    expect(formatarProtocolo('261008', 123456)).toBe('261008-123456');
  });
});

describe('reservarProtocolo', () => {
  beforeEach(() => queryRaw.mockReset());

  it('reserva o proximo numero do dia da organizacao atual', async () => {
    queryRaw.mockResolvedValue([{ ultimo: 7 }]);
    const protocolo = await comOrganizacao('org-1', () => reservarProtocolo(new Date('2026-10-09T15:00:00Z')), {
      id: 'u-1',
      perfil: 'ADMIN',
    });
    expect(protocolo).toBe('261009-00007');
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('falha alto se o banco nao devolver linha', async () => {
    queryRaw.mockResolvedValue([]);
    await expect(
      comOrganizacao('org-1', () => reservarProtocolo(new Date()), { id: 'u-1', perfil: 'ADMIN' }),
    ).rejects.toThrow(/protocolo/);
  });
});
