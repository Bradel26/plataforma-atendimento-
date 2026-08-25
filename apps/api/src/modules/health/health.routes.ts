import { Router } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { estadoDaFila } from '../../lib/fila';
import { prisma } from '../../lib/prisma';
import { redis } from '../../lib/redis';

export const healthRoutes = Router();

healthRoutes.get('/', async (_req, res) => {
  const [postgres, cache] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => 'ok' as const).catch(() => 'falha' as const),
    redis.ping().then(() => 'ok' as const).catch(() => 'falha' as const),
  ]);

  const saudavel = postgres === 'ok' && cache === 'ok';
  res.status(saudavel ? 200 : 503).json({
    status: saudavel ? 'ok' : 'degradado',
    dependencias: { postgres, redis: cache },
    versao: process.env.npm_package_version ?? '0.1.0',
  });
});

/**
 * Estado da fila de trabalho. Fila sem visibilidade e caixa preta: quando uma
 * campanha nao chega, a primeira pergunta e quantos trabalhos estao presos.
 */
healthRoutes.get(
  '/fila',
  requireAuth,
  requireRole('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (_req, res) => {
    res.json({ fila: await estadoDaFila() });
  }),
);
