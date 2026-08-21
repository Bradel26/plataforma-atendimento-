import type { User } from '@prisma/client';

/** Nunca exponha senhaHash — todo retorno de usuario passa por aqui. */
export function toPublicUser(user: User) {
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    perfil: user.perfil,
    status: user.status,
    ativo: user.ativo,
    ultimoLogin: user.ultimoLogin,
    criadoEm: user.criadoEm,
  };
}

export type PublicUser = ReturnType<typeof toPublicUser>;
