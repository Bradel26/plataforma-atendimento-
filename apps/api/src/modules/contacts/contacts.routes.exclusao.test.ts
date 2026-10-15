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
  contactDeletionRequestUpdate,
  contactUpdate,
  conversationUpdateMany,
  transaction,
} = vi.hoisted(() => ({
  contactFindFirst: vi.fn(),
  contactDeletionRequestFindFirst: vi.fn(),
  contactDeletionRequestCreate: vi.fn(),
  contactDeletionRequestUpdate: vi.fn(),
  contactUpdate: vi.fn(),
  conversationUpdateMany: vi.fn().mockResolvedValue({ count: 0 }),
  transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
    fn({
      contactDeletionRequest: { create: contactDeletionRequestCreate, update: contactDeletionRequestUpdate },
      contact: { update: contactUpdate },
      conversation: { updateMany: conversationUpdateMany },
    }),
  ),
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    contact: { findFirst: contactFindFirst, update: contactUpdate },
    contactDeletionRequest: { findFirst: contactDeletionRequestFindFirst, create: contactDeletionRequestCreate, update: contactDeletionRequestUpdate },
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

    // Sem isto, uma mensagem nova do mesmo numero reabre a conversa anonimizada
    // (`encontrarOuCriarContato`/`registrarMensagemEntrante` casam por
    // `status: { not: 'FINALIZADO' }`) e ela fica recebendo mensagem escondida
    // da caixa de entrada, que agora filtra `contato.excluidoEm`.
    expect(conversationUpdateMany).toHaveBeenCalledWith({
      where: { contatoId: 'contato-1', status: { not: 'FINALIZADO' } },
      data: { status: 'FINALIZADO', finalizadoEm: expect.any(Date) },
    });
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

  it('ja existe solicitacao pendente: recusa para quem nao e ADMIN', async () => {
    contactDeletionRequestFindFirst.mockResolvedValue({ id: 'req-existente', status: 'PENDENTE' });
    const handler = handlerDe('/:id/exclusao', 'post');
    const res = fakeRes();

    await expect(
      comOrganizacao('org-1', () => new Promise<void>((resolve, reject) => handler(fakeReq('SUPERVISOR', { motivo: 'cadastro de teste' }), res, (e) => (e ? reject(e) : resolve())))),
    ).rejects.toMatchObject({ status: 400 });

    expect(contactDeletionRequestCreate).not.toHaveBeenCalled();
    expect(contactUpdate).not.toHaveBeenCalled();
  });

  it('ADMIN: ja existe solicitacao pendente (ate de outra pessoa) -- resolve ela e exclui direto, nao recusa', async () => {
    contactDeletionRequestFindFirst.mockResolvedValue({ id: 'req-existente', status: 'PENDENTE' });
    contactDeletionRequestUpdate.mockResolvedValue({ id: 'req-existente', status: 'APROVADA' });
    const handler = handlerDe('/:id/exclusao', 'post');
    const res = fakeRes();

    await rodar(handler, fakeReq('ADMIN', { motivo: 'cadastro de teste' }), res);
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());

    expect(contactDeletionRequestCreate).not.toHaveBeenCalled();
    expect(contactDeletionRequestUpdate).toHaveBeenCalledWith({
      where: { id: 'req-existente' },
      data: expect.objectContaining({ status: 'APROVADA', aprovadoPorId: 'user-1', decididoEm: expect.any(Date) }),
    });
    expect(contactUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'contato-1' }, data: expect.objectContaining({ excluidoEm: expect.any(Date) }) }),
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ excluidoImediatamente: true }));
    expect(conversationUpdateMany).toHaveBeenCalledWith({
      where: { contatoId: 'contato-1', status: { not: 'FINALIZADO' } },
      data: { status: 'FINALIZADO', finalizadoEm: expect.any(Date) },
    });
  });
});
