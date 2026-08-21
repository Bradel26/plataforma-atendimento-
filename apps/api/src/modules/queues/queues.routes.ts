import { Router } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { param } from '../../http/params';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody } from '../../http/middleware/validate';
import { createQueueSchema, updateQueueSchema, vincularAgenteSchema } from './queues.schemas';
import {
  createQueue,
  deleteQueue,
  desvincularAgente,
  getQueue,
  listQueues,
  updateQueue,
  vincularAgente,
} from './queues.service';

export const queuesRoutes = Router();

queuesRoutes.use(requireAuth);

queuesRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ filas: await listQueues() });
  }),
);

queuesRoutes.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json({ fila: await getQueue(param(req, 'id')) });
  }),
);

queuesRoutes.post(
  '/',
  requireRole('ADMIN'),
  validateBody(createQueueSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ fila: await createQueue(req.body) });
  }),
);

queuesRoutes.patch(
  '/:id',
  requireRole('ADMIN'),
  validateBody(updateQueueSchema),
  asyncHandler(async (req, res) => {
    res.json({ fila: await updateQueue(param(req, 'id'), req.body) });
  }),
);

queuesRoutes.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    await deleteQueue(param(req, 'id'));
    res.status(204).end();
  }),
);

queuesRoutes.post(
  '/:id/agentes',
  requireRole('ADMIN', 'SUPERVISOR'),
  validateBody(vincularAgenteSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ fila: await vincularAgente(param(req, 'id'), req.body.usuarioId) });
  }),
);

queuesRoutes.delete(
  '/:id/agentes/:usuarioId',
  requireRole('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (req, res) => {
    res.json({ fila: await desvincularAgente(param(req, 'id'), param(req, 'usuarioId')) });
  }),
);
