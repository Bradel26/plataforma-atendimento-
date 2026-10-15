import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock('./prisma', () => ({
  prisma: { modulePermission: { findMany } },
}));

import { modulosPermitidos, requireModulo, MODULOS_EDITAVEIS } from './modulos';

function fakeReq(perfil?: string): Request {
  return (perfil ? { user: { sub: 'u-1', perfil, nome: 'Fulano', email: 'f@x.com', org: 'org-1' } } : {}) as Request;
}

function rodar(mw: ReturnType<typeof requireModulo>, req: Request) {
  return new Promise((resolve) => {
    mw(req, {} as Response, ((e?: unknown) => resolve(e)) as NextFunction);
  });
}

describe('modulosPermitidos', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ADMIN sempre tem todos os modulos editaveis, sem consultar o banco', async () => {
    const r = await modulosPermitidos('ADMIN' as never);
    expect([...r].sort()).toEqual([...MODULOS_EDITAVEIS].sort());
    expect(findMany).not.toHaveBeenCalled();
  });

  it('perfil sem nenhuma linha devolve conjunto vazio, sem lancar', async () => {
    findMany.mockResolvedValue([]);
    const r = await modulosPermitidos('AGENTE' as never);
    expect(r.size).toBe(0);
  });

  it('perfil com linhas devolve exatamente os modulos delas', async () => {
    findMany.mockResolvedValue([{ modulo: 'atendimento' }, { modulo: 'crm' }]);
    const r = await modulosPermitidos('SUPORTE' as never);
    expect([...r].sort()).toEqual(['atendimento', 'crm']);
  });
});

describe('requireModulo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sem req.user, nega autenticacao', async () => {
    const erro = await rodar(requireModulo('crm'), fakeReq());
    expect(erro).toMatchObject({ status: 401 });
  });

  it('ADMIN passa sem consultar o banco', async () => {
    const erro = await rodar(requireModulo('crm'), fakeReq('ADMIN'));
    expect(erro).toBeUndefined();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('perfil sem a linha do modulo leva 403', async () => {
    findMany.mockResolvedValue([]);
    const erro = await rodar(requireModulo('crm'), fakeReq('AGENTE'));
    expect(erro).toMatchObject({ status: 403 });
  });

  it('perfil com a linha do modulo passa', async () => {
    findMany.mockResolvedValue([{ modulo: 'crm' }]);
    const erro = await rodar(requireModulo('crm'), fakeReq('AGENTE'));
    expect(erro).toBeUndefined();
  });
});
