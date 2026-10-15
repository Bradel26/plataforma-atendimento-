import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { requireModulo } from '../../lib/modulos';
import { param } from '../../http/params';
import { validateBody, validateQuery } from '../../http/middleware/validate';
import { badRequest, notFound } from '../../lib/errors';
import type { Prisma } from '@prisma/client';
import { prisma, type ClienteDeEscrita } from '../../lib/prisma';
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
import { ufDoTelefone } from '../../lib/ddd';
import { obterConfig, obterConfigPorId } from '../channels/channels.service';
import { getWhatsAppProvider } from '../channels/whatsapp-provider.factory';
import type { FotoPerfil } from '../channels/avatar';
import { SEGMENTOS_PARCEIRO, identificarSegmentoParceiro } from '../crm/segmentoParceiro';
import { numeroNormalizado } from '../channels/whatsapp.modo';

export const contactsRoutes = Router();

const cacheFotosContato = new Map<string, { expiraEm: number; busca: Promise<FotoPerfil | null> }>();

contactsRoutes.use(requireAuth);
contactsRoutes.use(requireModulo('crm'));

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
  uf: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
  /** Filtro exato pelo prefixo de DDD do telefone. */
  ddd: z.string().trim().regex(/^\d{2}$/).optional(),
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
  canalOrigem: z.enum(['WEBCHAT', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'EMAIL', 'VOZ', 'PROSPECCAO_ATIVA', 'INDICACAO']).default('WEBCHAT'),
  observacoes: z.string().trim().max(2000).nullable().optional(),
  segmentoParceiro: z.enum(SEGMENTOS_PARCEIRO).nullable().optional(),
  /** Estado (UF) e cidade do parceiro: base do "por estado/regiao" e do publico de campanha. */
  uf: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'UF inválida').nullable().optional(),
  cidade: z.string().trim().max(80).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(TAMANHO_MAXIMO)).max(MAXIMO_POR_REGISTRO).default([]),
  contaId: z.string().uuid().nullable().optional(),
  /**
   * Empresa digitada no cadastro: vincula a uma conta existente (mesmo CNPJ ou mesmo nome) ou
   * cria a conta na hora. `contaId`, quando vem, manda e a empresa e ignorada.
   */
  empresa: z
    .object({
      nome: z.string().trim().min(2, 'Nome da empresa muito curto').max(160),
      cnpj: z
        .string()
        .trim()
        .transform((v) => v.replace(/\D/g, ''))
        .refine((v) => v === '' || v.length === 14, 'CNPJ deve ter 14 digitos')
        .optional(),
    })
    .nullable()
    .optional(),
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
    segmentoParceiro: z.enum(SEGMENTOS_PARCEIRO).nullable().optional(),
    /** Estado (UF) e cidade do parceiro: base do "por estado/regiao" e do publico de campanha. */
    uf: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'UF inválida').nullable().optional(),
    cidade: z.string().trim().max(80).nullable().optional(),
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
    const { busca, tags, limite, cursor, ciclo, uf, ddd } = res.locals.query as z.infer<typeof listarSchema>;
    // O escopo entra como primeiro filtro, e nao como `undefined` quando nao ha
    // busca: `where: undefined` e "sem restricao", que aqui seria a base inteira.
    const filtros: Prisma.ContactWhereInput[] = [await filtroDe(politicaContatos), { excluidoEm: null }];

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
    if (uf) filtros.push({ uf });
    /*
     * Filtro por DDD: busca o prefixo do telefone independentemente da UF.
     * ela na consulta — mesma tabela usada para preencher o estado sozinho na
     * criacao do contato (ver `ufDoTelefone`). Um DDD fora da tabela (nao deve
     * acontecer: o front so oferece os validos) nunca bate com nenhuma UF real,
     * entao a lista some vazia em vez de, por engano, devolver a base toda.
     */
    if (ddd) {
      const prefixos = [ddd, `(${ddd})`, `+55${ddd}`, `+55 ${ddd}`, `+55 (${ddd})`, `55${ddd}`, `55 ${ddd}`];
      filtros.push({ OR: prefixos.map((prefixo) => ({ telefone: { startsWith: prefixo } })) });
    }

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

    // Total do resultado completo, independente da pagina atual.
    const total = await prisma.contact.count({ where: { AND: filtros } });

    const depois = apos('atualizadoEm', decodificarCursor(cursor));
    if (depois) filtros.push(depois);

    const registros = await prisma.contact.findMany({
      where: { AND: filtros },
      orderBy: [{ atualizadoEm: 'desc' }, { id: 'desc' }],
      take: limite + 1,
      include: {
        _count: { select: { conversas: true } },
        // Agenda telefonica do CRM: empresa, responsavel, ultima interacao e
        // proximo retorno na propria lista, sem abrir a ficha.
        conta: { select: { id: true, nome: true } },
        responsavel: { select: { id: true, nome: true } },
        conversas: {
          where: await filtroDe(politicaConversas),
          select: { ultimaMensagemEm: true },
          orderBy: { ultimaMensagemEm: 'desc' },
          take: 1,
        },
        atividades: {
          where: { concluidoEm: null, prazo: { not: null } },
          select: { id: true, titulo: true, tipo: true, prazo: true },
          orderBy: { prazo: 'asc' },
          take: 1,
        },
      },
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
      contatos: itens.map(({ _count, conversas, atividades, ...c }) => ({
        ...c,
        totalConversas: _count.conversas,
        ultimaInteracaoEm: conversas[0]?.ultimaMensagemEm ?? null,
        proximoRetorno: atividades[0] ?? null,
        cicloDeVida: ciclos.get(c.id) ?? null,
      })),
      proximoCursor,
      total,
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

// Rota estática antes de `/:id`, para não interpretar o caminho como contato.
contactsRoutes.get('/solicitacoes-exclusao', requireRole('ADMIN', 'SUPERVISOR'), asyncHandler(async (_req, res) => {
  const solicitacoes = await prisma.contactDeletionRequest.findMany({
    orderBy: { solicitadoEm: 'desc' }, take: 200,
    include: { contato: { select: { id: true, nome: true, telefone: true } }, solicitadoPor: { select: { id: true, nome: true } }, aprovadoPor: { select: { id: true, nome: true } } },
  });
  res.json({ solicitacoes });
}));

/** Ficha do contato com o historico de conversas — CRM basico da Fase 1. */
contactsRoutes.get(
  '/:id/avatar',
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const contato = await prisma.contact.findFirst({
      where: { AND: [apenasVisivel(id, await filtroDe(politicaContatos)), { excluidoEm: null }] },
      select: { id: true, telefone: true },
    });
    if (!contato) throw notFound('Contato não encontrado');

    const telefone = (contato.telefone ?? '').replace(/\D/g, '');
    if (telefone.length < 10 || telefone.length > 15) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(404).end();
      return;
    }

    const conversa = await prisma.conversation.findFirst({
      where: { contatoId: id, canal: 'WHATSAPP', AND: [await filtroDe(politicaConversas)] },
      select: { canalConfigId: true },
      orderBy: { ultimaMensagemEm: 'desc' },
    });
    const config = conversa?.canalConfigId
      ? await obterConfigPorId(conversa.canalConfigId)
      : await obterConfig('WHATSAPP');
    if (!config) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(404).end();
      return;
    }

    const provider = getWhatsAppProvider();
    if (!provider.fetchAvatar) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(404).end();
      return;
    }

    const chave = `${config.id ?? config.ponteSessao ?? 'linha'}:${telefone}`;
    const agora = Date.now();
    let entrada = cacheFotosContato.get(chave);
    if (!entrada || entrada.expiraEm <= agora) {
      entrada = { expiraEm: agora + 15_000, busca: Promise.resolve(null) };
      entrada.busca = provider.fetchAvatar(config, telefone).catch(() => null).then((foto) => {
        entrada!.expiraEm = Date.now() + (foto ? 6 * 60 * 60_000 : 30_000);
        return foto;
      });
      cacheFotosContato.set(chave, entrada);
      if (cacheFotosContato.size > 1000) {
        const primeira = cacheFotosContato.keys().next().value;
        if (primeira) cacheFotosContato.delete(primeira);
      }
    }

    const foto = await entrada.busca;
    if (!foto) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(404).end();
      return;
    }
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.type(foto.contentType).send(foto.buffer);
  }),
);

contactsRoutes.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    // Mesmo filtro da listagem: contato fora do escopo responde 404, nao 403.
    const contato = await prisma.contact.findFirst({
      where: { AND: [apenasVisivel(id, await filtroDe(politicaContatos)), { excluidoEm: null }] },
    });
    if (!contato) throw notFound('Contato não encontrado');

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
    const { empresa, ...corpo } = req.body as z.infer<typeof criarSchema>;
    const dados = corpo;
    let contaCriada = false;

    /*
     * Empresa digitada: acha a conta ou cria uma.
     *
     * A busca e por CNPJ (a identidade real da empresa) e, sem CNPJ, pelo nome exato
     * sem diferenciar caixa. Nome parecido nao basta: juntar "Silva Telecom" com
     * "Silva Telecom Sul" por engano misturaria carteiras. A conta so e reutilizada
     * se o usuario a enxerga; senao seria vinculo a um registro que ele nao pode ver.
     */
    if (!dados.contaId && empresa) {
      const cnpj = empresa.cnpj || null;
      const visivel = await filtroDe(politicaContas);
      const existente = await prisma.account.findFirst({
        where: {
          AND: [
            visivel,
            cnpj ? { cnpj } : { nome: { equals: empresa.nome, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });
      if (existente) {
        dados.contaId = existente.id;
      } else {
        // CNPJ ja usado por conta que o usuario nao enxerga: a criacao bateria na unicidade.
        if (cnpj && (await prisma.account.findFirst({ where: { cnpj }, select: { id: true } }))) {
          throw badRequest('Já existe uma empresa com este CNPJ fora da sua carteira');
        }
        const conta = await prisma.account.create({
          data: { nome: empresa.nome, cnpj },
          select: { id: true },
        });
        dados.contaId = conta.id;
        contaCriada = true;
      }
    }

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
      if (!conta) throw notFound('Conta não encontrada');
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
          dados.telefone
            ? numeroNormalizado(dados.telefone)
              ? { telefoneNormalizado: numeroNormalizado(dados.telefone) }
              : { telefone: dados.telefone }
            : undefined,
        ].filter(Boolean) as Prisma.ContactWhereInput[],
      },
      select: { id: true, nome: true },
    });

    const contato = await prisma.contact.create({
      data: {
        ...(herdado === undefined ? dados : { ...dados, responsavelId: herdado }),
        // UF informada manda; sem ela, tenta inferir do DDD do telefone — o
        // vendedor que so digita o telefone nao precisa lembrar de marcar o
        // estado a mao.
        uf: dados.uf ?? ufDoTelefone(dados.telefone),
        tags: normalizarTags(dados.tags),
        segmentoParceiro:
          dados.segmentoParceiro ?? identificarSegmentoParceiro(null, dados.observacoes),
      },
    });
    const operacaoReconhecida = (contato.segmentoParceiro ?? '').toUpperCase();
    if (operacaoReconhecida === 'TIM' || operacaoReconhecida === 'STARLINK') {
      await prisma.contactOperation.upsert({
        where: { contatoId_operacao: { contatoId: contato.id, operacao: operacaoReconhecida } },
        create: { contatoId: contato.id, operacao: operacaoReconhecida },
        update: {},
      });
    }
    res.status(201).json({ contato, possivelDuplicado: duplicado, contaCriada });
  }),
);

/** Busca ou cria contato por telefone (para abrir previa de chat do WhatsApp). */
contactsRoutes.post(
  '/por-telefone',
  validateBody(porTelefoneSchema),
  asyncHandler(async (req, res) => {
    const { telefone, nome } = req.body as z.infer<typeof porTelefoneSchema>;

    const normalizado = numeroNormalizado(telefone);
    const existente = await prisma.contact.findFirst({
      where: {
        ...(normalizado ? { telefoneNormalizado: normalizado } : { telefone }),
        excluidoEm: null,
        AND: [await filtroDe(politicaContatos)],
      },
      orderBy: { criadoEm: 'asc' },
    });
    if (existente) return res.json({ contato: existente });

    const contato = await prisma.contact.create({
      data: {
        nome,
        telefone,
        uf: ufDoTelefone(telefone),
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
      where: { AND: [apenasVisivel(id, await filtroDe(politicaContatos)), { excluidoEm: null }] },
      select: { id: true, segmentoParceiro: true },
    });
    if (!existe) throw notFound('Contato não encontrado');
    await exigirUsuarioDaOrganizacao((req.body as { responsavelId?: string | null }).responsavelId);

    /*
     * Ausente e diferente de lista vazia: ausente nao mexe nas etiquetas, vazia
     * apaga todas. Sem a distincao, um PATCH que so troca o telefone limparia
     * as tags do contato.
     */
    const corpo = req.body as z.infer<typeof atualizarSchema>;
    const dados = corpo.tags === undefined ? { ...corpo } : { ...corpo, tags: normalizarTags(corpo.tags) };
    // Observação nova com a origem da importação reconhece o segmento, se ninguém
    // escolheu um. Segmento informado no corpo (inclusive null) sempre prevalece.
    if (dados.segmentoParceiro === undefined && dados.observacoes && !existe.segmentoParceiro) {
      const segmento = identificarSegmentoParceiro(null, dados.observacoes);
      if (segmento) dados.segmentoParceiro = segmento;
    }

    res.json({ contato: await prisma.contact.update({ where: { id }, data: dados }) });
  }),
);

/**
 * Apaga o PII do contato, preservando o registro (so a ficha fica em branco).
 *
 * Finaliza antes qualquer conversa ainda aberta: sem isso, o `enderecoExterno`
 * dela continua casando com `status: { not: 'FINALIZADO' }` em
 * `inbound.service.ts` (`encontrarOuCriarContato`/`registrarMensagemEntrante`)
 * e uma mensagem nova do mesmo numero reabriria essa conversa anonimizada —
 * que o filtro de `conversations.service.ts` (`contato.excluidoEm`) esconde da
 * caixa de entrada. A conversa ficaria recebendo mensagem sem que ninguem
 * visse. Finalizada, o telefone nulo abaixo garante que a proxima mensagem
 * cria contato e conversa novos.
 */
async function anonimizarContato(tx: ClienteDeEscrita, contatoId: string) {
  await tx.conversation.updateMany({
    where: { contatoId, status: { not: 'FINALIZADO' } },
    data: { status: 'FINALIZADO', finalizadoEm: new Date() },
  });
  return tx.contact.update({
    where: { id: contatoId },
    data: {
      nome: 'Contato removido', telefone: null, email: null, observacoes: null, tags: [],
      segmentoParceiro: null, uf: null, cidade: null, contaId: null, responsavelId: null,
      papelNaConta: null, qualificacaoQsa: null, excluidoEm: new Date(), anonimizadoEm: new Date(),
    },
  });
}

/**
 * Apaga o contato e tudo que pertence so a ele (conversas, mensagens,
 * candidaturas de campanha, credenciamentos — todos `onDelete: Cascade` no
 * schema). O que pertence a outra entidade so perde o vinculo (protocolo,
 * chamada, atividade viram `onDelete: SetNull`), nunca some junto.
 *
 * Mesmo padrao de `accountsRoutes.delete('/:id', ...)`: restrito a ADMIN.
 *
 * ADMIN executa na hora — e o perfil de maior confianca da organizacao, sem
 * ninguem acima para aprovar. Os demais perfis (incluindo SUPERVISOR) entram
 * no fluxo de dupla aprovacao: a exclusao so vale depois que uma SEGUNDA
 * pessoa (ADMIN ou SUPERVISOR, nunca quem pediu) decide em `/exclusao/aprovar`.
 */
contactsRoutes.post(
  '/:id/exclusao',
  validateBody(z.object({ motivo: z.string().trim().min(8).max(1000) })),
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const existe = await prisma.contact.findFirst({
      where: { AND: [apenasVisivel(id, await filtroDe(politicaContatos)), { excluidoEm: null }] },
      select: { id: true },
    });
    if (!existe) throw notFound('Contato não encontrado');
    const pendente = await prisma.contactDeletionRequest.findFirst({ where: { contatoId: id, status: 'PENDENTE' } });

    /*
     * ADMIN nunca fica preso por um pedido pendente de ninguem (nem o proprio,
     * nem de outra pessoa): a acao dele e direta e resolve qualquer pedido em
     * aberto como parte da mesma decisao, em vez de recusar.
     */
    if (req.user!.perfil === 'ADMIN') {
      const solicitacao = await prisma.$transaction(async (tx) => {
        const decisao = pendente
          ? await tx.contactDeletionRequest.update({
              where: { id: pendente.id },
              data: { status: 'APROVADA', aprovadoPorId: req.user!.sub, motivoDecisao: 'Exclusão direta por Administrador', decididoEm: new Date() },
            })
          : await tx.contactDeletionRequest.create({
              data: {
                contatoId: id, solicitadoPorId: req.user!.sub, motivo: req.body.motivo,
                status: 'APROVADA', aprovadoPorId: req.user!.sub,
                motivoDecisao: 'Exclusão direta por Administrador', decididoEm: new Date(),
              },
            });
        await anonimizarContato(tx, id);
        return decisao;
      });
      res.json({ solicitacao, excluidoImediatamente: true });
      return;
    }

    if (pendente) throw badRequest('Já existe uma solicitação de exclusão aguardando aprovação');
    const solicitacao = await prisma.contactDeletionRequest.create({ data: { contatoId: id, solicitadoPorId: req.user!.sub, motivo: req.body.motivo } });
    res.status(202).json({ solicitacao, excluidoImediatamente: false });
  }),
);

contactsRoutes.post('/:id/exclusao/aprovar', requireRole('ADMIN', 'SUPERVISOR'), asyncHandler(async (req, res) => {
  const id = param(req, 'id');
  const solicitacao = await prisma.contactDeletionRequest.findFirst({ where: { id, status: 'PENDENTE' } });
  if (!solicitacao) throw notFound('Solicitação pendente não encontrada');
  if (solicitacao.solicitadoPorId === req.user!.sub) throw badRequest('Quem solicitou não pode aprovar a própria exclusão');
  const justificativa = z.string().trim().min(3).max(1000).parse(req.body?.justificativa);
  const resultado = await prisma.$transaction(async (tx) => {
    const decisao = await tx.contactDeletionRequest.update({ where: { id }, data: { status: 'APROVADA', aprovadoPorId: req.user!.sub, motivoDecisao: justificativa, decididoEm: new Date() } });
    await anonimizarContato(tx, solicitacao.contatoId);
    return decisao;
  });
  res.json({ solicitacao: resultado });
}));

contactsRoutes.post('/:id/exclusao/rejeitar', requireRole('ADMIN', 'SUPERVISOR'), validateBody(z.object({ justificativa: z.string().trim().min(3).max(1000) })), asyncHandler(async (req, res) => {
  const id = param(req, 'id');
  const solicitacao = await prisma.contactDeletionRequest.findFirst({ where: { id, status: 'PENDENTE' } });
  if (!solicitacao) throw notFound('Solicitação pendente não encontrada');
  if (solicitacao.solicitadoPorId === req.user!.sub) throw badRequest('Quem solicitou não pode decidir a própria solicitação');
  res.json({ solicitacao: await prisma.contactDeletionRequest.update({ where: { id }, data: { status: 'REJEITADA', aprovadoPorId: req.user!.sub, motivoDecisao: req.body.justificativa, decididoEm: new Date() } }) });
}));

contactsRoutes.post('/solicitacoes-exclusao/:id/cancelar', validateBody(z.object({ justificativa: z.string().trim().min(3).max(1000) })), asyncHandler(async (req, res) => {
  const id = param(req, 'id');
  const solicitacao = await prisma.contactDeletionRequest.findFirst({ where: { id, status: 'PENDENTE' } });
  if (!solicitacao) throw notFound('Solicitação pendente não encontrada');
  if (solicitacao.solicitadoPorId !== req.user!.sub) throw badRequest('Somente quem solicitou pode cancelar o pedido');
  const atualizada = await prisma.contactDeletionRequest.update({
    where: { id }, data: { status: 'CANCELADA', motivoDecisao: req.body.justificativa, decididoEm: new Date() },
  });
  res.json({ solicitacao: atualizada });
}));

contactsRoutes.put('/:id/operacoes', validateBody(z.object({ operacoes: z.array(z.enum(['TIM', 'STARLINK'])).max(2) })), asyncHandler(async (req, res) => {
  const id = param(req, 'id');
  const contato = await prisma.contact.findFirst({ where: { AND: [apenasVisivel(id, await filtroDe(politicaContatos)), { excluidoEm: null }] }, select: { id: true } });
  if (!contato) throw notFound('Contato não encontrado');
  await prisma.$transaction(async (tx) => {
    await tx.contactOperation.deleteMany({ where: { contatoId: id } });
    await tx.contactOperation.createMany({ data: req.body.operacoes.map((operacao: string) => ({ contatoId: id, operacao })) });
  });
  res.json({ operacoes: req.body.operacoes });
}));
