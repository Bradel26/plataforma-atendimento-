import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth } from '../../http/middleware/auth';
import { validateBody, validateQuery } from '../../http/middleware/validate';
import { param } from '../../http/params';
import { badRequest, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { TIPOS_EVENTO, fichaConta, fichaContato, timeline } from './ficha.service';

export const fichaRoutes = Router();
export const atividadesRoutes = Router();

fichaRoutes.use(requireAuth);
atividadesRoutes.use(requireAuth);

/* ── Ficha 360 ─────────────────────────────────────────────────────────── */

const timelineSchema = z.object({
  /**
   * Lista separada por virgula em vez de `tipos[]` repetido: o filtro vai na URL
   * que o usuario compartilha, e `?tipos=CONVERSA,CHAMADA` e legivel.
   */
  tipos: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.split(',').map((t) => t.trim().toUpperCase()) : undefined))
    .refine(
      (v) => !v || v.every((t) => (TIPOS_EVENTO as readonly string[]).includes(t)),
      `Tipo invalido. Use: ${TIPOS_EVENTO.join(', ')}`,
    )
    .transform((v) => v as (typeof TIPOS_EVENTO)[number][] | undefined),
  desde: z.coerce.date().optional(),
  ate: z.coerce.date().optional(),
  cursor: z.string().optional(),
  limite: z.coerce.number().int().min(1).max(100).default(30),
});

fichaRoutes.get(
  '/contato/:id',
  asyncHandler(async (req, res) => {
    res.json(await fichaContato(param(req, 'id')));
  }),
);

fichaRoutes.get(
  '/conta/:id',
  asyncHandler(async (req, res) => {
    res.json(await fichaConta(param(req, 'id')));
  }),
);

fichaRoutes.get(
  '/contato/:id/timeline',
  validateQuery(timelineSchema),
  asyncHandler(async (req, res) => {
    const contatoId = param(req, 'id');
    // A conta entra na raiz para que a ficha do contato mostre tambem o que
    // aconteceu com a empresa dele — sem isso, a "vida do cliente" para no
    // atendimento e nunca chega na oportunidade.
    const contato = await prisma.contact.findUnique({
      where: { id: contatoId },
      select: { contaId: true },
    });
    if (!contato) throw notFound('Contato nao encontrado');

    const q = res.locals.query as z.infer<typeof timelineSchema>;
    res.json(await timeline({ ...q, contatoId, contaId: contato.contaId }));
  }),
);

fichaRoutes.get(
  '/conta/:id/timeline',
  validateQuery(timelineSchema),
  asyncHandler(async (req, res) => {
    const contaId = param(req, 'id');
    const existe = await prisma.account.findUnique({ where: { id: contaId }, select: { id: true } });
    if (!existe) throw notFound('Conta nao encontrada');

    const q = res.locals.query as z.infer<typeof timelineSchema>;
    res.json(await timeline({ ...q, contatoId: null, contaId }));
  }),
);

/* ── Atividades ────────────────────────────────────────────────────────── */

const TIPOS = ['NOTA', 'LIGACAO', 'WHATSAPP', 'EMAIL', 'REUNIAO', 'VISITA', 'PROPOSTA'] as const;

const vinculos = {
  contatoId: z.string().uuid().nullable().optional(),
  contaId: z.string().uuid().nullable().optional(),
  oportunidadeId: z.string().uuid().nullable().optional(),
  protocoloId: z.string().uuid().nullable().optional(),
};

const criarSchema = z
  .object({
    tipo: z.enum(TIPOS),
    titulo: z.string().trim().min(2, 'Titulo muito curto').max(160),
    descricao: z.string().trim().max(4000).nullable().optional(),
    /** Nulo = so registrando o que aconteceu. Preenchido = tarefa com prazo. */
    prazo: z.coerce.date().nullable().optional(),
    responsavelId: z.string().uuid().nullable().optional(),
    ...vinculos,
  })
  // O banco nao expressa "um destes quatro nao nulo"; a regra vive aqui.
  .refine(
    (d) => Boolean(d.contatoId || d.contaId || d.oportunidadeId || d.protocoloId),
    'Vincule a atividade a um contato, conta, oportunidade ou protocolo',
  );

const atualizarSchema = z
  .object({
    tipo: z.enum(TIPOS).optional(),
    titulo: z.string().trim().min(2).max(160).optional(),
    descricao: z.string().trim().max(4000).nullable().optional(),
    prazo: z.coerce.date().nullable().optional(),
    responsavelId: z.string().uuid().nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, 'Informe ao menos um campo');

const listarSchema = z.object({
  contatoId: z.string().uuid().optional(),
  contaId: z.string().uuid().optional(),
  oportunidadeId: z.string().uuid().optional(),
  responsavelId: z.string().uuid().optional(),
  /** abertas = com prazo e nao concluidas; atrasadas = abertas com prazo vencido. */
  situacao: z.enum(['todas', 'abertas', 'atrasadas', 'concluidas']).default('todas'),
  limite: z.coerce.number().int().min(1).max(200).default(50),
});

const inclusao = {
  responsavel: { select: { id: true, nome: true } },
  criadoPor: { select: { id: true, nome: true } },
} as const;

atividadesRoutes.get(
  '/',
  validateQuery(listarSchema),
  asyncHandler(async (req, res) => {
    const q = res.locals.query as z.infer<typeof listarSchema>;
    const agora = new Date();

    const situacao =
      q.situacao === 'abertas'
        ? { concluidoEm: null, prazo: { not: null } }
        : q.situacao === 'atrasadas'
          ? { concluidoEm: null, prazo: { lt: agora } }
          : q.situacao === 'concluidas'
            ? { concluidoEm: { not: null } }
            : {};

    const atividades = await prisma.activity.findMany({
      where: {
        ...situacao,
        contatoId: q.contatoId,
        contaId: q.contaId,
        oportunidadeId: q.oportunidadeId,
        responsavelId: q.responsavelId,
      },
      // Tarefa em aberto ordena pelo prazo mais proximo; o resto, pelo mais
      // recente. `nulls: 'last'` deixa o registro sem prazo no fim.
      orderBy: [{ prazo: { sort: 'asc', nulls: 'last' } }, { criadoEm: 'desc' }],
      take: q.limite,
      include: inclusao,
    });

    res.json({ atividades });
  }),
);

/**
 * Confere que todo vinculo informado pertence a organizacao de quem pede.
 *
 * A coluna `organizacaoId` da atividade impede a LEITURA cruzada, e nao a
 * escrita: o Postgres aceitaria uma atividade da organizacao B apontando para o
 * contato da A, porque a chave estrangeira nao exige mesma organizacao. Cada
 * `findFirst` abaixo passa pelo filtro da extensao, entao um id de outra empresa
 * simplesmente nao e encontrado.
 *
 * 404 e nao 403: dizer "proibido" confirmaria que o registro existe.
 *
 * Isto foi encontrado pelo `smoke:tenant`, que recebeu 201 onde esperava 404 —
 * o unico furo real da fundacao de organizacao.
 */
async function conferirVinculos(dados: {
  contatoId?: string | null;
  contaId?: string | null;
  oportunidadeId?: string | null;
  protocoloId?: string | null;
}) {
  const conferencias: Array<[string | null | undefined, () => Promise<unknown>]> = [
    [dados.contatoId, () => prisma.contact.findFirst({ where: { id: dados.contatoId! }, select: { id: true } })],
    [dados.contaId, () => prisma.account.findFirst({ where: { id: dados.contaId! }, select: { id: true } })],
    [
      dados.oportunidadeId,
      () => prisma.opportunity.findFirst({ where: { id: dados.oportunidadeId! }, select: { id: true } }),
    ],
    [dados.protocoloId, () => prisma.ticket.findFirst({ where: { id: dados.protocoloId! }, select: { id: true } })],
  ];

  for (const [valor, buscar] of conferencias) {
    if (!valor) continue;
    if (!(await buscar())) throw notFound('Registro vinculado nao encontrado');
  }
}

atividadesRoutes.post(
  '/',
  validateBody(criarSchema),
  asyncHandler(async (req, res) => {
    const dados = req.body as z.infer<typeof criarSchema>;
    const autorId = req.user?.sub;

    await conferirVinculos(dados);

    const atividade = await prisma.activity.create({
      data: {
        ...dados,
        criadoPorId: autorId,
        // Sem responsavel explicito, quem registra e o responsavel: tarefa sem
        // dono nao aparece em nenhuma lista e morre.
        responsavelId: dados.responsavelId ?? autorId,
      },
      include: inclusao,
    });

    res.status(201).json({ atividade });
  }),
);

atividadesRoutes.patch(
  '/:id',
  validateBody(atualizarSchema),
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const existe = await prisma.activity.findUnique({ where: { id }, select: { id: true } });
    if (!existe) throw notFound('Atividade nao encontrada');

    const atividade = await prisma.activity.update({
      where: { id },
      data: req.body as z.infer<typeof atualizarSchema>,
      include: inclusao,
    });

    res.json({ atividade });
  }),
);

atividadesRoutes.post(
  '/:id/concluir',
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const atual = await prisma.activity.findUnique({
      where: { id },
      select: { concluidoEm: true },
    });
    if (!atual) throw notFound('Atividade nao encontrada');
    if (atual.concluidoEm) throw badRequest('Atividade ja esta concluida');

    const atividade = await prisma.activity.update({
      where: { id },
      data: { concluidoEm: new Date() },
      include: inclusao,
    });

    res.json({ atividade });
  }),
);

atividadesRoutes.post(
  '/:id/reabrir',
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const existe = await prisma.activity.findUnique({ where: { id }, select: { id: true } });
    if (!existe) throw notFound('Atividade nao encontrada');

    const atividade = await prisma.activity.update({
      where: { id },
      data: { concluidoEm: null },
      include: inclusao,
    });

    res.json({ atividade });
  }),
);

atividadesRoutes.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const existe = await prisma.activity.findUnique({ where: { id }, select: { id: true } });
    if (!existe) throw notFound('Atividade nao encontrada');

    await prisma.activity.delete({ where: { id } });
    res.status(204).end();
  }),
);
