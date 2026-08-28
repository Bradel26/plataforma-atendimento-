import { prisma } from '../../lib/prisma';
import { AppError, unauthorized } from '../../lib/errors';
import { verifyPassword } from '../../lib/password';
import { issueRefreshToken, signAccessToken } from '../../lib/tokens';
import { registrarPresenca } from '../metrics/metrics.service';
import { toPublicUser } from '../users/users.serializer';
import type { LoginInput } from './auth.schemas';
import { garantirNaoBloqueado, limparFalhas, registrarFalha } from './tentativas';

const CREDENCIAIS_INVALIDAS = new AppError(401, 'INVALID_CREDENTIALS', 'Email ou senha incorretos');

export async function login({ email, senha }: LoginInput) {
  await garantirNaoBloqueado(email);

  /*
   * O e-mail deixou de ser identificador global: ele e unico POR organizacao.
   *
   * `take: 2` em vez de `findFirst` de proposito. Com `findFirst`, duas pessoas
   * com o mesmo e-mail em organizacoes diferentes fariam o login entrar sempre na
   * primeira que o banco devolvesse — silenciosamente, e sem jeito de a segunda
   * pessoa entrar nunca. Ler duas transforma isso em pergunta em vez de sorteio.
   */
  const candidatos = await prisma.user.findMany({ where: { email: email.toLowerCase() }, take: 2 });
  if (candidatos.length > 1) {
    throw new AppError(
      409,
      'ORGANIZACAO_AMBIGUA',
      'Este e-mail existe em mais de uma organizacao. Informe qual delas.',
    );
  }

  const user = candidatos[0];
  if (!user) {
    // Conta o erro mesmo sem usuario: sem isso, varrer emails sai de graca.
    await registrarFalha(email);
    throw CREDENCIAIS_INVALIDAS;
  }

  const senhaOk = await verifyPassword(senha, user.senhaHash);
  if (!senhaOk) {
    await registrarFalha(email);
    throw CREDENCIAIS_INVALIDAS;
  }
  if (!user.ativo) throw new AppError(403, 'USER_INACTIVE', 'Usuario desativado — procure um administrador');

  await limparFalhas(email);

  const atualizado = await prisma.user.update({
    where: { id: user.id },
    data: {
      ultimoLogin: new Date(),
      status: user.status === 'OFFLINE' ? 'DISPONIVEL' : user.status,
    },
  });
  // O login abre a jornada: sem este registro o relatorio de horas comecaria
  // apenas na primeira troca manual de status.
  await registrarPresenca(atualizado.id, atualizado.status);

  return buildSession(atualizado);
}

/** Emite um novo par de tokens a partir de um refresh token ja validado. */
export async function sessionForUserId(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.ativo) throw unauthorized('Sessao invalida, faca login novamente');
  return buildSession(user);
}

async function buildSession(user: Awaited<ReturnType<typeof prisma.user.findUniqueOrThrow>>) {
  const accessToken = signAccessToken({
    sub: user.id,
    nome: user.nome,
    email: user.email,
    perfil: user.perfil,
    org: user.organizacaoId,
  });
  const refreshToken = await issueRefreshToken(user.id, user.organizacaoId);
  return { accessToken, refreshToken, usuario: toPublicUser(user) };
}

export async function marcarOffline(userId: string) {
  await prisma.user
    .update({ where: { id: userId }, data: { status: 'OFFLINE' } })
    .then(() => registrarPresenca(userId, 'OFFLINE'))
    .catch(() => undefined);
}
