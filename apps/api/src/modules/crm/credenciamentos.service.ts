import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';
import { filtroDe, politicaCredenciamentos } from '../../lib/politicas';
import { usuarioAtualOuNulo } from '../../lib/tenant';
import { acessoDoUsuarioAtual } from '../esteira/acesso';
import { PERFIS_NA_OPERACAO } from '../users/presenca.perfis';
import { MAXIMO_POR_LOTE, planejarAtribuicao } from './atribuicaoEmLote';
import { PREFIXO_CHAVE_RETOMADA, planejarRetomada } from './retomadaEmLote';

/**
 * Funis ESTEIRA (um por operacao) para os indicadores e seletores. O cadastro,
 * a consulta e os movimentos dos vinculos ficam em `modules/esteira`
 * (`/api/esteiras/:operacao`); a API antiga de credenciamentos saiu na Task 21.
 */

// Só etapas ativas: a migração desativa as etapas antigas sem chave (ex.:
// Starlink "Treinamento realizado", "Ativo"), que não podem aparecer no
// Dashboard, na Gestão nem nos seletores de etapa (Desempenho, Campanhas).
const comEstagios = { estagios: { where: { ativa: true }, orderBy: { ordem: 'asc' } } } satisfies Prisma.FunnelInclude;

/** Funis ESTEIRA ativos da organizacao — um por operacao (ex.: TIM, Starlink). */
export function funisDaEsteira() {
  return prisma.funnel.findMany({
    where: { tipo: 'ESTEIRA', ativo: true },
    orderBy: { criadoEm: 'asc' },
    include: comEstagios,
  });
}

/**
 * Funis ESTEIRA das operacoes que o usuario atual enxerga (spec 4.9). Funil sem
 * operacao (anterior a migracao) nao aparece: credenciamento sempre tem operacao.
 */
export async function funisPermitidos() {
  const [funis, acesso] = await Promise.all([funisDaEsteira(), acessoDoUsuarioAtual()]);
  return funis.filter((f) => f.operacao !== null && acesso[f.operacao] !== undefined);
}

/** Funil pedido por id fora das operacoes permitidas: 404, sem revelar que existe. */
export async function exigirFunilPermitido(funilId: string | undefined) {
  if (!funilId) return;
  if (!(await funisPermitidos()).some((f) => f.id === funilId)) throw notFound('Operação não encontrada');
}

/**
 * Escopo das acoes em lote sobre credenciamentos: a carteira que o usuario enxerga
 * (politica), so operacoes em que ele tem EDICAO (LEITURA nao altera nada), vinculo
 * nao arquivado e esteira. O que ficar fora volta como "nao encontrado".
 */
async function escopoDeEdicao(): Promise<Prisma.CredenciamentoWhereInput> {
  const acesso = await acessoDoUsuarioAtual();
  const operacoes = (Object.keys(acesso) as Array<keyof typeof acesso>).filter((o) => acesso[o] === 'EDICAO');
  return {
    AND: [
      await filtroDe(politicaCredenciamentos),
      operacoes.length ? { operacao: { in: operacoes } } : { id: { in: [] } },
      { arquivadoEm: null },
      { funil: { tipo: 'ESTEIRA' } },
    ],
  };
}

/**
 * Atribui um responsavel a varios credenciamentos sem dono. Com `previa: true`
 * (padrao da tela) so calcula o que MUDARIA; grava apenas com `previa: false`,
 * depois de uma pessoa revisar. Nao envia mensagem nem cria atividade.
 * O contato do parceiro tambem recebe o responsavel quando esta sem (a carteira
 * do contato e o que define quem o enxerga).
 */
export async function atribuirResponsavelEmLote(input: { ids: string[]; responsavelId: string; previa: boolean }) {
  if (input.ids.length === 0) throw badRequest('Selecione ao menos um parceiro');
  if (input.ids.length > MAXIMO_POR_LOTE) throw badRequest(`Máximo de ${MAXIMO_POR_LOTE} parceiros por vez`);

  const responsavel = await prisma.user.findFirst({
    where: { id: input.responsavelId, ativo: true, perfil: { in: PERFIS_NA_OPERACAO } },
    select: { id: true, nome: true },
  });
  if (!responsavel) throw badRequest('Responsável inválido ou inativo');

  const encontrados = await prisma.credenciamento.findMany({
    where: { AND: [await escopoDeEdicao(), { id: { in: input.ids } }] },
    select: { id: true, responsavelId: true, contatoId: true },
  });
  const plano = planejarAtribuicao(input.ids, encontrados);
  const contatos = encontrados.filter((c) => plano.paraAtribuir.includes(c.id)).map((c) => c.contatoId);

  if (!input.previa && plano.paraAtribuir.length > 0) {
    await prisma.$transaction([
      // `responsavelId: null` no filtro: nunca sobrescreve quem ja tem dono (corrida entre duas revisoes).
      prisma.credenciamento.updateMany({ where: { id: { in: plano.paraAtribuir }, responsavelId: null }, data: { responsavelId: responsavel.id } }),
      prisma.contact.updateMany({ where: { id: { in: contatos }, responsavelId: null }, data: { responsavelId: responsavel.id } }),
    ]);
  }
  console.info(
    '[crm][atribuicao-em-lote]',
    JSON.stringify({
      previa: input.previa,
      por: usuarioAtualOuNulo()?.id ?? null,
      responsavelId: responsavel.id,
      pedidos: input.ids.length,
      atribuidos: plano.paraAtribuir.length,
      jaTinhamResponsavel: plano.jaTemResponsavel.length,
      naoEncontrados: plano.naoEncontrados.length,
    }),
  );
  return {
    previa: input.previa,
    responsavel,
    totalPedidos: new Set(input.ids).size,
    atribuidos: plano.paraAtribuir.length,
    jaTinhamResponsavel: plano.jaTemResponsavel.length,
    naoEncontrados: plano.naoEncontrados.length,
  };
}

/**
 * Cria tarefas internas de retomada de contato para o responsavel de cada
 * parceiro. `previa: true` (padrao) so calcula. Nao contata ninguem.
 */
export async function criarTarefasDeRetomadaEmLote(input: { ids: string[]; prazoDias: number; previa: boolean }) {
  if (input.ids.length === 0) throw badRequest('Selecione ao menos um parceiro');
  if (input.ids.length > MAXIMO_POR_LOTE) throw badRequest(`Máximo de ${MAXIMO_POR_LOTE} parceiros por vez`);

  const encontrados = await prisma.credenciamento.findMany({
    where: { AND: [await escopoDeEdicao(), { id: { in: input.ids } }] },
    select: { id: true, contatoId: true, responsavelId: true, contato: { select: { nome: true } } },
  });
  const abertas = await prisma.activity.findMany({
    where: {
      contatoId: { in: encontrados.map((e) => e.contatoId) },
      concluidoEm: null,
      canceladoEm: null,
      automacaoChave: { startsWith: PREFIXO_CHAVE_RETOMADA },
    },
    select: { contatoId: true },
  });
  const comTarefa = new Set(abertas.map((a) => a.contatoId).filter((c): c is string => c !== null));
  const plano = planejarRetomada(input.ids, encontrados, comTarefa);

  if (!input.previa && plano.criar.length > 0) {
    const prazo = new Date(Date.now() + input.prazoDias * 86_400_000);
    const dia = new Date().toISOString().slice(0, 10);
    const autorId = usuarioAtualOuNulo()?.id ?? null;
    const porId = new Map(encontrados.map((e) => [e.id, e]));
    await prisma.activity.createMany({
      data: plano.criar.map((id) => {
        const c = porId.get(id)!;
        return {
          tipo: 'ACOMPANHAMENTO' as const,
          titulo: `Retomar contato com ${c.contato.nome}`,
          descricao: 'Sem interação registrada. Tarefa criada após revisão humana; o contato é feito por uma pessoa.',
          prazo,
          responsavelId: c.responsavelId,
          contatoId: c.contatoId,
          criadoPorId: autorId,
          automacaoChave: `${PREFIXO_CHAVE_RETOMADA}${id}:${dia}`,
        };
      }),
      skipDuplicates: true,
    });
  }
  console.info(
    '[crm][retomada-em-lote]',
    JSON.stringify({
      previa: input.previa,
      por: usuarioAtualOuNulo()?.id ?? null,
      pedidos: input.ids.length,
      criadas: plano.criar.length,
      semResponsavel: plano.semResponsavel.length,
      jaTemTarefa: plano.jaTemTarefa.length,
      naoEncontrados: plano.naoEncontrados.length,
    }),
  );
  return {
    previa: input.previa,
    prazoDias: input.prazoDias,
    totalPedidos: new Set(input.ids).size,
    criadas: plano.criar.length,
    semResponsavel: plano.semResponsavel.length,
    jaTemTarefa: plano.jaTemTarefa.length,
    naoEncontrados: plano.naoEncontrados.length,
  };
}
