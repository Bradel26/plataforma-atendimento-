import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { inclusaoOportunidade, toOportunidade } from './crm.serializers';
import type {
  AtualizarOportunidadeInput,
  CriarOportunidadeInput,
  FecharOportunidadeInput,
  ItensInput,
  ListarOportunidadesQuery,
} from './opportunities.schemas';

/** Funil de destino: o informado, ou o primeiro funil ativo. */
async function resolverFunil(funilId?: string, estagioId?: string) {
  const funil = funilId
    ? await prisma.funnel.findUnique({ where: { id: funilId }, include: { estagios: { orderBy: { ordem: 'asc' } } } })
    : await prisma.funnel.findFirst({
        where: { ativo: true },
        orderBy: { criadoEm: 'asc' },
        include: { estagios: { orderBy: { ordem: 'asc' } } },
      });

  if (!funil) throw badRequest('Nenhum funil configurado — crie um funil antes de abrir oportunidades');
  if (funil.estagios.length === 0) throw badRequest('O funil nao tem estagios configurados');

  const estagio = estagioId ? funil.estagios.find((e) => e.id === estagioId) : funil.estagios[0];
  if (!estagio) throw badRequest('Estagio nao pertence ao funil informado');

  return { funil, estagio };
}

/** Resolve o preco de cada item: o informado, ou o do catalogo. */
async function montarItens(input: ItensInput) {
  const produtoIds = input.itens.map((i) => i.produtoId);
  const produtos = await prisma.product.findMany({ where: { id: { in: produtoIds } } });
  if (produtos.length !== new Set(produtoIds).size) throw notFound('Produto nao encontrado');

  const catalogo = input.catalogoId
    ? await prisma.priceCatalog.findUnique({ where: { id: input.catalogoId } })
    : await prisma.priceCatalog.findFirst({ where: { ativo: true }, orderBy: { criadoEm: 'asc' } });

  const precos = catalogo
    ? await prisma.catalogItem.findMany({ where: { catalogoId: catalogo.id, produtoId: { in: produtoIds } } })
    : [];

  return input.itens.map((item) => {
    const doCatalogo = precos.find((p) => p.produtoId === item.produtoId);
    const preco = item.precoUnitario ?? (doCatalogo ? Number(doCatalogo.preco) : undefined);
    if (preco === undefined) {
      throw badRequest('Produto sem preco no catalogo — informe precoUnitario');
    }
    return { produtoId: item.produtoId, quantidade: item.quantidade, precoUnitario: preco };
  });
}

const somaItens = (itens: Array<{ quantidade: number; precoUnitario: number }>) =>
  itens.reduce((acc, i) => acc + i.quantidade * i.precoUnitario, 0);

export async function listarOportunidades(query: ListarOportunidadesQuery) {
  const filtros: Prisma.OpportunityWhereInput[] = [];
  if (query.funilId) filtros.push({ funilId: query.funilId });
  if (query.estagioId) filtros.push({ estagioId: query.estagioId });
  if (query.contaId) filtros.push({ contaId: query.contaId });
  if (query.responsavelId) filtros.push({ responsavelId: query.responsavelId });
  if (query.status) filtros.push({ status: query.status });
  if (query.busca) {
    filtros.push({
      OR: [
        { titulo: { contains: query.busca, mode: 'insensitive' } },
        { conta: { nome: { contains: query.busca, mode: 'insensitive' } } },
      ],
    });
  }

  const oportunidades = await prisma.opportunity.findMany({
    where: filtros.length > 0 ? { AND: filtros } : {},
    include: inclusaoOportunidade,
    orderBy: { atualizadoEm: 'desc' },
    take: query.limite,
  });
  return oportunidades.map(toOportunidade);
}

export async function obterOportunidade(id: string) {
  const o = await prisma.opportunity.findUnique({ where: { id }, include: inclusaoOportunidade });
  if (!o) throw notFound('Oportunidade nao encontrada');
  return toOportunidade(o);
}

export async function criarOportunidade(input: CriarOportunidadeInput) {
  const conta = await prisma.account.findUnique({ where: { id: input.contaId } });
  if (!conta) throw notFound('Conta nao encontrada');

  const { funil, estagio } = await resolverFunil(input.funilId, input.estagioId);
  const itens = input.itens?.length ? await montarItens({ catalogoId: input.catalogoId, itens: input.itens }) : [];

  // Valor explicito manda; sem ele, soma dos itens.
  const valor = input.valor ?? somaItens(itens);

  const criada = await prisma.opportunity.create({
    data: {
      titulo: input.titulo,
      contaId: conta.id,
      funilId: funil.id,
      estagioId: estagio.id,
      valor,
      responsavelId: input.responsavelId ?? null,
      previsaoFechamento: input.previsaoFechamento ?? null,
      itens: itens.length > 0 ? { createMany: { data: itens } } : undefined,
    },
    include: inclusaoOportunidade,
  });
  return toOportunidade(criada);
}

export async function atualizarOportunidade(id: string, input: AtualizarOportunidadeInput) {
  const atual = await prisma.opportunity.findUnique({ where: { id } });
  if (!atual) throw notFound('Oportunidade nao encontrada');
  if (atual.status !== 'ABERTA') throw badRequest('Oportunidade fechada nao pode ser alterada');

  if (input.estagioId) {
    const estagio = await prisma.funnelStage.findUnique({ where: { id: input.estagioId } });
    if (!estagio) throw notFound('Estagio nao encontrado');
    if (estagio.funilId !== atual.funilId) throw badRequest('Estagio nao pertence ao funil da oportunidade');
  }

  const atualizada = await prisma.opportunity.update({
    where: { id },
    data: input,
    include: inclusaoOportunidade,
  });
  return toOportunidade(atualizada);
}

export async function fecharOportunidade(id: string, input: FecharOportunidadeInput) {
  const atual = await prisma.opportunity.findUnique({ where: { id } });
  if (!atual) throw notFound('Oportunidade nao encontrada');
  if (atual.status !== 'ABERTA') throw badRequest('Oportunidade ja esta fechada');

  const fechada = await prisma.opportunity.update({
    where: { id },
    data: {
      status: input.status,
      motivoPerda: input.status === 'PERDIDA' ? input.motivoPerda : null,
      fechadoEm: new Date(),
    },
    include: inclusaoOportunidade,
  });
  return toOportunidade(fechada);
}

/** Substitui os itens e recalcula o valor da oportunidade. */
export async function definirItens(id: string, input: ItensInput) {
  const atual = await prisma.opportunity.findUnique({ where: { id } });
  if (!atual) throw notFound('Oportunidade nao encontrada');
  if (atual.status !== 'ABERTA') throw badRequest('Oportunidade fechada nao pode ser alterada');

  const itens = await montarItens(input);
  const produtosUnicos = new Set(itens.map((i) => i.produtoId));
  if (produtosUnicos.size !== itens.length) throw conflict('Produto repetido na lista de itens');

  await prisma.$transaction([
    prisma.opportunityItem.deleteMany({ where: { oportunidadeId: id } }),
    prisma.opportunityItem.createMany({ data: itens.map((i) => ({ ...i, oportunidadeId: id })) }),
    prisma.opportunity.update({ where: { id }, data: { valor: somaItens(itens) } }),
  ]);

  return obterOportunidade(id);
}

/** Kanban do funil: uma coluna por estagio, na ordem configurada. */
export async function funilKanban(funilId?: string) {
  const { funil } = await resolverFunil(funilId);

  const oportunidades = await prisma.opportunity.findMany({
    where: { funilId: funil.id, status: 'ABERTA' },
    include: inclusaoOportunidade,
    orderBy: { atualizadoEm: 'desc' },
  });
  const serializadas = oportunidades.map(toOportunidade);

  return {
    funil: { id: funil.id, nome: funil.nome },
    colunas: funil.estagios.map((estagio) => {
      const itens = serializadas.filter((o) => o.estagio.id === estagio.id);
      return {
        estagio: { id: estagio.id, nome: estagio.nome, ordem: estagio.ordem, probabilidade: estagio.probabilidade },
        oportunidades: itens,
        total: itens.length,
        valorTotal: itens.reduce((acc, o) => acc + o.valor, 0),
        /** Valor ponderado pela probabilidade do estagio — previsao de receita. */
        valorPonderado: itens.reduce((acc, o) => acc + (o.valor * estagio.probabilidade) / 100, 0),
      };
    }),
  };
}

export async function listarFunis() {
  const funis = await prisma.funnel.findMany({
    include: { estagios: { orderBy: { ordem: 'asc' } }, _count: { select: { oportunidades: true } } },
    orderBy: { criadoEm: 'asc' },
  });
  return funis.map(({ _count, ...f }) => ({ ...f, totalOportunidades: _count.oportunidades }));
}

export async function criarFunil(input: { nome: string; estagios: Array<{ nome: string; probabilidade: number }> }) {
  const existente = await prisma.funnel.findUnique({ where: { nome: input.nome } });
  if (existente) throw conflict('Ja existe um funil com este nome');

  return prisma.funnel.create({
    data: {
      nome: input.nome,
      estagios: {
        createMany: {
          data: input.estagios.map((e, indice) => ({ ...e, ordem: indice + 1 })),
        },
      },
    },
    include: { estagios: { orderBy: { ordem: 'asc' } } },
  });
}
