import type { Role } from '@prisma/client';
import { badRequest } from '../../lib/errors';
import { MODULOS_EDITAVEIS, PERFIS_EDITAVEIS } from '../../lib/modulos';
import { prisma } from '../../lib/prisma';

export async function listarMatriz(): Promise<{ perfil: Role; modulos: string[] }[]> {
  const linhas = await prisma.modulePermission.findMany({ select: { perfil: true, modulo: true } });
  return PERFIS_EDITAVEIS.map((perfil) => ({ perfil, modulos: linhas.filter((l) => l.perfil === perfil).map((l) => l.modulo) }));
}

export async function substituirModulosDoPerfil(perfil: Role, modulos: string[]): Promise<void> {
  if (!(PERFIS_EDITAVEIS as readonly Role[]).includes(perfil)) throw badRequest('Perfil não configurável.');
  const invalidos = modulos.filter((m) => !(MODULOS_EDITAVEIS as readonly string[]).includes(m));
  if (invalidos.length) throw badRequest(`Módulo(s) inválido(s): ${invalidos.join(', ')}`);
  await prisma.$transaction(async (tx) => {
    await tx.modulePermission.deleteMany({ where: { perfil } });
    if (modulos.length) await tx.modulePermission.createMany({ data: [...new Set(modulos)].map((modulo) => ({ perfil, modulo })) });
  });
}
