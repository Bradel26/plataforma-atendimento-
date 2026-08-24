import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';
import { inclusaoLead, toLead } from './crm.serializers';
import { FASES, type AtualizarLeadInput, type CriarLeadInput, type ListarLeadsQuery } from './leads.schemas';

const FASES_TERMINAIS = ['GANHO', 'PERDIDO'] as const;
const eTerminal = (fase: string) => FASES_TERMINAIS.includes(fase as (typeof FASES_TERMINAIS)[number]);

function montarFiltros(query: ListarLeadsQuery): Prisma.LeadWhereInput {
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

  return filtros.length > 0 ? { AND: filtros } : {};
}

export async function listarLeads(query: ListarLeadsQuery) {
  const leads = await prisma.lead.findMany({
    where: montarFiltros(query),
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
  const lead = await prisma.lead.findUnique({ where: { id }, include: inclusaoLead });
  if (!lead) throw notFound('Lead nao encontrado');
  return toLead(lead);
}

export async function criarLead(input: CriarLeadInput) {
  const contato = await prisma.contact.findUnique({ where: { id: input.contatoId } });
  if (!contato) throw notFound('Contato nao encontrado');

  if (input.contaId) {
    const conta = await prisma.account.findUnique({ where: { id: input.contaId } });
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
  const atual = await prisma.lead.findUnique({ where: { id } });
  if (!atual) throw notFound('Lead nao encontrado');

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
  const atual = await prisma.lead.findUnique({ where: { id } });
  if (!atual) throw notFound('Lead nao encontrado');
  await prisma.lead.delete({ where: { id } });
}

/** Indicadores do funil de leads (base dos dashboards da Fase 3). */
export async function resumoLeads() {
  const [porFase, porTipo, porMotivo] = await Promise.all([
    prisma.lead.groupBy({ by: ['fase'], _count: { _all: true }, _sum: { valorEstimado: true } }),
    prisma.lead.groupBy({ by: ['tipo'], _count: { _all: true } }),
    prisma.lead.groupBy({ by: ['motivoPerda'], _count: { _all: true }, where: { fase: 'PERDIDO' } }),
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
