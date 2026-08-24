import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody } from '../../http/middleware/validate';
import { badRequest, notFound } from '../../lib/errors';
import {
  MODELO_LEADS_CSV,
  exportarContatos,
  exportarConversas,
  exportarLeads,
  exportarOportunidades,
  exportarProtocolos,
  importarLeads,
} from './dados.service';

export const dadosRoutes = Router();

dadosRoutes.use(requireAuth);

const EXPORTACOES: Record<string, () => Promise<string>> = {
  leads: exportarLeads,
  contatos: exportarContatos,
  oportunidades: exportarOportunidades,
  protocolos: exportarProtocolos,
  conversas: exportarConversas,
};

const importarSchema = z.object({
  /** Conteudo do arquivo CSV como texto. */
  csv: z.string().min(1, 'Envie o conteudo do CSV'),
  /** Valida sem gravar nada — util para conferir a planilha antes. */
  dryRun: z.boolean().default(false),
});

/** Modelo em branco para o usuario preencher. */
dadosRoutes.get('/modelos/leads.csv', (_req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="modelo-leads.csv"');
  res.send(MODELO_LEADS_CSV);
});

dadosRoutes.get(
  '/exportar/:recurso.csv',
  asyncHandler(async (req, res) => {
    const recurso = req.params.recurso ?? '';
    const exportar = EXPORTACOES[recurso];
    if (!exportar) {
      throw notFound(`Exportacao "${recurso}" nao existe. Disponiveis: ${Object.keys(EXPORTACOES).join(', ')}`);
    }

    const data = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${recurso}-${data}.csv"`);
    res.send(await exportar());
  }),
);

dadosRoutes.post(
  '/importar/leads',
  requireRole('ADMIN', 'SUPERVISOR'),
  validateBody(importarSchema),
  asyncHandler(async (req, res) => {
    if (req.body.csv.length > 2_000_000) throw badRequest('Arquivo muito grande (limite de 2 MB)');
    res.json({ resultado: await importarLeads(req.body.csv, req.body.dryRun) });
  }),
);
