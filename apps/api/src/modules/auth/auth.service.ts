import { prisma } from '../../lib/prisma';
import { AppError, unauthorized } from '../../lib/errors';
import { verifyPassword } from '../../lib/password';
import { issueRefreshToken, signAccessToken } from '../../lib/tokens';
import { registrarPresenca } from '../metrics/metrics.service';
import { toPublicUser } from '../users/users.serializer';
import type { LoginInput } from './auth.schemas';

const CREDENCIAIS_INVALIDAS = new AppError(401, 'INVALID_CREDENTIALS', 'Email ou senha incorretos');

export async function login({ email, senha }: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) throw CREDENCIAIS_INVALIDAS;

  const senhaOk = await verifyPassword(senha, user.senhaHash);
  if (!senhaOk) throw CREDENCIAIS_INVALIDAS;
  if (!user.ativo) throw new AppError(403, 'USER_INACTIVE', 'Usuario desativado — procure um administrador');

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
  });
  const refreshToken = await issueRefreshToken(user.id);
  return { accessToken, refreshToken, usuario: toPublicUser(user) };
}

export async function marcarOffline(userId: string) {
  await prisma.user
    .update({ where: { id: userId }, data: { status: 'OFFLINE' } })
    .then(() => registrarPresenca(userId, 'OFFLINE'))
    .catch(() => undefined);
}
