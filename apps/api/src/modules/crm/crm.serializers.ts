import type { Prisma } from '@prisma/client';
import { statusDaGarantia } from '../../lib/garantia';
import { totalDoItem, totaisDaOportunidade } from './valores';

/**
 * Prisma devolve Decimal (decimal.js), que serializa como string em JSON.
 * O frontend trabalha com number, entao a conversao acontece aqui — num unico
 * lugar — e nao espalhada pelas rotas.
 */
export const paraNumero = (valor: Prisma.Decimal | null): number | null =>
  valor === null ? null : Number(valor);

/** Dias inteiros decorridos desde a data, nunca negativo. */
const diasDesde = (data: Date) =>
  Math.max(0, Math.floor((Date.now() - data.getTime()) / 86_400_000));

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
  estagio: { select: { id: true, nome: true, ordem: true, probabilidade: true, tarefaObrigatoria: true } },
  responsavel: { select: { id: true, nome: true } },
  aprovadoPor: { select: { id: true, nome: true } },
  itens: { include: { produto: { select: { id: true, nome: true, sku: true } } } },
} satisfies Prisma.OpportunityInclude;

type OportunidadeDb = Prisma.OpportunityGetPayload<{ include: typeof inclusaoOportunidade }>;

export function toOportunidade(o: OportunidadeDb) {
  const itens = o.itens.map((i) => {
    const bruto = {
      quantidade: i.quantidade,
      precoUnitario: Number(i.precoUnitario),
      acrescimo: Number(i.acrescimo),
      desconto: Number(i.desconto),
      recorrencia: i.recorrencia,
      custoUnitario: i.custoUnitario === null ? null : Number(i.custoUnitario),
    };
    const t = totalDoItem(bruto);
    return {
      id: i.id,
      ...bruto,
      /**
       * `total` continua sendo o LIQUIDO da linha, como antes.
       *
       * Antes do desconto existir, bruto e liquido eram o mesmo numero, e o campo
       * se chamava `total`. Mantido o nome porque e o que a tela e a proposta
       * somam; o bruto vem ao lado, para a linha poder mostrar "de X por Y".
       */
      total: t.liquido,
      bruto: t.bruto,
      custo: t.custo,
      margem: t.margem,
      margemPercentual: t.margemPercentual,
      produto: i.produto,
    };
  });

  const totais = totaisDaOportunidade(
    itens.map((i) => ({
      quantidade: i.quantidade,
      precoUnitario: i.precoUnitario,
      acrescimo: i.acrescimo,
      desconto: i.desconto,
      recorrencia: i.recorrencia,
      custoUnitario: i.custoUnitario,
    })),
    o.mesesRecorrencia,
  );

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
    /** Soma liquida dos itens — o que a proposta cobra. */
    totalItens: totais.valorUnico + totais.valorMensal,
    /** Os dois valores separados: unico nao se soma com mensal (decisao 57). */
    valorUnico: Number(o.valorUnico),
    valorMensal: Number(o.valorMensal),
    mesesRecorrencia: o.mesesRecorrencia,
    /** Valor digitado a mao, quando houver. Nulo = o valor vem dos itens. */
    valorInformado: o.valorInformado === null ? null : Number(o.valorInformado),
    /*
     * Condicoes da proposta (item 2.2).
     *
     * Faltavam aqui, e o efeito era invisivel na escrita: o PATCH gravava, a
     * trilha de auditoria registrava a mudanca, e a resposta voltava sem os
     * campos — a tela nunca mostraria o que o banco tinha. O `dadosDaProposta`
     * le do banco direto, entao o PDF saia certo e a ficha, vazia. O roteiro de
     * conferencia pegou; nenhum teste de unidade poderia.
     */
    condicaoPagamento: o.condicaoPagamento,
    prazoEntrega: o.prazoEntrega,
    /*
     * Temperatura e origem vao para a LISTA, e nao so para o detalhe.
     *
     * O cartao do funil e o lugar onde elas servem: o vendedor varre o quadro e
     * ve o que esta frio sem abrir nada. Deixar no detalhe faria a informacao
     * existir e nao ser usada — o mesmo destino que o `custo` da chamada teve
     * por tres fases.
     */
    temperatura: o.temperatura,
    canalOrigem: o.canalOrigem,
    /**
     * Divergencia entre o digitado e o que os itens somam.
     *
     * Existe para a tela poder avisar em vez de escolher em silencio. Os itens
     * mandam (decisao 57), mas quem digitou 5.000 e ve 3.400 no funil merece
     * saber por que — sem isso, o numero parece defeito.
     */
    divergeDoInformado:
      o.valorInformado !== null && itens.length > 0 && Math.abs(Number(o.valorInformado) - totais.valor) > 0.01,
    totais: {
      bruto: totais.bruto,
      descontoTotal: totais.descontoTotal,
      acrescimoTotal: totais.acrescimoTotal,
      custoTotal: totais.custoTotal,
      margem: totais.margem,
      margemPercentual: totais.margemPercentual,
      itensComCusto: totais.itensComCusto,
    },
    /**
     * Alcada de desconto (decisao 58).
     *
     * `NAO_REQUER` e `APROVADA` sao estados diferentes de proposito: o primeiro
     * diz que o desconto caiu dentro do teto, o segundo que alguem com alcada
     * olhou e liberou. A tela mostra quem liberou, e por isso o nome vem junto.
     */
    aprovacaoDesconto: o.aprovacaoDesconto,
    aprovadoPor: o.aprovadoPor,
    aprovadoEm: o.aprovadoEm,
    estagioDesde: o.estagioDesde,
    /**
     * Dias na etapa atual e idade total do cartao. Vao calculados aqui, e nao no
     * front, para que os dois numeros venham do mesmo relogio: o navegador do
     * vendedor pode estar com a hora errada, e "3 dias parado" e um numero em
     * que alguem vai agir.
     */
    diasNoEstagio: diasDesde(o.estagioDesde),
    diasAberta: diasDesde(o.criadoEm),
  };
}

/* ── Base instalada (item 5.1) ─────────────────────────────────────────── */

export const inclusaoProdutoDoCliente = {
  componentes: { orderBy: { criadoEm: 'asc' } },
} satisfies Prisma.ProdutoDoClienteInclude;

type ProdutoDoClienteDb = Prisma.ProdutoDoClienteGetPayload<{ include: typeof inclusaoProdutoDoCliente }>;

/**
 * Junta cada componente ao proprio status de garantia.
 *
 * O calculo mora aqui, e nao no front, pelo mesmo motivo de `diasNoEstagio`:
 * "vencida" e um numero em que alguem vai agir no atendimento de garantia, e
 * o relogio certo e o do servidor.
 */
export function toProdutoDoCliente(p: ProdutoDoClienteDb) {
  return {
    id: p.id,
    contaId: p.contaId,
    modelo: p.modelo,
    numeroSerie: p.numeroSerie,
    dataInstalacao: p.dataInstalacao,
    instaladorNome: p.instaladorNome,
    instaladorCredenciado: p.instaladorCredenciado,
    notaFiscalNumero: p.notaFiscalNumero,
    observacoes: p.observacoes,
    criadoEm: p.criadoEm,
    atualizadoEm: p.atualizadoEm,
    componentes: p.componentes.map((c) => {
      const resultado = statusDaGarantia(
        { tipo: c.tipo, prazoDias: c.prazoDias, dataInicio: c.dataInicio ?? p.dataInstalacao },
        { instaladorCredenciado: p.instaladorCredenciado, notaFiscalNumero: p.notaFiscalNumero },
      );
      return {
        id: c.id,
        tipo: c.tipo,
        nome: c.nome,
        prazoDias: c.prazoDias,
        dataInicio: c.dataInicio ?? p.dataInstalacao,
        observacao: c.observacao,
        status: resultado.status,
        vencimento: resultado.vencimento,
      };
    }),
  };
}
