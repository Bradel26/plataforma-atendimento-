import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { urlAssinada } from '../../lib/storage';
import { apos, decodificarCursor, fatiar } from '../../lib/paginacao';
import { badRequest, notFound } from '../../lib/errors';
import { organizacaoAtual } from '../../lib/tenant';
import { notificarProtocolo } from '../../realtime/hub';
import type {
  AgendamentoInput,
  AtualizarTicketInput,
  CriarTicketInput,
  ListarTicketsQuery,
} from './tickets.schemas';

const ABERTOS = ['ABERTO', 'EM_ANDAMENTO', 'AGUARDANDO_CLIENTE'] as const;

const inclusao = {
  contato: { select: { id: true, nome: true, email: true } },
  conta: { select: { id: true, nome: true } },
  responsavel: { select: { id: true, nome: true } },
  fila: { select: { id: true, nome: true } },
  comentarios: {
    orderBy: { criadoEm: 'asc' },
    include: { autor: { select: { id: true, nome: true } } },
  },
  anexos: { orderBy: { criadoEm: 'asc' } },
  agendamentos: {
    orderBy: { inicio: 'asc' },
    include: { responsavel: { select: { id: true, nome: true } } },
  },
} satisfies Prisma.TicketInclude;

type TicketDb = Prisma.TicketGetPayload<{ include: typeof inclusao }>;

function serialize(t: TicketDb) {
  return {
    id: t.id,
    numero: t.numero,
    titulo: t.titulo,
    descricao: t.descricao,
    status: t.status,
    prioridade: t.prioridade,
    prazoSla: t.prazoSla,
    criadoEm: t.criadoEm,
    atualizadoEm: t.atualizadoEm,
    resolvidoEm: t.resolvidoEm,
    fechadoEm: t.fechadoEm,
    conversaId: t.conversaId,
    contato: t.contato,
    conta: t.conta,
    responsavel: t.responsavel,
    fila: t.fila,
    comentarios: t.comentarios.map((c) => ({
      id: c.id,
      conteudo: c.conteudo,
      interno: c.interno,
      criadoEm: c.criadoEm,
      autor: c.autor,
    })),
    anexos: t.anexos.map((a) => ({ ...a, url: urlAssinada(a.url) })),
    agendamentos: t.agendamentos,
    /** SLA estourado e chamado ainda em aberto. */
    slaVencido: Boolean(
      t.prazoSla && t.prazoSla < new Date() && ABERTOS.includes(t.status as (typeof ABERTOS)[number]),
    ),
  };
}

async function carregar(id: string) {
  const ticket = await prisma.ticket.findUnique({ where: { id }, include: inclusao });
  if (!ticket) throw notFound('Chamado nao encontrado');
  return ticket;
}

/** Recarrega, serializa e notifica os interessados. */
async function publicar(id: string) {
  const detalhe = serialize(await carregar(id));
  notificarProtocolo(detalhe, { responsavelId: detalhe.responsavel?.id, filaId: detalhe.fila?.id });
  return detalhe;
}

export async function listarTickets(query: ListarTicketsQuery) {
  const filtros: Prisma.TicketWhereInput[] = [];
  if (query.status) filtros.push({ status: query.status });
  if (query.prioridade) filtros.push({ prioridade: query.prioridade });
  if (query.responsavelId) filtros.push({ responsavelId: query.responsavelId });
  if (query.filaId) filtros.push({ filaId: query.filaId });
  if (query.contatoId) filtros.push({ contatoId: query.contatoId });
  if (query.contaId) filtros.push({ contaId: query.contaId });
  if (query.slaVencido === 'true') {
    filtros.push({ prazoSla: { lt: new Date() }, status: { in: [...ABERTOS] } });
  }
  if (query.busca) {
    const numero = Number(query.busca.replace(/\D/g, ''));
    filtros.push({
      OR: [
        { titulo: { contains: query.busca, mode: 'insensitive' } },
        { descricao: { contains: query.busca, mode: 'insensitive' } },
        { contato: { nome: { contains: query.busca, mode: 'insensitive' } } },
        ...(Number.isInteger(numero) && numero > 0 ? [{ numero }] : []),
      ],
    });
  }

  const depois = apos('atualizadoEm', decodificarCursor(query.cursor));
  if (depois) filtros.push(depois);

  const registros = await prisma.ticket.findMany({
    where: filtros.length > 0 ? { AND: filtros } : {},
    include: inclusao,
    orderBy: [{ atualizadoEm: 'desc' }, { id: 'desc' }],
    take: query.limite + 1,
  });

  const { itens, proximoCursor } = fatiar(registros, query.limite, (t) => t.atualizadoEm);
  return { protocolos: itens.map(serialize), proximoCursor };
}

export async function obterTicket(id: string) {
  return serialize(await carregar(id));
}

/**
 * Reserva o proximo numero de protocolo da organizacao.
 *
 * Antes era `autoincrement()` do Postgres, que e uma sequencia por TABELA: os
 * protocolos de uma empresa consumiriam os numeros da outra, e a segunda a
 * entrar abriria o protocolo n. 1.847 no primeiro dia.
 *
 * O `UPDATE ... RETURNING` reserva e devolve num passo, e o lock da linha da
 * organizacao serializa duas aberturas simultaneas — a segunda espera, le o
 * valor ja incrementado e recebe outro numero. Ler e depois gravar daria o mesmo
 * numero para as duas.
 */
async function reservarNumero(): Promise<number> {
  const [linha] = await prisma.$queryRaw<Array<{ numero: number }>>`
    UPDATE organizacoes
       SET proximo_protocolo = proximo_protocolo + 1
     WHERE id = ${organizacaoAtual()}
    RETURNING proximo_protocolo - 1 AS numero
  `;
  if (!linha) throw new Error('organizacao nao encontrada ao reservar numero de protocolo');
  return Number(linha.numero);
}

export async function criarTicket(input: CriarTicketInput, autorId: string) {
  if (input.conversaId) {
    const conversa = await prisma.conversation.findUnique({ where: { id: input.conversaId } });
    if (!conversa) throw notFound('Conversa de origem nao encontrada');
    // Herda contato e fila da conversa quando nao informados.
    input.contatoId ??= conversa.contatoId;
    input.filaId ??= conversa.filaId;
  }

  const criado = await prisma.ticket.create({ data: { ...input, numero: await reservarNumero() } });
  await prisma.ticketComment.create({
    data: { ticketId: criado.id, autorId, conteudo: 'Chamado aberto.', interno: true },
  });
  return publicar(criado.id);
}

export async function atualizarTicket(id: string, input: AtualizarTicketInput) {
  const atual = await carregar(id);
  if (atual.status === 'FECHADO' && input.status !== 'ABERTO' && input.status !== 'EM_ANDAMENTO') {
    throw badRequest('Chamado fechado — reabra mudando o status para ABERTO ou EM_ANDAMENTO');
  }

  const status = input.status ?? atual.status;
  // FECHADO tambem conta como resolvido: preservar resolvidoEm e o que permite
  // medir tempo de resolucao nos relatorios. Reabrir limpa as duas datas.
  const encerrado = status === 'RESOLVIDO' || status === 'FECHADO';

  await prisma.ticket.update({
    where: { id },
    data: {
      ...input,
      resolvidoEm: encerrado ? (atual.resolvidoEm ?? new Date()) : null,
      fechadoEm: status === 'FECHADO' ? (atual.fechadoEm ?? new Date()) : null,
    },
  });
  return publicar(id);
}

export async function comentar(id: string, autorId: string, conteudo: string, interno: boolean) {
  await carregar(id);
  await prisma.ticketComment.create({ data: { ticketId: id, autorId, conteudo, interno } });
  return publicar(id);
}

export async function anexar(
  id: string,
  autorId: string,
  dados: { nome: string; url: string; tipo?: string | null; tamanho?: number | null },
) {
  await carregar(id);
  await prisma.ticketAttachment.create({ data: { ticketId: id, autorId, ...dados } });
  return publicar(id);
}

export async function agendar(id: string, input: AgendamentoInput) {
  await carregar(id);
  if (input.fim && input.fim <= input.inicio) throw badRequest('O fim deve ser depois do inicio');
  await prisma.ticketSchedule.create({ data: { ticketId: id, ...input } });
  return publicar(id);
}

export async function concluirAgendamento(id: string, agendamentoId: string) {
  const agendamento = await prisma.ticketSchedule.findUnique({ where: { id: agendamentoId } });
  if (!agendamento || agendamento.ticketId !== id) throw notFound('Agendamento nao encontrado');

  await prisma.ticketSchedule.update({ where: { id: agendamentoId }, data: { concluido: true } });
  return publicar(id);
}

/** Kanban por status, com contagem de SLA vencido por coluna. */
export async function ticketsKanban(query: ListarTicketsQuery) {
  const { protocolos: tickets } = await listarTickets({ ...query, limite: 200, cursor: undefined });
  return {
    ABERTO: tickets.filter((t) => t.status === 'ABERTO'),
    EM_ANDAMENTO: tickets.filter((t) => t.status === 'EM_ANDAMENTO'),
    AGUARDANDO_CLIENTE: tickets.filter((t) => t.status === 'AGUARDANDO_CLIENTE'),
    RESOLVIDO: tickets.filter((t) => t.status === 'RESOLVIDO'),
    FECHADO: tickets.filter((t) => t.status === 'FECHADO'),
  };
}
