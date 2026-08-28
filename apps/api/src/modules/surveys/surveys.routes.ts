import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { limitar } from '../../http/middleware/rate-limit';
import { validateBody, validateQuery } from '../../http/middleware/validate';
import { param } from '../../http/params';
import { notFound } from '../../lib/errors';
import { prismaSemIsolamento } from '../../lib/prisma';
import { comOrganizacao, semOrganizacao } from '../../lib/tenant';
import { obterPorToken, responder, resultados } from './surveys.service';

/** Rotas publicas: o cliente responde por link, sem conta na plataforma. */
export const pesquisasPublicasRoutes = Router();
/** Rotas internas: resultados para a gestao. */
export const pesquisasRoutes = Router();

const responderSchema = z.object({
  nota: z.number().int(),
  comentario: z.string().trim().max(1000).optional(),
});

const periodoSchema = z.object({
  desde: z.coerce.date().optional(),
  ate: z.coerce.date().optional(),
});

/**
 * Organizacao dona de um convite de pesquisa.
 *
 * O cliente que responde nao tem sessao: quem identifica a organizacao e o
 * proprio token do convite, que e opaco e de uso unico. Irrestrito porque a
 * pergunta e "de quem e este token?".
 */
async function organizacaoDoConvite(token: string): Promise<string> {
  const pesquisa = await semOrganizacao('pesquisa publica: o token e que revela a organizacao', () =>
    prismaSemIsolamento.survey.findFirst({ where: { token }, select: { organizacaoId: true } }),
  );
  if (!pesquisa) throw notFound('Pesquisa nao encontrada');
  return pesquisa.organizacaoId;
}

pesquisasPublicasRoutes.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const token = param(req, 'token');
    const org = await organizacaoDoConvite(token);
    res.json({ pesquisa: await comOrganizacao(org, () => obterPorToken(token)) });
  }),
);

pesquisasPublicasRoutes.post(
  '/:token',
  // O token e opaco, mas sem limite ele fica sujeito a tentativa em massa.
  limitar({ nome: 'pesquisa-resposta', janelaSegundos: 600, maximo: 30 }),
  validateBody(responderSchema),
  asyncHandler(async (req, res) => {
    const token = param(req, 'token');
    const org = await organizacaoDoConvite(token);
    res.json(
      await comOrganizacao(org, () => responder(token, req.body.nota, req.body.comentario)),
    );
  }),
);

pesquisasRoutes.get(
  '/resultados',
  requireAuth,
  requireRole('ADMIN', 'SUPERVISOR'),
  validateQuery(periodoSchema),
  asyncHandler(async (_req, res) => {
    const { desde, ate } = res.locals.query as z.infer<typeof periodoSchema>;
    const fim = ate ?? new Date();
    const inicio = desde ?? new Date(fim.getTime() - 30 * 24 * 60 * 60 * 1000);
    res.json({ resultados: await resultados(inicio, fim) });
  }),
);
