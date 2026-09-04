import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody } from '../../http/middleware/validate';
import { param } from '../../http/params';
import {
  adicionarContatos,
  alterarStatus,
  criarCampanha,
  dispararCampanha,
  listarCampanhas,
  obterCampanha,
  reprocessarFalhas,
} from './campaigns.service';
import { aplicarPublico, previaDoPublico } from './publico.service';
import { CICLOS } from '../crm/cicloDeVida';

export const campanhasRoutes = Router();

campanhasRoutes.use(requireAuth, requireRole('ADMIN', 'SUPERVISOR'));

const criarSchema = z.object({
  nome: z.string().trim().min(3).max(120),
  canal: z.enum(['WEBCHAT', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'EMAIL', 'VOZ']).default('WHATSAPP'),
  mensagem: z.string().trim().min(3).max(1000),
  filaId: z.string().uuid().nullable().optional(),
  agendadaPara: z.coerce.date().nullable().optional(),
});

const contatosSchema = z.object({ contatoIds: z.array(z.string().uuid()).min(1).max(2000) });

/**
 * Filtro de publico (item E.3): os mesmos campos da tela de contatos.
 *
 * `responsavelId` aceita nulo explicito, que significa "carteira aberta" — uma
 * pergunta legitima, e nao ausencia de filtro.
 *
 * **Nao ha filtro de regiao**, e a falta e honesta: a plataforma nao guarda
 * endereco de contato nenhum. Oferecer "mesorregiao" como a demonstracao faz
 * exigiria inventar o dado, e um filtro que devolve zero sempre e pior que um
 * filtro ausente.
 */
const filtroPublicoSchema = z.object({
  ciclo: z.array(z.enum(CICLOS)).max(6).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  origem: z
    .array(z.enum(['WEBCHAT', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'EMAIL', 'VOZ']))
    .max(6)
    .optional(),
  papel: z
    .array(z.enum(['SOCIO', 'ADMINISTRADOR', 'DECISOR', 'TECNICO', 'FINANCEIRO', 'COMPRAS', 'OUTRO']))
    .max(7)
    .optional(),
  responsavelId: z.string().uuid().nullable().optional(),
});

const previaSchema = filtroPublicoSchema.extend({
  canal: z.enum(['WEBCHAT', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'EMAIL', 'VOZ']),
});
const statusSchema = z.object({ status: z.enum(['RASCUNHO', 'ATIVA', 'PAUSADA', 'CONCLUIDA']) });
const dispararSchema = z.object({ limite: z.number().int().min(1).max(500).default(100) });

campanhasRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ campanhas: await listarCampanhas() });
  }),
);

campanhasRoutes.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await obterCampanha(param(req, 'id')));
  }),
);

campanhasRoutes.post(
  '/',
  validateBody(criarSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ campanha: await criarCampanha(req.body, req.user!.sub) });
  }),
);

campanhasRoutes.post(
  '/:id/contatos',
  validateBody(contatosSchema),
  asyncHandler(async (req, res) => {
    res.json({ campanha: await adicionarContatos(param(req, 'id'), req.body.contatoIds) });
  }),
);

/**
 * Previa do publico (item E.3). **Nao escreve nada.**
 *
 * POST e nao GET porque o filtro e um objeto com listas: em query string ele
 * viraria `?ciclo=A&ciclo=B&tags=...`, que passa dos limites de tamanho de URL
 * assim que alguem escolhe muitas etiquetas — e nao ha nada de idempotente a
 * ganhar aqui, ja que a previa nao muda nada.
 *
 * O canal vem no corpo, e nao da campanha, porque a previa acontece ANTES de a
 * campanha existir: quem esta montando quer saber "quantos alcanco por WhatsApp"
 * enquanto ainda escolhe o canal.
 */
campanhasRoutes.post(
  '/publico/previa',
  validateBody(previaSchema),
  asyncHandler(async (req, res) => {
    const { canal, ...filtro } = req.body;
    res.json({ publico: await previaDoPublico(filtro, canal) });
  }),
);

/**
 * Grava o publico filtrado na campanha.
 *
 * O canal vem da propria campanha, e nao do corpo: gravar publico de e-mail numa
 * campanha de WhatsApp criaria itens que falham no disparo, e a discordancia
 * apareceria so no relatorio.
 */
campanhasRoutes.post(
  '/:id/publico',
  validateBody(filtroPublicoSchema),
  asyncHandler(async (req, res) => {
    const campanha = await obterCampanha(param(req, 'id'));
    res.json({
      resultado: await aplicarPublico(campanha.campanha.id, req.body, campanha.campanha.canal),
      campanha: (await obterCampanha(param(req, 'id'))).campanha,
    });
  }),
);

campanhasRoutes.patch(
  '/:id/status',
  validateBody(statusSchema),
  asyncHandler(async (req, res) => {
    res.json({ campanha: await alterarStatus(param(req, 'id'), req.body.status) });
  }),
);

campanhasRoutes.post(
  '/:id/disparar',
  validateBody(dispararSchema),
  asyncHandler(async (req, res) => {
    res.json({ resultado: await dispararCampanha(param(req, 'id'), req.body.limite) });
  }),
);

campanhasRoutes.post(
  '/:id/reprocessar',
  asyncHandler(async (req, res) => {
    res.json({ resultado: await reprocessarFalhas(param(req, 'id')) });
  }),
);
