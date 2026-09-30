import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { toPublicUser } from '../users/users.serializer';
import type { z } from 'zod';
import type { createQueueSchema, updateQueueSchema } from './queues.schemas';

const comAgentes = { agentes: { include: { usuario: true } } } as const;

type QueueWithAgents = Prisma.QueueGetPayload<{ include: typeof comAgentes }>;

function serialize(fila: QueueWithAgents) {
  return {
    id: fila.id,
    nome: fila.nome,
    descricao: fila.descricao,
    canalPadrao: fila.canalPadrao,
    ativa: fila.ativa,
    criadoEm: fila.criadoEm,
    agentes: fila.agentes.map((v) => toPublicUser(v.usuario)),
  };
}

export async function listQueues() {
  const filas = await prisma.queue.findMany({ include: comAgentes, orderBy: { nome: 'asc' } });
  return filas.map(serialize);
}

export async function getQueue(id: string) {
  const fila = await prisma.queue.findUnique({ where: { id }, include: comAgentes });
  if (!fila) throw notFound('Fila não encontrada');
  return serialize(fila);
}

export async function createQueue(input: z.infer<typeof createQueueSchema>) {
  const existente = await prisma.queue.findFirst({ where: { nome: input.nome } });
  if (existente) throw conflict('Já existe uma fila com este nome');

  const fila = await prisma.queue.create({ data: input, include: comAgentes });
  return serialize(fila);
}

export async function updateQueue(id: string, input: z.infer<typeof updateQueueSchema>) {
  const atual = await prisma.queue.findUnique({ where: { id } });
  if (!atual) throw notFound('Fila não encontrada');

  if (input.nome && input.nome !== atual.nome) {
    const nomeEmUso = await prisma.queue.findFirst({ where: { nome: input.nome } });
    if (nomeEmUso) throw conflict('Já existe uma fila com este nome');
  }

  const fila = await prisma.queue.update({ where: { id }, data: input, include: comAgentes });
  return serialize(fila);
}

export async function deleteQueue(id: string) {
  const atual = await prisma.queue.findUnique({ where: { id } });
  if (!atual) throw notFound('Fila não encontrada');
  await prisma.queue.delete({ where: { id } });
}

export async function vincularAgente(filaId: string, usuarioId: string) {
  const [fila, usuario] = await Promise.all([
    prisma.queue.findUnique({ where: { id: filaId } }),
    prisma.user.findUnique({ where: { id: usuarioId } }),
  ]);
  if (!fila) throw notFound('Fila não encontrada');
  if (!usuario) throw notFound('Usuário não encontrado');
  if (usuario.perfil === 'ADMIN') throw badRequest('Administradores não entram em fila de atendimento');

  const vinculo = await prisma.queueAgent.findUnique({ where: { filaId_usuarioId: { filaId, usuarioId } } });
  if (vinculo) throw conflict('Agente já vinculado a esta fila');

  await prisma.queueAgent.create({ data: { filaId, usuarioId } });
  return getQueue(filaId);
}

export async function desvincularAgente(filaId: string, usuarioId: string) {
  const vinculo = await prisma.queueAgent.findUnique({ where: { filaId_usuarioId: { filaId, usuarioId } } });
  if (!vinculo) throw notFound('Vínculo não encontrado');

  await prisma.queueAgent.delete({ where: { id: vinculo.id } });
  return getQueue(filaId);
}
