import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody, validateQuery } from '../../http/middleware/validate';
import { param } from '../../http/params';
import { notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { limiteBytes, salvar } from '../../lib/storage';
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

/**
 * Arquivo em memoria: o limite de tamanho ja barra o abuso e o destino final
 * pode nao ser disco (S3/R2), entao gravar em temporario seria trabalho perdido.
 */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: limiteBytes, files: 1 } });

ticketsRoutes.use(requireAuth);

ticketsRoutes.get(
  '/',
  validateQuery(listarTicketsSchema),
  asyncHandler(async (_req, res) => {
    res.json(await listarTickets(res.locals.query));
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

/**
 * Aceita o arquivo em si (multipart, campo `arquivo`) ou apenas uma URL externa
 * (JSON). Os dois casos existem na pratica: o print que o cliente mandou e o
 * link de um documento que ja vive em outro sistema.
 */
ticketsRoutes.post(
  '/:id/anexos',
  upload.single('arquivo'),
  asyncHandler(async (req, res) => {
    const dados = req.file
      ? await (async () => {
          const salvo = await salvar({
            buffer: req.file!.buffer,
            nome: req.file!.originalname,
            tipo: req.file!.mimetype,
          });
          return { nome: salvo.nome, url: salvo.url, tipo: salvo.tipo, tamanho: salvo.tamanho };
        })()
      : anexoSchema.parse(req.body);

    res.status(201).json({ protocolo: await anexar(param(req, 'id'), req.user!.sub, dados) });
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
