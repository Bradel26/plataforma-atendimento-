import { Prisma } from '@prisma/client';
import { notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { filtroDe, politicaContas, politicaContatos } from '../../lib/politicas';
import { apenasVisivel } from '../../lib/visibilidade';
import { codificarCursor, decodificarCursor } from '../../lib/paginacao';

/**
 * Ficha 360 do cliente.
 *
 * O pedido que originou este modulo: "entrar em um contato e ter a vida do
 * cliente, tudo filtrado ali". A vida do cliente esta espalhada em oito tabelas
 * (conversas, chamadas, atividades, protocolos, oportunidades, historico de
 * etapa, leads, pesquisas) e nenhuma delas sozinha responde "o que aconteceu
 * com este cliente".
 *
 * Duas decisoes de projeto que valem registro:
 *
 * 1. **O evento e a conversa, nao a mensagem.** Um cliente de dois anos tem
 *    milhares de mensagens; listadas uma a uma, a linha do tempo deixa de ser
 *    legivel e passa a ser um log. A mensagem individual continua acessivel na
 *    tela de atendimento, que e onde ela faz sentido.
 *
 * 2. **UNION ALL no banco, nao merge na aplicacao.** Buscar as oito fontes
 *    separadamente e ordenar em memoria obriga a trazer N registros de cada uma
 *    para descobrir os N mais recentes do conjunto — e quebra a paginacao por
 *    cursor, porque o corte de uma fonte nao e o corte do conjunto. Com UNION
 *    ALL o Postgres ordena e corta uma vez, e o cursor `(ocorrido_em, id)` vale
 *    para a linha do tempo inteira.
 */

export const TIPOS_EVENTO = [
  'CONVERSA',
  'CHAMADA',
  'ATIVIDADE',
  'PROTOCOLO',
  'OPORTUNIDADE',
  'ETAPA',
  'LEAD',
  'PESQUISA',
] as const;

export type TipoEvento = (typeof TIPOS_EVENTO)[number];

/** Uma linha do UNION. Campos nulos onde a fonte nao tem o dado. */
type LinhaEvento = {
  tipo: TipoEvento;
  id: string;
  ocorrido_em: Date;
  titulo: string;
  detalhe: string | null;
  canal: string | null;
  situacao: string | null;
  valor: Prisma.Decimal | null;
  /** Id da entidade para a tela abrir (conversa, protocolo, oportunidade...). */
  referencia: string | null;
  /** CONTATO quando o evento e do proprio contato, CONTA quando vem da empresa. */
  escopo: 'CONTATO' | 'CONTA';
  usuario_nome: string | null;
};

export type Evento = {
  tipo: TipoEvento;
  id: string;
  ocorridoEm: Date;
  titulo: string;
  detalhe: string | null;
  canal: string | null;
  situacao: string | null;
  valor: number | null;
  referencia: string | null;
  escopo: 'CONTATO' | 'CONTA';
  usuario: string | null;
};

const paraEvento = (l: LinhaEvento): Evento => ({
  tipo: l.tipo,
  id: l.id,
  ocorridoEm: l.ocorrido_em,
  titulo: l.titulo,
  detalhe: l.detalhe,
  canal: l.canal,
  situacao: l.situacao,
  valor: l.valor === null ? null : Number(l.valor),
  referencia: l.referencia,
  escopo: l.escopo,
  usuario: l.usuario_nome,
});

type Raiz = { contatoId: string | null; contaId: string | null };

export type FiltroTimeline = Raiz & {
  tipos?: TipoEvento[];
  desde?: Date;
  ate?: Date;
  cursor?: string;
  limite: number;
};

/**
 * Cada fonte projeta a mesma forma de linha. `sql` recebe os predicados de raiz
 * ja montados para nao repetir a regra de escopo oito vezes.
 */
function fontes(raiz: Raiz) {
  const { contatoId, contaId } = raiz;
  // Uuid inexistente: mantem o SQL valido quando so uma das raizes foi pedida,
  // sem precisar montar a lista de UNION condicionalmente.
  // Sem cast ::uuid: as chaves deste schema sao TEXT (Prisma String @id), e
  // comparar text com uuid no Postgres nao tem operador.
  const NENHUM = '00000000-0000-0000-0000-000000000000';
  const c = contatoId ?? NENHUM;
  const a = contaId ?? NENHUM;

  const escopo = (coluna: string) => Prisma.sql`
    CASE WHEN ${Prisma.raw(coluna)} = ${c} THEN 'CONTATO' ELSE 'CONTA' END`;

  return new Map<TipoEvento, Prisma.Sql>([
    [
      'CONVERSA',
      Prisma.sql`
        SELECT 'CONVERSA' AS tipo, cv.id, cv.criado_em AS ocorrido_em,
               COALESCE(cv.assunto, 'Atendimento') AS titulo,
               (SELECT m.conteudo FROM mensagens m WHERE m.conversa_id = cv.id
                 ORDER BY m.criado_em DESC LIMIT 1) AS detalhe,
               cv.canal::text AS canal, cv.status::text AS situacao,
               NULL::numeric AS valor, cv.id AS referencia,
               'CONTATO' AS escopo, u.nome AS usuario_nome
          FROM conversas cv
          LEFT JOIN usuarios u ON u.id = cv.agente_id
         WHERE cv.contato_id = ${c}`,
    ],
    [
      'CHAMADA',
      Prisma.sql`
        SELECT 'CHAMADA' AS tipo, ch.id, ch.iniciado_em AS ocorrido_em,
               CASE ch.direcao WHEN 'ENTRANTE' THEN 'Chamada recebida'
                               ELSE 'Chamada realizada' END AS titulo,
               ch.numero_destino AS detalhe,
               'VOZ' AS canal, ch.status::text AS situacao,
               NULL::numeric AS valor, ch.id AS referencia,
               'CONTATO' AS escopo, u.nome AS usuario_nome
          FROM chamadas ch
          LEFT JOIN usuarios u ON u.id = ch.agente_id
         WHERE ch.contato_id = ${c}`,
    ],
    [
      'ATIVIDADE',
      Prisma.sql`
        SELECT 'ATIVIDADE' AS tipo, at.id,
               COALESCE(at.concluido_em, at.prazo, at.criado_em) AS ocorrido_em,
               at.titulo, at.descricao AS detalhe,
               at.tipo::text AS canal,
               CASE WHEN at.concluido_em IS NOT NULL THEN 'CONCLUIDA'
                    WHEN at.prazo IS NULL THEN 'REGISTRO'
                    WHEN at.prazo < now() THEN 'ATRASADA'
                    ELSE 'PENDENTE' END AS situacao,
               NULL::numeric AS valor, at.id AS referencia,
               ${escopo('at.contato_id')} AS escopo, u.nome AS usuario_nome
          FROM atividades at
          LEFT JOIN usuarios u ON u.id = at.responsavel_id
         WHERE at.contato_id = ${c} OR at.conta_id = ${a}`,
    ],
    [
      'PROTOCOLO',
      Prisma.sql`
        SELECT 'PROTOCOLO' AS tipo, pr.id, pr.criado_em AS ocorrido_em,
               '#' || pr.numero || ' ' || pr.titulo AS titulo,
               pr.descricao AS detalhe,
               pr.prioridade::text AS canal, pr.status::text AS situacao,
               NULL::numeric AS valor, pr.id AS referencia,
               ${escopo('pr.contato_id')} AS escopo, u.nome AS usuario_nome
          FROM protocolos pr
          LEFT JOIN usuarios u ON u.id = pr.responsavel_id
         WHERE pr.contato_id = ${c} OR pr.conta_id = ${a}`,
    ],
    [
      'OPORTUNIDADE',
      Prisma.sql`
        SELECT 'OPORTUNIDADE' AS tipo, op.id, op.criado_em AS ocorrido_em,
               op.titulo, f.nome AS detalhe,
               NULL AS canal, op.status::text AS situacao,
               op.valor, op.id AS referencia,
               'CONTA' AS escopo, u.nome AS usuario_nome
          FROM oportunidades op
          JOIN funis f ON f.id = op.funil_id
          LEFT JOIN usuarios u ON u.id = op.responsavel_id
         WHERE op.conta_id = ${a}`,
    ],
    [
      'ETAPA',
      Prisma.sql`
        SELECT 'ETAPA' AS tipo, h.id, h.criado_em AS ocorrido_em,
               op.titulo, COALESCE(de.nome, 'inicio') || ' -> ' || pa.nome AS detalhe,
               NULL AS canal,
               CASE WHEN h.segundos_no_estagio IS NULL THEN NULL
                    ELSE (h.segundos_no_estagio / 86400)::text || 'd' END AS situacao,
               NULL::numeric AS valor, op.id AS referencia,
               'CONTA' AS escopo, u.nome AS usuario_nome
          FROM oportunidade_historico_estagio h
          JOIN oportunidades op ON op.id = h.oportunidade_id
          JOIN funil_estagios pa ON pa.id = h.para_estagio_id
          LEFT JOIN funil_estagios de ON de.id = h.de_estagio_id
          LEFT JOIN usuarios u ON u.id = h.usuario_id
         WHERE op.conta_id = ${a}`,
    ],
    [
      'LEAD',
      Prisma.sql`
        SELECT 'LEAD' AS tipo, ld.id, ld.criado_em AS ocorrido_em,
               'Lead ' || ld.tipo::text AS titulo, ld.observacoes AS detalhe,
               ld.canal_origem::text AS canal, ld.fase::text AS situacao,
               ld.valor_estimado AS valor, ld.id AS referencia,
               ${escopo('ld.contato_id')} AS escopo, u.nome AS usuario_nome
          FROM leads ld
          LEFT JOIN usuarios u ON u.id = ld.responsavel_id
         WHERE ld.contato_id = ${c} OR ld.conta_id = ${a}`,
    ],
    [
      'PESQUISA',
      Prisma.sql`
        SELECT 'PESQUISA' AS tipo, pe.id, pe.respondido_em AS ocorrido_em,
               pe.tipo::text AS titulo, pe.comentario AS detalhe,
               cv.canal::text AS canal, pe.nota::text AS situacao,
               NULL::numeric AS valor, pe.conversa_id AS referencia,
               'CONTATO' AS escopo, NULL AS usuario_nome
          FROM pesquisas pe
          JOIN conversas cv ON cv.id = pe.conversa_id
         WHERE cv.contato_id = ${c} AND pe.respondido_em IS NOT NULL`,
    ],
  ]);
}

export async function timeline(filtro: FiltroTimeline) {
  const { tipos, desde, ate, limite } = filtro;
  const cursor = decodificarCursor(filtro.cursor);

  const mapa = fontes(filtro);
  const escolhidos = tipos?.length ? tipos.filter((t) => mapa.has(t)) : TIPOS_EVENTO;
  if (escolhidos.length === 0) return { eventos: [] as Evento[], proximoCursor: null };

  const uniao = Prisma.join(
    escolhidos.map((t) => mapa.get(t) as Prisma.Sql),
    ' UNION ALL ',
  );

  // Comparacao de tupla: e o mesmo desempate por id da paginacao por cursor do
  // resto da API, escrito em SQL porque aqui a ordenacao e do conjunto.
  const filtros = [
    cursor ? Prisma.sql`(e.ocorrido_em, e.id) < (${cursor.valor}, ${cursor.id})` : null,
    desde ? Prisma.sql`e.ocorrido_em >= ${desde}` : null,
    ate ? Prisma.sql`e.ocorrido_em <= ${ate}` : null,
  ].filter((f): f is Prisma.Sql => f !== null);

  const onde = filtros.length ? Prisma.sql`WHERE ${Prisma.join(filtros, ' AND ')}` : Prisma.empty;

  const linhas = await prisma.$queryRaw<LinhaEvento[]>(Prisma.sql`
    SELECT * FROM (${uniao}) AS e
    ${onde}
    ORDER BY e.ocorrido_em DESC, e.id DESC
    LIMIT ${limite + 1}`);

  const temMais = linhas.length > limite;
  const itens = temMais ? linhas.slice(0, limite) : linhas;
  const ultimo = itens.at(-1);

  return {
    eventos: itens.map(paraEvento),
    proximoCursor:
      temMais && ultimo ? codificarCursor({ valor: ultimo.ocorrido_em, id: ultimo.id }) : null,
  };
}

/** Contadores do cabecalho da ficha. Uma consulta por metrica, todas em paralelo. */
async function resumo(raiz: Raiz) {
  const { contatoId, contaId } = raiz;
  const doContato = contatoId ? { contatoId } : undefined;
  const daConta = contaId ? { contaId } : undefined;

  const [conversas, chamadas, protocolosAbertos, oportunidadesAbertas, ganho, atividadesAbertas] =
    await Promise.all([
      contatoId ? prisma.conversation.count({ where: { contatoId } }) : 0,
      contatoId ? prisma.call.count({ where: { contatoId } }) : 0,
      prisma.ticket.count({
        where: { status: { in: ['ABERTO', 'EM_ANDAMENTO'] }, OR: [doContato, daConta].filter(Boolean) as object[] },
      }),
      contaId ? prisma.opportunity.count({ where: { contaId, status: 'ABERTA' } }) : 0,
      contaId
        ? prisma.opportunity.aggregate({
            where: { contaId, status: 'GANHA' },
            _sum: { valor: true },
            _count: true,
          })
        : null,
      prisma.activity.count({
        where: {
          concluidoEm: null,
          prazo: { not: null },
          OR: [doContato, daConta].filter(Boolean) as object[],
        },
      }),
    ]);

  return {
    conversas,
    chamadas,
    protocolosAbertos,
    oportunidadesAbertas,
    oportunidadesGanhas: ganho?._count ?? 0,
    valorGanho: Number(ganho?._sum.valor ?? 0),
    atividadesAbertas,
  };
}

export async function fichaContato(contatoId: string) {
  // A ficha e a porta de entrada do registro: se ele nao esta no escopo de quem
  // pediu, nem os indicadores devem ser calculados. 404, nao 403.
  const contato = await prisma.contact.findFirst({
    where: apenasVisivel(contatoId, await filtroDe(politicaContatos)),
    include: { conta: true },
  });
  if (!contato) throw notFound('Contato nao encontrado');

  const raiz: Raiz = { contatoId, contaId: contato.contaId };
  const [indicadores, atividades] = await Promise.all([
    resumo(raiz),
    prisma.activity.findMany({
      where: { concluidoEm: null, prazo: { not: null }, contatoId },
      orderBy: { prazo: 'asc' },
      take: 20,
      include: { responsavel: { select: { id: true, nome: true } } },
    }),
  ]);

  return { contato, indicadores, atividadesAbertas: atividades };
}

export async function fichaConta(contaId: string) {
  const conta = await prisma.account.findFirst({
    where: apenasVisivel(contaId, await filtroDe(politicaContas)),
    include: {
      contatos: {
        where: await filtroDe(politicaContatos),
        select: { id: true, nome: true, telefone: true, email: true },
        orderBy: { nome: 'asc' },
      },
    },
  });
  if (!conta) throw notFound('Conta nao encontrada');

  const raiz: Raiz = { contatoId: null, contaId };
  const [indicadores, atividades] = await Promise.all([
    resumo(raiz),
    prisma.activity.findMany({
      where: { concluidoEm: null, prazo: { not: null }, contaId },
      orderBy: { prazo: 'asc' },
      take: 20,
      include: { responsavel: { select: { id: true, nome: true } } },
    }),
  ]);

  return { conta, indicadores, atividadesAbertas: atividades };
}
