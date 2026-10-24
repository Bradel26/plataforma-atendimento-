import type { Operacao } from '@prisma/client';
import { Router, type Request, type RequestHandler } from 'express';
import multer, { MulterError } from 'multer';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody, validateQuery } from '../../http/middleware/validate';
import { param } from '../../http/params';
import { badRequest, notFound } from '../../lib/errors';
import { requireModulo } from '../../lib/modulos';
import { exigirOperacao } from './acesso';
import { operacaoDaUrl, type ChaveEtapa } from './catalogo';
import { configurarEtapa } from './estrutura.service';
import { estruturaDaEsteira, kanban, kanbanColuna, lista } from './consultas.service';
import {
  configEtapaSchema,
  criarVinculoSchema,
  editarVinculoSchemas,
  exportarQuerySchema,
  importarCorpoSchema,
  kanbanColunaQuerySchema,
  kanbanQuerySchema,
  listaQuerySchema,
  moverVinculoSchema,
  notaSchema,
  vendedorSchema,
  type ConfigEtapaInput,
  type ExportarQuery,
  type KanbanColunaQuery,
  type KanbanQuery,
  type ListaQuery,
  type MoverVinculoInput,
  type NotaInput,
  type VendedorInput,
} from './esteiras.schemas';
import { parseFiltros } from './filtros';
import { funilDaOperacao, periodoDosFiltros } from './funil';
import { LIMITE_IMPORTACAO_BYTES, exportar, importar } from './planilhas.service';
import {
  adicionarNota,
  criarVinculo,
  editarCampos,
  inativarVendedor,
  moverVinculo,
  obterVinculo,
  salvarVendedor,
} from './vinculos.service';

/**
 * Esteiras TIM e Starlink: `/api/esteiras/:operacao/...`. `exigirOperacao`
 * responde 404 para operação inválida ou sem acesso e 403 para quem só lê e
 * tenta escrever; grava `res.locals.operacao`.
 */
export const esteirasRoutes = Router();

/** Valida o corpo com o schema da operação da URL (depois de `exigirOperacao`). */
const validarPorOperacao =
  (schemas: Record<Operacao, Parameters<typeof validateBody>[0]>): RequestHandler =>
  (req, res, next) =>
    validateBody(schemas[res.locals.operacao as Operacao])(req, res, next);

/**
 * Vendedores do PDV só existem na TIM: na Starlink a rota "não existe" (404).
 * Vem antes de `exigirOperacao`, senão quem só lê a Starlink receberia 403.
 */
const somenteTim: RequestHandler = (req, _res, next) =>
  next(operacaoDaUrl(String(req.params.operacao ?? '')) === 'TIM' ? undefined : notFound('Recurso não encontrado'));

esteirasRoutes.use(requireAuth);
esteirasRoutes.use(requireModulo('esteira'));

/** Filtros da tela, na mesma query string da paginação (`ZodError` → 400). */
const filtrosDa = (req: Request) => parseFiltros(req.query as Record<string, unknown>);

// ---------------------------------------------------------------------------
// Configuração das etapas (ADMIN)
// ---------------------------------------------------------------------------

/**
 * Renomeia a etapa e/ou muda o limite de dias parado. Operação pela URL (404 se
 * inválida), sem exigir nível na operação: a trava é o perfil ADMIN.
 */
esteirasRoutes.patch(
  '/:operacao/etapas/:chave',
  requireRole('ADMIN'),
  validateBody(configEtapaSchema),
  asyncHandler(async (req, res) => {
    const operacao = operacaoDaUrl(param(req, 'operacao'));
    if (!operacao) throw notFound('Recurso não encontrado');
    res.json(await configurarEtapa(operacao, param(req, 'chave'), req.body as ConfigEtapaInput));
  }),
);

// ---------------------------------------------------------------------------
// Consultas (leitura)
// ---------------------------------------------------------------------------

esteirasRoutes.get(
  '/:operacao/estrutura',
  exigirOperacao('LEITURA'),
  asyncHandler(async (_req, res) => {
    res.json(await estruturaDaEsteira(res.locals.operacao, res.locals.nivelOperacao));
  }),
);

esteirasRoutes.get(
  '/:operacao/kanban',
  exigirOperacao('LEITURA'),
  validateQuery(kanbanQuerySchema),
  asyncHandler(async (req, res) => {
    const { porColuna } = res.locals.query as KanbanQuery;
    res.json(await kanban(res.locals.operacao, filtrosDa(req), porColuna));
  }),
);

esteirasRoutes.get(
  '/:operacao/kanban/coluna/:chave',
  exigirOperacao('LEITURA'),
  validateQuery(kanbanColunaQuerySchema),
  asyncHandler(async (req, res) => {
    const { porColuna, cursor } = res.locals.query as KanbanColunaQuery;
    res.json(await kanbanColuna(res.locals.operacao, param(req, 'chave'), filtrosDa(req), porColuna, cursor || undefined));
  }),
);

esteirasRoutes.get(
  '/:operacao/lista',
  exigirOperacao('LEITURA'),
  validateQuery(listaQuerySchema),
  asyncHandler(async (req, res) => {
    const { pagina, tamanho, ordenarPor, direcao } = res.locals.query as ListaQuery;
    res.json(await lista(res.locals.operacao, filtrosDa(req), { pagina, tamanho, ordenarPor: ordenarPor || undefined, direcao }));
  }),
);

/** Funil do período (padrão: últimos 90 dias); `compararDesde`/`compararAte` (ambos) trazem o período de comparação. */
esteirasRoutes.get(
  '/:operacao/funil',
  exigirOperacao('LEITURA'),
  asyncHandler(async (req, res) => {
    const operacao = res.locals.operacao as Operacao;
    const filtros = filtrosDa(req);
    const { compararDesde, compararAte } = req.query as Record<string, unknown>;
    const temDesde = typeof compararDesde === 'string' && compararDesde !== '';
    const temAte = typeof compararAte === 'string' && compararAte !== '';
    if (temDesde !== temAte) throw badRequest('Informe compararDesde e compararAte juntos');
    const agora = new Date();
    const atual = await funilDaOperacao(operacao, filtros, periodoDosFiltros(filtros, agora));
    if (!temDesde) return void res.json({ atual });
    const outro = parseFiltros({ desde: compararDesde, ate: compararAte });
    res.json({ atual, comparado: await funilDaOperacao(operacao, filtros, periodoDosFiltros(outro, agora)) });
  }),
);

// ---------------------------------------------------------------------------
// Planilhas (exportação e importação)
// ---------------------------------------------------------------------------

/**
 * Exportação: só os perfis que já exportam em `modules/dados` (ADMIN e
 * SUPERVISOR — nunca SUPORTE nem AGENTE), com LEITURA na operação. Mesma
 * consulta da Lista (filtros na query string), sem paginação.
 */
esteirasRoutes.get(
  '/:operacao/exportar',
  requireRole('ADMIN', 'SUPERVISOR'),
  exigirOperacao('LEITURA'),
  validateQuery(exportarQuerySchema),
  asyncHandler(async (req, res) => {
    const { formato, colunas, ordenarPor, direcao } = res.locals.query as ExportarQuery;
    const chaves = (colunas ?? '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    const { arquivo, nome, tipo } = await exportar(res.locals.operacao, filtrosDa(req), chaves, formato, {
      ordenarPor: ordenarPor || undefined,
      direcao,
    });
    res.setHeader('Content-Type', tipo);
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    res.send(arquivo);
  }),
);

const EXTENSOES_PLANILHA = /\.(csv|xlsx)$/i;
/** Tipos com que navegadores e sistemas enviam CSV/XLSX (o Windows manda CSV como `vnd.ms-excel`). */
const TIPOS_PLANILHA = new Set([
  'text/csv',
  'text/plain',
  'application/csv',
  'application/vnd.ms-excel',
  'application/octet-stream',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const uploadPlanilha = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITE_IMPORTACAO_BYTES, files: 1 },
  fileFilter: (_req, arquivo, aceitar) => {
    if (EXTENSOES_PLANILHA.test(arquivo.originalname) && TIPOS_PLANILHA.has(arquivo.mimetype)) return aceitar(null, true);
    aceitar(badRequest('Envie um arquivo .csv ou .xlsx'));
  },
});

/** Recebe o campo `arquivo`; o limite de tamanho vira 400 com o limite desta rota (não o dos anexos). */
const receberPlanilha: RequestHandler = (req, res, next) =>
  uploadPlanilha.single('arquivo')(req, res, (erro: unknown) => {
    if (erro instanceof MulterError && erro.code === 'LIMIT_FILE_SIZE') {
      return next(badRequest(`Arquivo acima do limite de ${LIMITE_IMPORTACAO_BYTES / 1024 / 1024} MB`));
    }
    next(erro);
  });

/** Importação (multipart: `arquivo`, `mapa` JSON opcional, `previa`): EDICAO na operação e ADMIN/SUPERVISOR. */
esteirasRoutes.post(
  '/:operacao/importar',
  requireRole('ADMIN', 'SUPERVISOR'),
  exigirOperacao('EDICAO'),
  receberPlanilha,
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Envie a planilha no campo "arquivo"');
    const { mapa, previa } = importarCorpoSchema.parse(req.body ?? {});
    res.json(
      await importar(res.locals.operacao, { buffer: req.file.buffer, nome: req.file.originalname }, mapa ?? null, previa),
    );
  }),
);

// ---------------------------------------------------------------------------
// Vínculo
// ---------------------------------------------------------------------------

esteirasRoutes.post(
  '/:operacao/vinculos',
  exigirOperacao('EDICAO'),
  validateBody(criarVinculoSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ vinculo: await criarVinculo(res.locals.operacao, req.body) });
  }),
);

esteirasRoutes.get(
  '/:operacao/vinculos/:id',
  exigirOperacao('LEITURA'),
  asyncHandler(async (req, res) => {
    res.json({ vinculo: await obterVinculo(res.locals.operacao, param(req, 'id')) });
  }),
);

esteirasRoutes.post(
  '/:operacao/vinculos/:id/mover',
  exigirOperacao('EDICAO'),
  validateBody(moverVinculoSchema),
  asyncHandler(async (req, res) => {
    const corpo = req.body as MoverVinculoInput;
    res.json({
      vinculo: await moverVinculo(res.locals.operacao, param(req, 'id'), {
        ...corpo,
        // O serviço confere se a chave é do catálogo da operação da rota.
        paraChave: corpo.paraChave as ChaveEtapa,
      }),
    });
  }),
);

esteirasRoutes.patch(
  '/:operacao/vinculos/:id',
  exigirOperacao('EDICAO'),
  validarPorOperacao(editarVinculoSchemas),
  asyncHandler(async (req, res) => {
    res.json({ vinculo: await editarCampos(res.locals.operacao, param(req, 'id'), req.body) });
  }),
);

esteirasRoutes.post(
  '/:operacao/vinculos/:id/notas',
  exigirOperacao('EDICAO'),
  validateBody(notaSchema),
  asyncHandler(async (req, res) => {
    const { texto } = req.body as NotaInput;
    res.status(201).json({ vinculo: await adicionarNota(res.locals.operacao, param(req, 'id'), texto) });
  }),
);

esteirasRoutes.put(
  '/:operacao/vinculos/:id/vendedores',
  somenteTim,
  exigirOperacao('EDICAO'),
  validateBody(vendedorSchema),
  asyncHandler(async (req, res) => {
    res.json({ vinculo: await salvarVendedor('TIM', param(req, 'id'), req.body as VendedorInput) });
  }),
);

esteirasRoutes.delete(
  '/:operacao/vinculos/:id/vendedores/:vendedorId',
  somenteTim,
  exigirOperacao('EDICAO'),
  asyncHandler(async (req, res) => {
    res.json({ vinculo: await inativarVendedor('TIM', param(req, 'id'), param(req, 'vendedorId')) });
  }),
);
