import type { Prisma } from '@prisma/client';

/**
 * Prisma devolve Decimal (decimal.js), que serializa como string em JSON.
 * O frontend trabalha com number, entao a conversao acontece aqui — num unico
 * lugar — e nao espalhada pelas rotas.
 */
export const paraNumero = (valor: Prisma.Decimal | null): number | null =>
  valor === null ? null : Number(valor);

export const inclusaoLead = {
  contato: { select: { id: true, nome: true, email: true, telefone: true } },
  conta: { select: { id: true, nome: true } },
  responsavel: { select: { id: true, nome: true } },
} satisfies Prisma.LeadInclude;

type LeadDb = Prisma.LeadGetPayload<{ include: typeof inclusaoLead }>;

export function toLead(l: LeadDb) {
  return {
    id: l.id,
    fase: l.fase,
    tipo: l.tipo,
    prazo: l.prazo,
    canalOrigem: l.canalOrigem,
    motivoPerda: l.motivoPerda,
    valorEstimado: paraNumero(l.valorEstimado),
    observacoes: l.observacoes,
    criadoEm: l.criadoEm,
    atualizadoEm: l.atualizadoEm,
    fechadoEm: l.fechadoEm,
    contato: l.contato,
    conta: l.conta,
    responsavel: l.responsavel,
  };
}

export const inclusaoOportunidade = {
  conta: { select: { id: true, nome: true } },
  funil: { select: { id: true, nome: true } },
  estagio: { select: { id: true, nome: true, ordem: true, probabilidade: true } },
  responsavel: { select: { id: true, nome: true } },
  itens: { include: { produto: { select: { id: true, nome: true, sku: true } } } },
} satisfies Prisma.OpportunityInclude;

type OportunidadeDb = Prisma.OpportunityGetPayload<{ include: typeof inclusaoOportunidade }>;

export function toOportunidade(o: OportunidadeDb) {
  const itens = o.itens.map((i) => ({
    id: i.id,
    quantidade: i.quantidade,
    precoUnitario: Number(i.precoUnitario),
    total: i.quantidade * Number(i.precoUnitario),
    produto: i.produto,
  }));

  return {
    id: o.id,
    titulo: o.titulo,
    valor: Number(o.valor),
    status: o.status,
    motivoPerda: o.motivoPerda,
    previsaoFechamento: o.previsaoFechamento,
    criadoEm: o.criadoEm,
    atualizadoEm: o.atualizadoEm,
    fechadoEm: o.fechadoEm,
    conta: o.conta,
    funil: o.funil,
    estagio: o.estagio,
    responsavel: o.responsavel,
    itens,
    /** Soma dos itens — usada para conferir com o valor informado na oportunidade. */
    totalItens: itens.reduce((acc, i) => acc + i.total, 0),
  };
}
