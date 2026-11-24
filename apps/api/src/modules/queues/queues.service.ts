import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { EM_ATENDIMENTO_ATIVO } from '../conversations/conversations.estados';
import { CAPACIDADE_PADRAO, escolherAgenteDaFila } from './roteamento';
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

/**
 * Sugestao do proximo agente (ver `escolherAgenteDaFila`). Le presenca e carga
 * do banco; nao atribui nada. Sem limite de conversas por
 * agente (decisao do negocio); `capacidadeMaxima` volta nulo.
 */
export async function sugerirAgenteDaFila(filaId: string) {
  const r = await calcularSugestaoDaFila(filaId);
  if (!r) throw notFound('Fila não encontrada');
  console.info('[fila][proximo-agente]', JSON.stringify({ filaId, sugerido: r.sugerido?.id ?? null, elegiveis: r.elegiveis.length, excluidos: r.excluidos }));
  return { filaId, capacidadeMaxima: Number.isFinite(CAPACIDADE_PADRAO) ? CAPACIDADE_PADRAO : null, ...r };
}

/** Calculo puro de leitura (sem log), compartilhado com a atribuicao automatica. Nulo se a fila nao existe. */
export async function calcularSugestaoDaFila(filaId: string) {
  const fila = await prisma.queue.findUnique({
    where: { id: filaId },
    include: { agentes: { include: { usuario: { select: { id: true, nome: true, status: true, ativo: true } } } } },
  });
  if (!fila) return null;
  const membros = fila.agentes.map((v) => v.usuario).filter((u) => u.ativo);
  const ids = membros.map((u) => u.id);
  const [cargas, ultimas] = await Promise.all([
    prisma.conversation.groupBy({
      by: ['agenteId'],
      where: { agenteId: { in: ids }, status: { in: [...EM_ATENDIMENTO_ATIVO] } },
      _count: { _all: true },
    }),
    prisma.conversation.groupBy({ by: ['agenteId'], where: { agenteId: { in: ids } }, _max: { atribuidoEm: true } }),
  ]);
  const carga = new Map(cargas.map((g) => [g.agenteId, g._count._all]));
  const ultima = new Map(ultimas.map((g) => [g.agenteId, g._max.atribuidoEm]));
  const r = escolherAgenteDaFila(
    membros.map((u) => ({
      id: u.id,
      nome: u.nome,
      status: u.status,
      conversasAtivas: carga.get(u.id) ?? 0,
      ultimaAtribuicaoEm: ultima.get(u.id) ?? null,
    })),
    CAPACIDADE_PADRAO,
  );
  return r;
}
