import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

/*
 * `requireAuth` agora valida a VERSAO da sessao contra o banco. O que cada caso
 * garante: sessao recusada nao entra no handler (nem `req.user`, nem contexto de
 * organizacao); falha do banco e 503 e nao 401; sessao valida segue como antes,
 * com a organizacao e o usuario no contexto.
 */

vi.mock('../../lib/redis', () => ({ redis: {} }));
const validarSessao = vi.fn();
vi.mock('../../lib/sessao', () => ({ validarSessao: (...a: unknown[]) => validarSessao(...a) }));

import { requireAuth } from './auth';
import { signAccessToken } from '../../lib/tokens';
import { AppError } from '../../lib/errors';
import { contextoAtual } from '../../lib/tenant';

const payload = { sub: 'u1', nome: 'Ana', email: 'ana@x.com', perfil: 'SUPORTE' as const, org: 'org-1' };
const reqCom = (token?: string) =>
  ({ headers: token ? { authorization: `Bearer ${token}` } : {} }) as unknown as Request & { user?: unknown };

/** Roda o middleware e devolve o que `next` recebeu, mais o contexto visto la dentro. */
function executar(req: Request) {
  return new Promise<{ erro: unknown; contexto: ReturnType<typeof contextoAtual>; chamouNext: boolean }>((resolve) => {
    requireAuth(req, {} as Response, (erro?: unknown) =>
      resolve({ erro, contexto: contextoAtual(), chamouNext: true }),
    );
  });
}

beforeEach(() => {
  validarSessao.mockReset();
});

describe('requireAuth — versao de sessao', () => {
  it('sessao valida: chama next sem erro, com req.user e o contexto da organizacao', async () => {
    validarSessao.mockResolvedValue(undefined);
    const req = reqCom(signAccessToken({ ...payload, sv: 2 }));

    const r = await executar(req);

    expect(r.erro).toBeUndefined();
    expect(req.user).toMatchObject({ sub: 'u1', org: 'org-1', sv: 2 });
    expect(r.contexto).toMatchObject({ organizacaoId: 'org-1', usuario: { id: 'u1', perfil: 'SUPORTE' } });
    // A validacao recebeu o que vem do token — org e versao inclusive.
    expect(validarSessao).toHaveBeenCalledWith(expect.objectContaining({ sub: 'u1', org: 'org-1', sv: 2 }));
  });

  it('sessao recusada (401): next recebe o erro, e NEM req.user NEM o contexto sao preenchidos', async () => {
    validarSessao.mockImplementation(async () => { throw new AppError(401, 'UNAUTHORIZED', 'Sessão encerrada'); });
    const req = reqCom(signAccessToken({ ...payload, sv: 0 }));

    const r = await executar(req);

    expect(r.erro).toMatchObject({ status: 401 });
    expect(req.user).toBeUndefined();
    expect(r.contexto).toBeUndefined();
  });

  it('banco indisponivel: 503 chega ao cliente (nao vira 401), sem req.user', async () => {
    validarSessao.mockImplementation(async () => { throw new AppError(503, 'SESSAO_INDISPONIVEL', 'x'); });
    const req = reqCom(signAccessToken({ ...payload, sv: 0 }));

    const r = await executar(req);

    expect(r.erro).toMatchObject({ status: 503, code: 'SESSAO_INDISPONIVEL' });
    expect(req.user).toBeUndefined();
  });

  it('token legado (sem sv) e repassado a validacao sem sv — quem decide e o validador', async () => {
    validarSessao.mockResolvedValue(undefined);
    await executar(reqCom(signAccessToken(payload)));
    expect(validarSessao.mock.calls[0]![0].sv).toBeUndefined();
  });

  it('sem header ou token invalido: 401 sem consultar o banco', async () => {
    const semHeader = await executar(reqCom());
    expect(semHeader.erro).toMatchObject({ status: 401 });

    const invalido = await executar(reqCom('lixo.lixo.lixo'));
    expect(invalido.erro).toMatchObject({ status: 401 });

    expect(validarSessao).not.toHaveBeenCalled();
  });

  it('requisicoes simultaneas nao misturam contexto entre organizacoes', async () => {
    validarSessao.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, Math.random() * 5));
    });
    const reqs = ['org-a', 'org-b', 'org-c', 'org-d'].map((org) => ({
      org,
      req: reqCom(signAccessToken({ ...payload, org, sv: 0 })),
    }));

    const resultados = await Promise.all(reqs.map(({ req }) => executar(req)));

    resultados.forEach((r, i) => expect(r.contexto).toMatchObject({ organizacaoId: reqs[i]!.org }));
  });
});
