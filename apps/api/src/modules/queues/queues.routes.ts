import { Router } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { param } from '../../http/params';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody } from '../../http/middleware/validate';
import { atribuirEsperaDaFila } from './atribuicaoAutomatica';
import { createQueueSchema, updateQueueSchema, vincularAgenteSchema } from './queues.schemas';
import {
  createQueue,
  deleteQueue,
  desvincularAgente,
  getQueue,
  sugerirAgenteDaFila,
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

/** Sugere o proximo agente da fila (so sugestao: nada e atribuido nem enviado a cliente). */
queuesRoutes.get(
  '/:id/proximo-agente',
  requireRole('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (req, res) => {
    res.json(await sugerirAgenteDaFila(param(req, 'id')));
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
    const fila = await updateQueue(param(req, 'id'), req.body);
    // Ligou a atribuicao automatica: distribui a espera que ja existia (so cria atribuicao interna, nao contata cliente).
    if (req.body.atribuicaoAutomatica === true) void atribuirEsperaDaFila(fila.id);
    res.json({ fila });
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
