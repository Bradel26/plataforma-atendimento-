import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('../../lib/prisma', () => ({ prisma: { modulePermission: { findMany } } }));
import { credenciamentosRoutes } from './credenciamentos.routes';

/*
 * `credenciamentosRoutes.use(requireRole(...))` (logo apos `requireAuth`) e o
 * portao que fecha o modulo inteiro da Esteira para quem nao esta na lista —
 * e o unico lugar que decide se SUPORTE entra ou leva 403 em qualquer rota
 * daqui. Testa o middleware direto pelo `stack`, sem montar servidor: mais
 * barato e exercita exatamente a checagem que protege a rota real.
 */
function guardDoModulo() {
  const layer = credenciamentosRoutes.stack[1] as { handle: (req: Request, res: Response, next: NextFunction) => void };
  return layer.handle;
}

function fakeReq(perfil: string): Request {
  return { user: { sub: 'u-1', perfil, nome: 'Fulano', email: 'f@x.com', org: 'org-1' } } as unknown as Request;
}

function rodar(perfil: string) {
  return new Promise((resolve) => {
    guardDoModulo()(fakeReq(perfil), {} as Response, resolve as NextFunction);
  });
}

describe('credenciamentosRoutes — guard do modulo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('SUPORTE sem permissão configurada recebe 403', async () => {
    findMany.mockResolvedValue([]);
    await expect(rodar('SUPORTE')).resolves.toMatchObject({ status: 403 });
  });

  it('SUPORTE com esteira configurada passa', async () => {
    findMany.mockResolvedValue([{ modulo: 'esteira' }]);
    await expect(rodar('SUPORTE')).resolves.toBeUndefined();
  });

  it('ADMIN sempre passa sem consultar configuração', async () => {
    await expect(rodar('ADMIN')).resolves.toBeUndefined();
    expect(findMany).not.toHaveBeenCalled();
  });
});
