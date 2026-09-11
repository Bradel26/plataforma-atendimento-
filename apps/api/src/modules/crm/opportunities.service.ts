import type { Prisma } from '@prisma/client';
import { prisma, type ClienteDeEscrita } from '../../lib/prisma';
import { filtroDe, politicaContas, politicaOportunidades } from '../../lib/politicas';
import { apenasVisivel } from '../../lib/visibilidade';
import { organizacaoAtual, usuarioAtual } from '../../lib/tenant';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { inclusaoOportunidade, toOportunidade } from './crm.serializers';
import { confirmarValoresDoRegistro, prepararValoresDoRegistro, valoresDoRegistro } from './campos-customizados.service';
import { montarProposta } from './proposta';
import {
  diferencasDaOportunidade,
  registrarAuditoria,
  trilhaDaOportunidade,
  type Retrato,
} from './auditoria';
import {
  comTarefaDeEtapa,
  conferirEtapaLiberada,
  ehAvanco,
  garantirTarefaDaEtapa,
  tarefasDeEtapaAbertas,
} from './etapas';
import {
  fracaoDeDesconto,
  resolverValor,
  situacaoDaAlcada,
  tetoDoPerfil,
  totaisDaOportunidade,
  type ItemParaTotal,
} from './valores';
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

    /*
     * Desconto maior que o que a linha cobra e recusado aqui, e nao aparado no
     * calculo.
     *
     * A funcao de total deixa o liquido negativo de proposito, para que um erro
     * de digitacao apareca em vez de virar linha zerada. Mas gravar linha
     * negativa poria a proposta impressa a somar contra si mesma, e o funil a
     * contar receita negativa. O lugar de recusar e a borda de escrita, com
     * mensagem que diz o teto — nao "valor invalido".
     *
     * A checagem nao mora no schema porque `precoUnitario` pode vir omitido para
     * o catalogo resolver: la nao ha bruto com que comparar.
     */
    const bruto = item.quantidade * preco;
    const teto = bruto + item.acrescimo;
    if (item.desconto > teto) {
      throw badRequest(
        `Desconto de ${item.desconto} passa do total da linha (${teto}). Reduza o desconto ou aumente a quantidade.`,
      );
    }

    return {
      produtoId: item.produtoId,
      quantidade: item.quantidade,
      precoUnitario: preco,
      acrescimo: item.acrescimo,
      desconto: item.desconto,
      recorrencia: item.recorrencia,
      custoUnitario: item.custoUnitario ?? null,
    };
  });
}

/** O que o calculo de totais precisa de cada item gravado. */
const paraTotal = (i: {
  quantidade: number;
  precoUnitario: number;
  acrescimo: number;
  desconto: number;
  recorrencia: 'UNICO' | 'MENSAL';
  custoUnitario: number | null;
}): ItemParaTotal => i;

/**
 * O mesmo, para item que veio do banco.
 *
 * Prisma devolve `Decimal` nas colunas de dinheiro, e `Number()` em cada uma e o
 * que o serializador tambem faz. Existe separado de `paraTotal` porque aquele
 * recebe item ja em `number` — o que vem do proprio `montarItens`.
 */
const doBanco = (i: {
  quantidade: number;
  precoUnitario: Prisma.Decimal;
  acrescimo: Prisma.Decimal;
  desconto: Prisma.Decimal;
  recorrencia: 'UNICO' | 'MENSAL';
  custoUnitario: Prisma.Decimal | null;
}): ItemParaTotal => ({
  quantidade: i.quantidade,
  precoUnitario: Number(i.precoUnitario),
  acrescimo: Number(i.acrescimo),
  desconto: Number(i.desconto),
  recorrencia: i.recorrencia,
  custoUnitario: i.custoUnitario === null ? null : Number(i.custoUnitario),
});

/** Texto em branco e ausencia de valor, nao valor em branco. */
const vazioEhNulo = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

export type SinalDeTarefa = { tarefasAbertas: number; proximoPrazo: Date | null };

/**
 * Tarefas em aberto por oportunidade, para o alerta do cartao do kanban.
 *
 * Consulta de topo, e nao `include` aninhado, por duas razoes:
 *
 * - a extensao de multi-tenant filtra a operacao consultada, nao o que vem por
 *   `include`. `Activity` e a unica tabela filha que carrega `organizacao_id`
 *   justamente porque uma atividade pode acabar apontando para a oportunidade de
 *   outra organizacao (ver o comentario do modelo, e o furo que o `smoke:tenant`
 *   provou). Um `groupBy` passa pela extensao; um include nao passaria;
 * - um include traria todas as atividades de todos os cartoes do quadro, sem
 *   teto, para produzir dois numeros.
 *
 * Conta **so o que tem prazo**: atividade sem prazo e registro do que aconteceu,
 * nao tarefa pendente. Contar nota como "proxima acao" apagaria o alerta
 * exatamente nos cartoes que mais precisam dele — os que tem historico e nenhum
 * proximo passo marcado.
 */
export async function tarefasPorOportunidade(ids: string[]): Promise<Map<string, SinalDeTarefa>> {
  if (ids.length === 0) return new Map();

  const grupos = await prisma.activity.groupBy({
    by: ['oportunidadeId'],
    where: { oportunidadeId: { in: ids }, concluidoEm: null, prazo: { not: null } },
    _count: { _all: true },
    _min: { prazo: true },
  });

  const mapa = new Map<string, SinalDeTarefa>();
  for (const g of grupos) {
    if (!g.oportunidadeId) continue;
    mapa.set(g.oportunidadeId, { tarefasAbertas: g._count._all, proximoPrazo: g._min.prazo });
  }
  return mapa;
}

/**
 * Junta o sinal de tarefa a cada oportunidade ja serializada.
 *
 * Oportunidade fora do mapa nao tem tarefa com prazo em aberto — e isso e um
 * zero de verdade, nao um "nao sei". Por isso o padrao e 0 e nao `null`: o
 * cartao precisa poder dizer "sem proxima acao", e um nulo viraria silencio.
 */
export function comSinalDeTarefa<T extends { id: string }>(oportunidades: T[], tarefas: Map<string, SinalDeTarefa>) {
  return oportunidades.map((o) => {
    const t = tarefas.get(o.id);
    return { ...o, tarefasAbertas: t?.tarefasAbertas ?? 0, proximoPrazo: t?.proximoPrazo ?? null };
  });
}

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

  // O escopo entra sempre. `{}` significa "sem restricao": era o que esta
  // consulta usava quando nenhum filtro vinha da query.
  filtros.push(await filtroDe(politicaOportunidades));
  const oportunidades = await prisma.opportunity.findMany({
    where: { AND: filtros },
    include: inclusaoOportunidade,
    orderBy: { atualizadoEm: 'desc' },
    take: query.limite,
  });
  const serializadas = oportunidades.map(toOportunidade);
  const ids = serializadas.map((o) => o.id);
  return comTarefaDeEtapa(
    comSinalDeTarefa(serializadas, await tarefasPorOportunidade(ids)),
    await tarefasDeEtapaAbertas(ids),
  );
}

export async function obterOportunidade(id: string) {
  // Mesmo filtro da listagem: fora do escopo responde 404, nao 403.
  const o = await prisma.opportunity.findFirst({
    where: apenasVisivel(id, await filtroDe(politicaOportunidades)),
    include: inclusaoOportunidade,
  });
  if (!o) throw notFound('Oportunidade nao encontrada');
  const [comSinal] = comTarefaDeEtapa(
    comSinalDeTarefa([toOportunidade(o)], await tarefasPorOportunidade([o.id])),
    await tarefasDeEtapaAbertas([o.id]),
  );
  return { ...comSinal!, camposCustomizados: await valoresDoRegistro('OPORTUNIDADE', o.id) };
}

export async function criarOportunidade(input: CriarOportunidadeInput, usuarioId?: string) {
  // A conta tem de estar no escopo de quem cria a oportunidade.
  const conta = await prisma.account.findFirst({
    where: apenasVisivel(input.contaId, await filtroDe(politicaContas)),
  });
  if (!conta) throw notFound('Conta nao encontrada');

  const { funil, estagio } = await resolverFunil(input.funilId, input.estagioId);
  const itens = input.itens?.length ? await montarItens({ catalogoId: input.catalogoId, itens: input.itens }) : [];

  /*
   * Havendo item, o item manda (decisao 57 — inverte a decisao 11).
   *
   * O `valor` que chega pela rota passou a significar "valor informado a mao": ele
   * e guardado sempre, e so vira o valor efetivo quando nao ha item. Com desconto
   * na linha, um total digitado por cima faria a proposta impressa discordar da
   * soma das proprias linhas na frente do cliente.
   */
  const mesesRecorrencia = input.mesesRecorrencia ?? 12;
  const totais = totaisDaOportunidade(itens.map(paraTotal), mesesRecorrencia);
  const valores = resolverValor(totais, input.valor ?? null);

  // Valida os campos customizados ANTES de criar: se falhar, nao sobra
  // oportunidade sem o campo obrigatorio que a validacao recusou.
  const camposParaGravar = await prepararValoresDoRegistro('OPORTUNIDADE', null, input.camposCustomizados);

  /*
   * A oportunidade e a tarefa da primeira etapa nascem juntas (item 3.1).
   *
   * Numa transacao porque um cartao na etapa sem a tarefa que ela exige e um
   * cartao pendente que ninguem sabe que esta pendente — e o vendedor descobriria
   * a exigencia so ao tentar mover.
   */
  const criada = await prisma.$transaction(async (tx) => {
    const nova = await tx.opportunity.create({
      data: {
        titulo: input.titulo,
        contaId: conta.id,
        funilId: funil.id,
        estagioId: estagio.id,
        valor: valores.valor,
        valorUnico: valores.valorUnico,
        valorMensal: valores.valorMensal,
        valorInformado: valores.valorInformado,
        mesesRecorrencia,
        responsavelId: input.responsavelId ?? null,
        previsaoFechamento: input.previsaoFechamento ?? null,
        itens: itens.length > 0 ? { createMany: { data: itens } } : undefined,
        // Primeira entrada do historico: sem estagio de origem e sem tempo gasto.
        // Sem ela, a conversao etapa a etapa perde o denominador do primeiro
        // estagio — todo cartao teria entrado no funil "do nada".
        historicoEstagio: { create: { paraEstagioId: estagio.id, usuarioId: usuarioId ?? null } },
      },
      include: inclusaoOportunidade,
    });

    await garantirTarefaDaEtapa(tx, {
      oportunidadeId: nova.id,
      estagioId: estagio.id,
      tarefaObrigatoria: estagio.tarefaObrigatoria,
      responsavelId: nova.responsavelId,
    });

    return nova;
  });
  await confirmarValoresDoRegistro('OPORTUNIDADE', criada.id, camposParaGravar);
  return { ...toOportunidade(criada), camposCustomizados: await valoresDoRegistro('OPORTUNIDADE', criada.id) };
}

/**
 * Recalcula e grava os totais a partir dos itens que estao no banco.
 *
 * Existe porque tres caminhos mudam o valor — trocar itens, mudar o horizonte de
 * recorrencia, digitar um valor a mao — e cada um deles precisa dos outros dois
 * para chegar ao numero certo. Espalhado, o terceiro caminho esqueceria de um
 * dos campos e o funil passaria a somar errado sem nada quebrar.
 */
async function regravarTotais(id: string, tx: ClienteDeEscrita = prisma) {
  /*
   * `findFirst`, e nao `findUniqueOrThrow`.
   *
   * Nao e estilo: dentro de uma transacao interativa, com o cliente estendido de
   * multi-tenant, `findUniqueOrThrow` com `select` aninhado devolve a relacao
   * **vazia** enquanto `findFirst` com o mesmo select devolve as linhas. O pai e
   * encontrado; os filhos gravados na mesma transacao, nao.
   *
   * Reproduzido: apos um `createMany` de item, no mesmo `tx`,
   * `findUniqueOrThrow` -> `{itens: []}`, `findFirst` -> `{itens: [{...}]}`,
   * `opportunityItem.count` -> 1.
   *
   * O sintoma era pior que um erro: `definirItens` gravava os itens e calculava
   * o total como se nao houvesse nenhum, entao a proposta ficava certa na tabela
   * e o funil somava o valor antigo. Nada quebrava. Foi a conferencia contra a
   * API que pegou — teste de unidade nao alcanca, porque a funcao pura estava
   * correta.
   */
  const atual = await tx.opportunity.findFirstOrThrow({
    where: { id },
    select: {
      mesesRecorrencia: true,
      valorInformado: true,
      itens: {
        select: {
          quantidade: true,
          precoUnitario: true,
          acrescimo: true,
          desconto: true,
          recorrencia: true,
          custoUnitario: true,
        },
      },
    },
  });

  const totais = totaisDaOportunidade(
    atual.itens.map((i) =>
      paraTotal({
        quantidade: i.quantidade,
        precoUnitario: Number(i.precoUnitario),
        acrescimo: Number(i.acrescimo),
        desconto: Number(i.desconto),
        recorrencia: i.recorrencia,
        custoUnitario: i.custoUnitario === null ? null : Number(i.custoUnitario),
      }),
    ),
    atual.mesesRecorrencia,
  );
  const valores = resolverValor(totais, atual.valorInformado === null ? null : Number(atual.valorInformado));

  /*
   * A alcada se decide aqui, junto do total, e nao numa funcao a parte.
   *
   * Sao a mesma verdade: o desconto que muda o valor e o desconto que dispara a
   * aprovacao. Separados, um caminho de escrita atualizaria o total e esqueceria
   * a situacao — e a proposta ficaria com desconto de 40% marcada como
   * `NAO_REQUER`, que e pior que nao ter a regra.
   *
   * Quem monta a proposta e quem tem o teto. Um GESTOR editando a proposta de um
   * COMERCIAL a libera pelo proprio perfil, e isso e intencional: ele poderia
   * aprovar em seguida de qualquer forma, e exigir os dois passos so adicionaria
   * clique.
   */
  const { perfil } = usuarioAtual();
  const org = await tx.organizacao.findFirstOrThrow({
    where: { id: organizacaoAtual() },
    select: { descontoMaximoPercentual: true },
  });
  const situacao = situacaoDaAlcada(fracaoDeDesconto(totais), tetoDoPerfil(perfil, org.descontoMaximoPercentual));

  await tx.opportunity.update({
    where: { id },
    data: {
      valor: valores.valor,
      valorUnico: valores.valorUnico,
      valorMensal: valores.valorMensal,
      aprovacaoDesconto: situacao,
      // Mudar a proposta invalida a aprovacao anterior. Manter o "aprovado por"
      // de um desconto que nao existe mais faria o registro dizer que alguem
      // autorizou um numero que nunca viu.
      aprovadoPorId: null,
      aprovadoEm: null,
    },
  });
}

/**
 * Libera ou recusa o desconto de uma proposta pendente.
 *
 * Reprovar nao desfaz o desconto: quem reprova esta dizendo "reduza", e apagar o
 * numero por conta propria tiraria do vendedor a chance de renegociar a partir do
 * que ja estava conversado. O que a reprovacao faz e continuar impedindo o
 * fechamento — a proposta so anda quando o desconto cabe no teto ou alguem
 * assume a excecao.
 */
export async function decidirDesconto(id: string, aprovar: boolean) {
  const atual = await prisma.opportunity.findFirst({
    where: apenasVisivel(id, await filtroDe(politicaOportunidades)),
    select: { id: true, aprovacaoDesconto: true },
  });
  if (!atual) throw notFound('Oportunidade nao encontrada');
  if (atual.aprovacaoDesconto === 'NAO_REQUER') {
    throw badRequest('Esta proposta nao precisa de aprovacao de desconto');
  }

  const { id: usuarioId } = usuarioAtual();
  const situacao = aprovar ? 'APROVADA' : 'REPROVADA';
  await prisma.$transaction(async (tx) => {
    await tx.opportunity.update({
      where: { id },
      data: { aprovacaoDesconto: situacao, aprovadoPorId: usuarioId, aprovadoEm: new Date() },
    });
    // A decisao entra na trilha alem de `aprovadoPor`: aquele campo guarda so a
    // ULTIMA decisao, e uma proposta reprovada, reeditada e aprovada depois
    // perderia a reprovacao — que e a parte que alguem vai querer ler.
    await registrarAuditoria(tx, id, [
      { campo: 'APROVACAO_DESCONTO', de: atual.aprovacaoDesconto, para: situacao },
    ]);
  });

  return obterOportunidade(id);
}

export async function atualizarOportunidade(
  id: string,
  input: AtualizarOportunidadeInput,
  usuarioId?: string,
) {
  const atual = await prisma.opportunity.findFirst({
    where: apenasVisivel(id, await filtroDe(politicaOportunidades)),
    // O nome do responsavel entra na trilha (item 3.2): guardar so o id deixaria
    // a auditoria ilegivel depois de o usuario ser removido.
    include: { responsavel: { select: { id: true, nome: true } } },
  });
  if (!atual) throw notFound('Oportunidade nao encontrada');
  if (atual.status !== 'ABERTA') throw badRequest('Oportunidade fechada nao pode ser alterada');

  const mudouEstagio = Boolean(input.estagioId) && input.estagioId !== atual.estagioId;

  let destino: { id: string; nome: string; ordem: number; tarefaObrigatoria: string | null } | null = null;
  if (input.estagioId) {
    const estagio = await prisma.funnelStage.findUnique({ where: { id: input.estagioId } });
    if (!estagio) throw notFound('Estagio nao encontrado');
    if (estagio.funilId !== atual.funilId) throw badRequest('Estagio nao pertence ao funil da oportunidade');
    destino = estagio;
  }

  /*
   * A tarefa da etapa barra o avanco, nao o retorno (item 3.1).
   *
   * A assimetria e a mesma da alcada de desconto, e pelo mesmo tipo de razao:
   * quase todo movimento para tras e correcao de engano — alguem arrastou o
   * cartao para a coluna errada — e exigir a tarefa para poder desfazer o proprio
   * erro deixaria o cartao preso onde ninguem quis por.
   *
   * A conferencia olha a etapa de ORIGEM: o que a etapa exige e condicao para
   * sair dela, nao para entrar na seguinte. Olhar o destino faria a exigencia
   * pular uma etapa de lugar.
   */
  if (mudouEstagio && destino) {
    const origem = await prisma.funnelStage.findUnique({ where: { id: atual.estagioId } });
    if (origem && ehAvanco(origem.ordem, destino.ordem)) {
      await conferirEtapaLiberada(id, origem);
    }
  }

  /*
   * `valor` na rota significa "valor informado", e nunca e gravado direto na
   * coluna `valor`.
   *
   * A coluna e derivada (decisao 57), e escrever nela por fora do recalculo faria
   * o funil mostrar um numero que os itens contradizem. O nome do campo na rota
   * fica como estava para nao quebrar quem ja chama — o formulario de nova
   * oportunidade manda `valor` desde a Fase 2.
   */
  const { valor, camposCustomizados, ...resto } = input;
  const camposParaGravar = await prepararValoresDoRegistro('OPORTUNIDADE', id, camposCustomizados);
  const dados = {
    ...resto,
    ...(valor !== undefined ? { valorInformado: valor } : {}),
    // Texto vazio vira nulo antes de gravar: guardar `''` imprimiria o rotulo
    // "Condicao de pagamento" seguido de nada, e num documento que vai ao
    // cliente isso parece campo que ficou faltando.
    ...(input.condicaoPagamento !== undefined ? { condicaoPagamento: vazioEhNulo(input.condicaoPagamento) } : {}),
    ...(input.prazoEntrega !== undefined ? { prazoEntrega: vazioEhNulo(input.prazoEntrega) } : {}),
  };
  // Mexer em valor informado ou no horizonte muda o total; trocar o titulo, nao.
  const mexeuNoValor = valor !== undefined || input.mesesRecorrencia !== undefined;

  /*
   * O retrato de antes e o de depois, para a trilha de auditoria (item 3.2).
   *
   * `depois` recebe **so os campos que vieram no PATCH**: ausente significa "nao
   * mandei", e tratar ausencia como mudanca faria toda edicao de titulo registrar
   * que o responsavel foi removido.
   */
  const antes: Retrato = {
    TITULO: atual.titulo,
    VALOR_INFORMADO: atual.valorInformado === null ? null : Number(atual.valorInformado),
    MESES_RECORRENCIA: atual.mesesRecorrencia,
    RESPONSAVEL: atual.responsavel ?? null,
    PREVISAO_FECHAMENTO: atual.previsaoFechamento?.toISOString() ?? null,
    CONDICAO_PAGAMENTO: atual.condicaoPagamento,
    PRAZO_ENTREGA: atual.prazoEntrega,
    ORIGEM: atual.canalOrigem,
  };
  const depois: Retrato = {};
  if (input.titulo !== undefined) depois.TITULO = input.titulo;
  if (valor !== undefined) depois.VALOR_INFORMADO = valor;
  if (input.mesesRecorrencia !== undefined) depois.MESES_RECORRENCIA = input.mesesRecorrencia;
  if (input.previsaoFechamento !== undefined) {
    depois.PREVISAO_FECHAMENTO = input.previsaoFechamento?.toISOString() ?? null;
  }
  if (input.condicaoPagamento !== undefined) depois.CONDICAO_PAGAMENTO = vazioEhNulo(input.condicaoPagamento);
  if (input.prazoEntrega !== undefined) depois.PRAZO_ENTREGA = vazioEhNulo(input.prazoEntrega);
  /*
   * Origem entra na trilha; temperatura NAO.
   *
   * Origem e fato sobre a procedencia do negocio, e mudar isso em silencio
   * reescreveria de onde a venda veio — base de qualquer decisao de investimento
   * em canal. Temperatura e leitura subjetiva que muda toda semana: auditar cada
   * mudanca encheria a trilha e esconderia as linhas que importam.
   */
  if (input.canalOrigem !== undefined) depois.ORIGEM = input.canalOrigem;
  if (input.responsavelId !== undefined) {
    depois.RESPONSAVEL = input.responsavelId
      ? await prisma.user.findFirst({ where: { id: input.responsavelId }, select: { id: true, nome: true } })
      : null;
  }
  const mudancas = diferencasDaOportunidade(antes, depois);

  if (!mudouEstagio) {
    // Transacao mesmo sem mudanca de etapa: a trilha nao pode registrar uma
    // edicao que acabou revertida.
    await prisma.$transaction(async (tx) => {
      await tx.opportunity.update({ where: { id }, data: dados });
      if (mexeuNoValor) await regravarTotais(id, tx);
      await registrarAuditoria(tx, id, mudancas);
    });
    await confirmarValoresDoRegistro('OPORTUNIDADE', id, camposParaGravar);
    return obterOportunidade(id);
  }

  // Mudanca de estagio grava historico e reancora estagioDesde. Numa transacao
  // porque as duas escritas sao a mesma verdade: um historico sem a nova ancora
  // (ou o contrario) faz o tempo por etapa mentir para sempre.
  const agora = new Date();
  const segundos = Math.max(0, Math.round((agora.getTime() - atual.estagioDesde.getTime()) / 1000));

  await prisma.$transaction(async (tx) => {
    await tx.opportunityStageLog.create({
      data: {
        oportunidadeId: id,
        deEstagioId: atual.estagioId,
        paraEstagioId: input.estagioId as string,
        usuarioId: usuarioId ?? null,
        segundosNoEstagio: segundos,
        criadoEm: agora,
      },
    });
    await tx.opportunity.update({ where: { id }, data: { ...dados, estagioDesde: agora } });
    if (mexeuNoValor) await regravarTotais(id, tx);
    // A etapa em si NAO entra na auditoria: ela ja esta em `OpportunityStageLog`,
    // logo acima, com o tempo gasto. A trilha lida na tela une as duas fontes.
    await registrarAuditoria(tx, id, mudancas);
    // A tarefa da etapa de destino nasce na mesma transacao do movimento.
    if (destino) {
      await garantirTarefaDaEtapa(tx, {
        oportunidadeId: id,
        estagioId: destino.id,
        tarefaObrigatoria: destino.tarefaObrigatoria,
        responsavelId: input.responsavelId ?? atual.responsavelId,
      });
    }
  });

  await confirmarValoresDoRegistro('OPORTUNIDADE', id, camposParaGravar);
  return obterOportunidade(id);
}

export async function fecharOportunidade(id: string, input: FecharOportunidadeInput) {
  const atual = await prisma.opportunity.findFirst({
    where: apenasVisivel(id, await filtroDe(politicaOportunidades)),
  });
  if (!atual) throw notFound('Oportunidade nao encontrada');
  if (atual.status !== 'ABERTA') throw badRequest('Oportunidade ja esta fechada');

  /*
   * Ganhar exige desconto dentro da alcada. Perder, nao.
   *
   * A assimetria e o ponto: barrar a perda deixaria a oportunidade viva no funil
   * por causa de uma aprovacao que ninguem vai dar — o negocio acabou, e o funil
   * tem de refletir isso. Barrar o ganho e o que impede a venda de se registrar
   * com um desconto que a empresa nao autorizou.
   */
  if (input.status === 'GANHA' && atual.aprovacaoDesconto !== 'NAO_REQUER' && atual.aprovacaoDesconto !== 'APROVADA') {
    throw badRequest(
      atual.aprovacaoDesconto === 'PENDENTE'
        ? 'O desconto desta proposta passa da alcada e ainda espera aprovacao.'
        : 'O desconto desta proposta foi reprovado. Reduza o desconto ou peca nova aprovacao.',
    );
  }

  /*
   * Ganhar tambem exige a tarefa da etapa concluida (item 3.1).
   *
   * Sem isso a exigencia teria uma porta aberta do tamanho do funil inteiro:
   * bastaria clicar em "Ganhou" no primeiro estagio para registrar a venda sem
   * passar pelo processo. Perder continua livre, pela mesma razao da alcada — o
   * negocio acabou, e o funil tem de poder refletir isso.
   */
  if (input.status === 'GANHA') {
    const estagio = await prisma.funnelStage.findUnique({ where: { id: atual.estagioId } });
    if (estagio) await conferirEtapaLiberada(id, estagio);
  }

  const fechada = await prisma.$transaction(async (tx) => {
    const o = await tx.opportunity.update({
      where: { id },
      data: {
        status: input.status,
        motivoPerda: input.status === 'PERDIDA' ? input.motivoPerda : null,
        fechadoEm: new Date(),
      },
      include: inclusaoOportunidade,
    });
    await registrarAuditoria(tx, id, [{ campo: 'STATUS', de: atual.status, para: input.status }]);
    return o;
  });
  return toOportunidade(fechada);
}

/** Substitui os itens e recalcula o valor da oportunidade. */
export async function definirItens(id: string, input: ItensInput) {
  const atual = await prisma.opportunity.findFirst({
    where: apenasVisivel(id, await filtroDe(politicaOportunidades)),
    // Os itens de antes entram para a trilha poder dizer "de 3 itens / 1.000
    // para 4 itens / 1.200" (item 3.2).
    include: {
      itens: {
        select: {
          quantidade: true,
          precoUnitario: true,
          acrescimo: true,
          desconto: true,
          recorrencia: true,
          custoUnitario: true,
        },
      },
    },
  });
  if (!atual) throw notFound('Oportunidade nao encontrada');
  if (atual.status !== 'ABERTA') throw badRequest('Oportunidade fechada nao pode ser alterada');

  const itens = await montarItens(input);
  const produtosUnicos = new Set(itens.map((i) => i.produtoId));
  if (produtosUnicos.size !== itens.length) throw conflict('Produto repetido na lista de itens');

  const meses = input.mesesRecorrencia ?? atual.mesesRecorrencia;
  const retrato = (lista: ItemParaTotal[]) => ({
    quantidade: lista.length,
    total: totaisDaOportunidade(lista, meses).valor,
  });
  const mudancasDeItem = diferencasDaOportunidade(
    { ITENS: retrato(atual.itens.map(doBanco)) },
    { ITENS: retrato(itens.map(paraTotal)) },
  );

  // Transacao interativa, e nao array: o recalculo precisa LER os itens depois de
  // grava-los. Com o array, `regravarTotais` leria o estado anterior — os itens
  // antigos, ja apagados na primeira operacao — e gravaria um total do passado.
  await prisma.$transaction(async (tx) => {
    await tx.opportunityItem.deleteMany({ where: { oportunidadeId: id } });
    await tx.opportunityItem.createMany({ data: itens.map((i) => ({ ...i, oportunidadeId: id })) });
    if (input.mesesRecorrencia !== undefined) {
      await tx.opportunity.update({ where: { id }, data: { mesesRecorrencia: input.mesesRecorrencia } });
    }
    await regravarTotais(id, tx);
    await registrarAuditoria(tx, id, mudancasDeItem);
  });

  return obterOportunidade(id);
}

/**
 * Os dados da proposta comercial em papel (item 2.2).
 *
 * Recusa em dois casos, e os dois sao sobre o que iria para o cliente:
 *
 * - **sem item**, porque uma proposta sem linha nenhuma e uma folha com o nome
 *   do cliente e um total de zero. O valor digitado a mao nao serve: ele nao diz
 *   o que esta sendo vendido, e o cliente nao tem como conferir nada;
 * - **desconto fora da alcada**, pendente ou reprovado. Imprimir seria por na
 *   frente do cliente um preco que a empresa nao autorizou, e e exatamente o que
 *   a decisao 58 existe para impedir — barrar o "ganhou" e deixar a proposta
 *   sair pelo PDF seria um cadeado com a janela aberta ao lado.
 */
export async function dadosDaProposta(id: string, emissor: string, agora = new Date()) {
  const o = await prisma.opportunity.findFirst({
    where: apenasVisivel(id, await filtroDe(politicaOportunidades)),
    include: {
      conta: { select: { nome: true } },
      responsavel: { select: { nome: true } },
      itens: { include: { produto: { select: { nome: true, sku: true } } } },
    },
  });
  if (!o) throw notFound('Oportunidade nao encontrada');

  if (o.itens.length === 0) {
    throw badRequest('Monte a proposta antes de gerar o PDF: uma proposta sem itens nao diz o que esta sendo vendido.');
  }
  if (o.aprovacaoDesconto === 'PENDENTE' || o.aprovacaoDesconto === 'REPROVADA') {
    throw badRequest(
      o.aprovacaoDesconto === 'PENDENTE'
        ? 'O desconto desta proposta passa da alcada e ainda espera aprovacao.'
        : 'O desconto desta proposta foi reprovado. Reduza o desconto ou peca nova aprovacao.',
    );
  }

  return montarProposta(
    {
      id: o.id,
      titulo: o.titulo,
      criadoEm: o.criadoEm,
      previsaoFechamento: o.previsaoFechamento,
      mesesRecorrencia: o.mesesRecorrencia,
      condicaoPagamento: o.condicaoPagamento,
      prazoEntrega: o.prazoEntrega,
      conta: o.conta,
      responsavel: o.responsavel,
      itens: o.itens.map((i) => ({ ...doBanco(i), produto: i.produto })),
    },
    emissor,
    agora,
  );
}

/**
 * A trilha de auditoria de uma oportunidade (item 3.2).
 *
 * A oportunidade e conferida com o filtro de visibilidade **antes** de a trilha
 * ser lida, e nao junto: `oportunidade_auditoria` e
 * `oportunidade_historico_estagio` nao carregam `organizacao_id`, e a extensao de
 * multi-tenant filtra a operacao consultada, nao a relacao. Sem esta conferencia,
 * um id valido de outra organizacao devolveria a trilha dela.
 */
export async function auditoriaDaOportunidade(id: string) {
  const existe = await prisma.opportunity.findFirst({
    where: apenasVisivel(id, await filtroDe(politicaOportunidades)),
    select: { id: true },
  });
  if (!existe) throw notFound('Oportunidade nao encontrada');
  return trilhaDaOportunidade(id);
}

/** Kanban do funil: uma coluna por estagio, na ordem configurada. */
export async function funilKanban(funilId?: string) {
  const { funil } = await resolverFunil(funilId);

  const oportunidades = await prisma.opportunity.findMany({
    // O kanban e uma listagem como as outras: sem o escopo, o quadro mostraria
    // o funil da organizacao inteira enquanto a lista mostra a carteira.
    where: { AND: [{ funilId: funil.id, status: 'ABERTA' }, await filtroDe(politicaOportunidades)] },
    include: inclusaoOportunidade,
    orderBy: { atualizadoEm: 'desc' },
  });
  // Um `groupBy` para o quadro inteiro, e nao um por coluna: o alerta de cartao
  // parado nao vale o custo de uma consulta por estagio.
  const ids = oportunidades.map((o) => o.id);
  const serializadas = comTarefaDeEtapa(
    comSinalDeTarefa(oportunidades.map(toOportunidade), await tarefasPorOportunidade(ids)),
    await tarefasDeEtapaAbertas(ids),
  );

  return {
    funil: { id: funil.id, nome: funil.nome },
    colunas: funil.estagios.map((estagio) => {
      const itens = serializadas.filter((o) => o.estagio.id === estagio.id);
      return {
        estagio: {
          id: estagio.id,
          nome: estagio.nome,
          ordem: estagio.ordem,
          probabilidade: estagio.probabilidade,
          // A coluna anuncia a exigencia antes de o cartao chegar nela: ver
          // "exige: visita tecnica" no cabecalho e diferente de descobrir o
          // bloqueio ao arrastar.
          tarefaObrigatoria: estagio.tarefaObrigatoria,
        },
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

/**
 * Configura a exigencia de uma etapa (item 3.1).
 *
 * O funil e conferido **antes** por consulta propria, e nao por `include`: a
 * extensao de multi-tenant filtra a operacao consultada, e `FunnelStage` nao
 * carrega `organizacao_id`. Ir direto na etapa por id deixaria qualquer
 * organizacao reescrever o processo de outra — e nenhum filtro de leitura pegaria
 * isso, porque a escrita nao passa por leitura.
 */
export async function definirTarefaDaEtapa(funilId: string, estagioId: string, tarefaObrigatoria: string | null) {
  const funil = await prisma.funnel.findFirst({ where: { id: funilId }, select: { id: true } });
  if (!funil) throw notFound('Funil nao encontrado');

  const estagio = await prisma.funnelStage.findFirst({ where: { id: estagioId, funilId: funil.id } });
  if (!estagio) throw notFound('Estagio nao encontrado neste funil');

  const texto = tarefaObrigatoria?.trim();
  /*
   * Texto vazio apaga a exigencia, e isso **nao** mexe nas tarefas ja criadas.
   *
   * Elas continuam abertas e continuam barrando, porque o bloqueio le a atividade
   * e nao o texto da etapa. E o comportamento certo: a tarefa foi combinada com
   * alguem, tem responsavel, e apagar em massa faria desaparecer trabalho
   * pendente de gente que nao foi avisada. Desligar a exigencia vale para quem
   * entrar na etapa dali em diante.
   */
  return prisma.funnelStage.update({
    where: { id: estagio.id },
    data: { tarefaObrigatoria: texto ? texto : null },
  });
}

export async function criarFunil(input: { nome: string; estagios: Array<{ nome: string; probabilidade: number }> }) {
  const existente = await prisma.funnel.findFirst({ where: { nome: input.nome } });
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

/**
 * Registra que o PDF da proposta foi gerado (item §16 do painel do vendedor).
 *
 * Sem verificar se a oportunidade existe: a rota que chama isto ja carregou a
 * oportunidade com sucesso (`dadosDaProposta` teria lancado 404 antes) — verificar de
 * novo aqui seria uma segunda consulta so para confirmar o que a primeira ja provou.
 */
export async function registrarPropostaGerada(oportunidadeId: string, autorId: string | undefined) {
  await prisma.propostaGerada.create({
    data: { oportunidadeId, autorId: autorId ?? null },
  });
}
