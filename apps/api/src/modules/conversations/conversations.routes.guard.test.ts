import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('../../lib/prisma', () => ({ prisma: { modulePermission: { findMany } } }));

import { conversationsRoutes } from './conversations.routes';

function fakeReq(perfil: string): Request {
  return { user: { sub: 'u-1', perfil, nome: 'Fulano', email: 'f@x.com', org: 'org-1' } } as unknown as Request;
}

function camadaUse(indice: number) {
  const layer = conversationsRoutes.stack[indice] as { handle: (req: Request, res: Response, next: NextFunction) => void };
  return layer.handle;
}

function camadaDaRota(path: string) {
  const layer = conversationsRoutes.stack.find(
    (l: { route?: { path: string } }) => l.route?.path === path,
  ) as { route: { stack: Array<{ handle: (req: Request, res: Response, next: NextFunction) => void }> } };
  // O guard vem primeiro na rota de auditoria: [0] requireModulo/requireRole, [1] validateQuery (so em /auditoria), último o handler.
  return layer.route.stack[0]!.handle;
}

/** `requireModulo` é assíncrono — toda chamada espera a promise resolver antes de checar o erro. */
function rodar(mw: (req: Request, res: Response, next: NextFunction) => void, perfil: string): Promise<unknown> {
  return new Promise((resolve) => {
    mw(fakeReq(perfil), {} as Response, resolve as NextFunction);
  });
}

describe('conversationsRoutes — guard geral (atendimento)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('perfil sem a linha "atendimento" leva 403', async () => {
    findMany.mockResolvedValue([]);
    const erro = await rodar(camadaUse(1), 'GESTOR');
    expect(erro).toMatchObject({ status: 403 });
  });

  it('perfil com a linha "atendimento" (seed da migration) passa', async () => {
    findMany.mockResolvedValue([{ modulo: 'atendimento' }]);
    const erro = await rodar(camadaUse(1), 'COMERCIAL');
    expect(erro).toBeUndefined();
  });
});

describe('conversationsRoutes — guard da auditoria', () => {
  beforeEach(() => vi.clearAllMocks());

  it('SUPORTE continua fora da auditoria (sem linha "auditoria")', async () => {
    findMany.mockResolvedValue([]);
    const erro = await rodar(camadaDaRota('/auditoria'), 'SUPORTE');
    expect(erro).toMatchObject({ status: 403 });
  });

  it('GESTOR com a linha "auditoria" (seed da migration) passa', async () => {
    findMany.mockResolvedValue([{ modulo: 'auditoria' }]);
    const erro = await rodar(camadaDaRota('/auditoria'), 'GESTOR');
    expect(erro).toBeUndefined();
  });

  it('COMERCIAL com a linha "auditoria" passa — prova que a checagem veio da tabela, nao do array antigo', async () => {
    // COMERCIAL nunca esteve no antigo requireRole('ADMIN','SUPERVISOR','GESTOR').
    // Este teste só passa se o guard consultar a tabela (requireModulo); sob o código
    // antigo (requireRole hardcoded) ele falharia, pois COMERCIAL nunca era permitido.
    findMany.mockResolvedValue([{ modulo: 'auditoria' }]);
    const erro = await rodar(camadaDaRota('/auditoria'), 'COMERCIAL');
    expect(erro).toBeUndefined();
  });
});
