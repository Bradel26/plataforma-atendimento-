import { prisma } from '../../lib/prisma';
import { indicadoresVoz } from '../voice/voice.service';

const ABERTOS_TICKET = ['ABERTO', 'EM_ANDAMENTO', 'AGUARDANDO_CLIENTE'] as const;

/** Media de segundos entre dois instantes, calculada no banco. */
async function mediaSegundos(
  campoInicio: string,
  campoFim: string,
  tabela: string,
  desde: Date,
): Promise<number | null> {
  const linhas = await prisma.$queryRawUnsafe<Array<{ media: number | null }>>(
    `SELECT AVG(EXTRACT(EPOCH FROM ("${campoFim}" - "${campoInicio}")))::float AS media
     FROM "${tabela}"
     WHERE "${campoFim}" IS NOT NULL AND "${campoInicio}" IS NOT NULL AND "${campoInicio}" >= $1`,
    desde,
  );
  const media = linhas[0]?.media;
  return media === null || media === undefined ? null : Math.round(media);
}

export type Periodo = { desde: Date; ate: Date };

/**
 * Indicadores do dashboard. TME = tempo medio de espera (criacao -> atribuicao);
 * TMA = tempo medio de atendimento (atribuicao -> finalizacao).
 */
export async function indicadores(periodo: Periodo) {
  const [
    porStatus,
    porCanal,
    agentes,
    tme,
    tma,
    ticketsPorStatus,
    slaVencidos,
    pesquisas,
    novasConversas,
    mensagens,
    voz,
  ] = await Promise.all([
    prisma.conversation.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.conversation.groupBy({
      by: ['canal'],
      _count: { _all: true },
      where: { criadoEm: { gte: periodo.desde, lte: periodo.ate } },
    }),
    prisma.user.groupBy({ by: ['status'], _count: { _all: true }, where: { ativo: true } }),
    mediaSegundos('criado_em', 'atribuido_em', 'conversas', periodo.desde),
    mediaSegundos('atribuido_em', 'finalizado_em', 'conversas', periodo.desde),
    prisma.ticket.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.ticket.count({
      where: { prazoSla: { lt: new Date() }, status: { in: [...ABERTOS_TICKET] } },
    }),
    prisma.survey.findMany({
      where: { respondidoEm: { not: null }, enviadoEm: { gte: periodo.desde, lte: periodo.ate } },
      select: { tipo: true, nota: true },
    }),
    prisma.conversation.count({ where: { criadoEm: { gte: periodo.desde, lte: periodo.ate } } }),
    prisma.message.count({ where: { criadoEm: { gte: periodo.desde, lte: periodo.ate } } }),
    indicadoresVoz(periodo.desde, periodo.ate),
  ]);

  const contar = <T extends string>(
    grupos: Array<{ _count: { _all: number } } & Record<string, unknown>>,
    chave: string,
  ) =>
    grupos.reduce<Record<string, number>>((acc, g) => {
      acc[String(g[chave] as T)] = g._count._all;
      return acc;
    }, {});

  const conversas = contar(porStatus, 'status');
  const csat = pesquisas.filter((p) => p.tipo === 'CSAT' && p.nota !== null).map((p) => p.nota!);
  const nps = pesquisas.filter((p) => p.tipo === 'NPS' && p.nota !== null).map((p) => p.nota!);

  return {
    periodo,
    conversas: {
      emEspera: conversas.EM_ESPERA ?? 0,
      atribuidas: conversas.ATRIBUIDO ?? 0,
      emAtendimento: conversas.EM_ATENDIMENTO ?? 0,
      finalizadas: conversas.FINALIZADO ?? 0,
      novasNoPeriodo: novasConversas,
      mensagensNoPeriodo: mensagens,
      porCanal: contar(porCanal, 'canal'),
    },
    tempos: { tmeSegundos: tme, tmaSegundos: tma },
    agentes: {
      total: agentes.reduce((acc, g) => acc + g._count._all, 0),
      porStatus: contar(agentes, 'status'),
    },
    protocolos: { porStatus: contar(ticketsPorStatus, 'status'), slaVencidos },
    voz,
    satisfacao: {
      csat: media(csat),
      csatRespostas: csat.length,
      nps: calcularNps(nps),
      npsRespostas: nps.length,
    },
  };
}

const media = (valores: number[]) =>
  valores.length === 0 ? null : Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 100) / 100;

/** NPS = %promotores (9-10) menos %detratores (0-6). Escala de -100 a 100. */
function calcularNps(notas: number[]) {
  if (notas.length === 0) return null;
  const promotores = notas.filter((n) => n >= 9).length;
  const detratores = notas.filter((n) => n <= 6).length;
  return Math.round(((promotores - detratores) / notas.length) * 100);
}

/**
 * Painel de monitoramento: cada agente com status atual, carga de atendimento e
 * tempo desde a ultima mudanca de presenca.
 */
export async function monitoramentoAgentes() {
  const agentes = await prisma.user.findMany({
    where: { ativo: true, perfil: { in: ['AGENTE', 'SUPERVISOR'] } },
    orderBy: { nome: 'asc' },
    include: {
      filas: { include: { fila: { select: { id: true, nome: true } } } },
      _count: {
        select: {
          conversas: { where: { status: { in: ['ATRIBUIDO', 'EM_ATENDIMENTO'] } } },
          protocolos: { where: { status: { in: ['ABERTO', 'EM_ANDAMENTO', 'AGUARDANDO_CLIENTE'] } } },
        },
      },
    },
  });

  const abertos = await prisma.presenceLog.findMany({
    where: { usuarioId: { in: agentes.map((a) => a.id) }, fim: null },
    orderBy: { iniciadoEm: 'desc' },
  });

  const agora = Date.now();

  return agentes.map((a) => {
    const log = abertos.find((l) => l.usuarioId === a.id);
    return {
      id: a.id,
      nome: a.nome,
      perfil: a.perfil,
      status: a.status,
      ultimoLogin: a.ultimoLogin,
      filas: a.filas.map((v) => v.fila),
      conversasAtivas: a._count.conversas,
      protocolosAbertos: a._count.protocolos,
      /** Segundos no status atual, quando ha registro de presenca aberto. */
      segundosNoStatus: log ? Math.round((agora - log.iniciadoEm.getTime()) / 1000) : null,
    };
  });
}

/** Fecha o intervalo de presenca anterior e abre um novo. */
export async function registrarPresenca(usuarioId: string, status: 'OFFLINE' | 'DISPONIVEL' | 'EM_ATENDIMENTO' | 'PAUSA') {
  const aberto = await prisma.presenceLog.findFirst({
    where: { usuarioId, fim: null },
    orderBy: { iniciadoEm: 'desc' },
  });

  const agora = new Date();

  if (aberto) {
    if (aberto.status === status) return; // nada mudou
    await prisma.presenceLog.update({
      where: { id: aberto.id },
      data: { fim: agora, duracao: Math.round((agora.getTime() - aberto.iniciadoEm.getTime()) / 1000) },
    });
  }

  await prisma.presenceLog.create({ data: { usuarioId, status, iniciadoEm: agora } });
}

/**
 * Horas por status no periodo. Intervalos ainda abertos contam ate agora, senao
 * o agente que esta online no momento apareceria com zero.
 */
export async function jornada(periodo: Periodo, usuarioId?: string) {
  const logs = await prisma.presenceLog.findMany({
    where: {
      ...(usuarioId ? { usuarioId } : {}),
      iniciadoEm: { lte: periodo.ate },
      OR: [{ fim: null }, { fim: { gte: periodo.desde } }],
    },
    include: { usuario: { select: { id: true, nome: true } } },
    orderBy: { iniciadoEm: 'asc' },
  });

  const agora = Date.now();
  const porAgente = new Map<
    string,
    { id: string; nome: string; disponivel: number; emAtendimento: number; pausa: number; offline: number }
  >();

  for (const log of logs) {
    const inicio = Math.max(log.iniciadoEm.getTime(), periodo.desde.getTime());
    const fim = Math.min((log.fim ?? new Date(agora)).getTime(), periodo.ate.getTime());
    const segundos = Math.max(0, Math.round((fim - inicio) / 1000));

    const atual =
      porAgente.get(log.usuarioId) ??
      { id: log.usuario.id, nome: log.usuario.nome, disponivel: 0, emAtendimento: 0, pausa: 0, offline: 0 };

    if (log.status === 'DISPONIVEL') atual.disponivel += segundos;
    else if (log.status === 'EM_ATENDIMENTO') atual.emAtendimento += segundos;
    else if (log.status === 'PAUSA') atual.pausa += segundos;
    else atual.offline += segundos;

    porAgente.set(log.usuarioId, atual);
  }

  return [...porAgente.values()].map((a) => ({
    ...a,
    /** Jornada produtiva = disponivel + em atendimento (pausa nao conta). */
    trabalhado: a.disponivel + a.emAtendimento,
  }));
}
