import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateQuery } from '../../http/middleware/validate';
import { filtroDe, politicaAtividades } from '../../lib/politicas';
import { prisma } from '../../lib/prisma';
import { matrizProdutividade } from './produtividade';

/**
 * Matriz de produtividade (item 3.3): mesmo corte de leitura de metas e
 * relatorios gerenciais — ADMIN, SUPERVISOR e GESTOR (decisao 58/59). GESTOR
 * ve so a propria equipe porque a consulta passa por `filtroDe(politicaAtividades)`,
 * que ja restringe por `equipeIds` — a rota nao decide isso de novo.
 */
export const produtividadeRoutes = Router();

produtividadeRoutes.use(requireAuth, requireRole('ADMIN', 'SUPERVISOR', 'GESTOR'));

/**
 * O mes vem como `AAAA-MM`, no mesmo formato de metas — sem hora, nao existe
 * fuso para uma tarefa de virada de mes cair no mes errado.
 */
const mesSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Informe o mes no formato AAAA-MM')
  .transform((v) => new Date(`${v}-01T00:00:00Z`));

const proximoMes = (mes: Date) => new Date(Date.UTC(mes.getUTCFullYear(), mes.getUTCMonth() + 1, 1));

produtividadeRoutes.get(
  '/',
  validateQuery(z.object({ mes: mesSchema.optional() })),
  asyncHandler(async (_req, res) => {
    const mes = res.locals.query.mes ?? new Date(`${new Date().toISOString().slice(0, 7)}-01T00:00:00Z`);
    const fim = proximoMes(mes);

    const atividades = await prisma.activity.findMany({
      where: {
        AND: [{ prazo: { gte: mes, lt: fim } }, await filtroDe(politicaAtividades)],
      },
      select: {
        id: true,
        titulo: true,
        tipo: true,
        prazo: true,
        concluidoEm: true,
        responsavel: { select: { id: true, nome: true } },
      },
    });

    res.json({ mes: mes.toISOString().slice(0, 7), linhas: matrizProdutividade(atividades) });
  }),
);
