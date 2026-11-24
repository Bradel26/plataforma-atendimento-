import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('../../lib/prisma', () => ({ prisma: { modulePermission: { findMany } } }));
import { exigirModuloDoRecurso } from './dados.routes';

/*
 * Exportar/importar CSV exige o modulo da matriz (crm ou relatorios, por
 * recurso), alem do perfil. Sem isso, desmarcar o modulo so escondia a tela.
 */
function rodar(perfil: string, recurso: string) {
  const req = { user: { sub: 'u-1', perfil, nome: 'F', email: 'f@x.com', org: 'org-1' }, params: { recurso } } as unknown as Request;
  return new Promise((resolve) => exigirModuloDoRecurso(req, {} as Response, resolve as NextFunction));
}

describe('dados — modulo exigido por recurso', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['contatos', 'leads', 'oportunidades', 'contas'])('SUPERVISOR sem crm recebe 403 em %s', async (recurso) => {
    findMany.mockResolvedValue([{ modulo: 'relatorios' }]);
    await expect(rodar('SUPERVISOR', recurso)).resolves.toMatchObject({ status: 403 });
  });

  it.each(['conversas', 'protocolos'])('SUPERVISOR sem relatorios recebe 403 em %s', async (recurso) => {
    findMany.mockResolvedValue([{ modulo: 'crm' }]);
    await expect(rodar('SUPERVISOR', recurso)).resolves.toMatchObject({ status: 403 });
  });

  it('SUPERVISOR com o modulo certo passa', async () => {
    findMany.mockResolvedValue([{ modulo: 'crm' }]);
    await expect(rodar('SUPERVISOR', 'contatos')).resolves.toBeUndefined();
  });

  it('recurso desconhecido segue adiante (a rota responde 404)', async () => {
    await expect(rodar('SUPERVISOR', 'xpto')).resolves.toBeUndefined();
  });

  it('ADMIN sempre passa', async () => {
    await expect(rodar('ADMIN', 'contatos')).resolves.toBeUndefined();
  });
});
