import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { exigirVinculosVisiveis, filtroDe, politicaContas, politicaContatos, politicaLeads } from '../../lib/politicas';
import { apenasVisivel } from '../../lib/visibilidade';
import { badRequest, notFound } from '../../lib/errors';
import { inclusaoLead, toLead } from './crm.serializers';
import { FASES, type AtualizarLeadInput, type CriarLeadInput, type ListarLeadsQuery } from './leads.schemas';

const FASES_TERMINAIS = ['GANHO', 'PERDIDO'] as const;
const eTerminal = (fase: string) => FASES_TERMINAIS.includes(fase as (typeof FASES_TERMINAIS)[number]);

async function montarFiltros(query: ListarLeadsQuery): Promise<Prisma.LeadWhereInput> {
  const filtros: Prisma.LeadWhereInput[] = [];

  if (query.fase) filtros.push({ fase: query.fase });
  if (query.tipo) filtros.push({ tipo: query.tipo });
  if (query.responsavelId) filtros.push({ responsavelId: query.responsavelId });
  if (query.canalOrigem) filtros.push({ canalOrigem: query.canalOrigem });
  if (query.motivoPerda) filtros.push({ motivoPerda: query.motivoPerda });
  if (query.contaId) filtros.push({ contaId: query.contaId });
  if (query.criadoDe) filtros.push({ criadoEm: { gte: query.criadoDe } });
  if (query.criadoAte) filtros.push({ criadoEm: { lte: query.criadoAte } });

  if (query.atrasados === 'true') {
    filtros.push({ prazo: { lt: new Date() }, fase: { notIn: [...FASES_TERMINAIS] } });
  }

  if (query.busca) {
    filtros.push({
      OR: [
        { contato: { nome: { contains: query.busca, mode: 'insensitive' } } },
        { contato: { email: { contains: query.busca, mode: 'insensitive' } } },
        { conta: { nome: { contains: query.busca, mode: 'insensitive' } } },
        { observacoes: { contains: query.busca, mode: 'insensitive' } },
      ],
    });
  }

  // O escopo entra sempre, e nunca como `{}`: filtro vazio significa "sem
  // restricao", e era o que esta funcao devolvia quando nao havia filtro algum.
  filtros.push(await filtroDe(politicaLeads));
  return { AND: filtros };
}

export async function listarLeads(query: ListarLeadsQuery) {
  const leads = await prisma.lead.findMany({
    where: await montarFiltros(query),
    include: inclusaoLead,
    orderBy: { atualizadoEm: 'desc' },
    take: query.limite,
  });
  return leads.map(toLead);
}

/** Agrupamento para o Kanban: uma coluna por fase, respeitando os filtros. */
export async function leadsPorFase(query: ListarLeadsQuery) {
  const leads = await listarLeads({ ...query, limite: 200 });
  const colunas = Object.fromEntries(FASES.map((f) => [f, [] as typeof leads])) as Record<
    (typeof FASES)[number],
    typeof leads
  >;
  for (const lead of leads) colunas[lead.fase].push(lead);
  return colunas;
}

export async function obterLead(id: string) {
  // Mesmo filtro da listagem: lead fora do escopo responde 404, nao 403.
  const lead = await prisma.lead.findFirst({
    where: apenasVisivel(id, await filtroDe(politicaLeads)),
    include: inclusaoLead,
  });
  if (!lead) throw notFound('Lead nao encontrado');
  return toLead(lead);
}

export async function criarLead(input: CriarLeadInput) {
  // Escrita que referencia outro registro: o contato tem de estar no escopo de
  // quem cria. Sem isto, um comercial abriria lead no contato do colega.
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
  if (input.responsavelId) {
    const responsavel = await prisma.user.findUnique({ where: { id: input.responsavelId } });
    if (!responsavel) throw notFound('Responsavel nao encontrado');
  }

  const lead = await prisma.lead.create({
    data: {
      ...input,
      // O canal de origem do contato e um padrao melhor que o do schema.
      canalOrigem: input.canalOrigem ?? contato.canalOrigem,
    },
    include: inclusaoLead,
  });
  return toLead(lead);
}

export async function atualizarLead(id: string, input: AtualizarLeadInput) {
  const atual = await prisma.lead.findFirst({ where: apenasVisivel(id, await filtroDe(politicaLeads)) });
  if (!atual) throw notFound('Lead nao encontrado');
  // O schema de atualizacao aceita `contaId`, e o `input` vai inteiro para o
  // `update`: sem isto, daria para mover o lead para o cliente de outra carteira.
  await exigirVinculosVisiveis(input);

  const faseFinal = input.fase ?? atual.fase;
  const motivoFinal = input.motivoPerda !== undefined ? input.motivoPerda : atual.motivoPerda;

  if (faseFinal === 'PERDIDO' && !motivoFinal) {
    throw badRequest('Ao marcar o lead como PERDIDO informe o motivo da perda');
  }
  // Rejeita apenas quando o cliente ENVIA um motivo para fase nao-PERDIDO.
  // Reabrir um lead perdido e valido: o motivo antigo e limpo abaixo.
  if (faseFinal !== 'PERDIDO' && input.motivoPerda) {
    throw badRequest('Motivo de perda so se aplica a leads na fase PERDIDO');
  }

  // fechadoEm acompanha a entrada e a saida das fases terminais.
  const fechadoEm = eTerminal(faseFinal) ? (atual.fechadoEm ?? new Date()) : null;

  const lead = await prisma.lead.update({
    where: { id },
    data: {
      ...input,
      ...(faseFinal !== 'PERDIDO' ? { motivoPerda: null } : {}),
      fechadoEm,
    },
    include: inclusaoLead,
  });
  return toLead(lead);
}

export async function excluirLead(id: string) {
  const atual = await prisma.lead.findFirst({ where: apenasVisivel(id, await filtroDe(politicaLeads)) });
  if (!atual) throw notFound('Lead nao encontrado');
  await prisma.lead.delete({ where: { id } });
}

/** Indicadores do funil de leads (base dos dashboards da Fase 3). */
export async function resumoLeads() {
  // O indicador usa o mesmo escopo da lista. Sem isto, o total no topo da tela
  // contaria leads que a lista embaixo nao mostra — e a primeira suspeita de
  // quem ve isso e que a lista esta quebrada.
  const escopo = await filtroDe(politicaLeads);
  const [porFase, porTipo, porMotivo] = await Promise.all([
    prisma.lead.groupBy({ by: ['fase'], _count: { _all: true }, _sum: { valorEstimado: true }, where: escopo }),
    prisma.lead.groupBy({ by: ['tipo'], _count: { _all: true }, where: escopo }),
    prisma.lead.groupBy({
      by: ['motivoPerda'],
      _count: { _all: true },
      where: { AND: [escopo, { fase: 'PERDIDO' }] },
    }),
  ]);

  return {
    porFase: porFase.map((g) => ({
      fase: g.fase,
      total: g._count._all,
      valorEstimado: g._sum.valorEstimado ? Number(g._sum.valorEstimado) : 0,
    })),
    porTipo: porTipo.map((g) => ({ tipo: g.tipo, total: g._count._all })),
    motivosPerda: porMotivo
      .filter((g) => g.motivoPerda !== null)
      .map((g) => ({ motivo: g.motivoPerda, total: g._count._all })),
  };
}
