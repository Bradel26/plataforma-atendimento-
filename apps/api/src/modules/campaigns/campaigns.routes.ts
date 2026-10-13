import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody } from '../../http/middleware/validate';
import { param } from '../../http/params';
import {
  adicionarContatos,
  agendarCampanha,
  alterarStatus,
  cancelarCampanha,
  criarCampanha,
  dispararCampanha,
  listarCampanhas,
  obterCampanha,
  reprocessarFalhas,
} from './campaigns.service';
import { aplicarPublico, previaDoPublico } from './publico.service';
import { CICLOS } from '../crm/cicloDeVida';
import { SITUACOES_PARCEIRO } from './publico';
import { prisma } from '../../lib/prisma';
import multer from 'multer';
import { badRequest, notFound } from '../../lib/errors';
import { limiteBytes, remover, salvar, urlAssinada } from '../../lib/storage';

export const campanhasRoutes = Router();

campanhasRoutes.use(requireAuth, requireRole('ADMIN', 'SUPERVISOR'));

const campanhaParceiroBaseSchema = z.object({
  nome: z.string().trim().min(3).max(120),
  operacao: z.enum(['TIM', 'STARLINK']),
  descricao: z.string().trim().max(3000).nullable().optional(),
  produtosServicos: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  incentivos: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
  criterios: z.string().trim().max(3000).nullable().optional(),
  materiais: z.array(z.object({ nome: z.string().trim().min(1).max(180), url: z.string().url().max(2000) })).max(20).default([]),
  inicioEm: z.coerce.date().nullable().optional(),
  fimEm: z.coerce.date().nullable().optional(),
  status: z.enum(['RASCUNHO', 'AGENDADA', 'VIGENTE', 'ENCERRADA', 'CANCELADA']).default('RASCUNHO'),
});
const campanhaParceiroSchema = campanhaParceiroBaseSchema.refine((d) => !d.inicioEm || !d.fimEm || d.fimEm >= d.inicioEm, { message: 'A data final deve ser posterior à inicial', path: ['fimEm'] });
const uploadAnexo = multer({ storage: multer.memoryStorage(), limits: { fileSize: limiteBytes, files: 1 } });

function serializarCampanhaParceiro(campanha: Awaited<ReturnType<typeof prisma.partnerCampaign.findFirstOrThrow>>) {
  const anexos = (campanha as typeof campanha & { anexos: Array<{ id: string; nome: string; tipo: string; tamanho: number; url: string; criadoEm: Date }> }).anexos;
  return { ...campanha, anexos: (anexos ?? []).map((anexo) => ({ ...anexo, url: urlAssinada(anexo.url) })) };
}

campanhasRoutes.get('/parceiros', requireRole('ADMIN'), asyncHandler(async (_req, res) => {
  const campanhas = await prisma.partnerCampaign.findMany({ include: { anexos: { orderBy: { criadoEm: 'asc' } } }, orderBy: [{ inicioEm: 'desc' }, { criadoEm: 'desc' }] });
  res.json({ campanhas: campanhas.map(serializarCampanhaParceiro) });
}));

campanhasRoutes.post('/parceiros', requireRole('ADMIN'), validateBody(campanhaParceiroSchema), asyncHandler(async (req, res) => {
  const campanha = await prisma.partnerCampaign.create({ data: { ...req.body, criadoPorId: req.user!.sub }, include: { anexos: true } });
  res.status(201).json({ campanha: serializarCampanhaParceiro(campanha) });
}));

campanhasRoutes.patch('/parceiros/:id', requireRole('ADMIN'), validateBody(campanhaParceiroBaseSchema.partial()), asyncHandler(async (req, res) => {
  const id = param(req, 'id');
  const existente = await prisma.partnerCampaign.findFirst({ where: { id }, include: { anexos: true } });
  if (!existente) return res.status(404).json({ erro: 'Campanha para parceiros não encontrada' });
  const inicioEm = req.body.inicioEm === undefined ? existente.inicioEm : req.body.inicioEm;
  const fimEm = req.body.fimEm === undefined ? existente.fimEm : req.body.fimEm;
  if (inicioEm && fimEm && fimEm < inicioEm) return res.status(400).json({ erro: 'A data final deve ser posterior à inicial' });
  const campanha = await prisma.partnerCampaign.update({ where: { id }, data: req.body, include: { anexos: true } });
  res.json({ campanha: serializarCampanhaParceiro(campanha) });
}));

campanhasRoutes.post('/parceiros/:id/anexos', requireRole('ADMIN'), uploadAnexo.single('arquivo'), asyncHandler(async (req, res) => {
  const id = param(req, 'id');
  const campanha = await prisma.partnerCampaign.findFirst({ where: { id }, select: { id: true, status: true } });
  if (!campanha) throw notFound('Campanha para parceiros não encontrada');
  if (campanha.status !== 'RASCUNHO') throw badRequest('Só é possível anexar arquivos a uma campanha em rascunho');
  if (!req.file) throw badRequest('Selecione um arquivo');
  const arquivo = await salvar({ buffer: req.file.buffer, nome: req.file.originalname, tipo: req.file.mimetype });
  const anexo = await prisma.partnerCampaignAttachment.create({ data: { campanhaId: id, url: arquivo.url, nome: arquivo.nome, tipo: arquivo.tipo, tamanho: arquivo.tamanho } });
  res.status(201).json({ anexo: { ...anexo, url: urlAssinada(anexo.url) } });
}));

campanhasRoutes.delete('/parceiros/:id/anexos/:anexoId', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const campanhaId = param(req, 'id');
  const anexoId = param(req, 'anexoId');
  const anexo = await prisma.partnerCampaignAttachment.findFirst({ where: { id: anexoId, campanhaId, campanha: { status: 'RASCUNHO' } } });
  if (!anexo) throw notFound('Anexo de rascunho não encontrado');
  await prisma.partnerCampaignAttachment.delete({ where: { id: anexoId } });
  await remover(anexo.url.replace(/^\/api\/arquivos\//, ''));
  res.status(204).end();
}));

const criarSchema = z.object({
  nome: z.string().trim().min(3).max(120),
  assunto: z.string().trim().max(180).nullable().optional(),
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
  uf: z.array(z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/)).max(27).optional(),
  funilIds: z.array(z.string().uuid()).max(20).optional(),
  estagioIds: z.array(z.string().uuid()).max(50).optional(),
  situacao: z.array(z.enum(SITUACOES_PARCEIRO)).max(4).optional(),
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

campanhasRoutes.patch('/:id', validateBody(z.object({ nome: z.string().trim().min(3).max(120).optional(), assunto: z.string().trim().max(180).nullable().optional(), mensagem: z.string().trim().min(3).max(1000).optional() }).refine((d) => Object.keys(d).length > 0)), asyncHandler(async (req, res) => {
  const id = param(req, 'id');
  const campanha = await prisma.campaign.findFirst({ where: { id }, select: { id: true, status: true } });
  if (!campanha) throw notFound('Comunicado não encontrado');
  if (campanha.status !== 'RASCUNHO') throw badRequest('Só é possível editar um comunicado em rascunho');
  res.json({ campanha: await prisma.campaign.update({ where: { id }, data: req.body }) });
}));

campanhasRoutes.post('/:id/anexos', uploadAnexo.single('arquivo'), asyncHandler(async (req, res) => {
  const id = param(req, 'id');
  const campanha = await prisma.campaign.findFirst({ where: { id }, select: { id: true, status: true } });
  if (!campanha) throw notFound('Comunicado não encontrado');
  if (campanha.status !== 'RASCUNHO') throw badRequest('Só é possível anexar arquivos a um rascunho');
  if (!req.file) throw badRequest('Selecione um arquivo');
  const arquivo = await salvar({ buffer: req.file.buffer, nome: req.file.originalname, tipo: req.file.mimetype });
  const anexo = await prisma.campaignAttachment.create({ data: { campanhaId: id, url: arquivo.url, nome: arquivo.nome, tipo: arquivo.tipo, tamanho: arquivo.tamanho } });
  res.status(201).json({ anexo: { ...anexo, url: `${arquivo.url}` } });
}));

campanhasRoutes.delete('/:id/anexos/:anexoId', asyncHandler(async (req, res) => {
  const campanhaId = param(req, 'id');
  const anexoId = param(req, 'anexoId');
  const anexo = await prisma.campaignAttachment.findFirst({
    where: { id: anexoId, campanhaId, campanha: { status: 'RASCUNHO' } },
  });
  if (!anexo) throw notFound('Anexo de rascunho não encontrado');
  await prisma.campaignAttachment.delete({ where: { id: anexoId } });
  await remover(anexo.url.replace(/^\/api\/arquivos\//, ''));
  res.status(204).end();
}));

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

campanhasRoutes.patch(
  '/:id/agendamento',
  validateBody(z.object({ agendadaPara: z.coerce.date().nullable() })),
  asyncHandler(async (req, res) => {
    res.json({ campanha: await agendarCampanha(param(req, 'id'), req.body.agendadaPara) });
  }),
);

campanhasRoutes.post(
  '/:id/cancelar',
  asyncHandler(async (req, res) => {
    res.json({ campanha: await cancelarCampanha(param(req, 'id')) });
  }),
);
