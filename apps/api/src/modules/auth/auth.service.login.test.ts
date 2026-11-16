import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { alterarSenhaInicial, login } from './auth.service';

/*
 * Login: nenhuma resposta publica pode revelar se uma conta existe. Os casos
 * abaixo cobrem o que muda com a correcao (ambiguidade so depois da senha, mesma
 * resposta para e-mail inexistente e senha errada, bcrypt gasto nos dois) e o que
 * nao pode mudar (conta bloqueada, desativada, login normal).
 */

const usuarios: Array<Record<string, unknown>> = [];
const registrarFalha = vi.fn();
const garantirNaoBloqueado = vi.fn();
const limparFalhas = vi.fn();

vi.mock('../../lib/prisma', () => ({
  prisma: {
    user: {
      findMany: vi.fn(async ({ where }: { where: { email: string } }) =>
        usuarios.filter((u) => u.email === where.email).slice(0, 2),
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: object }) => ({
        ...usuarios.find((u) => u.id === where.id),
        ...data,
      })),
    },
  },
}));
vi.mock('./tentativas', () => ({
  garantirNaoBloqueado: (...a: unknown[]) => garantirNaoBloqueado(...a),
  registrarFalha: (...a: unknown[]) => registrarFalha(...a),
  limparFalhas: (...a: unknown[]) => limparFalhas(...a),
}));
vi.mock('../../lib/tokens', () => ({
  signAccessToken: () => 'access',
  issueRefreshToken: async () => 'refresh',
}));
vi.mock('../metrics/metrics.service', () => ({ registrarPresenca: vi.fn() }));
vi.mock('../../lib/modulos', () => ({ modulosPermitidos: async () => new Set<string>() }));
vi.mock('../../lib/tenant', () => ({
  comOrganizacao: async (_org: string, fn: () => unknown) => fn(),
}));
vi.mock('../users/users.serializer', () => ({ toPublicUser: (u: { id: string; email: string }) => ({ id: u.id, email: u.email }) }));


const criar = (id: string, organizacaoId: string, senha: string, extra: object = {}) => ({
  id,
  organizacaoId,
  email: 'ana@bradel.com.br',
  nome: 'Ana',
  perfil: 'AGENTE',
  status: 'OFFLINE',
  ativo: true,
  senhaPendente: false,
  senhaHash: bcrypt.hashSync(senha, 4),
  ...extra,
});

beforeEach(() => {
  usuarios.length = 0;
  registrarFalha.mockReset();
  garantirNaoBloqueado.mockReset();
  limparFalhas.mockReset();
});

const falhar = async (p: Promise<unknown>) => p.then(() => null, (e: { status: number; code: string; message: string }) => e);

describe('login — sem enumeracao de contas', () => {
  it('e-mail inexistente e senha errada recebem a MESMA resposta', async () => {
    usuarios.push(criar('u1', 'org-1', 'SenhaCorreta#1'));

    const inexistente = await falhar(login({ email: 'ninguem@x.com', senha: 'qualquer' }));
    const senhaErrada = await falhar(login({ email: 'ana@bradel.com.br', senha: 'errada' }));

    expect(inexistente).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    expect(senhaErrada).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    expect(inexistente!.message).toBe(senhaErrada!.message);
  });

  it('as duas falhas contam tentativa (varrer e-mails nao sai de graca)', async () => {
    usuarios.push(criar('u1', 'org-1', 'SenhaCorreta#1'));
    await falhar(login({ email: 'ninguem@x.com', senha: 'x' }));
    await falhar(login({ email: 'ana@bradel.com.br', senha: 'x' }));
    expect(registrarFalha).toHaveBeenCalledTimes(2);
  });

  it('e-mail inexistente gasta bcrypt (o tempo nao denuncia a conta)', async () => {
    const spy = vi.spyOn(bcrypt, 'compare');
    await falhar(login({ email: 'ninguem@x.com', senha: 'x' }));
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('e-mail em duas organizacoes + senha ERRADA nao revela a ambiguidade', async () => {
    usuarios.push(criar('u1', 'org-1', 'SenhaA#12345'), criar('u2', 'org-2', 'SenhaB#12345'));
    const erro = await falhar(login({ email: 'ana@bradel.com.br', senha: 'chute' }));
    expect(erro).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
  });

  it('e-mail em duas organizacoes, senha de UMA delas, entra nessa (nao ha mais beco sem saida)', async () => {
    usuarios.push(criar('u1', 'org-1', 'SenhaA#12345'), criar('u2', 'org-2', 'SenhaB#12345'));
    const sessao = await login({ email: 'ana@bradel.com.br', senha: 'SenhaB#12345' });
    expect(sessao.usuario.id).toBe('u2');
  });

  it('so quem prova a senha de ambas ve a ambiguidade', async () => {
    usuarios.push(criar('u1', 'org-1', 'MesmaSenha#1'), criar('u2', 'org-2', 'MesmaSenha#1'));
    const erro = await falhar(login({ email: 'ana@bradel.com.br', senha: 'MesmaSenha#1' }));
    expect(erro).toMatchObject({ status: 409, code: 'ORGANIZACAO_AMBIGUA' });
  });
});

describe('login — comportamento preservado', () => {
  it('conta bloqueada interrompe antes de qualquer consulta', async () => {
    garantirNaoBloqueado.mockRejectedValueOnce(Object.assign(new Error('bloqueada'), { status: 429, code: 'CONTA_BLOQUEADA' }));
    const erro = await falhar(login({ email: 'ana@bradel.com.br', senha: 'x' }));
    expect(erro).toMatchObject({ status: 429, code: 'CONTA_BLOQUEADA' });
  });

  it('login valido devolve sessao e zera as falhas', async () => {
    usuarios.push(criar('u1', 'org-1', 'SenhaCorreta#1'));
    const sessao = await login({ email: 'ana@bradel.com.br', senha: 'SenhaCorreta#1' });
    expect(sessao.accessToken).toBe('access');
    expect(limparFalhas).toHaveBeenCalled();
  });

  it('usuario desativado so e informado a quem acertou a senha', async () => {
    usuarios.push(criar('u1', 'org-1', 'SenhaCorreta#1', { ativo: false }));
    expect(await falhar(login({ email: 'ana@bradel.com.br', senha: 'errada' }))).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(await falhar(login({ email: 'ana@bradel.com.br', senha: 'SenhaCorreta#1' }))).toMatchObject({ status: 403, code: 'USER_INACTIVE' });
  });

  it('senha temporaria pendente exige a troca', async () => {
    usuarios.push(criar('u1', 'org-1', 'Temporaria#1', { senhaPendente: true }));
    expect(await falhar(login({ email: 'ana@bradel.com.br', senha: 'Temporaria#1' }))).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });
  });
});

describe('alterarSenhaInicial — sem enumeracao', () => {
  it('e-mail em duas organizacoes + senha errada devolve credencial invalida, nao ambiguidade', async () => {
    usuarios.push(criar('u1', 'org-1', 'A#12345678901'), criar('u2', 'org-2', 'B#12345678901'));
    const erro = await falhar(alterarSenhaInicial({ email: 'ana@bradel.com.br', senhaAtual: 'chute', novaSenha: 'NovaSenhaForte#2026' }));
    expect(erro).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
  });
});
