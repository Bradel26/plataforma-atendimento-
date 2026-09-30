import type { AgentStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { exigirUsuarioDaOrganizacao } from '../../lib/politicas';
import { exigirFilialDaOrganizacao } from '../filiais/filiais.service';
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
  if (!user) throw notFound('Usuário não encontrado');
  return toPublicUser(user);
}

export async function createUser(input: CreateUserInput) {
  // findFirst e nao findUnique: o e-mail passou a ser unico POR organizacao, e a
  // pergunta certa e "ja existe nesta organizacao?" — que e o que o filtro da
  // extensao faz aqui.
  const existente = await prisma.user.findFirst({ where: { email: input.email } });
  if (existente) throw conflict('Já existe um usuário com este email');

  const user = await prisma.user.create({
    data: {
      nome: input.nome,
      email: input.email,
      perfil: input.perfil,
      senhaHash: await hashPassword(input.senha),
      senhaPendente: true,
    },
  });
  return toPublicUser(user);
}

export async function updateUser(id: string, input: UpdateUserInput) {
  const atual = await prisma.user.findUnique({ where: { id } });
  if (!atual) throw notFound('Usuário não encontrado');

  if (input.email && input.email !== atual.email) {
    const emailEmUso = await prisma.user.findFirst({ where: { email: input.email } });
    if (emailEmUso) throw conflict('Já existe um usuário com este email');
  }

  /*
   * O gestor tem de existir nesta organizacao, e nao pode ser a propria pessoa.
   *
   * Ciclo de um no e o unico que da para formar com um nivel de hierarquia, e
   * ele seria silencioso: `equipeIds` ja inclui o proprio usuario, entao alguem
   * como gestor de si mesmo nao mudaria nada hoje — e viraria um ciclo de
   * verdade no dia em que a arvore recursiva existir.
   */
  if (input.gestorId) {
    if (input.gestorId === id) throw conflict('Um usuário não pode ser gestor de si mesmo');
    await exigirUsuarioDaOrganizacao(input.gestorId);
  }

  if (input.filialId) await exigirFilialDaOrganizacao(input.filialId);

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
  if (!atual) throw notFound('Usuário não encontrado');

  const user = await prisma.user.update({
    where: { id },
    data: { ativo: false, status: 'OFFLINE' },
  });
  return toPublicUser(user);
}

/** Exclui definitivamente a conta selecionada; historicos com autoria opcional ficam preservados. */
export async function deleteUserPermanently(id: string) {
  const atual = await prisma.user.findUnique({ where: { id } });
  if (!atual) throw notFound('Usuário não encontrado');

  if (atual.perfil === 'ADMIN' && atual.ativo) {
    const outrosAdministradores = await prisma.user.count({
      where: { perfil: 'ADMIN', ativo: true, id: { not: id } },
    });
    if (outrosAdministradores === 0) throw conflict('Não é possível excluir o último administrador ativo');
  }

  await prisma.user.delete({ where: { id } });
  return toPublicUser(atual);
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

/**
 * Heartbeat do front: a aba avisa "ainda estou aqui" enquanto fica visivel.
 *
 * So atualiza uma coluna — nao mexe em status nem em presenca. A cada ping o
 * front normalmente nao mudou de status, e tratar isto como troca de status
 * abriria um PresenceLog novo a cada minuto.
 */
export async function registrarHeartbeat(id: string) {
  await prisma.user.update({ where: { id }, data: { ultimoHeartbeat: new Date() } });
}

/** Depois de quanto tempo sem heartbeat um agente e considerado inativo. */
export const LIMITE_INATIVIDADE_MS = 3 * 60 * 1000;

/**
 * Fecha a presenca de quem parou de mandar heartbeat — fechou a aba, o
 * computador travou, caiu a rede — sem nunca ter clicado em "Sair".
 *
 * Sem isto, "No status" no Monitoramento (`segundosNoStatus`) fica contando
 * para sempre a partir da ultima troca manual de status: a pessoa aparece
 * "Disponivel ha 3 dias" mesmo tendo saido ha 3 dias.
 *
 * So considera quem ja mandou pelo menos um heartbeat OU logou ha mais tempo
 * que o limite: usuario recem-criado, que nunca logou, nao pode ser marcado
 * offline por um job que roda antes de ele nunca ter entrado.
 */
export async function encerrarPresencasInativas() {
  const limite = new Date(Date.now() - LIMITE_INATIVIDADE_MS);
  const inativos = await prisma.user.findMany({
    where: {
      status: { not: 'OFFLINE' },
      OR: [{ ultimoHeartbeat: { lt: limite } }, { ultimoHeartbeat: null, ultimoLogin: { lt: limite } }],
    },
    select: { id: true },
  });

  for (const { id } of inativos) {
    await updateStatus(id, 'OFFLINE');
  }

  return inativos.length;
}
