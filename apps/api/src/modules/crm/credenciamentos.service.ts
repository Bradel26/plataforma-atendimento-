import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { filtroDe, politicaContas, politicaContatos, politicaCredenciamentos } from '../../lib/politicas';
import { usuarioAtualOuNulo } from '../../lib/tenant';
import { apenasVisivel } from '../../lib/visibilidade';
import { badRequest, notFound } from '../../lib/errors';
import { diasDesde, papelDoEstagio } from './esteira';
import { iniciarCiclos } from './cicloParceiro.service';
import type {
  AtualizarCredenciamentoInput,
  CriarCredenciamentoInput,
  ListarCredenciamentosQuery,
} from './credenciamentos.schemas';

const inclusao = {
  contato: { select: { id: true, nome: true, email: true, telefone: true, uf: true, cidade: true } },
  conta: { select: { id: true, nome: true, cnpj: true } },
  funil: { select: { id: true, nome: true } },
  estagio: { select: { id: true, nome: true, ordem: true } },
  responsavel: { select: { id: true, nome: true } },
} satisfies Prisma.CredenciamentoInclude;

type CredenciamentoDb = Prisma.CredenciamentoGetPayload<{ include: typeof inclusao }>;

function serialize(c: CredenciamentoDb) {
  return {
    id: c.id,
    contato: c.contato,
    conta: c.conta,
    funil: c.funil,
    estagio: { ...c.estagio, papel: papelDoEstagio(c.estagio.nome) },
    responsavel: c.responsavel,
    situacaoExcecao: c.situacaoExcecao,
    motivoExcecao: c.motivoExcecao,
    observacoes: c.observacoes,
    estagioDesde: c.estagioDesde,
    criadoEm: c.criadoEm,
    atualizadoEm: c.atualizadoEm,
    fechadoEm: c.fechadoEm,
    /** Desde a entrada no estagio atual — editar a observacao nao zera o contador. */
    diasNoEstagio: diasDesde(c.estagioDesde),
  };
}

export type CredenciamentoSerializado = ReturnType<typeof serialize>;

const comEstagios = { estagios: { orderBy: { ordem: 'asc' } } } satisfies Prisma.FunnelInclude;

/** Funis ESTEIRA ativos da organizacao — um por operacao (ex.: TIM, Starlink). */
export function funisDaEsteira() {
  return prisma.funnel.findMany({
    where: { tipo: 'ESTEIRA', ativo: true },
    orderBy: { criadoEm: 'asc' },
    include: comEstagios,
  });
}

/** Funil ESTEIRA de destino: o informado, ou o primeiro funil ESTEIRA ativo. */
async function resolverFunilEsteira(funilId?: string, estagioId?: string) {
  const funil = funilId
    ? await prisma.funnel.findUnique({ where: { id: funilId }, include: comEstagios })
    : await prisma.funnel.findFirst({
        where: { tipo: 'ESTEIRA', ativo: true },
        orderBy: { criadoEm: 'asc' },
        include: comEstagios,
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

/** Filtros comuns a lista e ao kanban. */
function filtrosDaConsulta(query: {
  uf?: string;
  busca?: string;
  responsavelId?: string;
  excecoes?: 'incluir' | 'ocultar' | 'somente';
}): Prisma.CredenciamentoWhereInput[] {
  const filtros: Prisma.CredenciamentoWhereInput[] = [];
  if (query.uf) filtros.push({ contato: { uf: query.uf } });
  if (query.responsavelId) filtros.push({ responsavelId: query.responsavelId });
  if (query.busca) {
    const termo = query.busca.trim();
    filtros.push({
      OR: [
        { contato: { nome: { contains: termo, mode: 'insensitive' } } },
        { contato: { telefone: { contains: termo } } },
        { conta: { nome: { contains: termo, mode: 'insensitive' } } },
        { conta: { cnpj: { contains: termo } } },
      ],
    });
  }
  if (query.excecoes === 'ocultar') filtros.push({ situacaoExcecao: null });
  if (query.excecoes === 'somente') filtros.push({ situacaoExcecao: { not: null } });
  return filtros;
}

export async function listarCredenciamentos(query: ListarCredenciamentosQuery) {
  const filtros = filtrosDaConsulta(query);
  if (query.funilId) filtros.push({ funilId: query.funilId });
  if (query.estagioId) filtros.push({ estagioId: query.estagioId });
  if (query.contaId) filtros.push({ contaId: query.contaId });
  if (query.contatoId) filtros.push({ contatoId: query.contatoId });
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
  const c = await carregarVisivel(id);
  const historico = await prisma.credenciamentoHistorico.findMany({
    where: { credenciamentoId: id },
    include: {
      deEstagio: { select: { id: true, nome: true } },
      paraEstagio: { select: { id: true, nome: true } },
      usuario: { select: { id: true, nome: true } },
    },
    orderBy: { criadoEm: 'asc' },
  });
  return { ...serialize(c), historico };
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

  // O mesmo parceiro nao entra duas vezes na mesma operacao enquanto o
  // processo anterior esta aberto: dois cards do mesmo parceiro dividiriam o
  // historico e dobrariam as contagens do Dashboard.
  const aberto = await prisma.credenciamento.findFirst({
    where: { contatoId: contato.id, funilId: funil.id, situacaoExcecao: null },
    select: { id: true },
  });
  if (aberto) throw badRequest('Este parceiro ja esta nesta esteira');

  const criado = await prisma.credenciamento.create({
    data: {
      contatoId: contato.id,
      contaId: input.contaId ?? contato.contaId ?? null,
      funilId: funil.id,
      estagioId: estagio.id,
      responsavelId: input.responsavelId ?? contato.responsavelId ?? null,
      observacoes: input.observacoes ?? null,
      historico: {
        create: { paraEstagioId: estagio.id, usuarioId: usuarioAtualOuNulo()?.id ?? null },
      },
    },
    include: inclusao,
  });
  await iniciarCicloSemFalhar(criado.id);
  return serialize(criado);
}

export async function atualizarCredenciamento(id: string, input: AtualizarCredenciamentoInput) {
  const atual = await carregarVisivel(id);
  const mudouEstagio = input.estagioId !== undefined && input.estagioId !== atual.estagioId;

  if (mudouEstagio) {
    const estagio = await prisma.funnelStage.findUnique({ where: { id: input.estagioId } });
    if (!estagio) throw notFound('Estagio nao encontrado');
    if (estagio.funilId !== atual.funilId) throw badRequest('Estagio nao pertence ao funil do credenciamento');
  }

  const agora = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.credenciamento.update({
      where: { id },
      data: {
        ...(mudouEstagio ? { estagioId: input.estagioId, estagioDesde: agora } : {}),
        ...(input.responsavelId !== undefined ? { responsavelId: input.responsavelId } : {}),
        ...(input.situacaoExcecao !== undefined ? { situacaoExcecao: input.situacaoExcecao } : {}),
        ...(input.motivoExcecao !== undefined ? { motivoExcecao: input.motivoExcecao } : {}),
        ...(input.observacoes !== undefined ? { observacoes: input.observacoes } : {}),
        fechadoEm: input.situacaoExcecao ? agora : input.situacaoExcecao === null ? null : atual.fechadoEm,
      },
    });
    if (mudouEstagio) {
      await tx.credenciamentoHistorico.create({
        data: {
          credenciamentoId: id,
          deEstagioId: atual.estagioId,
          paraEstagioId: input.estagioId!,
          usuarioId: usuarioAtualOuNulo()?.id ?? null,
          segundosNoEstagio: Math.max(0, Math.round((agora.getTime() - atual.estagioDesde.getTime()) / 1000)),
        },
      });
    }
  });
  await iniciarCicloSemFalhar(id);
  return obterCredenciamento(id);
}

/**
 * Ao chegar ao estagio Ativo o parceiro entra no ciclo de vida. Falha aqui nao pode
 * desfazer a movimentacao do card: o agendador e a listagem criam o ciclo depois.
 */
async function iniciarCicloSemFalhar(id: string) {
  try {
    await iniciarCiclos(id);
  } catch (erro) {
    console.error('[ciclo-parceiro] nao iniciou o ciclo', erro);
  }
}

/** Kanban do funil ESTEIRA: uma coluna por estagio, na ordem configurada. */
export async function esteiraKanban(query: {
  funilId?: string;
  uf?: string;
  busca?: string;
  responsavelId?: string;
  excecoes?: 'incluir' | 'ocultar' | 'somente';
}) {
  const { funil } = await resolverFunilEsteira(query.funilId);

  const registros = await prisma.credenciamento.findMany({
    where: { AND: [{ funilId: funil.id }, ...filtrosDaConsulta(query), await filtroDe(politicaCredenciamentos)] },
    include: inclusao,
    orderBy: { estagioDesde: 'asc' },
  });
  const serializados = registros.map(serialize);

  return {
    funil: { id: funil.id, nome: funil.nome },
    colunas: funil.estagios.map((estagio) => {
      const itens = serializados.filter((c) => c.estagio.id === estagio.id);
      return {
        estagio: { id: estagio.id, nome: estagio.nome, ordem: estagio.ordem, papel: papelDoEstagio(estagio.nome) },
        credenciamentos: itens,
        total: itens.length,
      };
    }),
  };
}
