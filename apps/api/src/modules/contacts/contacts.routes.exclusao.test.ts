import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { comOrganizacao } from '../../lib/tenant';

/*
 * ADMIN e o unico perfil sem ninguem acima para aprovar: por isso a exclusao
 * de contato acontece na hora para ele, enquanto os demais perfis (incluindo
 * SUPERVISOR) continuam exigindo uma SEGUNDA pessoa em `/exclusao/aprovar`.
 */

const {
  contactFindFirst,
  contactDeletionRequestFindFirst,
  contactDeletionRequestCreate,
  contactUpdate,
  transaction,
} = vi.hoisted(() => ({
  contactFindFirst: vi.fn(),
  contactDeletionRequestFindFirst: vi.fn(),
  contactDeletionRequestCreate: vi.fn(),
  contactUpdate: vi.fn(),
  transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
    fn({ contactDeletionRequest: { create: contactDeletionRequestCreate }, contact: { update: contactUpdate } }),
  ),
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    contact: { findFirst: contactFindFirst, update: contactUpdate },
    contactDeletionRequest: { findFirst: contactDeletionRequestFindFirst, create: contactDeletionRequestCreate },
    $transaction: transaction,
  },
}));

vi.mock('../../lib/politicas', () => ({
  filtroDe: vi.fn(async () => ({})),
  politicaContatos: {},
}));

vi.mock('../../lib/visibilidade', () => ({
  apenasVisivel: (id: string) => ({ id }),
}));

import { contactsRoutes } from './contacts.routes';

type RouteLayer = { route?: { path: string; stack: Array<{ method: string; handle: (req: Request, res: Response, next: (e?: unknown) => void) => void }> } };

function handlerDe(path: string, method: 'get' | 'post') {
  const layer = (contactsRoutes.stack as RouteLayer[]).find((l) => l.route?.path === path);
  if (!layer?.route) throw new Error(`rota ${path} nao encontrada`);
  const camadas = layer.route.stack.filter((s) => s.method === method);
  const ultima = camadas.at(-1);
  if (!ultima) throw new Error(`metodo ${method} nao encontrado em ${path}`);
  return ultima.handle;
}

function fakeRes() {
  return { json: vi.fn(), status: vi.fn().mockReturnThis(), end: vi.fn() } as unknown as Response;
}

function fakeReq(perfil: 'ADMIN' | 'SUPERVISOR' | 'COMERCIAL', body: Record<string, unknown>) {
  return {
    user: { sub: 'user-1', perfil, nome: 'Fulano', email: 'f@x.com', org: 'org-1' },
    params: { id: 'contato-1' },
    body,
  } as unknown as Request;
}

async function rodar(handler: (req: Request, res: Response, next: (e?: unknown) => void) => void, req: Request, res: Response) {
  await comOrganizacao('org-1', () => {
    return new Promise<void>((resolve, reject) => {
      handler(req, res, (err?: unknown) => (err ? reject(err) : resolve()));
      resolve();
    });
  });
}

describe('POST /:id/exclusao', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contactFindFirst.mockResolvedValue({ id: 'contato-1' });
    contactDeletionRequestFindFirst.mockResolvedValue(null);
  });

  it('ADMIN: exclui na hora, sem solicitacao pendente', async () => {
    contactDeletionRequestCreate.mockResolvedValue({ id: 'req-1', status: 'APROVADA' });
    const handler = handlerDe('/:id/exclusao', 'post');
    const res = fakeRes();

    await rodar(handler, fakeReq('ADMIN', { motivo: 'cadastro de teste' }), res);
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());

    expect(transaction).toHaveBeenCalled();
    expect(contactDeletionRequestCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contatoId: 'contato-1',
        solicitadoPorId: 'user-1',
        status: 'APROVADA',
        aprovadoPorId: 'user-1',
      }),
    });
    expect(contactUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'contato-1' }, data: expect.objectContaining({ excluidoEm: expect.any(Date) }) }),
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ excluidoImediatamente: true }));
    expect(res.status).not.toHaveBeenCalledWith(202);
  });

  it('SUPERVISOR: so cria a solicitacao pendente, nao exclui na hora', async () => {
    contactDeletionRequestCreate.mockResolvedValue({ id: 'req-1', status: 'PENDENTE' });
    const handler = handlerDe('/:id/exclusao', 'post');
    const res = fakeRes();

    await rodar(handler, fakeReq('SUPERVISOR', { motivo: 'cadastro de teste' }), res);
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());

    expect(transaction).not.toHaveBeenCalled();
    expect(contactUpdate).not.toHaveBeenCalled();
    expect(contactDeletionRequestCreate).toHaveBeenCalledWith({
      data: { contatoId: 'contato-1', solicitadoPorId: 'user-1', motivo: 'cadastro de teste' },
    });
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ excluidoImediatamente: false }));
  });

  it('COMERCIAL: tambem so cria a solicitacao pendente (mesmo caminho dos demais nao-ADMIN)', async () => {
    contactDeletionRequestCreate.mockResolvedValue({ id: 'req-1', status: 'PENDENTE' });
    const handler = handlerDe('/:id/exclusao', 'post');
    const res = fakeRes();

    await rodar(handler, fakeReq('COMERCIAL', { motivo: 'cadastro de teste' }), res);
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());

    expect(contactUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(202);
  });

  it('ja existe solicitacao pendente: recusa antes de decidir o fluxo, mesmo para ADMIN', async () => {
    contactDeletionRequestFindFirst.mockResolvedValue({ id: 'req-existente', status: 'PENDENTE' });
    const handler = handlerDe('/:id/exclusao', 'post');
    const res = fakeRes();

    await expect(
      comOrganizacao('org-1', () => new Promise<void>((resolve, reject) => handler(fakeReq('ADMIN', { motivo: 'cadastro de teste' }), res, (e) => (e ? reject(e) : resolve())))),
    ).rejects.toMatchObject({ status: 400 });

    expect(contactDeletionRequestCreate).not.toHaveBeenCalled();
    expect(contactUpdate).not.toHaveBeenCalled();
  });
});
