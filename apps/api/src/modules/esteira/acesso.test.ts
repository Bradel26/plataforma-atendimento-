import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('../../lib/prisma', () => ({ prisma: { usuarioOperacao: { findMany } } }));
import { comOrganizacao } from '../../lib/tenant';
import { exigirOperacao, nivelEfetivo, podeForcar, resolverAcesso } from './acesso';

describe('nivelEfetivo', () => {
  it('usuário sem linhas acessa as duas com EDICAO', () => {
    expect(nivelEfetivo('COMERCIAL', [])).toEqual({ TIM: 'EDICAO', STARLINK: 'EDICAO' });
  });
  it('linha LEITURA restringe só aquela operação', () => {
    expect(nivelEfetivo('COMERCIAL', [{ operacao: 'TIM', nivel: 'LEITURA' }])).toEqual({ TIM: 'LEITURA', STARLINK: 'EDICAO' });
  });
  it('SEM_ACESSO some do resultado', () => {
    expect(nivelEfetivo('COMERCIAL', [{ operacao: 'STARLINK', nivel: 'SEM_ACESSO' }])).toEqual({ TIM: 'EDICAO' });
  });
  it('ADMIN ignora as linhas', () => {
    expect(nivelEfetivo('ADMIN', [{ operacao: 'TIM', nivel: 'SEM_ACESSO' }])).toEqual({ TIM: 'EDICAO', STARLINK: 'EDICAO' });
  });
});

describe('podeForcar', () => {
  it('chefia com EDICAO pode', () => {
    expect(podeForcar('GESTOR', 'EDICAO')).toBe(true);
    expect(podeForcar('ADMIN', 'EDICAO')).toBe(true);
  });
  it('comercial não, e LEITURA não', () => {
    expect(podeForcar('COMERCIAL', 'EDICAO')).toBe(false);
    expect(podeForcar('SUPERVISOR', 'LEITURA')).toBe(false);
    expect(podeForcar('GESTOR', undefined)).toBe(false);
  });
});

describe('resolverAcesso', () => {
  it('sem acesso à operação é NAO_ENCONTRADO', () => {
    expect(resolverAcesso({ TIM: 'EDICAO' }, 'STARLINK', 'LEITURA')).toBe('NAO_ENCONTRADO');
  });
  it('LEITURA pedindo EDICAO é PROIBIDO', () => {
    expect(resolverAcesso({ TIM: 'LEITURA' }, 'TIM', 'EDICAO')).toBe('PROIBIDO');
  });
  it('níveis suficientes passam', () => {
    expect(resolverAcesso({ TIM: 'LEITURA' }, 'TIM', 'LEITURA')).toBe('OK');
    expect(resolverAcesso({ TIM: 'EDICAO' }, 'TIM', 'EDICAO')).toBe('OK');
  });
});

describe('exigirOperacao', () => {
  beforeEach(() => vi.clearAllMocks());

  function rodar(nivel: 'LEITURA' | 'EDICAO', operacao: string, perfil = 'COMERCIAL') {
    const res = { locals: {} } as unknown as Response;
    const req = { params: { operacao } } as unknown as Request;
    return new Promise<{ erro: unknown; res: Response }>((resolve) => {
      comOrganizacao(
        'org-1',
        () => exigirOperacao(nivel)(req, res, ((erro?: unknown) => resolve({ erro, res })) as NextFunction),
        { id: 'u-1', perfil },
      );
    });
  }

  it('/starlink para usuário só-TIM dá 404', async () => {
    findMany.mockResolvedValue([{ operacao: 'STARLINK', nivel: 'SEM_ACESSO' }]);
    expect((await rodar('LEITURA', 'starlink')).erro).toMatchObject({ status: 404 });
  });
  it('operação inválida dá 404', async () => {
    findMany.mockResolvedValue([]);
    expect((await rodar('LEITURA', 'xpto')).erro).toMatchObject({ status: 404 });
  });
  it('só LEITURA em rota de EDICAO dá 403', async () => {
    findMany.mockResolvedValue([{ operacao: 'TIM', nivel: 'LEITURA' }]);
    expect((await rodar('EDICAO', 'tim')).erro).toMatchObject({ status: 403 });
  });
  it('acesso ok grava res.locals', async () => {
    findMany.mockResolvedValue([]);
    const { erro, res } = await rodar('EDICAO', 'tim');
    expect(erro).toBeUndefined();
    expect(res.locals).toMatchObject({ operacao: 'TIM', nivelOperacao: 'EDICAO' });
  });
});
