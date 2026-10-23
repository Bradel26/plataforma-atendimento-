import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { filtroDe, politicaContatos, politicaCredenciamentos } from '../../lib/politicas';
import { usuarioAtualOuNulo } from '../../lib/tenant';
import { apenasVisivel } from '../../lib/visibilidade';
import { badRequest, notFound } from '../../lib/errors';
import { chaveDoVinculo, pertenceAoVinculo } from '../esteira/vinculo';
import { criarVinculo } from '../esteira/vinculos.service';
import { SEGMENTOS_PARCEIRO, identificarSegmentoParceiro, type SegmentoParceiro } from './segmentoParceiro';
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

  if (!funil) throw badRequest('Nenhum funil de Esteira configurado para esta organização');
  if (funil.tipo !== 'ESTEIRA') throw badRequest('O funil informado não e do tipo Esteira');
  if (funil.estagios.length === 0) throw badRequest('O funil não tem estágios configurados');

  const estagio = estagioId ? funil.estagios.find((e) => e.id === estagioId) : funil.estagios[0];
  if (!estagio) throw badRequest('Estágio não pertence ao funil informado');

  return { funil, estagio };
}

async function carregarVisivel(id: string) {
  const c = await prisma.credenciamento.findFirst({
    where: apenasVisivel(id, await filtroDe(politicaCredenciamentos)),
    include: inclusao,
  });
  if (!c) throw notFound('Credenciamento não encontrado');
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

/**
 * Rota antiga (`POST /api/credenciamentos`, sai na Task 21): delega para
 * `criarVinculo`. A operação vem do funil informado (ou do primeiro funil
 * ESTEIRA); `segmentoParceiro` deixou de restringir (spec 4.2) e o vínculo
 * sempre nasce na primeira etapa do trilho — `estagioId` é ignorado.
 */
export async function criarCredenciamento(input: CriarCredenciamentoInput) {
  const { funil } = await resolverFunilEsteira(input.funilId);
  if (!funil.operacao) throw badRequest('A esteira informada não tem operação definida');
  const vinculo = await criarVinculo(funil.operacao, {
    contatoId: input.contatoId,
    contaId: input.contaId,
    responsavelId: input.responsavelId,
    observacoes: input.observacoes,
  });
  const criado = await prisma.credenciamento.findUniqueOrThrow({ where: { id: vinculo.id }, include: inclusao });
  return serialize(criado);
}

/**
 * Classifica contatos pela origem guardada nas observacoes e encaminha em lote
 * para a esteira TIM ou Starlink. A previa e somente leitura; a execucao e
 * idempotente por vinculo (parceiro + operacao, `whereDoVinculo`).
 */
export async function importarContatosClassificados(previa: boolean) {
  const visibilidade = await filtroDe(politicaContatos);
  const contatos = await prisma.contact.findMany({
    where: {
      AND: [
        visibilidade,
        {
          OR: [
            { segmentoParceiro: { not: null } },
            // Pré-filtro largo; quem decide é identificarSegmentoParceiro.
            { observacoes: { contains: 'tim', mode: 'insensitive' } },
            { observacoes: { contains: 'starlink', mode: 'insensitive' } },
          ],
        },
      ],
    },
    select: { id: true, nome: true, contaId: true, segmentoParceiro: true, observacoes: true },
    orderBy: { nome: 'asc' },
  });

  const classificados = contatos.flatMap((contato) => {
    const segmento = identificarSegmentoParceiro(contato.segmentoParceiro, contato.observacoes);
    return segmento ? [{ ...contato, segmento }] : [];
  });
  const funis = await funisDaEsteira();
  const destino = new Map<SegmentoParceiro, (typeof funis)[number] | undefined>([
    ['TIM', funis.find((funil) => funil.nome.toLocaleLowerCase('pt-BR') === 'credenciamento tim')],
    ['STARLINK', funis.find((funil) => funil.nome.toLocaleLowerCase('pt-BR') === 'credenciamento starlink')],
  ]);
  // Vinculos existentes dos contatos e das contas deles, pelo mesmo criterio de
  // `criarVinculo` (`pertenceAoVinculo` = `whereDoVinculo` em memoria):
  // card em excecao conta como existente; arquivado nao.
  const ids = classificados.map((contato) => contato.id);
  const contaIds = [...new Set(classificados.flatMap((c) => (c.contaId ? [c.contaId] : [])))];
  const existentes = ids.length
    ? await prisma.credenciamento.findMany({
        where: {
          arquivadoEm: null,
          OR: [{ contatoId: { in: ids } }, ...(contaIds.length ? [{ contaId: { in: contaIds } }] : [])],
        },
        select: { operacao: true, contaId: true, contatoId: true, arquivadoEm: true },
      })
    : [];

  // O segmento reconhecido fica gravado no contato mesmo para quem ja esta na
  // esteira ou nao tem esteira configurada: a ficha e o envio manual dependem dele.
  if (!previa) {
    for (const segmento of SEGMENTOS_PARCEIRO) {
      const semSegmento = classificados.filter((c) => c.segmento === segmento && c.segmentoParceiro !== segmento);
      if (semSegmento.length) {
        await prisma.contact.updateMany({
          where: { id: { in: semSegmento.map((c) => c.id) } },
          data: { segmentoParceiro: segmento },
        });
      }
    }
  }

  const novoResumo = () => ({
    identificados: 0,
    paraEnviar: 0,
    jaNaEsteira: 0,
    emOutraEsteira: 0,
    semEsteiraConfigurada: 0,
    enviados: 0,
    erros: [] as Array<{ contato: string; motivo: string }>,
  });
  const porSegmento = { TIM: novoResumo(), STARLINK: novoResumo() };
  const envios: Array<{ contato: (typeof classificados)[number]; funilId: string }> = [];
  // Vinculos ja reservados neste lote: dois contatos da mesma conta sao um parceiro so.
  const reservados = new Set<string>();

  for (const contato of classificados) {
    const resumo = porSegmento[contato.segmento];
    const funil = destino.get(contato.segmento);
    resumo.identificados += 1;
    if (!funil || funil.estagios.length === 0) {
      resumo.semEsteiraConfigurada += 1;
      continue;
    }
    const vinculo = { operacao: funil.operacao ?? contato.segmento, contaId: contato.contaId, contatoId: contato.id };
    const chave = chaveDoVinculo(vinculo);
    if (reservados.has(chave) || existentes.some((c) => pertenceAoVinculo(c, vinculo))) {
      resumo.jaNaEsteira += 1;
      continue;
    }
    const outraOperacao = vinculo.operacao === 'TIM' ? 'STARLINK' : 'TIM';
    if (existentes.some((c) => pertenceAoVinculo(c, { ...vinculo, operacao: outraOperacao }))) {
      resumo.emOutraEsteira += 1;
    }
    reservados.add(chave);
    resumo.paraEnviar += 1;
    envios.push({ contato, funilId: funil.id });
  }

  if (!previa) {
    // Poucos envios simultaneos: o lote pode ter milhares de contatos e cada
    // um faz varias consultas, mas nao pode esgotar o pool do Prisma.
    const fila = [...envios];
    const trabalhar = async () => {
      for (let item = fila.shift(); item; item = fila.shift()) {
        const resumo = porSegmento[item.contato.segmento];
        try {
          await criarCredenciamento({ contatoId: item.contato.id, funilId: item.funilId });
          resumo.enviados += 1;
        } catch (erro) {
          resumo.erros.push({
            contato: item.contato.nome,
            motivo: erro instanceof Error ? erro.message : 'Falha ao enviar para a esteira',
          });
        }
      }
    };
    await Promise.all(Array.from({ length: 4 }, trabalhar));
  }

  return { previa, totalIdentificados: classificados.length, porSegmento };
}

export async function atualizarCredenciamento(id: string, input: AtualizarCredenciamentoInput) {
  const atual = await carregarVisivel(id);
  const mudouEstagio = input.estagioId !== undefined && input.estagioId !== atual.estagioId;

  if (mudouEstagio) {
    const estagio = await prisma.funnelStage.findUnique({ where: { id: input.estagioId } });
    if (!estagio) throw notFound('Estágio não encontrado');
    if (estagio.funilId !== atual.funilId) throw badRequest('Estágio não pertence ao funil do credenciamento');
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
          operacao: atual.operacao,
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
    console.error('[ciclo-parceiro] não iniciou o ciclo', erro);
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
