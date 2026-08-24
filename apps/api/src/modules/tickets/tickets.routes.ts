import { Router } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody, validateQuery } from '../../http/middleware/validate';
import { param } from '../../http/params';
import { notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import {
  agendamentoSchema,
  anexoSchema,
  atualizarTicketSchema,
  comentarioSchema,
  criarTicketSchema,
  listarTicketsSchema,
} from './tickets.schemas';
import {
  agendar,
  anexar,
  atualizarTicket,
  comentar,
  concluirAgendamento,
  criarTicket,
  listarTickets,
  obterTicket,
  ticketsKanban,
} from './tickets.service';

export const ticketsRoutes = Router();

ticketsRoutes.use(requireAuth);

ticketsRoutes.get(
  '/',
  validateQuery(listarTicketsSchema),
  asyncHandler(async (_req, res) => {
    res.json({ protocolos: await listarTickets(res.locals.query) });
  }),
);

ticketsRoutes.get(
  '/kanban',
  validateQuery(listarTicketsSchema),
  asyncHandler(async (_req, res) => {
    res.json({ colunas: await ticketsKanban(res.locals.query) });
  }),
);

/** Busca pelo numero sequencial, que e o que o cliente informa. */
ticketsRoutes.get(
  '/numero/:numero',
  asyncHandler(async (req, res) => {
    const numero = Number(param(req, 'numero'));
    if (!Number.isInteger(numero)) throw notFound('Chamado nao encontrado');

    const ticket = await prisma.ticket.findUnique({ where: { numero }, select: { id: true } });
    if (!ticket) throw notFound('Chamado nao encontrado');
    res.json({ protocolo: await obterTicket(ticket.id) });
  }),
);

ticketsRoutes.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json({ protocolo: await obterTicket(param(req, 'id')) });
  }),
);

ticketsRoutes.post(
  '/',
  validateBody(criarTicketSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ protocolo: await criarTicket(req.body, req.user!.sub) });
  }),
);

ticketsRoutes.patch(
  '/:id',
  validateBody(atualizarTicketSchema),
  asyncHandler(async (req, res) => {
    res.json({ protocolo: await atualizarTicket(param(req, 'id'), req.body) });
  }),
);

ticketsRoutes.post(
  '/:id/comentarios',
  validateBody(comentarioSchema),
  asyncHandler(async (req, res) => {
    const { conteudo, interno } = req.body;
    res.status(201).json({ protocolo: await comentar(param(req, 'id'), req.user!.sub, conteudo, interno) });
  }),
);

ticketsRoutes.post(
  '/:id/anexos',
  validateBody(anexoSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ protocolo: await anexar(param(req, 'id'), req.user!.sub, req.body) });
  }),
);

ticketsRoutes.post(
  '/:id/agendamentos',
  validateBody(agendamentoSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ protocolo: await agendar(param(req, 'id'), req.body) });
  }),
);

ticketsRoutes.post(
  '/:id/agendamentos/:agendamentoId/concluir',
  asyncHandler(async (req, res) => {
    res.json({ protocolo: await concluirAgendamento(param(req, 'id'), param(req, 'agendamentoId')) });
  }),
);

ticketsRoutes.delete(
  '/:id',
  requireRole('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const existe = await prisma.ticket.findUnique({ where: { id } });
    if (!existe) throw notFound('Chamado nao encontrado');
    await prisma.ticket.delete({ where: { id } });
    res.status(204).end();
  }),
);
