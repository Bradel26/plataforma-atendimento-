import { Router } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { param } from '../../http/params';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody, validateQuery } from '../../http/middleware/validate';
import { badRequest } from '../../lib/errors';
import {
  createUserSchema,
  listUsersSchema,
  updateStatusSchema,
  updateUserSchema,
} from './users.schemas';
import {
  createUser,
  deleteUserPermanently,
  deactivateUser,
  getUser,
  listUsers,
  registrarHeartbeat,
  updateStatus,
  updateUser,
} from './users.service';

export const usersRoutes = Router();

usersRoutes.use(requireAuth);

/** Status de presenca do proprio usuario (usado pelo seletor no cabecalho). */
usersRoutes.patch(
  '/me/status',
  validateBody(updateStatusSchema),
  asyncHandler(async (req, res) => {
    res.json({ usuario: await updateStatus(req.user!.sub, req.body.status) });
  }),
);

/**
 * Heartbeat: a aba chama isto periodicamente enquanto fica visivel, para o job
 * de inatividade (`encerrarPresencasInativas`) saber que a pessoa ainda esta
 * logada de verdade, e nao so com o status antigo travado.
 */
usersRoutes.post(
  '/me/heartbeat',
  asyncHandler(async (req, res) => {
    await registrarHeartbeat(req.user!.sub);
    res.status(204).end();
  }),
);

usersRoutes.get(
  '/',
  requireRole('ADMIN', 'SUPERVISOR'),
  validateQuery(listUsersSchema),
  asyncHandler(async (_req, res) => {
    res.json({ usuarios: await listUsers(res.locals.query) });
  }),
);

usersRoutes.post(
  '/',
  requireRole('ADMIN'),
  validateBody(createUserSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ usuario: await createUser(req.body) });
  }),
);

usersRoutes.get(
  '/:id',
  requireRole('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (req, res) => {
    res.json({ usuario: await getUser(param(req, 'id')) });
  }),
);

usersRoutes.patch(
  '/:id',
  requireRole('ADMIN'),
  validateBody(updateUserSchema),
  asyncHandler(async (req, res) => {
    res.json({ usuario: await updateUser(param(req, 'id'), req.body) });
  }),
);

usersRoutes.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    if (param(req, 'id') === req.user!.sub) throw badRequest('Você não pode desativar o próprio usuário');
    res.json({ usuario: await deactivateUser(param(req, 'id')) });
  }),
);

usersRoutes.delete(
  '/:id/permanente',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    if (id === req.user!.sub) throw badRequest('Você não pode excluir a própria conta');
    res.json({ usuario: await deleteUserPermanently(id) });
  }),
);
