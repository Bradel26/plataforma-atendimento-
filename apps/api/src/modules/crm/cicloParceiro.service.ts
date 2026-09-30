import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { filtroDe, politicaCredenciamentos } from '../../lib/politicas';
import { usuarioAtualOuNulo } from '../../lib/tenant';
import { apenasVisivel } from '../../lib/visibilidade';
import { badRequest, notFound } from '../../lib/errors';
import { papelDoEstagio } from './esteira';
import {
  CHAVES_ETAPAS,
  ETAPAS_IMPLANTACAO,
  PRIORIDADE_ATENCAO,
  STATUS_CICLO,
  decidirAutomatico,
  diasEntre,
  validarMudancaManual,
  type StatusCiclo,
} from './cicloParceiro';

/**
 * Persistencia do ciclo de vida do parceiro. As regras vivem em `cicloParceiro.ts`
 * (puras); aqui so a leitura dos fatos e a gravacao de cada passo no historico.
 *
 * O ciclo nao depende de um job para estar certo: a listagem e o detalhe
 * recalculam o que leem. O agendador diario existe para gravar as mudancas de
 * quem ninguem abriu — e por isso o historico mostra o dia certo da mudanca.
 */

const inclusaoLista = {
  credenciamento: {
    select: {
      id: true,
      contatoId: true,
      situacaoExcecao: true,
      funil: { select: { id: true, nome: true } },
      responsavel: { select: { id: true, nome: true } },
      contato: { select: { id: true, nome: true, telefone: true, uf: true, cidade: true } },
    },
  },
  etapas: { select: { chave: true } },
} satisfies Prisma.CicloParceiroInclude;

type CicloDb = Prisma.CicloParceiroGetPayload<{ include: typeof inclusaoLista }>;

/**
 * Ultima interacao registrada por contato: atividade de relacionamento (tudo
 * menos nota interna) ja feita, conversa ou ligacao.
 *
 * Nao e produtividade: e "alguem da equipe falou com o parceiro". Tarefa so
 * conta depois de concluida, porque agendar nao e acompanhar.
 */
export async function ultimasInteracoes(contatoIds: string[]): Promise<Map<string, Date>> {
  const mapa = new Map<string, Date>();
  if (contatoIds.length === 0) return mapa;
  const guardar = (id: string | null, data: Date | null | undefined) => {
    if (!id || !data) return;
    const atual = mapa.get(id);
    if (!atual || data > atual) mapa.set(id, data);
  };

  const [registradas, concluidas, conversas, ligacoes] = await Promise.all([
    prisma.activity.groupBy({
      by: ['contatoId'],
      where: { contatoId: { in: contatoIds }, prazo: null, tipo: { not: 'NOTA' } },
      _max: { criadoEm: true },
    }),
    prisma.activity.groupBy({
      by: ['contatoId'],
      where: { contatoId: { in: contatoIds }, concluidoEm: { not: null }, tipo: { not: 'NOTA' } },
      _max: { concluidoEm: true },
    }),
    prisma.conversation.groupBy({
      by: ['contatoId'],
      where: { contatoId: { in: contatoIds } },
      _max: { ultimaMensagemEm: true },
    }),
    prisma.call.groupBy({
      by: ['contatoId'],
      where: { contatoId: { in: contatoIds } },
      _max: { iniciadoEm: true },
    }),
  ]);
  for (const r of registradas) guardar(r.contatoId, r._max.criadoEm);
  for (const r of concluidas) guardar(r.contatoId, r._max.concluidoEm);
  for (const r of conversas) guardar(r.contatoId, r._max.ultimaMensagemEm);
  for (const r of ligacoes) guardar(r.contatoId, r._max.iniciadoEm);
  return mapa;
}

/**
 * Cria o ciclo de quem chegou ao estagio Ativo da esteira e ainda nao tem um.
 *
 * O estagio e reconhecido pelo NOME (`papelDoEstagio`), como no resto da esteira.
 * A data do credenciamento e a entrada no estagio atual — para quem ja estava la
 * antes desta funcionalidade existir, e a melhor data que o historico tem.
 */
export async function iniciarCiclos(credenciamentoId?: string) {
  const candidatos = await prisma.credenciamento.findMany({
    where: {
      situacaoExcecao: null,
      cicloParceiro: { is: null },
      ...(credenciamentoId ? { id: credenciamentoId } : {}),
    },
    select: { id: true, estagioDesde: true, estagio: { select: { nome: true } } },
  });

  let criados = 0;
  for (const c of candidatos) {
    if (papelDoEstagio(c.estagio.nome) !== 'ATIVO') continue;
    try {
      await prisma.cicloParceiro.create({
        data: {
          credenciamentoId: c.id,
          credenciadoEm: c.estagioDesde,
          statusDesde: c.estagioDesde,
          status: 'NOVO_PARCEIRO',
          historico: {
            create: {
              paraStatus: 'NOVO_PARCEIRO',
              regra: 'CREDENCIAMENTO_CONCLUIDO',
              motivo: 'Credenciamento concluido',
              criadoEm: c.estagioDesde,
            },
          },
        },
      });
      criados += 1;
    } catch (erro) {
      // Duas requisicoes criando o mesmo ciclo: a segunda perde, e tudo bem.
      if (!(erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002')) throw erro;
    }
  }
  return criados;
}

type CicloBasico = { id: string; status: StatusCiclo; statusDesde: Date; etapas: unknown[] };

/**
 * Aplica as mudancas automaticas ate estabilizar, gravando cada passo.
 * Devolve o status final.
 */
async function recalcular(ciclo: CicloBasico, ultimaInteracaoEm: Date | null, agora = new Date()) {
  let status = ciclo.status;
  let statusDesde = ciclo.statusDesde;
  // Limite de passos: as regras nao formam laco, mas um laco aqui gravaria sem parar.
  for (let passo = 0; passo < 4; passo += 1) {
    const decisao = decidirAutomatico({
      status,
      statusDesde,
      etapasConcluidas: ciclo.etapas.length,
      totalEtapas: ETAPAS_IMPLANTACAO.length,
      ultimaInteracaoEm,
      agora,
    });
    if (!decisao) break;
    await prisma.$transaction([
      prisma.cicloParceiro.update({ where: { id: ciclo.id }, data: { status: decisao.para, statusDesde: agora } }),
      prisma.cicloParceiroHistorico.create({
        data: {
          cicloId: ciclo.id,
          deStatus: status,
          paraStatus: decisao.para,
          regra: decisao.regra,
          motivo: decisao.motivo,
          criadoEm: agora,
        },
      }),
    ]);
    status = decisao.para;
    statusDesde = agora;
  }
  return status;
}

/** Recalcula uma lista de ciclos ja carregados (busca as interacoes de uma vez). */
async function atualizarCiclos(ciclos: CicloDb[]) {
  const interacoes = await ultimasInteracoes([...new Set(ciclos.map((c) => c.credenciamento.contatoId))]);
  for (const c of ciclos) {
    const novo = await recalcular(c, interacoes.get(c.credenciamento.contatoId) ?? null);
    if (novo !== c.status) {
      // Recarrega o que mudou para a resposta nao mostrar o status antigo.
      const atual = await prisma.cicloParceiro.findUnique({ where: { id: c.id }, select: { status: true, statusDesde: true } });
      if (atual) Object.assign(c, atual);
    }
  }
  return interacoes;
}

function serializar(c: CicloDb, interacoes: Map<string, Date>, agora = new Date()) {
  const ultima = interacoes.get(c.credenciamento.contatoId) ?? null;
  const diasComoParceiro = diasEntre(c.credenciadoEm, agora);
  return {
    id: c.id,
    credenciamentoId: c.credenciamentoId,
    status: c.status,
    statusDesde: c.statusDesde,
    diasNoStatus: diasEntre(c.statusDesde, agora),
    credenciadoEm: c.credenciadoEm,
    diasComoParceiro,
    ultimaInteracaoEm: ultima,
    /** Sem interacao alguma, conta desde o credenciamento. */
    diasSemInteracao: diasEntre(ultima ?? c.credenciadoEm, agora),
    etapasConcluidas: c.etapas.map((e) => e.chave),
    totalEtapas: ETAPAS_IMPLANTACAO.length,
    /** Credenciado ha mais de 30 dias e a implantacao nem comecou. */
    implantacaoAtrasada: c.status === 'NOVO_PARCEIRO' && diasComoParceiro > 30,
    contato: c.credenciamento.contato,
    funil: c.credenciamento.funil,
    responsavel: c.credenciamento.responsavel,
    situacaoExcecao: c.credenciamento.situacaoExcecao,
  };
}

export type CicloSerializado = ReturnType<typeof serializar>;

export async function listarCiclos(query: { status?: StatusCiclo; busca?: string; responsavelId?: string }) {
  await iniciarCiclos();
  const visivel = await filtroDe(politicaCredenciamentos);
  const ciclos = await prisma.cicloParceiro.findMany({
    where: {
      credenciamento: {
        ...visivel,
        ...(query.responsavelId ? { responsavelId: query.responsavelId } : {}),
        ...(query.busca ? { contato: { nome: { contains: query.busca, mode: 'insensitive' } } } : {}),
      },
    },
    include: inclusaoLista,
    orderBy: { credenciadoEm: 'desc' },
    take: 1000,
  });
  const interacoes = await atualizarCiclos(ciclos);
  const agora = new Date();
  const itens = ciclos.map((c) => serializar(c, interacoes, agora));

  const porStatus = Object.fromEntries(STATUS_CICLO.map((s) => [s, 0])) as Record<StatusCiclo, number>;
  for (const i of itens) porStatus[i.status] += 1;

  /** Quem precisa de acao do consultor, mais urgente primeiro. */
  const atencao = itens
    .filter((i) => PRIORIDADE_ATENCAO[i.status] !== undefined || i.implantacaoAtrasada)
    .filter((i) => i.status !== 'REATIVADO' || i.diasNoStatus <= 30)
    .sort(
      (a, b) =>
        (PRIORIDADE_ATENCAO[a.status] ?? 5) - (PRIORIDADE_ATENCAO[b.status] ?? 5) || b.diasSemInteracao - a.diasSemInteracao,
    );

  return {
    itens: query.status ? itens.filter((i) => i.status === query.status) : itens,
    resumo: { total: itens.length, porStatus, implantacaoAtrasada: itens.filter((i) => i.implantacaoAtrasada).length },
    atencao,
  };
}

async function carregarCredenciamentoVisivel(credenciamentoId: string) {
  const c = await prisma.credenciamento.findFirst({
    where: apenasVisivel(credenciamentoId, await filtroDe(politicaCredenciamentos)),
    select: { id: true },
  });
  if (!c) throw notFound('Credenciamento nao encontrado');
}

export async function obterCiclo(credenciamentoId: string) {
  await carregarCredenciamentoVisivel(credenciamentoId);
  await iniciarCiclos(credenciamentoId);

  const ciclo = await prisma.cicloParceiro.findFirst({ where: { credenciamentoId }, include: inclusaoLista });
  // Ainda nao chegou ao estagio Ativo: nao ha ciclo, e a tela diz isso.
  if (!ciclo) return null;
  const interacoes = await atualizarCiclos([ciclo]);

  const [etapas, historico] = await Promise.all([
    prisma.cicloParceiroEtapa.findMany({
      where: { cicloId: ciclo.id },
      include: { concluidaPor: { select: { nome: true } } },
    }),
    prisma.cicloParceiroHistorico.findMany({
      where: { cicloId: ciclo.id },
      orderBy: { criadoEm: 'desc' },
      include: { usuario: { select: { id: true, nome: true } } },
    }),
  ]);

  return {
    ...serializar(ciclo, interacoes),
    etapas: ETAPAS_IMPLANTACAO.map((e) => {
      const feita = etapas.find((x) => x.chave === e.chave);
      return {
        chave: e.chave,
        rotulo: e.rotulo,
        concluida: !!feita,
        concluidaEm: feita?.concluidaEm ?? null,
        concluidaPor: feita?.concluidaPor?.nome ?? null,
      };
    }),
    historico: historico.map((h) => ({
      id: h.id,
      deStatus: h.deStatus,
      paraStatus: h.paraStatus,
      regra: h.regra,
      motivo: h.motivo,
      observacao: h.observacao,
      usuario: h.usuario,
      criadoEm: h.criadoEm,
    })),
  };
}

export async function marcarEtapa(credenciamentoId: string, chave: string, concluida: boolean) {
  if (!CHAVES_ETAPAS.includes(chave)) throw badRequest('Etapa de implantacao desconhecida');
  await carregarCredenciamentoVisivel(credenciamentoId);
  await iniciarCiclos(credenciamentoId);
  const ciclo = await prisma.cicloParceiro.findFirst({ where: { credenciamentoId }, select: { id: true } });
  if (!ciclo) throw badRequest('O parceiro ainda nao chegou ao estagio Ativo da esteira');

  if (concluida) {
    await prisma.cicloParceiroEtapa.upsert({
      where: { cicloId_chave: { cicloId: ciclo.id, chave } },
      create: { cicloId: ciclo.id, chave, concluidaPorId: usuarioAtualOuNulo()?.id ?? null },
      update: {},
    });
  } else {
    await prisma.cicloParceiroEtapa.deleteMany({ where: { cicloId: ciclo.id, chave } });
  }
  return obterCiclo(credenciamentoId);
}

export async function mudarStatusManual(
  credenciamentoId: string,
  input: { status: StatusCiclo; motivo?: string; observacao?: string },
) {
  await carregarCredenciamentoVisivel(credenciamentoId);
  await iniciarCiclos(credenciamentoId);
  const ciclo = await prisma.cicloParceiro.findFirst({ where: { credenciamentoId } });
  if (!ciclo) throw badRequest('O parceiro ainda nao chegou ao estagio Ativo da esteira');

  const erro = validarMudancaManual(ciclo.status, input.status, input.motivo);
  if (erro) throw badRequest(erro);

  const agora = new Date();
  const motivo =
    input.motivo?.trim() ||
    (input.status === 'REATIVADO' ? `Parceiro reativado em ${agora.toLocaleDateString('pt-BR')}` : null);
  await prisma.$transaction([
    prisma.cicloParceiro.update({ where: { id: ciclo.id }, data: { status: input.status, statusDesde: agora } }),
    prisma.cicloParceiroHistorico.create({
      data: {
        cicloId: ciclo.id,
        deStatus: ciclo.status,
        paraStatus: input.status,
        regra: 'MANUAL',
        motivo,
        observacao: input.observacao?.trim() || null,
        usuarioId: usuarioAtualOuNulo()?.id ?? null,
        criadoEm: agora,
      },
    }),
  ]);
  return obterCiclo(credenciamentoId);
}

/** Uma nova interacao com o contato pode tirar o parceiro de SEM_ACOMPANHAMENTO. */
export async function recalcularCiclosDoContato(contatoId: string) {
  const ciclos = await prisma.cicloParceiro.findMany({
    where: { credenciamento: { contatoId } },
    include: inclusaoLista,
  });
  if (ciclos.length > 0) await atualizarCiclos(ciclos);
}

/** Passada completa da organizacao: cria os ciclos que faltam e recalcula todos. */
export async function recalcularTodos() {
  const criados = await iniciarCiclos();
  const ciclos = await prisma.cicloParceiro.findMany({ include: inclusaoLista });
  await atualizarCiclos(ciclos);
  return { criados, recalculados: ciclos.length };
}
