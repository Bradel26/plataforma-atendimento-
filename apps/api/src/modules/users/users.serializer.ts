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
    /** Filial desta pessoa (item 6.5). Exposto porque a tela de usuarios agora edita este campo. */
    filialId: user.filialId,
  };
}

export type PublicUser = ReturnType<typeof toPublicUser>;
