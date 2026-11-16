import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Handshake do Socket.IO: o token de usuario passa tambem pela versao de sessao.
 * Sem isso, quem teve a conta desativada ou o perfil rebaixado reconectaria com o
 * token antigo e voltaria a entrar nas salas do perfil que tinha.
 */

vi.mock('../lib/redis', () => ({ redis: {} }));
vi.mock('../lib/prisma', () => ({ prisma: {} }));
vi.mock('../lib/politicas', () => ({ conversaVisivel: vi.fn() }));
vi.mock('./hub', () => ({ registrarIo: vi.fn() }));
const validarSessao = vi.fn();
vi.mock('../lib/sessao', () => ({ validarSessao: (...a: unknown[]) => validarSessao(...a) }));

import { AppError } from '../lib/errors';
import { signAccessToken, signWebchatToken } from '../lib/tokens';
import { autenticarHandshake, situacaoDaSessao } from './server';

const base = { sub: 'u1', nome: 'Ana', email: 'ana@x.com', perfil: 'ADMIN' as const, org: 'org-1' };

beforeEach(() => {
  validarSessao.mockReset();
});

describe('autenticarHandshake', () => {
  it('sessao valida: devolve o usuario do token', async () => {
    validarSessao.mockResolvedValue(undefined);
    const r = await autenticarHandshake({ token: signAccessToken({ ...base, sv: 1 }) });
    expect(r.usuario).toMatchObject({ sub: 'u1', org: 'org-1', perfil: 'ADMIN', sv: 1 });
    expect(validarSessao).toHaveBeenCalledWith(expect.objectContaining({ sub: 'u1', sv: 1 }));
  });

  it('sessao revogada (token antigo apos rebaixar/desativar): recusa com 401', async () => {
    validarSessao.mockImplementation(async () => { throw new AppError(401, 'UNAUTHORIZED', 'Sessão encerrada'); });
    await expect(autenticarHandshake({ token: signAccessToken({ ...base, sv: 0 }) })).rejects.toMatchObject({ status: 401 });
  });

  it('banco indisponivel: recusa com 503, nao com 401', async () => {
    validarSessao.mockImplementation(async () => { throw new AppError(503, 'SESSAO_INDISPONIVEL', 'x'); });
    await expect(autenticarHandshake({ token: signAccessToken({ ...base, sv: 0 }) })).rejects.toMatchObject({ status: 503 });
  });

  it('token invalido nem chega a consultar o banco', async () => {
    await expect(autenticarHandshake({ token: 'lixo' })).rejects.toMatchObject({ status: 401 });
    expect(validarSessao).not.toHaveBeenCalled();
  });

  it('visitante do webchat segue como antes: sem consulta de versao de usuario', async () => {
    const sessao = signWebchatToken({ conversaId: 'c1', contatoId: 'k1', org: 'org-9' });
    const r = await autenticarHandshake({ sessao });
    expect(r).toEqual({ conversaId: 'c1', org: 'org-9' });
    expect(validarSessao).not.toHaveBeenCalled();
  });

  it('sem credencial: recusa', async () => {
    await expect(autenticarHandshake({})).rejects.toThrow('Credencial ausente');
  });
});

describe('situacaoDaSessao — socket ja aberto', () => {
  const usuario = { ...base, sv: 0 };

  it('sessao valida', async () => {
    validarSessao.mockResolvedValue(undefined);
    expect(await situacaoDaSessao(usuario)).toBe('valida');
  });

  it('401 do validador: revogada (o socket deve ser derrubado)', async () => {
    validarSessao.mockImplementation(async () => {
      throw new AppError(401, 'UNAUTHORIZED', 'Sessão encerrada');
    });
    expect(await situacaoDaSessao(usuario)).toBe('revogada');
  });

  it('503 do validador (banco fora): indisponivel — NAO e tratado como revogada nem como valida', async () => {
    validarSessao.mockImplementation(async () => {
      throw new AppError(503, 'SESSAO_INDISPONIVEL', 'x');
    });
    expect(await situacaoDaSessao(usuario)).toBe('indisponivel');
  });

  it('erro inesperado tambem e indisponivel (nao derruba por falha que nao e do usuario)', async () => {
    validarSessao.mockImplementation(async () => {
      throw new Error('bug');
    });
    expect(await situacaoDaSessao(usuario)).toBe('indisponivel');
  });
});
