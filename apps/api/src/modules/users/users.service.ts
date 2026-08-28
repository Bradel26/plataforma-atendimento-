import type { AgentStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { conflict, notFound } from '../../lib/errors';
import { hashPassword } from '../../lib/password';
import { notificarStatusAgente } from '../../realtime/hub';
import { registrarPresenca } from '../metrics/metrics.service';
import { toPublicUser } from './users.serializer';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from './users.schemas';

export async function listUsers(query: ListUsersQuery) {
  const where: Prisma.UserWhereInput = {};
  if (query.perfil) where.perfil = query.perfil;
  if (query.ativo) where.ativo = query.ativo === 'true';
  if (query.busca) {
    where.OR = [
      { nome: { contains: query.busca, mode: 'insensitive' } },
      { email: { contains: query.busca, mode: 'insensitive' } },
    ];
  }

  const users = await prisma.user.findMany({ where, orderBy: { nome: 'asc' } });
  return users.map(toPublicUser);
}

export async function getUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw notFound('Usuario nao encontrado');
  return toPublicUser(user);
}

export async function createUser(input: CreateUserInput) {
  // findFirst e nao findUnique: o e-mail passou a ser unico POR organizacao, e a
  // pergunta certa e "ja existe nesta organizacao?" — que e o que o filtro da
  // extensao faz aqui.
  const existente = await prisma.user.findFirst({ where: { email: input.email } });
  if (existente) throw conflict('Ja existe um usuario com este email');

  const user = await prisma.user.create({
    data: {
      nome: input.nome,
      email: input.email,
      perfil: input.perfil,
      senhaHash: await hashPassword(input.senha),
    },
  });
  return toPublicUser(user);
}

export async function updateUser(id: string, input: UpdateUserInput) {
  const atual = await prisma.user.findUnique({ where: { id } });
  if (!atual) throw notFound('Usuario nao encontrado');

  if (input.email && input.email !== atual.email) {
    const emailEmUso = await prisma.user.findFirst({ where: { email: input.email } });
    if (emailEmUso) throw conflict('Ja existe um usuario com este email');
  }

  const { senha, ...resto } = input;
  const user = await prisma.user.update({
    where: { id },
    data: { ...resto, ...(senha ? { senhaHash: await hashPassword(senha) } : {}) },
  });
  return toPublicUser(user);
}

/** Desativacao logica — preserva o historico de atendimento do agente. */
export async function deactivateUser(id: string) {
  const atual = await prisma.user.findUnique({ where: { id } });
  if (!atual) throw notFound('Usuario nao encontrado');

  const user = await prisma.user.update({
    where: { id },
    data: { ativo: false, status: 'OFFLINE' },
  });
  return toPublicUser(user);
}

export async function updateStatus(id: string, status: AgentStatus) {
  const user = await prisma.user.update({ where: { id }, data: { status } });
  // Historico de presenca: base das horas trabalhadas no relatorio de jornada.
  await registrarPresenca(id, status);
  const publico = toPublicUser(user);
  // A gestao acompanha presenca em tempo real (base do Monitoramento, Fase 3).
  notificarStatusAgente(publico);
  return publico;
}
