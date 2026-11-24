import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { requireModulo } from '../../lib/modulos';
import { validateBody } from '../../http/middleware/validate';
import { badRequest, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
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

/** Modulo que a matriz de permissoes exige para exportar/importar cada recurso. */
const MODULO_DO_RECURSO: Record<string, string> = {
  leads: 'crm',
  contatos: 'crm',
  contas: 'crm',
  oportunidades: 'crm',
  protocolos: 'relatorios',
  conversas: 'relatorios',
};

export const exigirModuloDoRecurso: RequestHandler = (req, res, next) => {
  const modulo = MODULO_DO_RECURSO[(req.params.recurso ?? '').replace(/\.csv$/, '')];
  if (!modulo) return next(); // recurso desconhecido: a rota responde 404
  return requireModulo(modulo)(req, res, next);
};

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
  csv: z.string().min(1, 'Envie o conteúdo do CSV'),
  /** Valida sem gravar nada — util para conferir a planilha antes. */
  dryRun: z.boolean().default(false),
  origemImportacao: z.string().trim().max(120).optional(),
});

const mapeamentosSchema = z.object({
  mapeamentos: z.array(z.object({ origem: z.string().trim().min(2).max(120), operacao: z.enum(['TIM', 'STARLINK']) })).max(100),
});

dadosRoutes.get('/mapeamentos-origem', requireRole('ADMIN', 'SUPERVISOR'), asyncHandler(async (_req, res) => {
  res.json({ mapeamentos: await prisma.importSourceMapping.findMany({ orderBy: { origem: 'asc' } }) });
}));

dadosRoutes.put('/mapeamentos-origem', requireRole('ADMIN', 'SUPERVISOR'), validateBody(mapeamentosSchema), asyncHandler(async (req, res) => {
  const { mapeamentos } = req.body as z.infer<typeof mapeamentosSchema>;
  const chaves = mapeamentos.map((m) => m.origem.trim().toLocaleLowerCase('pt-BR'));
  if (new Set(chaves).size !== chaves.length) throw badRequest('Há origens repetidas no mapeamento');
  await prisma.$transaction(async (tx) => {
    await tx.importSourceMapping.deleteMany();
    if (mapeamentos.length) await tx.importSourceMapping.createMany({ data: mapeamentos.map((m) => ({ origem: m.origem.trim(), operacao: m.operacao })) });
  });
  res.json({ mapeamentos: await prisma.importSourceMapping.findMany({ orderBy: { origem: 'asc' } }) });
}));

/** Modelo em branco para o usuario preencher. */
dadosRoutes.get('/modelos/:recurso.csv', (req, res) => {
  const recurso = req.params.recurso ?? '';
  const item = IMPORTACOES[recurso];
  if (!item) throw notFound(`Modelo de importação "${recurso}" não existe. Disponíveis: ${Object.keys(IMPORTACOES).join(', ')}`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="modelo-${recurso}.csv"`);
  res.send(item.modelo);
});

dadosRoutes.get(
  '/exportar/:recurso.csv',
  requireRole('ADMIN', 'SUPERVISOR'),
  exigirModuloDoRecurso,
  asyncHandler(async (req, res) => {
    const recurso = req.params.recurso ?? '';
    const exportar = EXPORTACOES[recurso];
    if (!exportar) {
      throw notFound(`Exportação "${recurso}" não existe. Disponíveis: ${Object.keys(EXPORTACOES).join(', ')}`);
    }

    const data = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${recurso}-${data}.csv"`);
    // Trilha: quem exportou, o que e quando (sem o conteudo).
    console.info('[dados][exportacao]', JSON.stringify({ recurso, usuarioId: req.user?.sub ?? null, perfil: req.user?.perfil ?? null, em: new Date().toISOString() }));
    res.send(await exportar());
  }),
);

dadosRoutes.post(
  '/importar/:recurso',
  requireRole('ADMIN', 'SUPERVISOR'),
  exigirModuloDoRecurso,
  validateBody(importarSchema),
  asyncHandler(async (req, res) => {
    const recurso = req.params.recurso ?? '';
    const item = IMPORTACOES[recurso];
    if (!item) throw notFound(`Importação "${recurso}" não existe. Disponíveis: ${Object.keys(IMPORTACOES).join(', ')}`);
    if (req.body.csv.length > 2_000_000) throw badRequest('Arquivo muito grande (limite de 2 MB)');
    const resultado = recurso === 'contatos'
      ? await importarContatos(req.body.csv, req.body.dryRun, req.body.origemImportacao)
      : await item.importar(req.body.csv, req.body.dryRun);
    res.json({ resultado });
  }),
);
