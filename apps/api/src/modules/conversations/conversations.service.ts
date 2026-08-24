import type { Prisma, Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { notificarConversaAtualizada, notificarMensagem } from '../../realtime/hub';
import { enviarParaCanal, exigeEnvioExterno } from '../channels/outbound.service';
import { criarPesquisa } from '../surveys/surveys.service';
import {
  inclusaoDetalhe,
  inclusaoResumo,
  toConversaDetalhe,
  toConversaResumo,
  toMensagem,
} from './conversations.serializer';
import type { ListarConversasQuery, TransferirInput } from './conversations.schemas';

export type Solicitante = { sub: string; perfil: Role; nome: string };

const eGestao = (perfil: Role) => perfil === 'ADMIN' || perfil === 'SUPERVISOR';

/**
 * Agente ve as conversas dele e as que estao em espera nas filas em que atua.
 * Gestao ve tudo.
 */
async function escopoVisivel(solicitante: Solicitante): Promise<Prisma.ConversationWhereInput> {
  if (eGestao(solicitante.perfil)) return {};

  const vinculos = await prisma.queueAgent.findMany({
    where: { usuarioId: solicitante.sub },
    select: { filaId: true },
  });
  const filaIds = vinculos.map((v) => v.filaId);

  return {
    OR: [{ agenteId: solicitante.sub }, { status: 'EM_ESPERA', filaId: { in: filaIds } }],
  };
}

export async function listarConversas(solicitante: Solicitante, query: ListarConversasQuery) {
  const filtros: Prisma.ConversationWhereInput[] = [await escopoVisivel(solicitante)];

  if (query.status) filtros.push({ status: query.status });
  if (query.minhas === 'true') filtros.push({ agenteId: solicitante.sub });
  if (query.busca) {
    filtros.push({
      OR: [
        { contato: { nome: { contains: query.busca, mode: 'insensitive' } } },
        { contato: { email: { contains: query.busca, mode: 'insensitive' } } },
        { contato: { telefone: { contains: query.busca } } },
        { assunto: { contains: query.busca, mode: 'insensitive' } },
      ],
    });
  }

  const conversas = await prisma.conversation.findMany({
    where: { AND: filtros },
    include: inclusaoResumo,
    orderBy: { ultimaMensagemEm: 'desc' },
    take: query.limite,
  });

  return conversas.map(toConversaResumo);
}

/** Contadores por aba do painel. */
export async function contarPorStatus(solicitante: Solicitante) {
  const grupos = await prisma.conversation.groupBy({
    by: ['status'],
    where: await escopoVisivel(solicitante),
    _count: { _all: true },
  });

  const base = { EM_ESPERA: 0, ATRIBUIDO: 0, EM_ATENDIMENTO: 0, FINALIZADO: 0 };
  for (const g of grupos) base[g.status] = g._count._all;
  return base;
}

async function carregarOuFalhar(id: string) {
  const conversa = await prisma.conversation.findUnique({ where: { id }, include: inclusaoDetalhe });
  if (!conversa) throw notFound('Conversa nao encontrada');
  return conversa;
}

/** Agente so acessa conversa propria ou em espera na fila dele. */
async function garantirAcesso(
  solicitante: Solicitante,
  conversa: { agenteId: string | null; filaId: string | null; status: string },
) {
  if (eGestao(solicitante.perfil)) return;
  if (conversa.agenteId === solicitante.sub) return;

  if (conversa.status === 'EM_ESPERA' && conversa.filaId) {
    const vinculo = await prisma.queueAgent.findUnique({
      where: { filaId_usuarioId: { filaId: conversa.filaId, usuarioId: solicitante.sub } },
    });
    if (vinculo) return;
  }
  throw forbidden('Esta conversa esta atribuida a outro agente');
}

export async function obterConversa(solicitante: Solicitante, id: string) {
  const conversa = await carregarOuFalhar(id);
  await garantirAcesso(solicitante, conversa);
  return toConversaDetalhe(conversa);
}

/** Registra evento do sistema no historico (atribuicao, transferencia, encerramento). */
async function registrarEventoSistema(conversaId: string, texto: string) {
  return prisma.message.create({ data: { conversaId, autor: 'SISTEMA', conteudo: texto } });
}

export async function assumirConversa(solicitante: Solicitante, id: string) {
  const conversa = await carregarOuFalhar(id);
  if (conversa.status === 'FINALIZADO') throw badRequest('Conversa ja finalizada');
  if (conversa.agenteId && conversa.agenteId !== solicitante.sub) {
    throw badRequest('Conversa ja atribuida a outro agente');
  }
  await garantirAcesso(solicitante, conversa);

  await prisma.conversation.update({
    where: { id },
    data: { agenteId: solicitante.sub, status: 'ATRIBUIDO', atribuidoEm: new Date() },
  });
  await registrarEventoSistema(id, `${solicitante.nome} assumiu o atendimento.`);

  return publicar(id, { agenteAnteriorId: conversa.agenteId, filaAnteriorId: conversa.filaId });
}

export async function enviarMensagem(solicitante: Solicitante, id: string, conteudo: string) {
  const conversa = await carregarOuFalhar(id);
  if (conversa.status === 'FINALIZADO') throw badRequest('Conversa finalizada — nao aceita novas mensagens');
  await garantirAcesso(solicitante, conversa);

  // Responder sem ter assumido atribui a conversa ao agente automaticamente.
  const assumir = conversa.agenteId ? {} : { agenteId: solicitante.sub, atribuidoEm: new Date() };

  // Canal externo: envia ANTES de gravar. Se a Meta recusar, a mensagem nao
  // entra no historico — nao existe "enviada" que o cliente nunca recebeu.
  const envio = exigeEnvioExterno(conversa.canal)
    ? await enviarParaCanal(conversa.canal, conversa.enderecoExterno, conteudo)
    : { idExterno: null };

  const mensagem = await prisma.message.create({
    data: {
      conversaId: id,
      autor: 'AGENTE',
      autorId: solicitante.sub,
      conteudo,
      idExterno: envio.idExterno,
    },
  });

  await prisma.conversation.update({
    where: { id },
    data: { ...assumir, status: 'EM_ATENDIMENTO', ultimaMensagemEm: mensagem.criadoEm },
  });

  const atualizada = await publicar(id, { filaAnteriorId: conversa.filaId });
  notificarMensagem(
    { conversaId: id, mensagem: toMensagem(mensagem) },
    { conversaId: id, filaId: atualizada.fila?.id, agenteId: atualizada.agente?.id },
  );

  return { mensagem: toMensagem(mensagem), conversa: atualizada };
}

export async function transferirConversa(solicitante: Solicitante, id: string, input: TransferirInput) {
  const conversa = await carregarOuFalhar(id);
  if (conversa.status === 'FINALIZADO') throw badRequest('Conversa ja finalizada');
  await garantirAcesso(solicitante, conversa);

  const sufixo = input.motivo ? ` Motivo: ${input.motivo}` : '';

  if (input.agenteId) {
    const destino = await prisma.user.findUnique({ where: { id: input.agenteId } });
    if (!destino) throw notFound('Agente de destino nao encontrado');
    if (!destino.ativo) throw badRequest('Agente de destino esta desativado');
    if (destino.perfil === 'ADMIN') throw badRequest('Administradores nao recebem atendimento');
    if (destino.id === conversa.agenteId) throw badRequest('A conversa ja esta com este agente');

    await prisma.conversation.update({
      where: { id },
      data: { agenteId: destino.id, status: 'ATRIBUIDO', atribuidoEm: new Date() },
    });
    await registrarEventoSistema(id, `${solicitante.nome} transferiu o atendimento para ${destino.nome}.${sufixo}`);
  } else {
    const fila = await prisma.queue.findUnique({ where: { id: input.filaId! } });
    if (!fila) throw notFound('Fila de destino nao encontrada');
    if (!fila.ativa) throw badRequest('Fila de destino esta inativa');

    await prisma.conversation.update({
      where: { id },
      data: { filaId: fila.id, agenteId: null, status: 'EM_ESPERA', atribuidoEm: null },
    });
    await registrarEventoSistema(id, `${solicitante.nome} devolveu o atendimento para a fila ${fila.nome}.${sufixo}`);
  }

  return publicar(id, { agenteAnteriorId: conversa.agenteId, filaAnteriorId: conversa.filaId });
}

export async function finalizarConversa(solicitante: Solicitante, id: string) {
  const conversa = await carregarOuFalhar(id);
  if (conversa.status === 'FINALIZADO') throw badRequest('Conversa ja finalizada');
  await garantirAcesso(solicitante, conversa);

  await prisma.conversation.update({
    where: { id },
    data: { status: 'FINALIZADO', finalizadoEm: new Date() },
  });
  await registrarEventoSistema(id, `${solicitante.nome} finalizou o atendimento.`);
  // Pesquisa de satisfacao pos-atendimento (Fase 3).
  await criarPesquisa(id);

  return publicar(id, { agenteAnteriorId: conversa.agenteId, filaAnteriorId: conversa.filaId });
}

/** Zera o contador de nao lidas ao abrir a conversa no painel. */
export async function marcarComoLida(solicitante: Solicitante, id: string) {
  const conversa = await carregarOuFalhar(id);
  await garantirAcesso(solicitante, conversa);
  if (conversa.naoLidas === 0) return toConversaDetalhe(conversa);

  await prisma.conversation.update({ where: { id }, data: { naoLidas: 0 } });
  return publicar(id, { filaAnteriorId: conversa.filaId });
}

/**
 * Recarrega a conversa e avisa os interessados — incluindo a fila e o agente
 * ANTERIORES, que precisam remover o item das listas deles.
 */
async function publicar(
  id: string,
  anterior: { agenteAnteriorId?: string | null; filaAnteriorId?: string | null },
) {
  const detalhe = toConversaDetalhe(await carregarOuFalhar(id));

  notificarConversaAtualizada(detalhe, {
    conversaId: id,
    filaId: detalhe.fila?.id,
    agenteId: detalhe.agente?.id,
    agenteAnteriorId: anterior.agenteAnteriorId,
  });
  if (anterior.filaAnteriorId && anterior.filaAnteriorId !== detalhe.fila?.id) {
    notificarConversaAtualizada(detalhe, { filaId: anterior.filaAnteriorId });
  }

  return detalhe;
}
