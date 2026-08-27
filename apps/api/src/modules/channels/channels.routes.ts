import { Router } from 'express';
import { z } from 'zod';
import type { Channel } from '@prisma/client';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody } from '../../http/middleware/validate';
import { param } from '../../http/params';
import { notFound } from '../../lib/errors';
import { CANAIS_EXTERNOS, listarCanais, salvarCanal, type CanalExterno } from './channels.service';
import { estadoDaIa, salvarIa } from '../bots/ia.service';

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

/**
 * A ponte de IA vale para qualquer canal, nao so os da Meta: um agente
 * respondendo no webchat e o caso mais facil de testar, e o e-mail nao tem
 * credencial de Graph API nenhuma.
 */
const CANAIS_IA = ['WEBCHAT', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'EMAIL'] as const;

const canalDeIa = (valor: string): Channel => {
  const canal = valor.toUpperCase();
  if (!(CANAIS_IA as readonly string[]).includes(canal)) throw notFound('Canal nao suportado para IA');
  return canal as Channel;
};

const iaSchema = z
  .object({
    iaAtiva: z.boolean().optional(),
    iaUrlWebhook: z.string().trim().url().max(300).nullable().optional(),
    iaSegredo: z.string().trim().min(16, 'Use um segredo de ao menos 16 caracteres').max(200).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Informe ao menos um campo' });

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

/**
 * Estado e configuracao da ponte com o motor de IA externo.
 *
 * Rota propria e nao campo no PUT do canal: quem liga a IA nao esta mexendo em
 * credencial da Meta, e o canal WEBCHAT — o mais provavel para o primeiro teste
 * — nao passa pela validacao daquele PUT.
 */
channelsRoutes.get(
  '/:canal/ia',
  requireRole('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (req, res) => {
    res.json({ ia: await estadoDaIa(canalDeIa(param(req, 'canal'))) });
  }),
);

channelsRoutes.put(
  '/:canal/ia',
  requireRole('ADMIN'),
  validateBody(iaSchema),
  asyncHandler(async (req, res) => {
    res.json({ ia: await salvarIa(canalDeIa(param(req, 'canal')), req.body) });
  }),
);
