import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';
import { organizacaoAtual, usuarioAtual } from '../../lib/tenant';
import { competencia, proximoMes } from './metas';
import { papelDoEstagio } from './esteira';
import {
  INDICADORES,
  fracaoDoMes,
  progressoOperacional,
  taxaDeConversao,
  type IndicadorChave,
} from './metasOperacionais';

/**
 * Metas operacionais: o que cada consultor realizou no mes.
 *
 * "Do consultor" = responsavel pelo credenciamento (parceiro) ou autor da
 * interacao. Tudo sai de dados que o CRM ja tem; nada usa venda ou faturamento.
 * Nenhuma tabela nova guarda o realizado: e calculado, como o resto dos paineis,
 * para nunca discordar da esteira.
 */

type Valores = Record<IndicadorChave, number | null>;
type Bruto = { valores: Valores; concluidos: number; trabalhados: number };

/**
 * Zeros de partida. A carteira parada e a posicao de HOJE: fora do mes corrente
 * ela nao descreve o mes pedido, entao fica desconhecida (nulo), nao zero.
 */
const vazio = (mesCorrente = true): Valores => ({
  NOVOS_PARCEIROS: 0,
  CREDENCIAMENTOS_CONCLUIDOS: 0,
  TAXA_CONVERSAO: null,
  PARCEIROS_ATIVADOS: 0,
  CONTATOS_REALIZADOS: 0,
  PARCEIROS_SEM_ACOMPANHAMENTO: mesCorrente ? 0 : null,
  REATIVACOES: 0,
});

/** Realizado de cada consultor no mes (so quem aparece em algum dado). */
async function realizadoDoMes(mes: Date, hoje: Date): Promise<Map<string, Bruto>> {
  const inicio = competencia(mes);
  const noMes = { gte: inicio, lt: proximoMes(inicio) };
  const fracao = fracaoDoMes(inicio, hoje);
  const mesCorrente = fracao > 0 && fracao < 1;

  const resultado = new Map<string, Bruto>();
  const de = (id: string) => {
    let b = resultado.get(id);
    if (!b) {
      b = { valores: vazio(mesCorrente), concluidos: 0, trabalhados: 0 };
      resultado.set(id, b);
    }
    return b;
  };
  const somar = (id: string | null | undefined, chave: IndicadorChave, n = 1) => {
    if (!id) return;
    const b = de(id);
    b.valores[chave] = (b.valores[chave] ?? 0) + n;
  };

  const creds = await prisma.credenciamento.findMany({ select: { id: true, responsavelId: true, criadoEm: true } });
  const donoDe = new Map(creds.map((c) => [c.id, c.responsavelId]));

  const historico = creds.length
    ? await prisma.credenciamentoHistorico.findMany({
        where: { criadoEm: noMes, credenciamentoId: { in: creds.map((c) => c.id) } },
        select: { credenciamentoId: true, paraEstagio: { select: { nome: true } } },
      })
    : [];

  const trabalhados = new Map<string, Set<string>>();
  const concluidos = new Map<string, Set<string>>();
  const marcar = (mapa: Map<string, Set<string>>, dono: string | null | undefined, credId: string) => {
    if (!dono) return;
    if (!mapa.has(dono)) mapa.set(dono, new Set());
    mapa.get(dono)!.add(credId);
  };

  for (const c of creds) {
    if (c.criadoEm >= noMes.gte && c.criadoEm < noMes.lt) {
      somar(c.responsavelId, 'NOVOS_PARCEIROS');
      marcar(trabalhados, c.responsavelId, c.id);
    }
  }
  for (const h of historico) {
    const dono = donoDe.get(h.credenciamentoId);
    marcar(trabalhados, dono, h.credenciamentoId);
    if (papelDoEstagio(h.paraEstagio.nome) === 'ATIVO') marcar(concluidos, dono, h.credenciamentoId);
  }
  for (const [dono, ids] of concluidos) {
    somar(dono, 'CREDENCIAMENTOS_CONCLUIDOS', ids.size);
    de(dono).concluidos = ids.size;
  }
  for (const [dono, ids] of trabalhados) de(dono).trabalhados = ids.size;

  // Ciclo de vida: ativacao (implantacao concluida), reativacao e carteira parada.
  const ciclos = await prisma.cicloParceiro.findMany({ select: { id: true, status: true, credenciamentoId: true } });
  const donoDoCiclo = new Map(ciclos.map((c) => [c.id, donoDe.get(c.credenciamentoId) ?? null]));
  if (mesCorrente) {
    for (const c of ciclos) {
      if (c.status === 'SEM_ACOMPANHAMENTO') somar(donoDoCiclo.get(c.id), 'PARCEIROS_SEM_ACOMPANHAMENTO');
    }
  }
  const eventos = ciclos.length
    ? await prisma.cicloParceiroHistorico.findMany({
        where: { criadoEm: noMes, cicloId: { in: ciclos.map((c) => c.id) } },
        select: { cicloId: true, paraStatus: true, regra: true },
      })
    : [];
  for (const e of eventos) {
    if (e.regra === 'IMPLANTACAO_CONCLUIDA') somar(donoDoCiclo.get(e.cicloId), 'PARCEIROS_ATIVADOS');
    if (e.paraStatus === 'REATIVADO') somar(donoDoCiclo.get(e.cicloId), 'REATIVACOES');
  }

  // Contatos realizados: interacao registrada (nao nota) ou tarefa concluida no mes.
  const interacoes = await prisma.activity.groupBy({
    by: ['criadoPorId'],
    where: {
      tipo: { not: 'NOTA' },
      contatoId: { not: null },
      criadoPorId: { not: null },
      OR: [{ prazo: null, criadoEm: noMes }, { concluidoEm: noMes }],
    },
    _count: { _all: true },
  });
  for (const i of interacoes) somar(i.criadoPorId, 'CONTATOS_REALIZADOS', i._count._all);

  for (const b of resultado.values()) {
    b.valores.TAXA_CONVERSAO = taxaDeConversao(b.concluidos, b.trabalhados);
  }
  return resultado;
}

type Alvos = Map<string, Map<IndicadorChave, number>>;

async function alvosDoMes(mes: Date, usuarioIds?: string[]): Promise<Alvos> {
  const metas = await prisma.metaOperacional.findMany({
    where: { mes: competencia(mes), ...(usuarioIds ? { usuarioId: { in: usuarioIds } } : {}) },
  });
  const mapa: Alvos = new Map();
  for (const m of metas) {
    if (!mapa.has(m.usuarioId)) mapa.set(m.usuarioId, new Map());
    mapa.get(m.usuarioId)!.set(m.indicador, m.alvo);
  }
  return mapa;
}

function itensDe(alvos: Map<IndicadorChave, number> | undefined, valores: Valores | undefined, mes: Date, hoje: Date) {
  const fracao = fracaoDoMes(competencia(mes), hoje);
  const base = valores ?? vazio(fracao > 0 && fracao < 1);
  return INDICADORES.map((ind) => ({
    indicador: ind.chave,
    ...progressoOperacional({
      alvo: alvos?.get(ind.chave) ?? null,
      realizado: base[ind.chave],
      sentido: ind.sentido,
      fracaoDoMes: fracao,
    }),
  }));
}

async function nomesDe(ids: string[], apenasComerciais = false) {
  const usuarios = await prisma.user.findMany({
    where: { id: { in: ids }, ...(apenasComerciais ? { perfil: 'COMERCIAL' } : {}) },
    select: { id: true, nome: true },
  });
  return new Map(usuarios.map((u) => [u.id, u.nome]));
}

/** Painel da gestao: todos os consultores com meta ou movimento no mes, mais o total da equipe. */
export async function painelOperacional(mes: Date, restritoA?: string[]) {
  const hoje = new Date();
  const [realizado, alvos] = await Promise.all([realizadoDoMes(mes, hoje), alvosDoMes(mes, restritoA)]);

  let ids = [...new Set([...alvos.keys(), ...realizado.keys()])];
  if (restritoA) ids = ids.filter((id) => restritoA.includes(id));
  // Meta operacional e do consultor (perfil Comercial): admin, gestor e suporte nao entram no painel.
  const nomes = await nomesDe(ids, true);
  ids = ids.filter((id) => nomes.has(id)).sort((a, b) => nomes.get(a)!.localeCompare(nomes.get(b)!, 'pt-BR'));

  const consultores = ids.map((id) => ({
    usuarioId: id,
    nome: nomes.get(id)!,
    itens: itensDe(alvos.get(id), realizado.get(id)?.valores, mes, hoje),
  }));

  // Equipe: soma dos consultores listados. A taxa e refeita dos totais, nao
  // a media das taxas: 1 de 2 e 30 de 60 nao pesam igual.
  const totalAlvos = new Map<IndicadorChave, number>();
  const totalValores = vazio(fracaoDoMes(competencia(mes), hoje) > 0 && fracaoDoMes(competencia(mes), hoje) < 1);
  let conc = 0;
  let trab = 0;
  for (const id of ids) {
    for (const [ind, alvo] of alvos.get(id) ?? []) totalAlvos.set(ind, (totalAlvos.get(ind) ?? 0) + alvo);
    const b = realizado.get(id);
    if (!b) continue;
    conc += b.concluidos;
    trab += b.trabalhados;
    for (const ind of INDICADORES) {
      const v = b.valores[ind.chave];
      if (v !== null && ind.chave !== 'TAXA_CONVERSAO') totalValores[ind.chave] = (totalValores[ind.chave] ?? 0) + v;
    }
  }
  totalValores.TAXA_CONVERSAO = taxaDeConversao(conc, trab);
  // A meta de taxa da equipe e a media das metas individuais, nao a soma.
  const alvosTaxa = ids.map((id) => alvos.get(id)?.get('TAXA_CONVERSAO')).filter((v): v is number => v !== undefined);
  if (alvosTaxa.length) totalAlvos.set('TAXA_CONVERSAO', Math.round(alvosTaxa.reduce((a, b) => a + b, 0) / alvosTaxa.length));
  else totalAlvos.delete('TAXA_CONVERSAO');

  return {
    mes: competencia(mes),
    indicadores: INDICADORES,
    consultores,
    equipe: { itens: itensDe(totalAlvos, totalValores, mes, hoje) },
  };
}

/** A propria meta e o proprio realizado. */
export async function minhasMetasOperacionais(mes: Date) {
  const eu = usuarioAtual();
  const hoje = new Date();
  const [realizado, alvos] = await Promise.all([realizadoDoMes(mes, hoje), alvosDoMes(mes, [eu.id])]);
  const nomes = await nomesDe([eu.id]);
  return {
    mes: competencia(mes),
    indicadores: INDICADORES,
    consultor: {
      usuarioId: eu.id,
      nome: nomes.get(eu.id) ?? '',
      itens: itensDe(alvos.get(eu.id), realizado.get(eu.id)?.valores, mes, hoje),
    },
  };
}

/** Alvos ja gravados de um consultor no mes, para o formulario abrir preenchido. */
export async function lerAlvos(usuarioId: string, mes: Date) {
  const alvos = await alvosDoMes(mes, [usuarioId]);
  const meus = alvos.get(usuarioId);
  return Object.fromEntries(INDICADORES.map((i) => [i.chave, meus?.get(i.chave) ?? null]));
}

/**
 * Grava os alvos do mes. Numero grava, `null` apaga (volta para "nao definida",
 * que nao e zero) e indicador omitido nao e tocado.
 */
export async function gravarAlvos(usuarioId: string, mes: Date, alvos: Partial<Record<IndicadorChave, number | null>>) {
  const usuario = await prisma.user.findFirst({ where: { id: usuarioId }, select: { id: true, perfil: true } });
  if (!usuario) throw notFound('Usuário não encontrado');
  if (usuario.perfil !== 'COMERCIAL') throw badRequest('Meta operacional só existe para usuários do perfil Comercial');

  const organizacaoId = organizacaoAtual();
  const competenciaDoMes = competencia(mes);
  const operacoes = Object.entries(alvos).map(([indicador, alvo]) =>
    alvo === null || alvo === undefined
      ? prisma.metaOperacional.deleteMany({
          where: { usuarioId, indicador: indicador as IndicadorChave, mes: competenciaDoMes },
        })
      : prisma.metaOperacional.upsert({
          where: {
            organizacaoId_usuarioId_indicador_mes: {
              organizacaoId,
              usuarioId,
              indicador: indicador as IndicadorChave,
              mes: competenciaDoMes,
            },
          },
          create: { organizacaoId, usuarioId, indicador: indicador as IndicadorChave, mes: competenciaDoMes, alvo },
          update: { alvo },
        }),
  );
  await prisma.$transaction(operacoes);
  return lerAlvos(usuarioId, mes);
}

/** O gestor enxerga a propria equipe direta (a mesma definicao de `metas.service`). */
export async function equipeDoGestor(gestorId: string): Promise<string[]> {
  const equipe = await prisma.user.findMany({ where: { gestorId }, select: { id: true } });
  return [gestorId, ...equipe.map((u) => u.id)];
}
