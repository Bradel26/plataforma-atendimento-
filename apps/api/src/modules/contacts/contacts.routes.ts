import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { param } from '../../http/params';
import { validateBody, validateQuery } from '../../http/middleware/validate';
import { notFound } from '../../lib/errors';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { apos, decodificarCursor, fatiar } from '../../lib/paginacao';
import { inclusaoResumo, toConversaResumo } from '../conversations/conversations.serializer';

import { exigirUsuarioDaOrganizacao, filtroDe, politicaContas, politicaContatos, politicaConversas } from '../../lib/politicas';
import {
  cicloDoContato,
  ciclosDosContatos,
  funilDeCiclo,
} from '../crm/cicloDeVida.service';
import { CICLOS } from '../crm/cicloDeVida';
import { apenasVisivel } from '../../lib/visibilidade';
import { MAXIMO_POR_REGISTRO, TAMANHO_MAXIMO, normalizarTags } from '../../lib/tags';

export const contactsRoutes = Router();

contactsRoutes.use(requireAuth);

const listarSchema = z.object({
  /*
   * Ciclo de vida (item E.4). Lista, e nao valor unico: "clientes e em
   * negociacao" e uma pergunta comum, e obrigar duas consultas para uniao faria
   * a tela somar dois totais que se sobrepoem.
   */
  ciclo: z
    .union([z.enum(CICLOS), z.array(z.enum(CICLOS))])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  busca: z.string().trim().min(1).optional(),
  /**
   * Filtro por etiqueta, repetivel: `?tags=revenda&tags=atacado`.
   *
   * A semantica e **E**: cada tag estreita o resultado. As tags do filtro
   * passam pela mesma normalizacao da escrita — sem isso, `?tags=Revenda` nao
   * acharia o registro salvo como `revenda`.
   */
  tags: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (v === undefined ? [] : normalizarTags(Array.isArray(v) ? v : [v]))),
  limite: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

/**
 * Cadastro manual de contato.
 *
 * Ate aqui o contato so nascia de uma conversa (webhook de canal ou webchat), o
 * que faz sentido para atendimento e nao faz nenhum para CRM: o vendedor que
 * volta de uma feira com trinta cartoes nao tem por onde comecar. Nenhum dos
 * CRMs avaliados deixa de ter um "Novo cliente".
 */
const criarSchema = z.object({
  nome: z.string().trim().min(2, 'Nome muito curto').max(120),
  email: z.string().email().nullable().optional(),
  telefone: z.string().trim().min(8).max(20).nullable().optional(),
  canalOrigem: z.enum(['WEBCHAT', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'EMAIL', 'VOZ']).default('WEBCHAT'),
  observacoes: z.string().trim().max(2000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(TAMANHO_MAXIMO)).max(MAXIMO_POR_REGISTRO).default([]),
  contaId: z.string().uuid().nullable().optional(),
  /** Ausente e diferente de nulo: ausente herda da conta, nulo deixa sem dono. */
  responsavelId: z.string().uuid().nullable().optional(),
});

const porTelefoneSchema = z.object({
  telefone: z.string().trim().min(8).max(20),
  nome: z.string().trim().min(1).max(200),
});

const atualizarSchema = z
  .object({
    nome: z.string().trim().min(2).max(120).optional(),
    email: z.string().email().nullable().optional(),
    telefone: z.string().trim().min(8).max(20).nullable().optional(),
    observacoes: z.string().trim().max(2000).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(TAMANHO_MAXIMO)).max(MAXIMO_POR_REGISTRO).optional(),
    /**
     * Trocar o responsavel do contato.
     *
     * Sem este campo, `responsavelId` nascia na criacao (herdado da conta) e
     * nunca mais mudava — a carteira ficaria congelada no dia do cadastro.
     * Nulo devolve o contato para a carteira aberta.
     */
    responsavelId: z.string().uuid().nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Informe ao menos um campo' });

contactsRoutes.get(
  '/',
  validateQuery(listarSchema),
  asyncHandler(async (_req, res) => {
    const { busca, tags, limite, cursor, ciclo } = res.locals.query as z.infer<typeof listarSchema>;
    // O escopo entra como primeiro filtro, e nao como `undefined` quando nao ha
    // busca: `where: undefined` e "sem restricao", que aqui seria a base inteira.
    const filtros: Prisma.ContactWhereInput[] = [await filtroDe(politicaContatos)];

    if (busca) {
      filtros.push({
        OR: [
          { nome: { contains: busca, mode: 'insensitive' } },
          { email: { contains: busca, mode: 'insensitive' } },
          { telefone: { contains: busca } },
        ],
      });
    }
    // `hasEvery` com lista vazia nao restringe, entao nao precisa de condicional.
    filtros.push({ tags: { hasEvery: tags } });

    /*
     * Filtro por ciclo de vida (item E.4).
     *
     * O ciclo e DERIVADO, entao nao ha coluna para o Postgres filtrar: o filtro
     * resolve os ids primeiro e os passa como restricao. Isso e aceitavel porque
     * a derivacao ja passa pela politica de visibilidade — o conjunto e o da
     * carteira de quem pergunta, e nao a base inteira — e porque o alternativo
     * seria guardar o ciclo numa coluna que apodrece.
     *
     * A paginacao continua funcionando: o `IN` entra antes do cursor.
     */
    if (ciclo && ciclo.length > 0) {
      const mapa = await ciclosDosContatos({ AND: [...filtros] });
      const desejados = new Set(ciclo);
      const ids = [...mapa.entries()].filter(([, c]) => desejados.has(c)).map(([id]) => id);
      filtros.push({ id: { in: ids } });
    }

    const depois = apos('atualizadoEm', decodificarCursor(cursor));
    if (depois) filtros.push(depois);

    const registros = await prisma.contact.findMany({
      where: { AND: filtros },
      orderBy: [{ atualizadoEm: 'desc' }, { id: 'desc' }],
      take: limite + 1,
      include: { _count: { select: { conversas: true } } },
    });

    const { itens, proximoCursor } = fatiar(registros, limite, (c) => c.atualizadoEm);

    /*
     * O ciclo vai na LISTA, e nao so na ficha.
     *
     * E a licao registrada na propria ordem recomendada do plano: dado que
     * aparece no lugar errado se parece muito com dado que nao existe. Ciclo de
     * vida serve para varrer a carteira — "quantos clientes tenho aqui?" — e
     * isso nao se faz abrindo um contato por vez.
     *
     * Calculado so para a pagina servida: derivar a base inteira para mostrar
     * vinte linhas seria trabalho jogado fora.
     */
    const ciclos = await ciclosDosContatos({ id: { in: itens.map((c) => c.id) } });

    res.json({
      contatos: itens.map(({ _count, ...c }) => ({
        ...c,
        totalConversas: _count.conversas,
        cicloDeVida: ciclos.get(c.id) ?? null,
      })),
      proximoCursor,
    });
  }),
);

/**
 * O funil de ciclo de vida (item E.4).
 *
 * Sem `requireRole`: passa pela politica de contatos como qualquer leitura, e o
 * numero que cada um ve e o da carteira dele. Reservar a gestao faria o vendedor
 * nao poder responder "quantos clientes eu tenho" sem pedir relatorio.
 *
 * Vem ANTES de `/:id` no arquivo de proposito: `/ciclo-de-vida` casaria com
 * `/:id` e a rota nunca seria alcancada.
 */
contactsRoutes.get(
  '/ciclo-de-vida',
  asyncHandler(async (_req, res) => {
    res.json({ funil: await funilDeCiclo() });
  }),
);

/** Ficha do contato com o historico de conversas — CRM basico da Fase 1. */
contactsRoutes.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    // Mesmo filtro da listagem: contato fora do escopo responde 404, nao 403.
    const contato = await prisma.contact.findFirst({
      where: apenasVisivel(id, await filtroDe(politicaContatos)),
    });
    if (!contato) throw notFound('Contato nao encontrado');

    // As conversas tambem passam pela politica delas: contato pode estar visivel
    // por um protocolo, e nesse caso as conversas dele nao sao do agente.
    const conversas = await prisma.conversation.findMany({
      where: { AND: [{ contatoId: id }, await filtroDe(politicaConversas)] },
      include: inclusaoResumo,
      orderBy: { ultimaMensagemEm: 'desc' },
      take: 50,
    });

    res.json({
      contato: { ...contato, cicloDeVida: await cicloDoContato(id) },
      conversas: conversas.map(toConversaResumo),
    });
  }),
);

contactsRoutes.post(
  '/',
  validateBody(criarSchema),
  asyncHandler(async (req, res) => {
    const dados = req.body as z.infer<typeof criarSchema>;

    /*
     * Responsavel inicial vindo da conta.
     *
     * A regra tem tres casos, e a diferenca entre dois deles e sutil:
     *   - `responsavelId` informado (inclusive nulo) manda, sempre;
     *   - **ausente** do corpo, com a conta tendo responsavel: herda o da conta,
     *     como valor inicial;
     *   - ausente, sem conta ou conta sem responsavel: fica sem dono.
     *
     * "Ausente" e "nulo" precisam ser distinguiveis, por isso o `in`: quem
     * manda `responsavelId: null` esta dizendo "sem dono", e herdar ali seria
     * desobedecer.
     *
     * E heranca de valor, nao vinculo: trocar o responsavel da conta depois
     * **nao** mexe nos contatos — ver o PATCH de conta.
     */
    let herdado: string | null | undefined;
    if (dados.contaId) {
      const conta = await prisma.account.findFirst({
        where: apenasVisivel(dados.contaId, await filtroDe(politicaContas)),
        select: { id: true, responsavelId: true },
      });
      if (!conta) throw notFound('Conta nao encontrada');
      if (!('responsavelId' in dados)) herdado = conta.responsavelId;
    }

    // Nao ha unique em email nem telefone (o mesmo numero pode aparecer em
    // canais diferentes durante a importacao), entao a duplicidade e avisada e
    // nao bloqueada — bloquear aqui travaria o cadastro legitimo de dois
    // contatos da mesma empresa que compartilham o telefone do escritorio.
    const duplicado = await prisma.contact.findFirst({
      where: {
        OR: [
          dados.email ? { email: dados.email } : undefined,
          dados.telefone ? { telefone: dados.telefone } : undefined,
        ].filter(Boolean) as Prisma.ContactWhereInput[],
      },
      select: { id: true, nome: true },
    });

    const contato = await prisma.contact.create({
      data: {
        ...(herdado === undefined ? dados : { ...dados, responsavelId: herdado }),
        tags: normalizarTags(dados.tags),
      },
    });
    res.status(201).json({ contato, possivelDuplicado: duplicado });
  }),
);

/** Busca ou cria contato por telefone (para abrir previa de chat do WhatsApp). */
contactsRoutes.post(
  '/por-telefone',
  validateBody(porTelefoneSchema),
  asyncHandler(async (req, res) => {
    const { telefone, nome } = req.body as z.infer<typeof porTelefoneSchema>;

    const existente = await prisma.contact.findFirst({
      where: { telefone, AND: [await filtroDe(politicaContatos)] },
    });
    if (existente) return res.json({ contato: existente });

    const contato = await prisma.contact.create({
      data: {
        nome,
        telefone,
        canalOrigem: 'WHATSAPP',
      },
    });
    res.status(201).json({ contato });
  }),
);

contactsRoutes.patch(
  '/:id',
  validateBody(atualizarSchema),
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const existe = await prisma.contact.findFirst({
      where: apenasVisivel(id, await filtroDe(politicaContatos)),
      select: { id: true },
    });
    if (!existe) throw notFound('Contato nao encontrado');
    await exigirUsuarioDaOrganizacao((req.body as { responsavelId?: string | null }).responsavelId);

    /*
     * Ausente e diferente de lista vazia: ausente nao mexe nas etiquetas, vazia
     * apaga todas. Sem a distincao, um PATCH que so troca o telefone limparia
     * as tags do contato.
     */
    const corpo = req.body as z.infer<typeof atualizarSchema>;
    const dados = corpo.tags === undefined ? corpo : { ...corpo, tags: normalizarTags(corpo.tags) };

    res.json({ contato: await prisma.contact.update({ where: { id }, data: dados }) });
  }),
);

/**
 * Apaga o contato e tudo que pertence so a ele (conversas, mensagens,
 * candidaturas de campanha, credenciamentos — todos `onDelete: Cascade` no
 * schema). O que pertence a outra entidade so perde o vinculo (protocolo,
 * chamada, atividade viram `onDelete: SetNull`), nunca some junto.
 *
 * Mesmo padrao de `accountsRoutes.delete('/:id', ...)`: restrito a ADMIN.
 */
contactsRoutes.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const existe = await prisma.contact.findFirst({
      where: apenasVisivel(id, await filtroDe(politicaContatos)),
      select: { id: true },
    });
    if (!existe) throw notFound('Contato nao encontrado');
    await prisma.contact.delete({ where: { id } });
    res.status(204).end();
  }),
);
