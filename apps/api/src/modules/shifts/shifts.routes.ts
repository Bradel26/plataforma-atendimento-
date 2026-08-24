import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody, validateQuery } from '../../http/middleware/validate';
import { param } from '../../http/params';
import { badRequest, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { jornada } from '../metrics/metrics.service';

export const escalasRoutes = Router();

escalasRoutes.use(requireAuth);

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

const escalaSchema = z.object({
  agenteId: z.string().uuid(),
  diaSemana: z.number().int().min(0).max(6),
  inicio: z.string().regex(HORA, 'Use o formato HH:MM'),
  fim: z.string().regex(HORA, 'Use o formato HH:MM'),
  ativo: z.boolean().default(true),
});

const periodoSchema = z.object({
  desde: z.coerce.date().optional(),
  ate: z.coerce.date().optional(),
  usuarioId: z.string().uuid().optional(),
});

const DIAS = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];

/** Minutos do dia, para comparar inicio e fim como texto "HH:MM". */
const minutos = (hora: string) => {
  const [h, m] = hora.split(':');
  return Number(h) * 60 + Number(m);
};

escalasRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    const escalas = await prisma.workShift.findMany({
      include: { agente: { select: { id: true, nome: true, perfil: true } } },
      orderBy: [{ agente: { nome: 'asc' } }, { diaSemana: 'asc' }],
    });

    res.json({
      escalas: escalas.map((e) => ({
        ...e,
        diaNome: DIAS[e.diaSemana],
        /** Carga do dia em minutos, util para somar a jornada semanal. */
        cargaMinutos: minutos(e.fim) - minutos(e.inicio),
      })),
    });
  }),
);

/** Relatorio de jornada: horas por status no periodo, a partir do log de presenca. */
escalasRoutes.get(
  '/jornada',
  requireRole('ADMIN', 'SUPERVISOR'),
  validateQuery(periodoSchema),
  asyncHandler(async (_req, res) => {
    const { desde, ate, usuarioId } = res.locals.query as z.infer<typeof periodoSchema>;
    const fim = ate ?? new Date();
    const inicio = desde ?? new Date(fim.getTime() - 7 * 24 * 60 * 60 * 1000);
    res.json({ periodo: { desde: inicio, ate: fim }, jornada: await jornada({ desde: inicio, ate: fim }, usuarioId) });
  }),
);

escalasRoutes.put(
  '/',
  requireRole('ADMIN', 'SUPERVISOR'),
  validateBody(escalaSchema),
  asyncHandler(async (req, res) => {
    const { agenteId, diaSemana, inicio, fim, ativo } = req.body as z.infer<typeof escalaSchema>;
    if (minutos(fim) <= minutos(inicio)) throw badRequest('O fim do turno deve ser depois do inicio');

    const agente = await prisma.user.findUnique({ where: { id: agenteId } });
    if (!agente) throw notFound('Agente nao encontrado');

    const escala = await prisma.workShift.upsert({
      where: { agenteId_diaSemana: { agenteId, diaSemana } },
      update: { inicio, fim, ativo },
      create: { agenteId, diaSemana, inicio, fim, ativo },
      include: { agente: { select: { id: true, nome: true, perfil: true } } },
    });

    res.json({ escala: { ...escala, diaNome: DIAS[escala.diaSemana], cargaMinutos: minutos(fim) - minutos(inicio) } });
  }),
);

escalasRoutes.delete(
  '/:id',
  requireRole('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const existe = await prisma.workShift.findUnique({ where: { id } });
    if (!existe) throw notFound('Escala nao encontrada');
    await prisma.workShift.delete({ where: { id } });
    res.status(204).end();
  }),
);
