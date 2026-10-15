import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { requireModulo } from '../../lib/modulos';
import { exigirUsuarioDaOrganizacao, filtroDe, politicaContatos, politicaContas } from '../../lib/politicas';
import { apenasVisivel } from '../../lib/visibilidade';
import { MAXIMO_POR_REGISTRO, TAMANHO_MAXIMO, normalizarTags } from '../../lib/tags';
import { validateBody, validateQuery } from '../../http/middleware/validate';
import { param } from '../../http/params';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { exigirFilialDaOrganizacao } from '../filiais/filiais.service';
import {
  inclusaoLead,
  inclusaoOportunidade,
  inclusaoProdutoDoCliente,
  toLead,
  toOportunidade,
  toProdutoDoCliente,
} from './crm.serializers';
import { confirmarValoresDoRegistro, prepararValoresDoRegistro, valoresDoRegistro } from './campos-customizados.service';
import {
  aplicarEnriquecimento,
  definirPapelNaConta,
  previaDoEnriquecimento,
} from './cnpj.service';

export const accountsRoutes = Router();

accountsRoutes.use(requireAuth);
accountsRoutes.use(requireModulo('crm'));

async function validarConsultorResponsavel(usuarioId?: string | null) {
  if (!usuarioId) return;
  const consultor = await prisma.user.findFirst({ where: { id: usuarioId, ativo: true, perfil: { in: ['COMERCIAL', 'SUPORTE'] } }, select: { id: true } });
  if (!consultor) throw badRequest('Selecione um consultor ativo da equipe comercial ou suporte');
}

/** Guarda apenas digitos e valida os verificadores do CNPJ. */
function cnpjValido(v: string): boolean {
  if (!/^\d{14}$/.test(v) || /^([\d])\1{13}$/.test(v)) return false;
  const digito = (base: string, pesos: number[]) => {
    const resto = [...base].reduce((soma, n, i) => soma + Number(n) * pesos[i]!, 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return digito(v.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(v[12]) &&
    digito(v.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(v[13]);
}
const cnpj = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ''))
  .refine(cnpjValido, 'Informe um CNPJ válido');

const camposContaSchema = z.object({
  cadastroCompleto: z.boolean().optional(),
  nome: z.string().trim().min(2, 'Nome muito curto').max(160),
  razaoSocial: z.string().trim().max(180).nullable().optional(),
  cnpj: cnpj.nullable().optional(),
  nomeFantasia: z.string().trim().max(160).nullable().optional(),
  inscricaoEstadual: z.string().trim().max(40).nullable().optional(),
  cidade: z.string().trim().max(120).nullable().optional(),
  uf: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).nullable().optional(),
  cep: z.string().trim().max(12).nullable().optional(),
  logradouro: z.string().trim().max(180).nullable().optional(),
  numero: z.string().trim().max(30).nullable().optional(),
  complemento: z.string().trim().max(120).nullable().optional(),
  bairro: z.string().trim().max(100).nullable().optional(),
  responsavelNome: z.string().trim().max(160).nullable().optional(),
  responsavelCpf: z.string().trim().max(14).nullable().optional(),
  atividadePrincipal: z.string().trim().max(300).nullable().optional(),
  cnaeSecundario: z.array(z.string().trim().max(300)).max(30).optional(),
  origemCadastro: z.string().trim().max(120).nullable().optional(),
  segmento: z.string().trim().max(80).nullable().optional(),
  site: z.string().url('Informe uma URL valida').nullable().optional(),
  telefone: z.string().trim().min(8).max(20).nullable().optional(),
  email: z.string().email().nullable().optional(),
  observacoes: z.string().trim().max(2000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(TAMANHO_MAXIMO)).max(MAXIMO_POR_REGISTRO).default([]),
  /** Responsavel principal pela carteira. Nulo devolve a conta para a carteira aberta. */
  responsavelId: z.string().uuid().nullable().optional(),
  /** Filial que atende esta conta (item 6.5). So classificacao, ver `Filial` no schema. */
  filialId: z.string().uuid().nullable().optional(),
  /** Item 6.4: `{chave: valor}`, validado em runtime contra as definicoes ativas. */
  camposCustomizados: z.record(z.string(), z.unknown()).optional(),
});

const criarSchema = camposContaSchema.superRefine((d, ctx) => {
  if (!d.cadastroCompleto) return;
  if (!d.razaoSocial?.trim()) ctx.addIssue({ code: 'custom', path: ['razaoSocial'], message: 'Razão social é obrigatória' });
  if (!d.cnpj) ctx.addIssue({ code: 'custom', path: ['cnpj'], message: 'CNPJ é obrigatório' });
  if (!d.cidade?.trim()) ctx.addIssue({ code: 'custom', path: ['cidade'], message: 'Cidade é obrigatória' });
  const ufs = ['GO', 'TO', 'MA', 'PA', 'DF', 'AM', 'MT', 'MS', 'RR'];
  if (!d.uf || !ufs.includes(d.uf)) ctx.addIssue({ code: 'custom', path: ['uf'], message: 'Selecione uma UF atendida pela Bradel' });
  if (!d.responsavelId) ctx.addIssue({ code: 'custom', path: ['responsavelId'], message: 'Consultor responsável é obrigatório' });
});

const atualizarSchema = camposContaSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Informe ao menos um campo' });

const listarSchema = z.object({
  busca: z.string().trim().min(1).optional(),
  /**
   * Filtro por etiqueta, repetivel: `?tags=revenda&tags=atacado`.
   *
   * A semantica e **E**, nao OU: cada tag informada estreita o resultado. Quem
   * filtra por duas etiquetas quer os registros que tem as duas — OU devolveria
   * uma lista maior a cada clique, o contrario do que a pessoa esta fazendo.
   */
  tags: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (v === undefined ? [] : normalizarTags(Array.isArray(v) ? v : [v]))),
  filialId: z.string().uuid().optional(),
  limite: z.coerce.number().int().min(1).max(200).default(100),
});

const vincularSchema = z.object({ contatoId: z.string().uuid() });

/**
 * Normaliza `tags` do corpo antes de gravar, se vier.
 *
 * Campo ausente e diferente de lista vazia: ausente nao mexe nas etiquetas
 * atuais, vazia apaga todas. Sem esta distincao, qualquer PATCH de telefone
 * limparia as tags do cliente.
 */
function comTagsNormalizadas<T extends { tags?: string[] }>(corpo: T): T {
  return corpo.tags === undefined ? corpo : { ...corpo, tags: normalizarTags(corpo.tags) };
}

accountsRoutes.get(
  '/',
  validateQuery(listarSchema),
  asyncHandler(async (_req, res) => {
    const { busca, tags, filialId, limite } = res.locals.query as z.infer<typeof listarSchema>;
    const escopo = await filtroDe(politicaContas);
    const contas = await prisma.account.findMany({
      // O escopo entra sempre; a busca, so quando ha termo. Antes o `where` era
      // `undefined` sem busca, que significa "sem restricao".
      where: {
        AND: [
          escopo,
          ...(filialId ? [{ filialId }] : []),
          ...(busca
            ? [
                {
                  OR: [
                    { nome: { contains: busca, mode: 'insensitive' as const } },
                    { segmento: { contains: busca, mode: 'insensitive' as const } },
                    /*
                     * So entra se sobrar digito. `cnpj: { contains: '' }` bate com
                     * QUALQUER conta que tenha CNPJ preenchido — e busca sem digito
                     * nenhum (nome comum, por exemplo) fazia essa clausula do OR
                     * virar sempre verdadeira, devolvendo a base inteira como se
                     * fosse "sem filtro". Achado pelo roteiro do item 6.3, que
                     * apagou uma conta de outro teste ao confiar nesta busca.
                     */
                    ...(busca.replace(/\D/g, '') ? [{ cnpj: { contains: busca.replace(/\D/g, '') } }] : []),
                  ],
                },
              ]
            : []),
          // `hasEvery` com lista vazia nao filtra nada, entao nao precisa de `if`.
          { tags: { hasEvery: tags } },
        ],
      },
      orderBy: { nome: 'asc' },
      take: limite,
      include: { operacoes: { select: { operacao: true } }, responsavel: { select: { id: true, nome: true } }, _count: { select: { contatos: true, leads: true, oportunidades: true } } },
    });

    res.json({
      contas: contas.map(({ _count, ...c }) => ({
        ...c,
        totalContatos: _count.contatos,
        totalLeads: _count.leads,
        totalOportunidades: _count.oportunidades,
      })),
    });
  }),
);

accountsRoutes.get('/resumo', asyncHandler(async (_req, res) => {
  const contas = await filtroDe(politicaContas);
  const contatos = await filtroDe(politicaContatos);
  const [empresas, empresasComContatos, empresasSemContatos, tim, starlink, ambas, totalContatos, contatosTim, contatosStarlink] = await Promise.all([
    prisma.account.count({ where: contas }),
    prisma.account.count({ where: { AND: [contas, { contatos: { some: { excluidoEm: null } } }] } }),
    prisma.account.count({ where: { AND: [contas, { contatos: { none: { excluidoEm: null } } }] } }),
    prisma.account.count({ where: { AND: [contas, { OR: [{ operacoes: { some: { operacao: 'TIM' } } }, { segmento: 'TIM' }] }] } }),
    prisma.account.count({ where: { AND: [contas, { OR: [{ operacoes: { some: { operacao: 'STARLINK' } } }, { segmento: 'STARLINK' }] }] } }),
    prisma.account.count({ where: { AND: [contas, { operacoes: { some: { operacao: 'TIM' } } }, { operacoes: { some: { operacao: 'STARLINK' } } }] } }),
    prisma.contact.count({ where: { AND: [contatos, { excluidoEm: null }] } }),
    prisma.contact.count({ where: { AND: [contatos, { excluidoEm: null }, { OR: [{ operacoes: { some: { operacao: 'TIM' } } }, { segmentoParceiro: 'TIM' }] }] } }),
    prisma.contact.count({ where: { AND: [contatos, { excluidoEm: null }, { OR: [{ operacoes: { some: { operacao: 'STARLINK' } } }, { segmentoParceiro: 'STARLINK' }] }] } }),
  ]);
  res.json({
    empresas, empresasComContatos, empresasSemContatos,
    porOperacao: { tim, starlink, ambas, somenteTim: tim - ambas, somenteStarlink: starlink - ambas },
    contatos: { total: totalContatos, tim: contatosTim, starlink: contatosStarlink },
  });
}));

/** Ficha 360 da conta: contatos, leads e oportunidades vinculados. */
accountsRoutes.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const conta = await prisma.account.findFirst({
      where: apenasVisivel(id, await filtroDe(politicaContas)),
      // Os contatos da ficha passam pela politica de contato: um agente que
      // chegou ao cliente por uma conversa nao herda a lista inteira de pessoas
      // dele.
      include: { operacoes: { select: { operacao: true } }, responsavel: { select: { id: true, nome: true } }, contatos: { where: { AND: [await filtroDe(politicaContatos), { excluidoEm: null }] }, orderBy: { nome: 'asc' } } },
    });
    if (!conta) throw notFound('Conta não encontrada');

    /*
     * Leads e oportunidades da ficha NAO passam pelas politicas comerciais.
     *
     * E deliberado, e foi decisao do dono do produto: o agente pode ver
     * informacao comercial resumida dentro da ficha do cliente quando isso
     * ajuda no atendimento — o que ele nao acessa e a **lista**, o **kanban** e
     * o **detalhe** de oportunidade, barrados por perfil nas rotas proprias.
     * A porta de entrada aqui e a conta, e ela ja passou pela politica.
     */
    const [leads, oportunidades, produtosInstalados] = await Promise.all([
      prisma.lead.findMany({ where: { contaId: id }, include: inclusaoLead, orderBy: { atualizadoEm: 'desc' } }),
      prisma.opportunity.findMany({
        where: { contaId: id },
        include: inclusaoOportunidade,
        orderBy: { atualizadoEm: 'desc' },
      }),
      // Base instalada (item 5.1): mesma logica de leads/oportunidades acima —
      // a porta de entrada e a conta, ja passada pela politica.
      prisma.produtoDoCliente.findMany({
        where: { contaId: id },
        include: inclusaoProdutoDoCliente,
        orderBy: { criadoEm: 'desc' },
      }),
    ]);

    res.json({
      conta,
      leads: leads.map(toLead),
      oportunidades: oportunidades.map(toOportunidade),
      produtosInstalados: produtosInstalados.map(toProdutoDoCliente),
      camposCustomizados: await valoresDoRegistro('CONTA', id),
    });
  }),
);

accountsRoutes.post(
  '/',
  validateBody(criarSchema),
  asyncHandler(async (req, res) => {
    if (req.body.cnpj) {
      const existente = await prisma.account.findFirst({ where: { cnpj: req.body.cnpj } });
      if (existente) throw conflict('Já existe uma conta com este CNPJ');
    }
    if (req.body.filialId) await exigirFilialDaOrganizacao(req.body.filialId);
    if (req.body.responsavelId) {
      await exigirUsuarioDaOrganizacao(req.body.responsavelId);
      await validarConsultorResponsavel(req.body.responsavelId);
    }

    // Valida os campos customizados ANTES de criar: se falhar, nao sobra
    // conta sem o campo obrigatorio que a validacao recusou.
    const { camposCustomizados, cadastroCompleto: _cadastroCompleto, ...corpo } = req.body;
    const valores = await prepararValoresDoRegistro('CONTA', null, camposCustomizados);

    const conta = await prisma.account.create({ data: comTagsNormalizadas(corpo) });
    await confirmarValoresDoRegistro('CONTA', conta.id, valores);
    res.status(201).json({ conta, camposCustomizados: await valoresDoRegistro('CONTA', conta.id) });
  }),
);

accountsRoutes.patch(
  '/:id',
  validateBody(atualizarSchema),
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const atual = await prisma.account.findFirst({
      where: apenasVisivel(id, await filtroDe(politicaContas)),
    });
    if (!atual) throw notFound('Conta não encontrada');

    if (req.body.cnpj && req.body.cnpj !== atual.cnpj) {
      const existente = await prisma.account.findFirst({ where: { cnpj: req.body.cnpj } });
      if (existente) throw conflict('Já existe uma conta com este CNPJ');
    }
    if (req.body.filialId) await exigirFilialDaOrganizacao(req.body.filialId);
    if (req.body.responsavelId) {
      await exigirUsuarioDaOrganizacao(req.body.responsavelId);
      await validarConsultorResponsavel(req.body.responsavelId);
    }

    const { camposCustomizados, cadastroCompleto: _cadastroCompleto, ...corpo } = req.body;
    const valores = await prepararValoresDoRegistro('CONTA', id, camposCustomizados);

    /*
     * Trocar o responsavel da conta **nao** propaga para os contatos.
     *
     * O `update` mexe so na conta, e e proposital: o responsavel do contato foi
     * herdado como valor inicial na criacao e desde entao e independente.
     * Propagar aqui reatribuiria em silencio a carteira de outra pessoa — e um
     * `updateMany` nos contatos e exatamente a "melhoria" que alguem faria mais
     * tarde sem perceber o que quebra. Ha teste guardando este comportamento.
     */
    const conta = await prisma.account.update({ where: { id }, data: comTagsNormalizadas(corpo) });
    await confirmarValoresDoRegistro('CONTA', id, valores);
    res.json({ conta, camposCustomizados: await valoresDoRegistro('CONTA', id) });
  }),
);

accountsRoutes.post(
  '/:id/contatos',
  validateBody(vincularSchema),
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    /*
     * As DUAS pontas passam pela politica.
     *
     * E o furo classico da escrita que referencia outro registro: sem isto, um
     * comercial vincularia o contato da carteira do colega ao proprio cliente —
     * uma escrita que ele nao pode fazer, por um caminho que a listagem nunca
     * mostraria. Foi o mesmo tipo de furo que o smoke:tenant achou na atividade,
     * durante a fundacao de organizacao.
     */
    const [escopoConta, escopoContato] = await Promise.all([
      filtroDe(politicaContas),
      filtroDe(politicaContatos),
    ]);
    const [conta, contato] = await Promise.all([
      prisma.account.findFirst({ where: apenasVisivel(id, escopoConta) }),
      prisma.contact.findFirst({ where: apenasVisivel(req.body.contatoId, escopoContato) }),
    ]);
    if (!conta) throw notFound('Conta não encontrada');
    if (!contato) throw notFound('Contato não encontrado');

    res.json({
      contato: await prisma.contact.update({ where: { id: contato.id }, data: { contaId: id } }),
    });
  }),
);

accountsRoutes.put('/:id/operacoes', validateBody(z.object({ operacoes: z.array(z.enum(['TIM', 'STARLINK'])).max(2) })), asyncHandler(async (req, res) => {
  const id = param(req, 'id');
  const conta = await prisma.account.findFirst({ where: apenasVisivel(id, await filtroDe(politicaContas)), select: { id: true } });
  if (!conta) throw notFound('Empresa não encontrada');
  await prisma.$transaction(async (tx) => {
    await tx.accountOperation.deleteMany({ where: { contaId: id } });
    if (req.body.operacoes.length) await tx.accountOperation.createMany({ data: req.body.operacoes.map((operacao: string) => ({ contaId: id, operacao })) });
  });
  res.json({ operacoes: req.body.operacoes });
}));

/**
 * Desvincula um contato da conta.
 *
 * Existe porque vincular e um clique e errar tambem: sem desfazer, um contato
 * ligado a empresa errada leva as oportunidades daquela empresa para a ficha
 * dele — e a unica saida seria mexer no banco.
 *
 * Nao apaga o contato. So solta o vinculo.
 */
accountsRoutes.delete(
  '/:id/contatos/:contatoId',
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const contatoId = param(req, 'contatoId');

    const contato = await prisma.contact.findFirst({
      where: apenasVisivel(contatoId, await filtroDe(politicaContatos)),
    });
    if (!contato) throw notFound('Contato não encontrado');
    // Confere o par: `DELETE /contas/<outra>/contatos/<id>` nao pode soltar um
    // vinculo que nao e daquela conta.
    if (contato.contaId !== id) throw badRequest('Este contato não está vinculado a esta conta');

    res.json({ contato: await prisma.contact.update({ where: { id: contatoId }, data: { contaId: null } }) });
  }),
);

accountsRoutes.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    // DELETE e restrito a ADMIN, cuja politica e filtro vazio — aplicar aqui e
    // no-op hoje. Fica aplicado de proposito: se um dia o DELETE for liberado
    // para outro perfil, a trava ja esta no lugar.
    const atual = await prisma.account.findFirst({
      where: apenasVisivel(id, await filtroDe(politicaContas)),
    });
    if (!atual) throw notFound('Conta não encontrada');
    await prisma.account.delete({ where: { id } });
    res.status(204).end();
  }),
);

/* ── Quadro societario e enriquecimento por CNPJ (item 5.2) ───────────────── */

const PAPEIS = ['SOCIO', 'ADMINISTRADOR', 'DECISOR', 'TECNICO', 'FINANCEIRO', 'COMPRAS', 'OUTRO'] as const;

/**
 * A previa do enriquecimento. **Nao escreve nada.**
 *
 * `GET` de proposito: e leitura, e repetir a chamada nao muda o cadastro. Quem
 * decide aplicar chama o `POST` logo abaixo.
 */
accountsRoutes.get(
  '/:id/enriquecimento',
  requireRole('ADMIN', 'SUPERVISOR', 'GESTOR', 'COMERCIAL'),
  asyncHandler(async (req, res) => {
    res.json(await previaDoEnriquecimento(param(req, 'id')));
  }),
);

accountsRoutes.post(
  '/:id/enriquecimento',
  requireRole('ADMIN', 'SUPERVISOR', 'GESTOR', 'COMERCIAL'),
  asyncHandler(async (req, res) => {
    res.json(await aplicarEnriquecimento(param(req, 'id')));
  }),
);

/**
 * Papel de uma pessoa na conta.
 *
 * Fica nas rotas de conta, e nao nas de contato, porque a pergunta e da conta:
 * "quem sao as pessoas desta empresa e o que cada uma faz nela". A escrita
 * confere as duas pontas pela politica, como o vinculo acima.
 */
accountsRoutes.patch(
  '/:id/contatos/:contatoId/papel',
  requireRole('ADMIN', 'SUPERVISOR', 'GESTOR', 'COMERCIAL'),
  validateBody(z.object({ papelNaConta: z.enum(PAPEIS).nullable() })),
  asyncHandler(async (req, res) => {
    const id = param(req, 'id');
    const contatoId = param(req, 'contatoId');

    const [escopoConta, escopoContato] = await Promise.all([
      filtroDe(politicaContas),
      filtroDe(politicaContatos),
    ]);
    const [conta, contato] = await Promise.all([
      prisma.account.findFirst({ where: apenasVisivel(id, escopoConta), select: { id: true } }),
      prisma.contact.findFirst({ where: apenasVisivel(contatoId, escopoContato), select: { id: true, contaId: true } }),
    ]);
    if (!conta) throw notFound('Conta não encontrada');
    if (!contato) throw notFound('Contato não encontrado');
    // O contato tem de ser DAQUELA conta: papel e vinculo, e definir o papel de
    // alguem de outra empresa nao significaria nada.
    if (contato.contaId !== conta.id) throw badRequest('Este contato não pertence a este cliente');

    res.json({ contato: await definirPapelNaConta(contato.id, req.body.papelNaConta) });
  }),
);
