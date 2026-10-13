import { Router } from 'express';
import { recalcularCiclosDoContato } from './cicloParceiro.service';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth } from '../../http/middleware/auth';
import { validateBody, validateQuery } from '../../http/middleware/validate';
import { param } from '../../http/params';
import { badRequest, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import {
  coordenadaValida,
  duracaoEmMinutos,
  impedimentoDoCheckin,
  impedimentoDoCheckout,
} from './visita';
import {
  filtroDe,
  politicaAtividades,
  politicaContas,
  politicaContatos,
  politicaOportunidades,
  politicaProtocolos,
  exigirUsuarioDaOrganizacao,
} from '../../lib/politicas';
import { apenasVisivel } from '../../lib/visibilidade';
import { TIPOS_EVENTO, fichaConta, fichaContato, timeline } from './ficha.service';
import { diasDaSemana, montarAgenda, segundaDaSemana } from './agenda';

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
      `Tipo inválido. Use: ${TIPOS_EVENTO.join(', ')}`,
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
    const contato = await prisma.contact.findFirst({
      where: apenasVisivel(contatoId, await filtroDe(politicaContatos)),
      select: { contaId: true },
    });
    if (!contato) throw notFound('Contato não encontrado');

    const q = res.locals.query as z.infer<typeof timelineSchema>;
    res.json(await timeline({ ...q, contatoId, contaId: contato.contaId }));
  }),
);

fichaRoutes.get(
  '/conta/:id/timeline',
  validateQuery(timelineSchema),
  asyncHandler(async (req, res) => {
    const contaId = param(req, 'id');
    const existe = await prisma.account.findFirst({
      where: apenasVisivel(contaId, await filtroDe(politicaContas)),
      select: { id: true },
    });
    if (!existe) throw notFound('Conta não encontrada');

    const q = res.locals.query as z.infer<typeof timelineSchema>;
    res.json(await timeline({ ...q, contatoId: null, contaId }));
  }),
);

/* ── Atividades ────────────────────────────────────────────────────────── */

const TIPOS = ['NOTA', 'TAREFA', 'LIGACAO', 'WHATSAPP', 'EMAIL', 'REUNIAO', 'VISITA', 'PROPOSTA', 'RETORNO', 'DOCUMENTACAO', 'ACOMPANHAMENTO', 'OUTRO'] as const;

const vinculos = {
  contatoId: z.string().uuid().nullable().optional(),
  contaId: z.string().uuid().nullable().optional(),
  oportunidadeId: z.string().uuid().nullable().optional(),
  protocoloId: z.string().uuid().nullable().optional(),
};

const criarSchema = z
  .object({
    tipo: z.enum(TIPOS),
    titulo: z.string().trim().min(2, 'Título muito curto').max(160),
    descricao: z.string().trim().max(4000).nullable().optional(),
    /** Nulo = so registrando o que aconteceu. Preenchido = tarefa com prazo. */
    prazo: z.coerce.date().nullable().optional(),
    responsavelId: z.string().uuid().nullable().optional(),
    ...vinculos,
    recorrencia: z.object({
      frequencia: z.enum(['DIARIA', 'SEMANAL', 'MENSAL']),
      diasSemana: z.array(z.number().int().min(0).max(6)).max(7).default([]),
      fimEm: z.coerce.date().optional(),
    }).optional(),
  })
  // O banco nao expressa "um destes quatro nao nulo"; a regra vive aqui.
  .refine(
    (d) => Boolean(d.contatoId || d.contaId || d.oportunidadeId || d.protocoloId),
    'Vincule a atividade a um contato, conta, oportunidade ou protocolo',
  );

const registroManualSchema = z.object({
  contatoId: z.string().uuid(),
  canal: z.enum(['TELEFONE', 'VISITA', 'OUTRO']),
  ocorridoEm: z.coerce.date(),
  assunto: z.string().trim().min(2, 'Informe o assunto').max(160),
  descricao: z.string().trim().min(2, 'Descreva o atendimento').max(4000),
  resultado: z.string().trim().min(2, 'Informe o resultado').max(2000),
  proximaAcao: z.string().trim().min(2, 'Informe a próxima ação').max(160),
  descricaoTarefa: z.string().trim().max(2000).nullable().optional(),
  prazoTarefa: z.coerce.date(),
  responsavelTarefaId: z.string().uuid().optional(),
});

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
  /*
   * abertas = com prazo e nao concluidas; atrasadas = abertas com prazo vencido.
   *
   * `pendentes` e diferente de `abertas` e a diferenca importa: pendente e
   * "nao concluida", com ou sem prazo. A tarefa que a etapa do funil exige
   * (item 3.1) nasce **sem prazo** de proposito — um prazo inventado viraria
   * "atrasada" dias depois sem ninguem ter combinado data — e por isso ela
   * nao aparece em `abertas`. Sem este valor, a tarefa que bloqueia o funil
   * seria a unica que nenhuma lista mostra.
   */
  situacao: z.enum(['todas', 'abertas', 'pendentes', 'atrasadas', 'concluidas']).default('todas'),
  limite: z.coerce.number().int().min(1).max(200).default(50),
});

const inclusao = {
  responsavel: { select: { id: true, nome: true } },
  criadoPor: { select: { id: true, nome: true } },
} as const;

/**
 * Agenda da semana (item E.5).
 *
 * Vem ANTES de `/` no arquivo por clareza, e o endereco proprio (`/semana`) nao
 * colide com nada.
 *
 * **O fuso vem de quem pergunta.** `offset` e o `getTimezoneOffset()` do
 * navegador, e sem ele a tarefa de sabado as 22h (domingo 01h UTC) apareceria no
 * domingo — mesmo raciocinio das metas, que recebem `AAAA-MM` para nao existir
 * fuso a errar.
 *
 * Sem `requireRole`: cada um ve a propria agenda pela politica de atividades. O
 * gestor que quiser a agenda de alguem passa `responsavelId` — e a politica dele
 * ja permite ver a equipe, ou nao permite, sem esta rota decidir nada a parte.
 */
atividadesRoutes.get(
  '/semana',
  validateQuery(
    z.object({
      /** Segunda-feira da semana, `AAAA-MM-DD`. Ausente = a semana de hoje. */
      inicio: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use AAAA-MM-DD')
        .optional(),
      /** Minutos a subtrair do horario local para chegar ao UTC (Brasil: 180). */
      offset: z.coerce.number().int().min(-840).max(840).default(0),
      responsavelId: z.string().uuid().optional(),
    }),
  ),
  asyncHandler(async (_req, res) => {
    const q = res.locals.query as { inicio?: string; offset: number; responsavelId?: string };
    const inicio = q.inicio ?? segundaDaSemana(new Date(), q.offset);
    const dias = diasDaSemana(inicio, q.offset);

    /*
     * A consulta pega TRES conjuntos numa so: o que cai na semana, o atrasado de
     * antes dela e o pendente sem prazo. Buscar em tres consultas abriria a porta
     * para os tres verem versoes diferentes do banco — a tarefa concluida entre a
     * primeira e a terceira apareceria em duas faixas.
     */
    const atividades = await prisma.activity.findMany({
      where: {
        AND: [
          {
            responsavelId: q.responsavelId,
            canceladoEm: null,
            OR: [
              { prazo: { gte: dias[0]!.inicio, lt: dias[dias.length - 1]!.fim } },
              { prazo: { lt: dias[0]!.inicio }, concluidoEm: null },
              { prazo: null, concluidoEm: null },
            ],
          },
          await filtroDe(politicaAtividades),
        ],
      },
      orderBy: [{ prazo: { sort: 'asc', nulls: 'last' } }, { criadoEm: 'desc' }],
      // Teto alto para a semana nao vir cortada em silencio, e a contagem de
      // "sem prazo" nao virar um numero que depende do limite.
      take: 500,
      include: {
        ...inclusao,
        contato: { select: { id: true, nome: true } },
        oportunidade: { select: { id: true, titulo: true } },
      },
    });

    const agenda = montarAgenda(atividades, dias);
    res.json({ inicio, agenda });
  }),
);

atividadesRoutes.get(
  '/',
  validateQuery(listarSchema),
  asyncHandler(async (req, res) => {
    const q = res.locals.query as z.infer<typeof listarSchema>;
    const agora = new Date();

    const situacao =
      q.situacao === 'abertas'
        ? { concluidoEm: null, prazo: { not: null } }
        : q.situacao === 'pendentes'
          ? { concluidoEm: null }
          : q.situacao === 'atrasadas'
            ? { concluidoEm: null, prazo: { lt: agora } }
            : q.situacao === 'concluidas'
              ? { concluidoEm: { not: null } }
              : {};

    const atividades = await prisma.activity.findMany({
      where: {
        AND: [
          {
            ...situacao,
            canceladoEm: null,
            contatoId: q.contatoId,
            contaId: q.contaId,
            oportunidadeId: q.oportunidadeId,
            responsavelId: q.responsavelId,
          },
          await filtroDe(politicaAtividades),
        ],
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
  /*
   * Cada vinculo passa pela politica do proprio dominio.
   *
   * Antes a conferencia so garantia que o registro era da mesma **organizacao**
   * — o que fechava o furo que o smoke:tenant achou na fundacao. Agora garante
   * tambem que ele esta no **escopo de quem escreve**: sem isso, um comercial
   * penduraria uma atividade no contato da carteira do colega, e a atividade
   * apareceria na ficha alheia.
   */
  const conferencias: Array<[string | null | undefined, () => Promise<unknown>]> = [
    [
      dados.contatoId,
      async () =>
        prisma.contact.findFirst({
          where: apenasVisivel(dados.contatoId!, await filtroDe(politicaContatos)),
          select: { id: true },
        }),
    ],
    [
      dados.contaId,
      async () =>
        prisma.account.findFirst({
          where: apenasVisivel(dados.contaId!, await filtroDe(politicaContas)),
          select: { id: true },
        }),
    ],
    [
      dados.oportunidadeId,
      async () =>
        prisma.opportunity.findFirst({
          where: apenasVisivel(dados.oportunidadeId!, await filtroDe(politicaOportunidades)),
          select: { id: true },
        }),
    ],
    [
      dados.protocoloId,
      async () =>
        prisma.ticket.findFirst({
          where: apenasVisivel(dados.protocoloId!, await filtroDe(politicaProtocolos)),
          select: { id: true },
        }),
    ],
  ];

  for (const [valor, buscar] of conferencias) {
    if (!valor) continue;
    if (!(await buscar())) throw notFound('Registro vinculado não encontrado');
  }
}

atividadesRoutes.post(
  '/',
  validateBody(criarSchema),
  asyncHandler(async (req, res) => {
    const dados = req.body as z.infer<typeof criarSchema>;
    const autorId = req.user?.sub;

    // No Atendimento e na ficha do contato, um registro precisa deixar a próxima
    // ação agendada. A rota manual abaixo cria interação e tarefa em transação.
    if (dados.contatoId && !dados.prazo) {
      throw badRequest('Informe a data e a hora da próxima tarefa antes de salvar');
    }

    await conferirVinculos(dados);

    const { recorrencia, ...atividadeDados } = dados;
    let atividade;
    if (!recorrencia) {
      atividade = await prisma.activity.create({
        data: {
          ...atividadeDados,
          criadoPorId: autorId,
          responsavelId: dados.responsavelId ?? autorId,
        },
        include: inclusao,
      });
    } else {
      if (!dados.prazo || (recorrencia.fimEm && recorrencia.fimEm <= dados.prazo)) throw badRequest('A data final precisa ser posterior à primeira ocorrência');
      if (recorrencia.frequencia === 'SEMANAL' && recorrencia.diasSemana.length === 0) throw badRequest('Selecione ao menos um dia da semana');
      if (recorrencia.fimEm && recorrencia.fimEm.getTime() - dados.prazo.getTime() > 10 * 366 * 24 * 60 * 60 * 1000) throw badRequest('A recorrência pode durar no máximo dez anos');
      const datas: Date[] = [];
      const cursor = new Date(dados.prazo);
      const horizonteInicial = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);
      const limiteInicial = recorrencia.fimEm && recorrencia.fimEm < horizonteInicial ? recorrencia.fimEm : horizonteInicial;
      while (cursor <= limiteInicial && datas.length < 120) {
        const dia = cursor.getDay();
        const inclui = datas.length === 0 || (
          recorrencia.frequencia === 'DIARIA' ||
          (recorrencia.frequencia === 'SEMANAL' && recorrencia.diasSemana.includes(dia)) ||
          (recorrencia.frequencia === 'MENSAL' && cursor.getDate() === dados.prazo.getDate())
        );
        if (inclui) datas.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      const criadas = await prisma.$transaction(async (tx) => {
        const serie = await tx.activitySeries.create({ data: {
          frequencia: recorrencia.frequencia,
          diasSemana: recorrencia.diasSemana,
          inicioEm: dados.prazo!,
          fimEm: recorrencia.fimEm ?? null,
        } });
        return Promise.all(datas.map((prazo) => tx.activity.create({
          data: { ...atividadeDados, prazo, serieId: serie.id, criadoPorId: autorId, responsavelId: dados.responsavelId ?? autorId },
          include: inclusao,
        })));
      });
      atividade = criadas[0]!;
      res.status(201).json({ atividade, ocorrencias: criadas.length, serieId: atividade.serieId });
      return;
    }

    if (atividade.contatoId) void recalcularCiclosDoContato(atividade.contatoId).catch(() => undefined);

    res.status(201).json({ atividade });
  }),
);

atividadesRoutes.post('/:id/cancelar-serie', asyncHandler(async (req, res) => {
  const serieId = param(req, 'id');
  const serie = await prisma.activitySeries.findFirst({ where: { id: serieId } });
  if (!serie) throw notFound('Série de atividades não encontrada');
  const agora = new Date();
  await prisma.$transaction([
    prisma.activitySeries.update({ where: { id: serieId }, data: { canceladoEm: agora } }),
    prisma.activity.updateMany({ where: { serieId, concluidoEm: null, canceladoEm: null, prazo: { gte: agora } }, data: { canceladoEm: agora } }),
  ]);
  res.json({ cancelada: true });
}));

atividadesRoutes.post('/:id/cancelar', asyncHandler(async (req, res) => {
  const id = param(req, 'id');
  const atividade = await prisma.activity.findFirst({ where: apenasVisivel(id, await filtroDe(politicaAtividades)) });
  if (!atividade) throw notFound('Atividade não encontrada');
  if (atividade.concluidoEm) throw badRequest('Uma atividade concluída não pode ser cancelada');
  const atualizada = await prisma.activity.update({ where: { id }, data: { canceladoEm: new Date() }, include: inclusao });
  res.json({ atividade: atualizada });
}));

// Edita as ocorrências futuras de uma recorrência sem alterar o histórico já
// concluído. Cada prazo conserva o dia original e recebe o horário escolhido.
atividadesRoutes.patch('/:id/serie', validateBody(atualizarSchema), asyncHandler(async (req, res) => {
  const serieId = param(req, 'id');
  const serie = await prisma.activitySeries.findFirst({ where: { id: serieId, canceladoEm: null } });
  if (!serie) throw notFound('Série de atividades não encontrada');
  const amostra = await prisma.activity.findFirst({
    where: { serieId, AND: [await filtroDe(politicaAtividades)] },
    select: { id: true },
  });
  if (!amostra) throw notFound('Série de atividades não encontrada');
  const dados = req.body as z.infer<typeof atualizarSchema>;
  const futuras = await prisma.activity.findMany({
    where: { serieId, concluidoEm: null, canceladoEm: null, prazo: { gte: new Date() } },
    select: { id: true, prazo: true },
  });
  await prisma.$transaction(futuras.map((item) => {
    const prazo = dados.prazo && item.prazo
      ? new Date(item.prazo.getFullYear(), item.prazo.getMonth(), item.prazo.getDate(), dados.prazo.getHours(), dados.prazo.getMinutes())
      : dados.prazo;
    return prisma.activity.update({ where: { id: item.id }, data: { ...dados, ...(prazo !== undefined ? { prazo } : {}) } });
  }));
  res.json({ atualizadas: futuras.length });
}));

atividadesRoutes.post(
  '/registro-manual',
  validateBody(registroManualSchema),
  asyncHandler(async (req, res) => {
    const dados = req.body as z.infer<typeof registroManualSchema>;
    const autorId = req.user!.sub;
    const contato = await prisma.contact.findFirst({
      where: apenasVisivel(dados.contatoId, await filtroDe(politicaContatos)),
      select: { id: true, contaId: true },
    });
    if (!contato) throw notFound('Contato não encontrado');
    const responsavelTarefaId = dados.responsavelTarefaId ?? autorId;
    await exigirUsuarioDaOrganizacao(responsavelTarefaId);
    await conferirVinculos({ contatoId: contato.id, contaId: contato.contaId });

    const resultado = await prisma.$transaction(async (tx) => {
      const registro = await tx.activity.create({
        data: {
          tipo: dados.canal === 'TELEFONE' ? 'LIGACAO' : dados.canal === 'VISITA' ? 'VISITA' : 'OUTRO',
          canalManual: dados.canal,
          ocorridoEm: dados.ocorridoEm,
          titulo: dados.assunto,
          descricao: dados.descricao,
          resultado: dados.resultado,
          contatoId: contato.id,
          contaId: contato.contaId,
          responsavelId: autorId,
          criadoPorId: autorId,
        },
      });
      const tarefa = await tx.activity.create({
        data: {
          tipo: 'TAREFA',
          titulo: dados.proximaAcao,
          descricao: dados.descricaoTarefa ?? null,
          prazo: dados.prazoTarefa,
          contatoId: contato.id,
          contaId: contato.contaId,
          responsavelId: responsavelTarefaId,
          criadoPorId: autorId,
          registroPaiId: registro.id,
        },
        include: inclusao,
      });
      return { registro, tarefa };
    });

    void recalcularCiclosDoContato(contato.id).catch(() => undefined);
    res.status(201).json(resultado);
  }),
);

atividadesRoutes.patch(
  '/:id',
  validateBody(atualizarSchema),
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const existe = await prisma.activity.findFirst({
      where: apenasVisivel(id, await filtroDe(politicaAtividades)),
      select: { id: true },
    });
    if (!existe) throw notFound('Atividade não encontrada');
    /*
     * Sem conferencia de vinculo aqui, e de proposito: o `atualizarSchema` da
     * atividade nao aceita `contatoId`, `contaId` nem `oportunidadeId` — so
     * tipo, titulo, descricao, prazo e responsavel. Nao ha vinculo para
     * atravessar. O TypeScript confirmou isso ao recusar a chamada por "no
     * properties in common", o que e uma forma barata de auditar esta classe de
     * furo: se alguem acrescentar `contatoId` ao schema, a conferencia volta a
     * ser necessaria e a ausencia dela deixa de ser justificavel.
     */

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
  validateBody(z.object({ justificativa: z.string().trim().min(3).max(1000), resultado: z.string().trim().min(1).max(1000) })),
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const atual = await prisma.activity.findFirst({
      where: apenasVisivel(id, await filtroDe(politicaAtividades)),
      select: { concluidoEm: true },
    });
    if (!atual) throw notFound('Atividade não encontrada');
    if (atual.concluidoEm) throw badRequest('Atividade já está concluída');

    const atividade = await prisma.activity.update({
      where: { id },
      data: {
        concluidoEm: new Date(),
        concluidoPorId: req.user!.sub,
        justificativaConclusao: req.body.justificativa,
        resultadoConclusao: req.body.resultado,
      },
      include: inclusao,
    });

    if (atividade.contatoId) void recalcularCiclosDoContato(atividade.contatoId).catch(() => undefined);

    res.json({ atividade });
  }),
);

/* ── Check-in e check-out de visita (item 6.7) ────────────────────────────── */

/**
 * Coordenada opcional no corpo.
 *
 * Opcional de proposito: o tecnico pode estar num subsolo, com GPS negado ou sem
 * sinal, e recusar o check-in nesse caso impediria o registro justamente na
 * visita mais difícil. `coordenadaValida` descarta o `0,0` que alguns
 * navegadores mandam quando o GPS falha.
 */
const localSchema = z.object({
  lat: z.number().optional(),
  lng: z.number().optional(),
});

atividadesRoutes.post(
  '/:id/checkin',
  validateBody(localSchema),
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const atual = await prisma.activity.findFirst({
      where: apenasVisivel(id, await filtroDe(politicaAtividades)),
      select: { tipo: true, checkinEm: true, checkoutEm: true },
    });
    if (!atual) throw notFound('Atividade não encontrada');

    const impedimento = impedimentoDoCheckin(atual);
    if (impedimento) throw badRequest(impedimento);

    const local = coordenadaValida(req.body.lat, req.body.lng);
    const atividade = await prisma.activity.update({
      where: { id },
      data: { checkinEm: new Date(), checkinLat: local?.lat ?? null, checkinLng: local?.lng ?? null },
      include: inclusao,
    });

    res.json({ atividade });
  }),
);

atividadesRoutes.post(
  '/:id/checkout',
  validateBody(localSchema),
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const atual = await prisma.activity.findFirst({
      where: apenasVisivel(id, await filtroDe(politicaAtividades)),
      select: { tipo: true, checkinEm: true, checkoutEm: true, concluidoEm: true },
    });
    if (!atual) throw notFound('Atividade não encontrada');

    const impedimento = impedimentoDoCheckout(atual);
    if (impedimento) throw badRequest(impedimento);

    const local = coordenadaValida(req.body.lat, req.body.lng);
    const agora = new Date();

    const atividade = await prisma.activity.update({
      where: { id },
      data: {
        checkoutEm: agora,
        checkoutLat: local?.lat ?? null,
        checkoutLng: local?.lng ?? null,
        /*
         * O check-out conclui a tarefa, se ela ainda estava aberta.
         *
         * Visita encerrada e tarefa feita: pedir os dois cliques deixaria a
         * agenda cheia de visitas realizadas e "pendentes" — e seria o proprio
         * tecnico a pagar por essa distincao, no fim do dia, no celular.
         *
         * `??` e nao sobrescrita: se alguem ja concluiu antes, a hora original
         * fica. Duas verdades diferentes, e a primeira e a que foi registrada.
         */
        concluidoEm: atual.concluidoEm ?? agora,
      },
      include: inclusao,
    });

    res.json({
      atividade,
      duracaoMinutos: duracaoEmMinutos({ checkinEm: atividade.checkinEm, checkoutEm: atividade.checkoutEm }),
    });
  }),
);

atividadesRoutes.post(
  '/:id/reabrir',
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const existe = await prisma.activity.findFirst({
      where: apenasVisivel(id, await filtroDe(politicaAtividades)),
      select: { id: true },
    });
    if (!existe) throw notFound('Atividade não encontrada');

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
    const existe = await prisma.activity.findFirst({
      where: apenasVisivel(id, await filtroDe(politicaAtividades)),
      select: { id: true },
    });
    if (!existe) throw notFound('Atividade não encontrada');

    await prisma.activity.delete({ where: { id } });
    res.status(204).end();
  }),
);
