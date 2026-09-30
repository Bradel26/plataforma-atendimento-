import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { filtroDe, politicaConversas, politicaCredenciamentos, politicaProtocolos } from '../../lib/politicas';
import { organizacaoAtual } from '../../lib/tenant';
import { funisDaEsteira } from './credenciamentos.service';
import { DIA_MS, REGIAO_DA_UF, diasDesde, media, papelDoEstagio, semaforo, type PapelDoEstagio } from './esteira';

/**
 * Indicadores da operacao de credenciamento (SUGESTOES.docx).
 *
 * Tres telas, tres perguntas diferentes — e cada funcao aqui responde uma so,
 * para as telas nao repetirem numero umas das outras:
 *
 * - **Dashboard** (`painelOperacoes`): quantos parceiros existem, por operacao.
 * - **Area da Gestao** (`gestaoOperacao`): onde a esteira esta travando agora.
 * - **Desempenho Operacional** (`desempenhoOperacional`): quem e mais agil.
 */

export type Periodo = { desde: Date; ate: Date };

const ESTAGIOS_CONCLUIDOS: PapelDoEstagio[] = ['CREDENCIADO', 'ATIVO'];

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/**
 * Uma coluna por operacao (funil ESTEIRA). "Tela dividida ao meio com os dados
 * de cada operacao": com dois funis (TIM, Starlink) sao duas metades; com um so,
 * uma coluna; sem nenhum, lista vazia e o Dashboard nao mostra a secao.
 */
export async function painelOperacoes(periodo: Periodo) {
  const [funis, registros] = await Promise.all([
    funisDaEsteira(),
    prisma.credenciamento.findMany({
      where: await filtroDe(politicaCredenciamentos),
      select: {
        funilId: true,
        estagioId: true,
        situacaoExcecao: true,
        criadoEm: true,
        contato: { select: { uf: true } },
      },
    }),
  ]);

  return funis.map((funil) => {
    const papelPorEstagio = new Map(funil.estagios.map((e) => [e.id, papelDoEstagio(e.nome)]));
    const doFunil = registros.filter((r) => r.funilId === funil.id);
    const emFluxo = doFunil.filter((r) => r.situacaoExcecao === null);
    const comPapel = (papel: PapelDoEstagio) => emFluxo.filter((r) => papelPorEstagio.get(r.estagioId) === papel).length;

    const porUf = new Map<string, number>();
    for (const r of doFunil) {
      const uf = r.contato.uf ?? 'Sem UF';
      porUf.set(uf, (porUf.get(uf) ?? 0) + 1);
    }
    const porRegiao = new Map<string, number>();
    for (const [uf, total] of porUf) {
      const regiao = REGIAO_DA_UF[uf] ?? 'Sem UF';
      porRegiao.set(regiao, (porRegiao.get(regiao) ?? 0) + total);
    }
    const ordenar = (m: Map<string, number>) =>
      [...m.entries()].map(([rotulo, total]) => ({ rotulo, total })).sort((a, b) => b.total - a.total);

    return {
      funil: { id: funil.id, nome: funil.nome },
      total: doFunil.length,
      ativos: comPapel('ATIVO'),
      pendentes: comPapel('PENDENCIA'),
      inativos: doFunil.filter((r) => r.situacaoExcecao === 'INATIVADO').length,
      reprovados: doFunil.filter((r) => r.situacaoExcecao === 'REPROVADO').length,
      cancelados: doFunil.filter((r) => r.situacaoExcecao === 'CANCELADO').length,
      novosNoPeriodo: doFunil.filter((r) => r.criadoEm >= periodo.desde && r.criadoEm <= periodo.ate).length,
      porEstagio: funil.estagios.map((e) => ({
        id: e.id,
        nome: e.nome,
        total: emFluxo.filter((r) => r.estagioId === e.id).length,
      })),
      porUf: ordenar(porUf),
      porRegiao: ordenar(porRegiao),
    };
  });
}

// ---------------------------------------------------------------------------
// Blocos compartilhados por Gestao e Desempenho
// ---------------------------------------------------------------------------

type FiltroCred = { funilId?: string; uf?: string; responsavelId?: string };

async function whereCredenciamentos(f: FiltroCred): Promise<Prisma.CredenciamentoWhereInput> {
  const e: Prisma.CredenciamentoWhereInput[] = [await filtroDe(politicaCredenciamentos), { funil: { tipo: 'ESTEIRA' } }];
  if (f.funilId) e.push({ funilId: f.funilId });
  if (f.uf) e.push({ contato: { uf: f.uf } });
  if (f.responsavelId) e.push({ responsavelId: f.responsavelId });
  return { AND: e };
}

/**
 * Tempo medio do inicio do processo ate o credenciamento, em dias.
 *
 * "Credenciado" e a PRIMEIRA entrada num estagio Credenciado ou Ativo — quem
 * pulou direto para Ativo tambem concluiu. Conta quem concluiu dentro do
 * periodo, nao quem comecou nele: o numero responde "quanto demoraram os que
 * credenciamos este mes".
 */
async function temposDeCredenciamento(periodo: Periodo, f: FiltroCred) {
  const passagens = await prisma.credenciamentoHistorico.findMany({
    where: {
      criadoEm: { gte: periodo.desde, lte: periodo.ate },
      credenciamento: await whereCredenciamentos(f),
    },
    select: {
      credenciamentoId: true,
      criadoEm: true,
      paraEstagio: { select: { nome: true } },
      credenciamento: { select: { criadoEm: true, responsavelId: true } },
    },
    orderBy: { criadoEm: 'asc' },
  });

  const vistos = new Set<string>();
  const concluidos: Array<{ dias: number; responsavelId: string | null }> = [];
  for (const p of passagens) {
    if (vistos.has(p.credenciamentoId)) continue;
    if (!ESTAGIOS_CONCLUIDOS.includes(papelDoEstagio(p.paraEstagio.nome))) continue;
    vistos.add(p.credenciamentoId);
    concluidos.push({
      dias: (p.criadoEm.getTime() - p.credenciamento.criadoEm.getTime()) / DIA_MS,
      responsavelId: p.credenciamento.responsavelId,
    });
  }
  return concluidos;
}

const arred1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

/**
 * Tempo medio por etapa: media das passagens CONCLUIDAS no periodo (o card saiu
 * da etapa), em dias. Card que ainda esta na etapa nao entra — o tempo dele nao
 * terminou, e somar um valor parcial puxaria a media para baixo.
 */
async function tempoPorEtapa(periodo: Periodo, f: FiltroCred & { estagioId?: string }) {
  const passagens = await prisma.credenciamentoHistorico.findMany({
    where: {
      criadoEm: { gte: periodo.desde, lte: periodo.ate },
      deEstagioId: f.estagioId ? f.estagioId : { not: null },
      segundosNoEstagio: { not: null },
      credenciamento: await whereCredenciamentos(f),
    },
    select: { segundosNoEstagio: true, deEstagio: { select: { id: true, nome: true, ordem: true } } },
  });

  const porEtapa = new Map<string, { nome: string; ordem: number; segundos: number[] }>();
  for (const p of passagens) {
    if (!p.deEstagio) continue;
    // Agrupa pelo NOME: TIM e Starlink tem estagios com ids diferentes e o
    // mesmo significado, e a pergunta e "qual etapa demora", nao "qual funil".
    const chave = p.deEstagio.nome;
    const atual = porEtapa.get(chave) ?? { nome: p.deEstagio.nome, ordem: p.deEstagio.ordem, segundos: [] };
    atual.segundos.push(p.segundosNoEstagio!);
    porEtapa.set(chave, atual);
  }

  return [...porEtapa.values()]
    .sort((a, b) => a.ordem - b.ordem)
    .map((e) => ({
      etapa: e.nome,
      papel: papelDoEstagio(e.nome),
      passagens: e.segundos.length,
      mediaDias: arred1(media(e.segundos)! / 86_400),
    }));
}

// ---------------------------------------------------------------------------
// Area da Gestao
// ---------------------------------------------------------------------------

export async function gestaoOperacao(
  periodo: Periodo,
  opcoes: { limiteDias: number; horasSemInteracao: number; funilId?: string },
) {
  const f: FiltroCred = { funilId: opcoes.funilId };
  const agora = Date.now();

  const [concluidos, porEtapa, abertos, conversasParadas, funis] = await Promise.all([
    temposDeCredenciamento(periodo, f),
    tempoPorEtapa(periodo, f),
    prisma.credenciamento.findMany({
      where: { AND: [await whereCredenciamentos(f), { situacaoExcecao: null }] },
      select: {
        id: true,
        estagioDesde: true,
        funil: { select: { id: true, nome: true } },
        estagio: { select: { id: true, nome: true, ordem: true } },
        contato: { select: { id: true, nome: true } },
        conta: { select: { id: true, nome: true } },
        responsavel: { select: { id: true, nome: true } },
      },
      orderBy: { estagioDesde: 'asc' },
    }),
    prisma.conversation.findMany({
      where: {
        AND: [
          await filtroDe(politicaConversas),
          { status: { not: 'FINALIZADO' }, arquivada: false },
          { ultimaMensagemEm: { lt: new Date(agora - opcoes.horasSemInteracao * 3_600_000) } },
        ],
      },
      select: {
        id: true,
        canal: true,
        status: true,
        ultimaMensagemEm: true,
        contato: { select: { id: true, nome: true } },
        agente: { select: { id: true, nome: true } },
      },
      orderBy: { ultimaMensagemEm: 'asc' },
      take: 200,
    }),
    funisDaEsteira(),
  ]);

  // "Parado" so vale para quem ainda tem caminho pela frente: parceiro Ativo e
  // o fim da esteira, e ficar la e o objetivo, nao gargalo.
  const naEsteira = abertos
    .filter((c) => papelDoEstagio(c.estagio.nome) !== 'ATIVO')
    .map((c) => {
      const dias = diasDesde(c.estagioDesde, agora);
      return {
        id: c.id,
        parceiro: c.conta?.nome ?? c.contato.nome,
        contato: c.contato,
        responsavel: c.responsavel,
        operacao: c.funil,
        etapa: c.estagio.nome,
        ultimaMovimentacao: c.estagioDesde,
        diasParado: dias,
        semaforo: semaforo(dias, opcoes.limiteDias),
      };
    });

  const parados = naEsteira.filter((c) => c.diasParado >= opcoes.limiteDias);
  const maior = naEsteira.reduce<(typeof naEsteira)[number] | null>(
    (acc, c) => (acc === null || c.diasParado > acc.diasParado ? c : acc),
    null,
  );

  const horasDesde = (d: Date) => Math.floor((agora - d.getTime()) / 3_600_000);

  return {
    periodo,
    parametros: opcoes,
    tempoMedioCredenciamentoDias: arred1(media(concluidos.map((c) => c.dias))),
    credenciadosNoPeriodo: concluidos.length,
    parceirosParados: parados.length,
    maiorTempoParado: maior ? { parceiro: maior.parceiro, dias: maior.diasParado, etapa: maior.etapa } : null,
    tempoMedioPorEtapa: porEtapa,
    atendimentosSemInteracao: {
      total: conversasParadas.length,
      lista: conversasParadas.slice(0, 20).map((c) => ({
        id: c.id,
        canal: c.canal,
        status: c.status,
        contato: c.contato,
        agente: c.agente,
        ultimaMensagemEm: c.ultimaMensagemEm,
        horasSemInteracao: horasDesde(c.ultimaMensagemEm),
        semaforo: semaforo(horasDesde(c.ultimaMensagemEm), opcoes.horasSemInteracao * 2),
      })),
    },
    /** Volume em cada etapa, por operacao: onde a esteira acumula. */
    volumePorEtapa: funis
      .filter((fu) => !opcoes.funilId || fu.id === opcoes.funilId)
      .map((fu) => ({
        funil: { id: fu.id, nome: fu.nome },
        etapas: fu.estagios.map((e) => ({
          id: e.id,
          nome: e.nome,
          total: abertos.filter((c) => c.estagio.id === e.id).length,
          parados: parados.filter((c) => c.etapa === e.nome && c.operacao.id === fu.id).length,
        })),
      })),
    semMovimentacao: naEsteira.slice(0, 50),
    semaforoContagem: {
      NORMAL: naEsteira.filter((c) => c.semaforo === 'NORMAL').length,
      ATENCAO: naEsteira.filter((c) => c.semaforo === 'ATENCAO').length,
      CRITICO: naEsteira.filter((c) => c.semaforo === 'CRITICO').length,
    },
  };
}

// ---------------------------------------------------------------------------
// Desempenho Operacional
// ---------------------------------------------------------------------------

/**
 * Tempo da primeira resposta humana, por agente, em segundos.
 *
 * SQL cru porque a pergunta ("a primeira mensagem de AGENTE de cada conversa")
 * e um MIN por conversa, e fazer isso pelo Prisma traria todas as mensagens do
 * periodo para a memoria. SQL cru nao passa pela extensao de multi-tenant: o
 * filtro de organizacao vai a mao, sempre.
 */
async function primeiraRespostaPorAgente(periodo: Periodo, f: { uf?: string; agenteId?: string }) {
  const params: unknown[] = [organizacaoAtual(), periodo.desde, periodo.ate];
  let extra = '';
  if (f.agenteId) {
    params.push(f.agenteId);
    extra += ` AND c."agente_id" = $${params.length}`;
  }
  if (f.uf) {
    params.push(f.uf);
    extra += ` AND ct."uf" = $${params.length}`;
  }
  const linhas = await prisma.$queryRawUnsafe<Array<{ agente_id: string | null; media: number | null; n: number }>>(
    `SELECT c."agente_id", AVG(EXTRACT(EPOCH FROM (p.primeira - c."criado_em")))::float AS media, COUNT(*)::int AS n
     FROM "conversas" c
     JOIN "contatos" ct ON ct."id" = c."contato_id"
     JOIN LATERAL (
       SELECT MIN(m."criado_em") AS primeira FROM "mensagens" m
       WHERE m."conversa_id" = c."id" AND m."autor" = 'AGENTE' AND m."interno" = false
     ) p ON p.primeira IS NOT NULL
     WHERE c."organizacao_id" = $1 AND c."criado_em" >= $2 AND c."criado_em" <= $3${extra}
     GROUP BY c."agente_id"`,
    ...params,
  );
  return new Map(linhas.map((l) => [l.agente_id, { media: l.media, n: l.n }]));
}

type Sla = { cumprido: number; vencido: number };

function classificarSla(t: { prazoSla: Date | null; resolvidoEm: Date | null; fechadoEm: Date | null }, agora: number) {
  if (!t.prazoSla) return null;
  const fim = t.resolvidoEm ?? t.fechadoEm;
  if (fim) return fim <= t.prazoSla ? 'cumprido' : 'vencido';
  // Aberto e ainda no prazo: nao cumpriu nem venceu. Fica fora da conta.
  return agora > t.prazoSla.getTime() ? 'vencido' : null;
}

const pct = (parte: number, total: number) => (total === 0 ? null : Math.round((parte / total) * 100));

export async function desempenhoOperacional(
  periodo: Periodo,
  f: { consultorId?: string; uf?: string; funilId?: string; estagioId?: string },
) {
  const agora = Date.now();
  const filtroCred: FiltroCred = { funilId: f.funilId, uf: f.uf, responsavelId: f.consultorId };

  const whereConversas: Prisma.ConversationWhereInput = {
    AND: [
      await filtroDe(politicaConversas),
      { criadoEm: { gte: periodo.desde, lte: periodo.ate } },
      ...(f.consultorId ? [{ agenteId: f.consultorId }] : []),
      ...(f.uf ? [{ contato: { uf: f.uf } }] : []),
    ],
  };
  const whereTickets: Prisma.TicketWhereInput = {
    AND: [
      await filtroDe(politicaProtocolos),
      { criadoEm: { gte: periodo.desde, lte: periodo.ate }, prazoSla: { not: null } },
      ...(f.consultorId ? [{ responsavelId: f.consultorId }] : []),
      ...(f.uf ? [{ contato: { uf: f.uf } }] : []),
    ],
  };

  const duracao = periodo.ate.getTime() - periodo.desde.getTime();
  const janelas = [3, 2, 1, 0].map((k) => ({
    desde: new Date(periodo.desde.getTime() - k * duracao),
    ate: new Date(periodo.ate.getTime() - k * duracao),
  }));

  const [primeira, conversas, tickets, concluidos, porEtapa, evolucao, usuarios] = await Promise.all([
    primeiraRespostaPorAgente(periodo, { uf: f.uf, agenteId: f.consultorId }),
    prisma.conversation.findMany({
      where: whereConversas,
      select: { agenteId: true, atribuidoEm: true, finalizadoEm: true },
    }),
    prisma.ticket.findMany({
      where: whereTickets,
      select: { responsavelId: true, prazoSla: true, resolvidoEm: true, fechadoEm: true },
    }),
    temposDeCredenciamento(periodo, filtroCred),
    tempoPorEtapa(periodo, { ...filtroCred, estagioId: f.estagioId }),
    Promise.all(janelas.map((j) => temposDeCredenciamento(j, filtroCred))),
    prisma.user.findMany({ where: { ativo: true }, select: { id: true, nome: true, perfil: true } }),
  ]);

  // --- por consultor -------------------------------------------------------
  type Linha = { atend: number[]; sla: Sla; cred: number[]; conversas: number };
  const porConsultor = new Map<string, Linha>();
  const linha = (id: string) => {
    const atual = porConsultor.get(id) ?? { atend: [], sla: { cumprido: 0, vencido: 0 }, cred: [], conversas: 0 };
    porConsultor.set(id, atual);
    return atual;
  };

  for (const c of conversas) {
    if (!c.agenteId) continue;
    const l = linha(c.agenteId);
    l.conversas += 1;
    if (c.atribuidoEm && c.finalizadoEm) l.atend.push((c.finalizadoEm.getTime() - c.atribuidoEm.getTime()) / 1000);
  }
  const slaTotal: Sla = { cumprido: 0, vencido: 0 };
  for (const t of tickets) {
    const s = classificarSla(t, agora);
    if (!s) continue;
    slaTotal[s] += 1;
    if (t.responsavelId) linha(t.responsavelId).sla[s] += 1;
  }
  for (const c of concluidos) if (c.responsavelId) linha(c.responsavelId).cred.push(c.dias);
  for (const id of primeira.keys()) if (id) linha(id);

  const nomes = new Map(usuarios.map((u) => [u.id, u.nome]));
  const consultores = [...porConsultor.entries()]
    .filter(([id]) => nomes.has(id))
    .map(([id, l]) => {
      const slaN = l.sla.cumprido + l.sla.vencido;
      return {
        id,
        nome: nomes.get(id)!,
        atendimentos: l.conversas,
        primeiraRespostaSegundos: primeira.get(id)?.media === undefined ? null : Math.round(primeira.get(id)!.media!),
        tempoMedioAtendimentoSegundos: l.atend.length ? Math.round(media(l.atend)!) : null,
        credenciamentosConcluidos: l.cred.length,
        tempoMedioCredenciamentoDias: arred1(media(l.cred)),
        slaCumpridoPct: pct(l.sla.cumprido, slaN),
        slaVencidoPct: pct(l.sla.vencido, slaN),
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  // --- cards gerais --------------------------------------------------------
  let somaPrimeira = 0;
  let nPrimeira = 0;
  for (const v of primeira.values()) {
    if (v.media === null) continue;
    somaPrimeira += v.media * v.n;
    nPrimeira += v.n;
  }
  const atendTodos = conversas
    .filter((c) => c.atribuidoEm && c.finalizadoEm)
    .map((c) => (c.finalizadoEm!.getTime() - c.atribuidoEm!.getTime()) / 1000);
  const analise = porEtapa.filter((e) => e.papel === 'ANALISE' || e.papel === 'APROVACAO');
  const slaN = slaTotal.cumprido + slaTotal.vencido;

  return {
    periodo,
    indicadores: {
      primeiraRespostaSegundos: nPrimeira === 0 ? null : Math.round(somaPrimeira / nPrimeira),
      tempoMedioAtendimentoSegundos: atendTodos.length ? Math.round(media(atendTodos)!) : null,
      tempoMedioAnaliseDias: arred1(
        media(analise.flatMap((e) => (e.mediaDias === null ? [] : Array(e.passagens).fill(e.mediaDias)))),
      ),
      tempoMedioCredenciamentoDias: arred1(media(concluidos.map((c) => c.dias))),
      slaCumpridoPct: pct(slaTotal.cumprido, slaN),
      slaVencidoPct: pct(slaTotal.vencido, slaN),
      protocolosComSla: slaN,
    },
    consultores,
    tempoMedioPorEtapa: porEtapa,
    evolucao: janelas.map((j, i) => ({
      desde: j.desde,
      ate: j.ate,
      tempoMedioCredenciamentoDias: arred1(media(evolucao[i]!.map((c) => c.dias))),
      credenciados: evolucao[i]!.length,
    })),
  };
}

// ---------------------------------------------------------------------------
// CRM > Acompanhamentos
// ---------------------------------------------------------------------------

/**
 * Parceiros que precisam de alguma acao, em cinco listas (SUGESTOES.docx, CRM >
 * Acompanhamentos). Um parceiro pode estar em mais de uma: aguardando
 * documentacao E sem interacao ha 10 dias sao dois motivos para ligar.
 */
export async function acompanhamentos(diasSemInteracao: number) {
  const agora = Date.now();
  const limite = new Date(agora - diasSemInteracao * DIA_MS);

  const [creds, retornos] = await Promise.all([
    prisma.credenciamento.findMany({
      where: { AND: [await whereCredenciamentos({}), { OR: [{ situacaoExcecao: null }, { situacaoExcecao: 'INATIVADO' }] }] },
      select: {
        id: true,
        situacaoExcecao: true,
        motivoExcecao: true,
        estagioDesde: true,
        fechadoEm: true,
        funil: { select: { id: true, nome: true } },
        estagio: { select: { nome: true } },
        responsavel: { select: { id: true, nome: true } },
        conta: { select: { nome: true } },
        contato: {
          select: {
            id: true,
            nome: true,
            telefone: true,
            conversas: {
              where: await filtroDe(politicaConversas),
              select: { ultimaMensagemEm: true },
              orderBy: { ultimaMensagemEm: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { estagioDesde: 'asc' },
    }),
    prisma.activity.findMany({
      where: {
        concluidoEm: null,
        prazo: { not: null },
        tipo: { in: ['RETORNO', 'LIGACAO', 'WHATSAPP', 'ACOMPANHAMENTO', 'DOCUMENTACAO'] },
        contato: { credenciamentos: { some: { AND: [await whereCredenciamentos({})] } } },
      },
      select: {
        id: true,
        titulo: true,
        tipo: true,
        prazo: true,
        responsavel: { select: { id: true, nome: true } },
        contato: { select: { id: true, nome: true, telefone: true } },
      },
      orderBy: { prazo: 'asc' },
      take: 100,
    }),
  ]);

  const item = (c: (typeof creds)[number], extra: Record<string, unknown> = {}) => ({
    id: c.id,
    parceiro: c.conta?.nome ?? c.contato.nome,
    contato: { id: c.contato.id, nome: c.contato.nome, telefone: c.contato.telefone },
    responsavel: c.responsavel,
    operacao: c.funil,
    etapa: c.estagio.nome,
    diasNaEtapa: diasDesde(c.estagioDesde, agora),
    ultimaInteracaoEm: c.contato.conversas[0]?.ultimaMensagemEm ?? null,
    ...extra,
  });

  const emFluxo = creds.filter((c) => c.situacaoExcecao === null && papelDoEstagio(c.estagio.nome) !== 'ATIVO');

  return {
    diasSemInteracao,
    aguardandoRetorno: retornos.map((r) => ({
      id: r.id,
      titulo: r.titulo,
      tipo: r.tipo,
      prazo: r.prazo,
      atrasado: r.prazo!.getTime() < agora,
      contato: r.contato,
      responsavel: r.responsavel,
    })),
    aguardandoDocumentacao: emFluxo.filter((c) => papelDoEstagio(c.estagio.nome) === 'PENDENCIA').map((c) => item(c)),
    precisamDeContato: emFluxo
      .filter((c) => c.contato.conversas.length === 0 || c.responsavel === null)
      .map((c) => item(c, { motivo: c.responsavel === null ? 'sem responsável' : 'nunca houve conversa' })),
    semInteracao: emFluxo
      .filter((c) => c.contato.conversas[0] && c.contato.conversas[0].ultimaMensagemEm < limite)
      .map((c) => item(c)),
    reativacao: creds
      .filter((c) => c.situacaoExcecao === 'INATIVADO')
      .map((c) => item(c, { motivo: c.motivoExcecao, inativadoEm: c.fechadoEm })),
  };
}
