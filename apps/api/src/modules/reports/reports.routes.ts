import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateQuery } from '../../http/middleware/validate';
import { param } from '../../http/params';
import { notFound } from '../../lib/errors';
import { gerarCsv } from '../dados/csv';
import { getBranding } from '../branding/branding.service';
import { gerarPdf } from './pdf';
import { RELATORIOS, type NomeRelatorio } from './reports.service';

export const relatoriosRoutes = Router();

relatoriosRoutes.use(requireAuth, requireRole('ADMIN', 'SUPERVISOR', 'GESTOR'));

const periodoSchema = z.object({
  desde: z.coerce.date().optional(),
  ate: z.coerce.date().optional(),
});

/** Padrao: ultimos 30 dias. */
function resolverPeriodo(query: z.infer<typeof periodoSchema>) {
  const ate = query.ate ?? new Date();
  const desde = query.desde ?? new Date(ate.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { desde, ate };
}

function resolverRelatorio(nome: string) {
  const gerar = RELATORIOS[nome as NomeRelatorio];
  if (!gerar) throw notFound(`Relatorio "${nome}" nao existe. Disponiveis: ${Object.keys(RELATORIOS).join(', ')}`);
  return gerar;
}

relatoriosRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({
      relatorios: [
        { nome: 'atendimentos', titulo: 'Atendimentos por agente' },
        { nome: 'filas', titulo: 'Desempenho por fila' },
        { nome: 'protocolos', titulo: 'Protocolos abertos no periodo' },
        { nome: 'jornada', titulo: 'Jornada de trabalho' },
        { nome: 'funil', titulo: 'Funil de leads' },
      ],
    });
  }),
);

relatoriosRoutes.get(
  '/:nome',
  validateQuery(periodoSchema),
  asyncHandler(async (req, res) => {
    const gerar = resolverRelatorio(param(req, 'nome'));
    res.json({ relatorio: await gerar(resolverPeriodo(res.locals.query)) });
  }),
);

relatoriosRoutes.get(
  '/:nome/csv',
  validateQuery(periodoSchema),
  asyncHandler(async (req, res) => {
    const nome = param(req, 'nome');
    const relatorio = await resolverRelatorio(nome)(resolverPeriodo(res.locals.query));
    const linhas = [...relatorio.linhas, ...(relatorio.totais ? [relatorio.totais] : [])];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nome}-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(gerarCsv(relatorio.colunas.map((c) => c.chave), linhas));
  }),
);

relatoriosRoutes.get(
  '/:nome/pdf',
  validateQuery(periodoSchema),
  asyncHandler(async (req, res) => {
    const nome = param(req, 'nome');
    const [relatorio, branding] = await Promise.all([
      resolverRelatorio(nome)(resolverPeriodo(res.locals.query)),
      getBranding(),
    ]);

    // O PDF sai com a identidade visual configurada no White Label.
    const pdf = await gerarPdf(relatorio, branding.appName, branding.corPrimaria);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nome}-${new Date().toISOString().slice(0, 10)}.pdf"`);
    res.send(pdf);
  }),
);
