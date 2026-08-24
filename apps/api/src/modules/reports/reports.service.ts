import { prisma } from '../../lib/prisma';
import { jornada, type Periodo } from '../metrics/metrics.service';

export type Relatorio = {
  titulo: string;
  periodo: Periodo;
  colunas: Array<{ chave: string; rotulo: string }>;
  linhas: Array<Record<string, string | number>>;
  totais?: Record<string, string | number>;
};

const segundosParaHms = (segundos: number | null) => {
  if (segundos === null) return '—';
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
};

const mediaSeg = (valores: number[]) =>
  valores.length === 0 ? null : Math.round(valores.reduce((a, b) => a + b, 0) / valores.length);

/** Atendimentos por agente, com TME, TMA e satisfacao — o relatorio mais pedido. */
export async function relatorioAtendimentos(periodo: Periodo): Promise<Relatorio> {
  const conversas = await prisma.conversation.findMany({
    where: { criadoEm: { gte: periodo.desde, lte: periodo.ate } },
    include: {
      agente: { select: { id: true, nome: true } },
      pesquisa: { select: { nota: true, tipo: true, respondidoEm: true } },
      _count: { select: { mensagens: true } },
    },
  });

  type Acumulado = {
    nome: string;
    total: number;
    finalizadas: number;
    mensagens: number;
    esperas: number[];
    atendimentos: number[];
    notas: number[];
  };

  const porAgente = new Map<string, Acumulado>();
  const semAgente: Acumulado = {
    nome: '(sem agente)',
    total: 0,
    finalizadas: 0,
    mensagens: 0,
    esperas: [],
    atendimentos: [],
    notas: [],
  };

  for (const c of conversas) {
    const alvo = c.agente
      ? (porAgente.get(c.agente.id) ??
        { nome: c.agente.nome, total: 0, finalizadas: 0, mensagens: 0, esperas: [], atendimentos: [], notas: [] })
      : semAgente;

    alvo.total += 1;
    alvo.mensagens += c._count.mensagens;
    if (c.status === 'FINALIZADO') alvo.finalizadas += 1;
    if (c.atribuidoEm) alvo.esperas.push(Math.round((c.atribuidoEm.getTime() - c.criadoEm.getTime()) / 1000));
    if (c.atribuidoEm && c.finalizadoEm) {
      alvo.atendimentos.push(Math.round((c.finalizadoEm.getTime() - c.atribuidoEm.getTime()) / 1000));
    }
    if (c.pesquisa?.nota !== null && c.pesquisa?.nota !== undefined) alvo.notas.push(c.pesquisa.nota);

    if (c.agente) porAgente.set(c.agente.id, alvo);
  }

  const registros = [...porAgente.values(), ...(semAgente.total > 0 ? [semAgente] : [])];

  return {
    titulo: 'Atendimentos por agente',
    periodo,
    colunas: [
      { chave: 'agente', rotulo: 'Agente' },
      { chave: 'total', rotulo: 'Conversas' },
      { chave: 'finalizadas', rotulo: 'Finalizadas' },
      { chave: 'mensagens', rotulo: 'Mensagens' },
      { chave: 'tme', rotulo: 'TME' },
      { chave: 'tma', rotulo: 'TMA' },
      { chave: 'satisfacao', rotulo: 'Satisfacao' },
    ],
    linhas: registros.map((r) => ({
      agente: r.nome,
      total: r.total,
      finalizadas: r.finalizadas,
      mensagens: r.mensagens,
      tme: segundosParaHms(mediaSeg(r.esperas)),
      tma: segundosParaHms(mediaSeg(r.atendimentos)),
      satisfacao:
        r.notas.length === 0
          ? '—'
          : `${(r.notas.reduce((a, b) => a + b, 0) / r.notas.length).toFixed(2)} (${r.notas.length})`,
    })),
    totais: {
      agente: 'Total',
      total: conversas.length,
      finalizadas: conversas.filter((c) => c.status === 'FINALIZADO').length,
      mensagens: conversas.reduce((acc, c) => acc + c._count.mensagens, 0),
      tme: segundosParaHms(mediaSeg(registros.flatMap((r) => r.esperas))),
      tma: segundosParaHms(mediaSeg(registros.flatMap((r) => r.atendimentos))),
      satisfacao: '',
    },
  };
}

/** Volume e desempenho por fila. */
export async function relatorioFilas(periodo: Periodo): Promise<Relatorio> {
  const conversas = await prisma.conversation.findMany({
    where: { criadoEm: { gte: periodo.desde, lte: periodo.ate } },
    include: { fila: { select: { id: true, nome: true } } },
  });

  const porFila = new Map<string, { nome: string; total: number; esperando: number; esperas: number[] }>();

  for (const c of conversas) {
    const chave = c.fila?.id ?? 'sem-fila';
    const atual = porFila.get(chave) ?? { nome: c.fila?.nome ?? '(sem fila)', total: 0, esperando: 0, esperas: [] };
    atual.total += 1;
    if (c.status === 'EM_ESPERA') atual.esperando += 1;
    if (c.atribuidoEm) atual.esperas.push(Math.round((c.atribuidoEm.getTime() - c.criadoEm.getTime()) / 1000));
    porFila.set(chave, atual);
  }

  return {
    titulo: 'Desempenho por fila',
    periodo,
    colunas: [
      { chave: 'fila', rotulo: 'Fila' },
      { chave: 'total', rotulo: 'Conversas' },
      { chave: 'esperando', rotulo: 'Em espera' },
      { chave: 'tme', rotulo: 'TME' },
    ],
    linhas: [...porFila.values()].map((f) => ({
      fila: f.nome,
      total: f.total,
      esperando: f.esperando,
      tme: segundosParaHms(mediaSeg(f.esperas)),
    })),
  };
}

/** Chamados por status e prioridade, com SLA. */
export async function relatorioProtocolos(periodo: Periodo): Promise<Relatorio> {
  const tickets = await prisma.ticket.findMany({
    where: { criadoEm: { gte: periodo.desde, lte: periodo.ate } },
    include: { responsavel: { select: { nome: true } } },
  });

  const abertos = ['ABERTO', 'EM_ANDAMENTO', 'AGUARDANDO_CLIENTE'];
  const agora = new Date();

  return {
    titulo: 'Protocolos abertos no periodo',
    periodo,
    colunas: [
      { chave: 'numero', rotulo: 'Numero' },
      { chave: 'titulo', rotulo: 'Titulo' },
      { chave: 'status', rotulo: 'Status' },
      { chave: 'prioridade', rotulo: 'Prioridade' },
      { chave: 'responsavel', rotulo: 'Responsavel' },
      { chave: 'sla', rotulo: 'SLA' },
      { chave: 'resolucao', rotulo: 'Tempo de resolucao' },
    ],
    linhas: tickets.map((t) => ({
      numero: t.numero,
      titulo: t.titulo,
      status: t.status,
      prioridade: t.prioridade,
      responsavel: t.responsavel?.nome ?? '—',
      sla: !t.prazoSla
        ? '—'
        : t.prazoSla < agora && abertos.includes(t.status)
          ? 'vencido'
          : 'no prazo',
      resolucao: t.resolvidoEm
        ? segundosParaHms(Math.round((t.resolvidoEm.getTime() - t.criadoEm.getTime()) / 1000))
        : '—',
    })),
    totais: {
      numero: '',
      titulo: `${tickets.length} chamado(s)`,
      status: '',
      prioridade: '',
      responsavel: '',
      sla: `${tickets.filter((t) => t.prazoSla && t.prazoSla < agora && abertos.includes(t.status)).length} vencido(s)`,
      resolucao: '',
    },
  };
}

/** Jornada de trabalho por agente, a partir do log de presenca. */
export async function relatorioJornada(periodo: Periodo): Promise<Relatorio> {
  const dados = await jornada(periodo);

  return {
    titulo: 'Jornada de trabalho',
    periodo,
    colunas: [
      { chave: 'agente', rotulo: 'Agente' },
      { chave: 'disponivel', rotulo: 'Disponivel' },
      { chave: 'atendimento', rotulo: 'Em atendimento' },
      { chave: 'pausa', rotulo: 'Pausa' },
      { chave: 'trabalhado', rotulo: 'Jornada produtiva' },
    ],
    linhas: dados.map((d) => ({
      agente: d.nome,
      disponivel: segundosParaHms(d.disponivel),
      atendimento: segundosParaHms(d.emAtendimento),
      pausa: segundosParaHms(d.pausa),
      trabalhado: segundosParaHms(d.trabalhado),
    })),
    totais: {
      agente: 'Total',
      disponivel: segundosParaHms(dados.reduce((a, d) => a + d.disponivel, 0)),
      atendimento: segundosParaHms(dados.reduce((a, d) => a + d.emAtendimento, 0)),
      pausa: segundosParaHms(dados.reduce((a, d) => a + d.pausa, 0)),
      trabalhado: segundosParaHms(dados.reduce((a, d) => a + d.trabalhado, 0)),
    },
  };
}

/** Funil comercial: leads por fase com valor estimado. */
export async function relatorioFunil(periodo: Periodo): Promise<Relatorio> {
  const grupos = await prisma.lead.groupBy({
    by: ['fase'],
    where: { criadoEm: { gte: periodo.desde, lte: periodo.ate } },
    _count: { _all: true },
    _sum: { valorEstimado: true },
  });

  const totalLeads = grupos.reduce((acc, g) => acc + g._count._all, 0);

  return {
    titulo: 'Funil de leads',
    periodo,
    colunas: [
      { chave: 'fase', rotulo: 'Fase' },
      { chave: 'leads', rotulo: 'Leads' },
      { chave: 'participacao', rotulo: 'Participacao' },
      { chave: 'valor', rotulo: 'Valor estimado' },
    ],
    linhas: grupos.map((g) => ({
      fase: g.fase,
      leads: g._count._all,
      participacao: totalLeads === 0 ? '—' : `${Math.round((g._count._all / totalLeads) * 100)}%`,
      valor: g._sum.valorEstimado ? Number(g._sum.valorEstimado).toFixed(2).replace('.', ',') : '0,00',
    })),
    totais: {
      fase: 'Total',
      leads: totalLeads,
      participacao: '100%',
      valor: grupos
        .reduce((acc, g) => acc + (g._sum.valorEstimado ? Number(g._sum.valorEstimado) : 0), 0)
        .toFixed(2)
        .replace('.', ','),
    },
  };
}

export const RELATORIOS = {
  atendimentos: relatorioAtendimentos,
  filas: relatorioFilas,
  protocolos: relatorioProtocolos,
  jornada: relatorioJornada,
  funil: relatorioFunil,
} as const;

export type NomeRelatorio = keyof typeof RELATORIOS;
