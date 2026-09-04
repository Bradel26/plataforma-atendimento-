import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody } from '../../http/middleware/validate';
import { badRequest, notFound } from '../../lib/errors';
import {
  MODELO_CONTAS_CSV,
  MODELO_CONTATOS_CSV,
  MODELO_LEADS_CSV,
  MODELO_OPORTUNIDADES_CSV,
  exportarContas,
  exportarContatos,
  exportarConversas,
  exportarLeads,
  exportarOportunidades,
  exportarProtocolos,
  importarContas,
  importarContatos,
  importarLeads,
  importarOportunidades,
} from './dados.service';

export const dadosRoutes = Router();

dadosRoutes.use(requireAuth);

const EXPORTACOES: Record<string, () => Promise<string>> = {
  leads: exportarLeads,
  contatos: exportarContatos,
  contas: exportarContas,
  oportunidades: exportarOportunidades,
  protocolos: exportarProtocolos,
  conversas: exportarConversas,
};

/** Cada recurso importavel: o modelo em branco e a funcao de importacao. */
const IMPORTACOES: Record<string, { modelo: string; importar: (csv: string, dryRun: boolean) => Promise<unknown> }> = {
  leads: { modelo: MODELO_LEADS_CSV, importar: importarLeads },
  contatos: { modelo: MODELO_CONTATOS_CSV, importar: importarContatos },
  contas: { modelo: MODELO_CONTAS_CSV, importar: importarContas },
  oportunidades: { modelo: MODELO_OPORTUNIDADES_CSV, importar: importarOportunidades },
};

const importarSchema = z.object({
  /** Conteudo do arquivo CSV como texto. */
  csv: z.string().min(1, 'Envie o conteudo do CSV'),
  /** Valida sem gravar nada — util para conferir a planilha antes. */
  dryRun: z.boolean().default(false),
});

/** Modelo em branco para o usuario preencher. */
dadosRoutes.get('/modelos/:recurso.csv', (req, res) => {
  const recurso = req.params.recurso ?? '';
  const item = IMPORTACOES[recurso];
  if (!item) throw notFound(`Modelo de importacao "${recurso}" nao existe. Disponiveis: ${Object.keys(IMPORTACOES).join(', ')}`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="modelo-${recurso}.csv"`);
  res.send(item.modelo);
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
  '/importar/:recurso',
  requireRole('ADMIN', 'SUPERVISOR'),
  validateBody(importarSchema),
  asyncHandler(async (req, res) => {
    const recurso = req.params.recurso ?? '';
    const item = IMPORTACOES[recurso];
    if (!item) throw notFound(`Importacao "${recurso}" nao existe. Disponiveis: ${Object.keys(IMPORTACOES).join(', ')}`);
    if (req.body.csv.length > 2_000_000) throw badRequest('Arquivo muito grande (limite de 2 MB)');
    res.json({ resultado: await item.importar(req.body.csv, req.body.dryRun) });
  }),
);
