import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { filtroDe, politicaContas, politicaContatos, politicaCredenciamentos } from '../../lib/politicas';
import { apenasVisivel } from '../../lib/visibilidade';
import { badRequest, notFound } from '../../lib/errors';
import type {
  AtualizarCredenciamentoInput,
  CriarCredenciamentoInput,
  ListarCredenciamentosQuery,
} from './credenciamentos.schemas';

const inclusao = {
  contato: { select: { id: true, nome: true, email: true } },
  conta: { select: { id: true, nome: true } },
  funil: { select: { id: true, nome: true } },
  estagio: { select: { id: true, nome: true, ordem: true } },
  responsavel: { select: { id: true, nome: true } },
} satisfies Prisma.CredenciamentoInclude;

type CredenciamentoDb = Prisma.CredenciamentoGetPayload<{ include: typeof inclusao }>;

/** Dias inteiros desde a data, nunca negativo — mesmo calculo do resto do CRM. */
const diasDesde = (data: Date) => Math.max(0, Math.floor((Date.now() - data.getTime()) / 86_400_000));

function serialize(c: CredenciamentoDb) {
  return {
    id: c.id,
    contato: c.contato,
    conta: c.conta,
    funil: c.funil,
    estagio: c.estagio,
    responsavel: c.responsavel,
    situacaoExcecao: c.situacaoExcecao,
    motivoExcecao: c.motivoExcecao,
    observacoes: c.observacoes,
    criadoEm: c.criadoEm,
    atualizadoEm: c.atualizadoEm,
    fechadoEm: c.fechadoEm,
    /**
     * Aproximado por `atualizadoEm`, sem campo dedicado de "estagio desde"
     * (decisao do spec — ver docs/superpowers/specs/2026-09-09-esteira-credenciamento-design.md).
     * Qualquer edicao do card reseta o contador, nao so mudanca de estagio.
     */
    diasNoEstagio: diasDesde(c.atualizadoEm),
  };
}

/** Funil ESTEIRA de destino: o informado, ou o primeiro funil ESTEIRA ativo. */
async function resolverFunilEsteira(funilId?: string, estagioId?: string) {
  const funil = funilId
    ? await prisma.funnel.findUnique({ where: { id: funilId }, include: { estagios: { orderBy: { ordem: 'asc' } } } })
    : await prisma.funnel.findFirst({
        where: { tipo: 'ESTEIRA', ativo: true },
        orderBy: { criadoEm: 'asc' },
        include: { estagios: { orderBy: { ordem: 'asc' } } },
      });

  if (!funil) throw badRequest('Nenhum funil de Esteira configurado para esta organizacao');
  if (funil.tipo !== 'ESTEIRA') throw badRequest('O funil informado nao e do tipo Esteira');
  if (funil.estagios.length === 0) throw badRequest('O funil nao tem estagios configurados');

  const estagio = estagioId ? funil.estagios.find((e) => e.id === estagioId) : funil.estagios[0];
  if (!estagio) throw badRequest('Estagio nao pertence ao funil informado');

  return { funil, estagio };
}

async function carregarVisivel(id: string) {
  const c = await prisma.credenciamento.findFirst({
    where: apenasVisivel(id, await filtroDe(politicaCredenciamentos)),
    include: inclusao,
  });
  if (!c) throw notFound('Credenciamento nao encontrado');
  return c;
}

export async function listarCredenciamentos(query: ListarCredenciamentosQuery) {
  const filtros: Prisma.CredenciamentoWhereInput[] = [];
  if (query.funilId) filtros.push({ funilId: query.funilId });
  if (query.estagioId) filtros.push({ estagioId: query.estagioId });
  if (query.contaId) filtros.push({ contaId: query.contaId });
  if (query.responsavelId) filtros.push({ responsavelId: query.responsavelId });
  filtros.push(await filtroDe(politicaCredenciamentos));

  const registros = await prisma.credenciamento.findMany({
    where: { AND: filtros },
    include: inclusao,
    orderBy: { atualizadoEm: 'desc' },
    take: query.limite,
  });
  return registros.map(serialize);
}

export async function obterCredenciamento(id: string) {
  return serialize(await carregarVisivel(id));
}

export async function criarCredenciamento(input: CriarCredenciamentoInput) {
  const contato = await prisma.contact.findFirst({
    where: apenasVisivel(input.contatoId, await filtroDe(politicaContatos)),
  });
  if (!contato) throw notFound('Contato nao encontrado');

  if (input.contaId) {
    const conta = await prisma.account.findFirst({
      where: apenasVisivel(input.contaId, await filtroDe(politicaContas)),
    });
    if (!conta) throw notFound('Conta nao encontrada');
  }

  const { funil, estagio } = await resolverFunilEsteira(input.funilId, input.estagioId);

  const criado = await prisma.credenciamento.create({
    data: {
      contatoId: contato.id,
      contaId: input.contaId ?? null,
      funilId: funil.id,
      estagioId: estagio.id,
      responsavelId: input.responsavelId ?? null,
      observacoes: input.observacoes ?? null,
    },
    include: inclusao,
  });
  return serialize(criado);
}

export async function atualizarCredenciamento(id: string, input: AtualizarCredenciamentoInput) {
  const atual = await carregarVisivel(id);

  if (input.estagioId) {
    const estagio = await prisma.funnelStage.findUnique({ where: { id: input.estagioId } });
    if (!estagio) throw notFound('Estagio nao encontrado');
    if (estagio.funilId !== atual.funilId) throw badRequest('Estagio nao pertence ao funil do credenciamento');
  }

  await prisma.credenciamento.update({
    where: { id },
    data: {
      ...(input.estagioId !== undefined ? { estagioId: input.estagioId } : {}),
      ...(input.responsavelId !== undefined ? { responsavelId: input.responsavelId } : {}),
      ...(input.situacaoExcecao !== undefined ? { situacaoExcecao: input.situacaoExcecao } : {}),
      ...(input.motivoExcecao !== undefined ? { motivoExcecao: input.motivoExcecao } : {}),
      ...(input.observacoes !== undefined ? { observacoes: input.observacoes } : {}),
      fechadoEm: input.situacaoExcecao ? new Date() : input.situacaoExcecao === null ? null : atual.fechadoEm,
    },
  });
  return obterCredenciamento(id);
}

/** Kanban do funil ESTEIRA: uma coluna por estagio, na ordem configurada. */
export async function esteiraKanban(funilId?: string) {
  const { funil } = await resolverFunilEsteira(funilId);

  const registros = await prisma.credenciamento.findMany({
    where: { AND: [{ funilId: funil.id }, await filtroDe(politicaCredenciamentos)] },
    include: inclusao,
    orderBy: { atualizadoEm: 'desc' },
  });
  const serializados = registros.map(serialize);

  return {
    funil: { id: funil.id, nome: funil.nome },
    colunas: funil.estagios.map((estagio) => {
      const itens = serializados.filter((c) => c.estagio.id === estagio.id);
      return {
        estagio: { id: estagio.id, nome: estagio.nome, ordem: estagio.ordem },
        credenciamentos: itens,
        total: itens.length,
      };
    }),
  };
}
