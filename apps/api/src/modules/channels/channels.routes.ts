import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody } from '../../http/middleware/validate';
import { param } from '../../http/params';
import { notFound } from '../../lib/errors';
import { CANAIS_EXTERNOS, listarCanais, salvarCanal, type CanalExterno } from './channels.service';

export const channelsRoutes = Router();

channelsRoutes.use(requireAuth);

const salvarSchema = z
  .object({
    ativo: z.boolean().optional(),
    phoneNumberId: z.string().trim().max(60).nullable().optional(),
    wabaId: z.string().trim().max(60).nullable().optional(),
    pageId: z.string().trim().max(60).nullable().optional(),
    igUserId: z.string().trim().max(60).nullable().optional(),
    accessToken: z.string().trim().min(10).nullable().optional(),
    appSecret: z.string().trim().min(10).nullable().optional(),
    verifyToken: z.string().trim().min(6).nullable().optional(),
    filaId: z.string().uuid().nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Informe ao menos um campo' });

const canalDaRota = (valor: string): CanalExterno => {
  const canal = valor.toUpperCase();
  if (!(CANAIS_EXTERNOS as readonly string[]).includes(canal)) throw notFound('Canal nao suportado');
  return canal as CanalExterno;
};

channelsRoutes.get(
  '/',
  requireRole('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (_req, res) => {
    res.json({ canais: await listarCanais(), suportados: CANAIS_EXTERNOS });
  }),
);

channelsRoutes.put(
  '/:canal',
  requireRole('ADMIN'),
  validateBody(salvarSchema),
  asyncHandler(async (req, res) => {
    res.json({ canal: await salvarCanal(canalDaRota(param(req, 'canal')), req.body) });
  }),
);
