import type { AgentStatus, Prisma } from '@prisma/client';
import { prisma, type ClienteDeEscrita } from '../../lib/prisma';
import { organizacaoAtual } from '../../lib/tenant';
import { exigirUsuarioDaOrganizacao } from '../../lib/politicas';
import { exigirFilialDaOrganizacao } from '../filiais/filiais.service';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { acessoDoUsuario } from '../esteira/acesso';
import { hashPassword } from '../../lib/password';
import { desconectarUsuario, notificarStatusAgente } from '../../realtime/hub';
import { invalidarSessaoLocal } from '../../lib/sessao';
import { registrarPresenca } from '../metrics/metrics.service';
import { toPublicUser } from './users.serializer';
import type { CreateUserInput, ListUsersQuery, OperacoesUsuarioInput, UpdateUserInput } from './users.schemas';

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

/** Usuário da organização atual (a extensão de tenant filtra), ou 404. */
async function usuarioDaOrganizacao(id: string) {
  const user = await prisma.user.findFirst({ where: { id }, select: { id: true, perfil: true } });
  if (!user) throw notFound('Usuário não encontrado');
  return user;
}

/** Nível efetivo do usuário nas operações (já aplicando o padrão EDICAO). */
export async function getOperacoesUsuario(id: string) {
  const user = await usuarioDaOrganizacao(id);
  return acessoDoUsuario(user.id, user.perfil);
}

/** Grava só exceções: EDICAO/null apagam a linha, LEITURA/SEM_ACESSO fazem upsert. */
export async function setOperacoesUsuario(id: string, input: OperacoesUsuarioInput) {
  const user = await usuarioDaOrganizacao(id);
  if (user.perfil === 'ADMIN') throw badRequest('Administradores sempre acessam as duas operações');

  for (const operacao of ['TIM', 'STARLINK'] as const) {
    const nivel = input[operacao];
    if (nivel === undefined) continue;
    if (nivel === null || nivel === 'EDICAO') {
      await prisma.usuarioOperacao.deleteMany({ where: { usuarioId: id, operacao } });
    } else {
      await prisma.usuarioOperacao.upsert({
        where: { usuarioId_operacao: { usuarioId: id, operacao } },
        create: { usuarioId: id, operacao, nivel },
        update: { nivel },
      });
    }
  }
  return acessoDoUsuario(user.id, user.perfil);
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
  // O hash e caro (bcrypt): calculado antes de abrir a secao, para nao segurar o
  // bloqueio da organizacao enquanto a CPU trabalha.
  const senhaHash = senha ? await hashPassword(senha) : undefined;

  const { user, revogou } = await emSecaoDeAdmins(async (tx) => {
    // Relido DENTRO da secao: o `atual` de cima pode ter mudado entre a leitura e
    // o bloqueio, e a decisao "e o ultimo ADMIN?" so vale sobre o estado atual.
    const alvo = await tx.user.findUnique({ where: { id } });
    if (!alvo) throw notFound('Usuário não encontrado');

    const deixaDeSerAdminAtivo =
      alvo.perfil === 'ADMIN' && alvo.ativo && ((resto.perfil && resto.perfil !== 'ADMIN') || resto.ativo === false);
    if (deixaDeSerAdminAtivo) {
      await exigirOutroAdminAtivo(tx, id, 'Não é possível desativar ou rebaixar o último administrador ativo');
    }

    // Perfil, senha ou desativacao encerram as sessoes ja emitidas. O incremento vai
    // NA MESMA escrita da mudanca: nao existe estado em que o perfil mudou e a
    // sessao antiga ainda vale, nem o inverso, mesmo se o processo cair no meio.
    const revogaSessoes =
      Boolean(senhaHash) ||
      (resto.perfil !== undefined && resto.perfil !== alvo.perfil) ||
      (resto.ativo === false && alvo.ativo);

    const atualizado = await tx.user.update({
      where: { id },
      data: {
        ...resto,
        ...(senhaHash ? { senhaHash } : {}),
        ...(revogaSessoes ? { sessaoVersao: { increment: 1 } } : {}),
      },
    });
    return { user: atualizado, revogou: revogaSessoes };
  });
  if (revogou) aposRevogarSessoes(id);
  return toPublicUser(user);
}

/**
 * Efeitos DEPOIS do commit de uma revogacao: esquecer o cache local (a validacao
 * seguinte ja le a versao nova) e derrubar os sockets abertos da pessoa.
 *
 * Nao entram na transacao de proposito: a verdade e a versao gravada no banco, e
 * ela ja esta commitada. Se o passo dos sockets falhar, o erro e registrado e a
 * operacao NAO e desfeita — o socket aberto fica ate reconectar (o handshake
 * recusa a sessao revogada), e isso e um risco residual declarado, nao silencio.
 */
function aposRevogarSessoes(usuarioId: string) {
  const organizacaoId = organizacaoAtual();
  invalidarSessaoLocal(organizacaoId, usuarioId);
  try {
    desconectarUsuario(organizacaoId, usuarioId);
  } catch (erro) {
    console.error(
      `[sessao] sessões revogadas, mas falhou ao desconectar os sockets do usuário ${usuarioId}:`,
      erro instanceof Error ? erro.message : erro,
    );
  }
}

/**
 * Secao critica "mexer em quem e administrador" de uma organizacao.
 *
 * "Nunca zerar os ADMIN ativos" e uma regra sobre o CONJUNTO de usuarios, e uma
 * contagem seguida de escrita nao a protege: dois administradores rebaixados ao
 * mesmo tempo leem, cada um, "ha outro ADMIN" e ambos gravam — a organizacao
 * fica sem administrador. Por isso as tres operacoes que podem reduzir o numero
 * de ADMIN ativos (`updateUser`, `deactivateUser`, `deleteUserPermanently`)
 * passam por aqui, e so por aqui.
 *
 * O bloqueio e `pg_advisory_xact_lock` por organizacao, tomado no inicio de uma
 * transacao e solto no commit/rollback — nao existe "esquecer de soltar". A
 * segunda operacao espera a primeira terminar e entao conta sobre o estado ja
 * gravado. Vale tambem atras de pooler em modo transacao (Neon), porque o lock
 * vive dentro da transacao. O bloqueio e por organizacao: uma empresa nao espera
 * a outra.
 */
async function emSecaoDeAdmins<T>(fn: (tx: ClienteDeEscrita) => Promise<T>): Promise<T> {
  const organizacaoId = organizacaoAtual();
  return prisma.$transaction(async (tx) => {
    // `$executeRaw` e nao `$queryRaw`: a funcao devolve `void`, que o Prisma nao
    // sabe desserializar numa consulta.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`admins:${organizacaoId}`}, 0))`;
    return fn(tx);
  });
}

/** Recusa a operacao se `id` for o unico ADMIN ativo. Chamar so dentro de `emSecaoDeAdmins`. */
async function exigirOutroAdminAtivo(tx: ClienteDeEscrita, id: string, mensagem: string) {
  const outros = await tx.user.count({ where: { perfil: 'ADMIN', ativo: true, id: { not: id } } });
  if (outros === 0) throw conflict(mensagem);
}

/** Desativacao logica — preserva o historico de atendimento do agente. */
export async function deactivateUser(id: string) {
  const user = await emSecaoDeAdmins(async (tx) => {
    const atual = await tx.user.findUnique({ where: { id } });
    if (!atual) throw notFound('Usuário não encontrado');

    if (atual.perfil === 'ADMIN' && atual.ativo) {
      await exigirOutroAdminAtivo(tx, id, 'Não é possível desativar o último administrador ativo');
    }

    return tx.user.update({
      where: { id },
      data: { ativo: false, status: 'OFFLINE', sessaoVersao: { increment: 1 } },
    });
  });
  aposRevogarSessoes(id);
  return toPublicUser(user);
}

/** Exclui definitivamente a conta selecionada; historicos com autoria opcional ficam preservados. */
export async function deleteUserPermanently(id: string) {
  const atual = await emSecaoDeAdmins(async (tx) => {
    const alvo = await tx.user.findUnique({ where: { id } });
    if (!alvo) throw notFound('Usuário não encontrado');

    if (alvo.perfil === 'ADMIN' && alvo.ativo) {
      await exigirOutroAdminAtivo(tx, id, 'Não é possível excluir o último administrador ativo');
    }

    await tx.user.delete({ where: { id } });
    return alvo;
  });
  // Sem linha, `validarSessao` recusa (401): o que falta e soltar o cache e os sockets.
  aposRevogarSessoes(id);
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
