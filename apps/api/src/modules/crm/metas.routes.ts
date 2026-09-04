import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody, validateQuery } from '../../http/middleware/validate';
import { apagarMeta, gravarRampa, lerRampa, listarMetas, minhaMeta } from './metas.service';
import { mesesEntre } from './metas';

/**
 * Metas mensais (item 4.1 do plano em ANALISE-CRM.md).
 *
 * Duas alcadas diferentes, e a diferenca e a mesma da politica de desconto
 * (decisao 58) e do processo do funil (decisao 59): **definir** meta e decidir
 * pelos outros, e fica com ADMIN/SUPERVISOR; **ler** o painel e trabalho de
 * gestao, e inclui GESTOR. Ver a propria meta e de qualquer um que venda.
 */
export const metasRoutes = Router();

metasRoutes.use(requireAuth);

const LEITURA = requireRole('ADMIN', 'SUPERVISOR', 'GESTOR');
const ESCRITA = requireRole('ADMIN', 'SUPERVISOR');

/**
 * O mes vem como `AAAA-MM`, nao como data completa.
 *
 * Aceitar data completa convidaria a mandar `2026-09-30` e esperar "setembro",
 * o que funciona — mas tambem `2026-09-30T23:00:00-03:00`, que em UTC cai em
 * outubro. Recebendo `AAAA-MM` nao existe fuso para errar.
 */
const mesSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Informe o mes no formato AAAA-MM')
  .transform((v) => new Date(`${v}-01T00:00:00Z`));

const escopoSchema = z.enum(['INDIVIDUAL', 'EQUIPE']);

metasRoutes.get(
  '/',
  LEITURA,
  validateQuery(z.object({ mes: mesSchema.optional() })),
  asyncHandler(async (_req, res) => {
    // Sem mes, o mes corrente: e o que a gestao quer ver ao abrir.
    res.json(await listarMetas(res.locals.query.mes ?? new Date()));
  }),
);

/** A propria meta. Sem `requireRole`: quem vende ve o proprio numero. */
metasRoutes.get(
  '/minha',
  validateQuery(z.object({ mes: mesSchema.optional() })),
  asyncHandler(async (_req, res) => {
    res.json(await minhaMeta(res.locals.query.mes ?? new Date()));
  }),
);

metasRoutes.get(
  '/rampa',
  LEITURA,
  validateQuery(
    z.object({
      usuarioId: z.string().uuid(),
      de: mesSchema,
      ate: mesSchema,
      escopo: escopoSchema.default('INDIVIDUAL'),
    }),
  ),
  asyncHandler(async (_req, res) => {
    const { usuarioId, de, ate, escopo } = res.locals.query;
    res.json({ rampa: await lerRampa(usuarioId, de, ate, escopo) });
  }),
);

/**
 * Grava a rampa inteira de uma vez.
 *
 * Uma rota que gravasse um mes por chamada tornaria "meta diferente por mes"
 * doze idas ao formulario, e ninguem faria — a rampa mensal e justamente o que
 * distingue isto de uma meta anual.
 */
metasRoutes.put(
  '/rampa',
  ESCRITA,
  validateBody(
    z.object({
      usuarioId: z.string().uuid(),
      escopo: escopoSchema,
      valores: z
        .array(z.object({ mes: mesSchema, valor: z.number().nonnegative().max(1_000_000_000) }))
        .min(1, 'Informe ao menos um mes')
        // Teto de 36, o mesmo de `mesesEntre`: rampa maior que tres anos e quase
        // sempre erro de digitacao na data.
        .max(36, 'A rampa cabe em 36 meses'),
    }),
  ),
  asyncHandler(async (req, res) => {
    res.json({ metas: await gravarRampa(req.body) });
  }),
);

metasRoutes.delete(
  '/',
  ESCRITA,
  validateQuery(z.object({ usuarioId: z.string().uuid(), escopo: escopoSchema, mes: mesSchema })),
  asyncHandler(async (_req, res) => {
    const { usuarioId, escopo, mes } = res.locals.query;
    await apagarMeta(usuarioId, escopo, mes);
    res.status(204).end();
  }),
);

/**
 * Os meses de um intervalo, para a tela montar o formulario da rampa.
 *
 * Fica na API, e nao no front, porque `mesesEntre` e a mesma funcao que a
 * gravacao usa para normalizar competencia — duas implementacoes de "quais meses
 * ha entre" divergiriam na virada de ano, que e exatamente onde a rampa importa.
 */
metasRoutes.get(
  '/meses',
  LEITURA,
  validateQuery(z.object({ de: mesSchema, ate: mesSchema })),
  asyncHandler(async (_req, res) => {
    res.json({ meses: mesesEntre(res.locals.query.de, res.locals.query.ate) });
  }),
);
