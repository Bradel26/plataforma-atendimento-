import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';
import { organizacaoAtual, usuarioAtual } from '../../lib/tenant';
import { competencia, mesesEntre, montarProgresso, progressoDaMeta, proximoMes } from './metas';

/**
 * Metas mensais: consultas (item 4.1 do plano em ANALISE-CRM.md).
 *
 * A aritmetica toda mora em `metas.ts` e e testada sem banco. Aqui ficam as duas
 * perguntas que precisam do Postgres: quais metas existem no mes, e quanto cada
 * um ganhou nele.
 */

/**
 * O que conta como realizado: oportunidade **GANHA**, pela data de fechamento.
 *
 * Nao e o valor em aberto no funil, e a distincao e o ponto: previsao ponderada
 * ja existe no kanban e serve para planejar. Meta se mede com venda fechada — um
 * progresso que subisse com proposta em aberto mostraria meta batida em mes que
 * fechou sem faturar nada.
 *
 * A data e `fechadoEm`, nao `criadoEm`: a venda pertence ao mes em que fechou,
 * mesmo que a negociacao tenha comecado em marco.
 */
async function realizadoPorResponsavel(mes: Date): Promise<Map<string, number>> {
  const inicio = competencia(mes);
  const grupos = await prisma.opportunity.groupBy({
    by: ['responsavelId'],
    where: { status: 'GANHA', fechadoEm: { gte: inicio, lt: proximoMes(inicio) } },
    _sum: { valor: true },
  });

  const mapa = new Map<string, number>();
  for (const g of grupos) {
    // Venda sem responsavel nao entra em meta de ninguem, e nao pode ser
    // distribuida por conta propria: atribuir a alguem seria inventar autoria.
    if (!g.responsavelId) continue;
    mapa.set(g.responsavelId, Number(g._sum.valor ?? 0));
  }
  return mapa;
}

/**
 * A equipe de um gestor, na **mesma** definicao do resto da plataforma.
 *
 * `equipeIds` em `lib/visibilidade.ts` e o gestor mais quem aponta para ele em
 * `gestorId`. Repetir aqui uma definicao propria faria a meta medir um grupo
 * diferente do que as telas mostram — e ninguem descobriria pela tela, so pela
 * conta que nao fecha.
 */
async function equipeDe(gestorId: string): Promise<string[]> {
  const equipe = await prisma.user.findMany({ where: { gestorId }, select: { id: true } });
  return [gestorId, ...equipe.map((u) => u.id)];
}

/** Metas do mes, com progresso. Uma consulta de metas e uma de realizado. */
export async function listarMetas(mes: Date) {
  const competenciaDoMes = competencia(mes);
  const hoje = new Date();

  const [metas, realizados] = await Promise.all([
    prisma.meta.findMany({
      where: { mes: competenciaDoMes },
      include: { usuario: { select: { id: true, nome: true, perfil: true } } },
      orderBy: [{ escopo: 'asc' }, { usuario: { nome: 'asc' } }],
    }),
    realizadoPorResponsavel(competenciaDoMes),
  ]);

  const individuais = metas.filter((m) => m.escopo === 'INDIVIDUAL');
  const deEquipe = metas.filter((m) => m.escopo === 'EQUIPE');

  const { linhas, semMetaDefinida } = montarProgresso(
    individuais.map((m) => ({
      usuarioId: m.usuarioId,
      nome: m.usuario.nome,
      escopo: 'INDIVIDUAL' as const,
      valor: Number(m.valor),
    })),
    realizados,
    competenciaDoMes,
    hoje,
  );

  /*
   * A meta de equipe soma o realizado da equipe inteira — inclusive o do proprio
   * gestor, porque `equipeIds` o inclui. Nao ha contagem dupla dentro da linha de
   * equipe; a contagem dupla apareceria se alguem somasse a linha de equipe com
   * as individuais, e por isso as duas ficam em listas separadas na resposta.
   */
  const equipes = await Promise.all(
    deEquipe.map(async (m) => {
      const ids = await equipeDe(m.usuarioId);
      const realizado = ids.reduce((acc, id) => acc + (realizados.get(id) ?? 0), 0);
      return {
        usuarioId: m.usuarioId,
        nome: m.usuario.nome,
        escopo: 'EQUIPE' as const,
        integrantes: ids.length,
        ...progressoDaMeta({ meta: Number(m.valor), realizado, mes: competenciaDoMes, hoje }),
      };
    }),
  );

  const nomes = await prisma.user.findMany({
    where: { id: { in: semMetaDefinida } },
    select: { id: true, nome: true },
  });

  return {
    mes: competenciaDoMes,
    individuais: linhas,
    equipes,
    /*
     * Quem vendeu no mes e nao tem meta individual aparece aqui, com nome.
     *
     * Esconder faria o total da tela discordar do funil, e a primeira conclusao
     * de quem olhasse seria que a plataforma perdeu venda.
     */
    semMeta: nomes.map((u) => ({
      usuarioId: u.id,
      nome: u.nome,
      realizado: realizados.get(u.id) ?? 0,
    })),
  };
}

/** A meta do proprio usuario no mes — o que a tela dele precisa. */
export async function minhaMeta(mes: Date) {
  const { id: usuarioId } = usuarioAtual();
  const competenciaDoMes = competencia(mes);

  const [meta, realizados] = await Promise.all([
    prisma.meta.findFirst({ where: { usuarioId, escopo: 'INDIVIDUAL', mes: competenciaDoMes } }),
    realizadoPorResponsavel(competenciaDoMes),
  ]);

  return {
    mes: competenciaDoMes,
    definida: meta !== null,
    ...progressoDaMeta({
      meta: meta ? Number(meta.valor) : 0,
      realizado: realizados.get(usuarioId) ?? 0,
      mes: competenciaDoMes,
      hoje: new Date(),
    }),
  };
}

/**
 * Grava a rampa: uma meta por mes do intervalo, com o valor de cada um.
 *
 * `valores` traz o valor por mes, e meses omitidos **nao** sao tocados. Preencher
 * o que faltou com um valor padrao gravaria meta que ninguem definiu — e meta
 * inventada e pior que meta ausente, porque o painel passa a acusar quem nao
 * tinha compromisso nenhum.
 *
 * `upsert` por (organizacao, usuario, escopo, mes), que e o indice unico: sem
 * ele, dois cliques no botao deixariam duas metas do mesmo mes e o progresso
 * contaria contra a errada.
 */
export async function gravarRampa(input: {
  usuarioId: string;
  escopo: 'INDIVIDUAL' | 'EQUIPE';
  valores: Array<{ mes: Date; valor: number }>;
}) {
  const usuario = await prisma.user.findFirst({
    where: { id: input.usuarioId },
    select: { id: true, perfil: true },
  });
  if (!usuario) throw notFound('Usuario nao encontrado');

  /*
   * Meta de equipe so para GESTOR.
   *
   * Para os outros perfis "equipe" nao tem definicao: `gestorId` nao aponta para
   * eles, entao a equipe seria so a propria pessoa e a meta de equipe viraria uma
   * copia silenciosa da individual — dois numeros iguais que quem lesse acharia
   * que medem coisas diferentes.
   */
  if (input.escopo === 'EQUIPE' && usuario.perfil !== 'GESTOR') {
    throw badRequest('Meta de equipe existe para o perfil Gestor, que e quem tem equipe direta');
  }

  const organizacaoId = organizacaoAtual();
  const gravadas = await prisma.$transaction(
    input.valores.map(({ mes, valor }) =>
      prisma.meta.upsert({
        where: {
          organizacaoId_usuarioId_escopo_mes: {
            organizacaoId,
            usuarioId: input.usuarioId,
            escopo: input.escopo,
            mes: competencia(mes),
          },
        },
        create: { organizacaoId, usuarioId: input.usuarioId, escopo: input.escopo, mes: competencia(mes), valor },
        update: { valor },
      }),
    ),
  );

  return gravadas.map((m) => ({ mes: m.mes, valor: Number(m.valor), escopo: m.escopo }));
}

/** A rampa que existe hoje para uma pessoa, num intervalo de meses. */
export async function lerRampa(usuarioId: string, de: Date, ate: Date, escopo: 'INDIVIDUAL' | 'EQUIPE') {
  const meses = mesesEntre(de, ate);
  if (meses.length === 0) throw badRequest('O mes final nao pode ser anterior ao inicial');

  const metas = await prisma.meta.findMany({
    where: { usuarioId, escopo, mes: { gte: meses[0], lte: meses[meses.length - 1] } },
    orderBy: { mes: 'asc' },
  });
  const porMes = new Map(metas.map((m) => [m.mes.toISOString().slice(0, 10), Number(m.valor)]));

  /*
   * Devolve **todos** os meses do intervalo, com nulo onde nao ha meta.
   *
   * Nulo e diferente de zero aqui tambem: zero e "meta de nao vender nada" e o
   * formulario gravaria isso; nulo e "ninguem definiu" e o formulario deixa em
   * branco. Devolver so os meses que existem obrigaria a tela a adivinhar quais
   * faltam.
   */
  return meses.map((mes) => ({
    mes,
    valor: porMes.get(mes.toISOString().slice(0, 10)) ?? null,
  }));
}

/** Apaga a meta de um mes — voltar para "nao definida" tem de ser possivel. */
export async function apagarMeta(usuarioId: string, escopo: 'INDIVIDUAL' | 'EQUIPE', mes: Date) {
  const alvo = await prisma.meta.findFirst({
    where: { usuarioId, escopo, mes: competencia(mes) },
    select: { id: true },
  });
  if (!alvo) throw notFound('Meta nao encontrada');
  await prisma.meta.delete({ where: { id: alvo.id } });
}
