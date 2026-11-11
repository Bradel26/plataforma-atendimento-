import { Prisma, type Operacao } from '@prisma/client';
import { notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { urlAssinada } from '../../lib/storage';
import { filtroDe, politicaContas, politicaContatos, politicaCredenciamentos } from '../../lib/politicas';
import { apenasVisivel } from '../../lib/visibilidade';
import { codificarCursor, decodificarCursor } from '../../lib/paginacao';
import { filtroOperacoesPermitidas } from '../esteira/acesso';

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
  'CREDENCIAMENTO',
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
  gravacao_url: string | null;
  /** So nos eventos da esteira: TIM ou STARLINK. */
  operacao: Operacao | null;
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
  gravacaoUrl: string | null;
  /** Operacao da esteira (eventos CREDENCIAMENTO); nulo nos demais. */
  operacao: Operacao | null;
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
  gravacaoUrl: l.gravacao_url ? urlAssinada(l.gravacao_url) : null,
  operacao: l.operacao,
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
 * Vinculos da esteira que entram na linha do tempo: do contato ou da empresa,
 * nao arquivados, na carteira e nas operacoes que o usuario enxerga (spec 4.9).
 * O SQL cru nao passa pelos filtros do Prisma, entao a lista de ids vai pronta.
 */
async function credenciamentosVisiveis(raiz: Raiz): Promise<string[]> {
  const doVinculo: Prisma.CredenciamentoWhereInput[] = [
    ...(raiz.contatoId ? [{ contatoId: raiz.contatoId }] : []),
    ...(raiz.contaId ? [{ contaId: raiz.contaId }] : []),
  ];
  if (doVinculo.length === 0) return [];
  const linhas = await prisma.credenciamento.findMany({
    where: {
      AND: [
        await filtroDe(politicaCredenciamentos),
        await filtroOperacoesPermitidas(),
        { arquivadoEm: null },
        { OR: doVinculo },
      ],
    },
    select: { id: true },
  });
  return linhas.map((l) => l.id);
}

/**
 * Cada fonte projeta a mesma forma de linha. `sql` recebe os predicados de raiz
 * ja montados para nao repetir a regra de escopo oito vezes.
 */
function fontes(raiz: Raiz, credenciamentos: string[]) {
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
               'CONTATO' AS escopo, u.nome AS usuario_nome, NULL::text AS gravacao_url, NULL::text AS operacao
          FROM conversas cv
          LEFT JOIN usuarios u ON u.id = cv.agente_id
         WHERE cv.contato_id = ${c}`,
    ],
    [
      'CHAMADA',
      Prisma.sql`
        SELECT 'CHAMADA' AS tipo, ch.id, ch.iniciado_em AS ocorrido_em,
               CASE ch.direcao
                 WHEN 'ENTRANTE' THEN CASE WHEN ch.status::text IN ('NAO_ATENDIDA', 'OCUPADA', 'CANCELADA', 'FALHOU')
                                           THEN 'Chamada perdida' ELSE 'Chamada recebida' END
                 ELSE 'Chamada realizada' END AS titulo,
               concat_ws(E'\n',
                 CASE ch.direcao WHEN 'ENTRANTE' THEN ch.numero_origem
                                 ELSE ch.numero_destino END,
                 CASE WHEN ch.duracao IS NOT NULL THEN 'Duração: ' || ch.duracao || 's' END,
                 -- Resumo, não a transcrição bruta: áudio curto ou mudo gera texto inventado pelo Whisper.
                 -- Sem análise confiável ("Não foi possível..." ou confiança BAIXA) o resumo não vai para a ficha.
                 CASE WHEN ch.resumo IS NOT NULL AND ch.resumo <> '' AND ch.resumo NOT LIKE 'Não foi possível%' AND COALESCE(ch.analisado_por, '') NOT LIKE '%confiança estimada BAIXA%'
                      THEN 'Resumo: ' || ch.resumo END,
                 CASE WHEN ch.sentimento IS NOT NULL AND ch.resumo IS NOT NULL AND ch.resumo <> '' AND ch.resumo NOT LIKE 'Não foi possível%' AND COALESCE(ch.analisado_por, '') NOT LIKE '%confiança estimada BAIXA%'
                      THEN 'Sentimento: ' || initcap(lower(ch.sentimento::text)) END,
                 CASE WHEN ch.resumo IS NOT NULL AND ch.resumo <> '' AND ch.analisado_por LIKE '%confiança estimada BAIXA%'
                      THEN 'Resumo indisponível: a transcrição teve baixa confiança. Ouça a gravação.' END,
                 (SELECT 'Próximas ações: ' || string_agg(a.texto, '; ' ORDER BY a.ordem)
                    FROM acoes_sugeridas_da_chamada a
                   WHERE a.chamada_id = ch.id AND a.descartado_em IS NULL)) AS detalhe,
               'VOZ' AS canal, ch.status::text AS situacao,
               NULL::numeric AS valor, ch.id AS referencia,
               'CONTATO' AS escopo, u.nome AS usuario_nome, ch.gravacao_url, NULL::text AS operacao
          FROM chamadas ch
          LEFT JOIN usuarios u ON u.id = ch.agente_id
         WHERE ch.contato_id = ${c}`,
    ],
    [
      'ATIVIDADE',
      Prisma.sql`
        SELECT 'ATIVIDADE' AS tipo, at.id,
               COALESCE(at.ocorrido_em, at.concluido_em, at.prazo, at.criado_em) AS ocorrido_em,
               at.titulo,
               concat_ws(E'\\n', NULLIF(at.descricao, ''),
                 CASE WHEN at.resultado IS NOT NULL THEN 'Resultado: ' || at.resultado END,
                 CASE WHEN at.justificativa_conclusao IS NOT NULL THEN 'Justificativa de conclusão: ' || at.justificativa_conclusao END,
                 CASE WHEN at.resultado_conclusao IS NOT NULL THEN 'Resultado da conclusão: ' || at.resultado_conclusao END,
                 CASE WHEN tarefa.id IS NOT NULL THEN 'Próxima ação: ' || tarefa.titulo || ' · ' ||
                   to_char(tarefa.prazo AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || ' · ' ||
                   CASE WHEN tarefa.concluido_em IS NOT NULL THEN 'Concluída'
                        WHEN tarefa.cancelado_em IS NOT NULL THEN 'Cancelada'
                        WHEN tarefa.prazo < now() THEN 'Atrasada'
                        ELSE 'Pendente' END END) AS detalhe,
               CASE at.canal_manual::text WHEN 'TELEFONE' THEN 'Ligação manual'
                    WHEN 'VISITA' THEN 'Visita presencial' WHEN 'OUTRO' THEN 'Outro canal manual'
                    ELSE at.tipo::text END AS canal,
               CASE WHEN at.canal_manual IS NOT NULL THEN 'REGISTRO MANUAL'
                    WHEN at.concluido_em IS NOT NULL THEN 'CONCLUIDA'
                    WHEN at.prazo IS NULL THEN 'REGISTRO'
                    WHEN at.prazo < now() THEN 'ATRASADA'
                    ELSE 'PENDENTE' END AS situacao,
               NULL::numeric AS valor, at.id AS referencia,
               ${escopo('at.contato_id')} AS escopo, COALESCE(uc.nome, u.nome) AS usuario_nome, NULL::text AS gravacao_url, NULL::text AS operacao
          FROM atividades at
          LEFT JOIN usuarios u ON u.id = at.responsavel_id
          LEFT JOIN usuarios uc ON uc.id = at.concluido_por_id
          LEFT JOIN atividades tarefa ON tarefa.registro_pai_id = at.id
         WHERE (at.contato_id = ${c} OR at.conta_id = ${a}) AND at.registro_pai_id IS NULL`,
    ],
    [
      'PROTOCOLO',
      Prisma.sql`
        SELECT 'PROTOCOLO' AS tipo, pr.id, pr.criado_em AS ocorrido_em,
               '#' || pr.numero || ' ' || pr.titulo AS titulo,
               pr.descricao AS detalhe,
               pr.prioridade::text AS canal, pr.status::text AS situacao,
               NULL::numeric AS valor, pr.id AS referencia,
               ${escopo('pr.contato_id')} AS escopo, u.nome AS usuario_nome, NULL::text AS gravacao_url, NULL::text AS operacao
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
               'CONTA' AS escopo, u.nome AS usuario_nome, NULL::text AS gravacao_url, NULL::text AS operacao
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
               'CONTA' AS escopo, u.nome AS usuario_nome, NULL::text AS gravacao_url, NULL::text AS operacao
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
               ${escopo('ld.contato_id')} AS escopo, u.nome AS usuario_nome, NULL::text AS gravacao_url, NULL::text AS operacao
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
               'CONTATO' AS escopo, NULL AS usuario_nome, NULL::text AS gravacao_url, NULL::text AS operacao
          FROM pesquisas pe
          JOIN conversas cv ON cv.id = pe.conversa_id
         WHERE cv.contato_id = ${c} AND pe.respondido_em IS NOT NULL`,
    ],
    [
      // Ciclo do parceiro: cada passagem de etapa da Esteira de Credenciamento,
      // rotulada pela operacao (spec 4.8: nunca misturada sem rotulo). So os
      // vinculos que o usuario enxerga (`credenciamentosVisiveis`).
      'CREDENCIAMENTO',
      Prisma.sql`
        SELECT 'CREDENCIAMENTO' AS tipo, h.id, h.criado_em AS ocorrido_em,
               f.nome || ': ' || pa.nome AS titulo,
               CASE WHEN de.nome IS NULL THEN 'Entrou na esteira'
                    ELSE 'Saiu de ' || de.nome END AS detalhe,
               NULL AS canal,
               CASE WHEN h.segundos_no_estagio IS NULL THEN NULL
                    ELSE (h.segundos_no_estagio / 86400)::text || 'd' END AS situacao,
               NULL::numeric AS valor, cr.id AS referencia,
               ${escopo('cr.contato_id')} AS escopo, u.nome AS usuario_nome, NULL::text AS gravacao_url,
               h.operacao::text AS operacao
          FROM credenciamento_historico h
          JOIN credenciamentos cr ON cr.id = h.credenciamento_id
          JOIN funis f ON f.id = cr.funil_id
          JOIN funil_estagios pa ON pa.id = h.para_estagio_id
          LEFT JOIN funil_estagios de ON de.id = h.de_estagio_id
          LEFT JOIN usuarios u ON u.id = h.usuario_id
         WHERE ${credenciamentos.length ? Prisma.sql`cr.id IN (${Prisma.join(credenciamentos)})` : Prisma.sql`FALSE`}`,
    ],
  ]);
}

export async function timeline(filtro: FiltroTimeline) {
  const { tipos, desde, ate, limite } = filtro;
  const cursor = decodificarCursor(filtro.cursor);

  const pedidos = tipos?.length ? tipos : TIPOS_EVENTO;
  const credenciamentos = pedidos.includes('CREDENCIAMENTO') ? await credenciamentosVisiveis(filtro) : [];
  const mapa = fontes(filtro, credenciamentos);
  const escolhidos = pedidos.filter((t) => mapa.has(t));
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
    where: { AND: [apenasVisivel(contatoId, await filtroDe(politicaContatos)), { excluidoEm: null }] },
    include: { conta: true, operacoes: { select: { operacao: true } } },
  });
  if (!contato) throw notFound('Contato não encontrado');

  const raiz: Raiz = { contatoId, contaId: contato.contaId };
  // Só análise confiável vai para a ficha: sem "Não foi possível..." e sem confiança BAIXA (texto inventado pelo Whisper em áudio ruim).
  const analiseConfiavel: Prisma.CallWhereInput = {
    resumo: { not: null },
    AND: [
      { resumo: { not: '' } },
      { NOT: { resumo: { startsWith: 'Não foi possível' } } },
      { NOT: { analisadoPor: { contains: 'confiança estimada BAIXA' } } },
    ],
  };
  const [indicadores, atividades, solicitacoesExclusao, ultimaLigacao, acoesSugeridas, ultimaConversa, ultimaChamada] = await Promise.all([
    resumo(raiz),
    prisma.activity.findMany({
      where: { concluidoEm: null, prazo: { not: null }, contatoId },
      orderBy: { prazo: 'asc' },
      take: 20,
      include: { responsavel: { select: { id: true, nome: true } } },
    }),
    prisma.contactDeletionRequest.findMany({
      where: { contatoId }, orderBy: { solicitadoEm: 'desc' }, take: 20,
      include: { solicitadoPor: { select: { id: true, nome: true } }, aprovadoPor: { select: { id: true, nome: true } } },
    }),
    prisma.call.findFirst({
      where: { contatoId, ...analiseConfiavel },
      orderBy: { iniciadoEm: 'desc' },
      select: { id: true, iniciadoEm: true, direcao: true, duracao: true, resumo: true, sentimento: true },
    }),
    // Pendências ditas nas ligações que ainda não viraram tarefa nem foram descartadas.
    prisma.callSuggestedAction.findMany({
      where: { descartadoEm: null, atividadeId: null, chamada: { contatoId, ...analiseConfiavel } },
      orderBy: [{ criadoEm: 'desc' }, { ordem: 'asc' }],
      take: 5,
      select: { id: true, texto: true, chamadaId: true, criadoEm: true },
    }),
    prisma.conversation.findFirst({ where: { contatoId }, orderBy: { ultimaMensagemEm: 'desc' }, select: { ultimaMensagemEm: true, canal: true } }),
    prisma.call.findFirst({ where: { contatoId }, orderBy: { iniciadoEm: 'desc' }, select: { iniciadoEm: true, direcao: true, status: true } }),
  ]);

  // Último contato com o cliente, qualquer canal. Sem interpretar nada: só a data e por onde foi.
  const candidatos = [
    ultimaConversa ? { em: ultimaConversa.ultimaMensagemEm, canal: ultimaConversa.canal as string } : null,
    ultimaChamada ? { em: ultimaChamada.iniciadoEm, canal: 'VOZ' } : null,
  ].filter((c): c is { em: Date; canal: string } => c !== null);
  const ultimoContato = candidatos.length ? candidatos.reduce((a, b) => (b.em > a.em ? b : a)) : null;
  // Cliente ligou e ninguém atendeu, e desde então não houve nova ligação: pede retorno.
  const STATUS_PERDIDA = ['NAO_ATENDIDA', 'OCUPADA', 'CANCELADA', 'FALHOU'];
  const ligacaoPerdidaSemRetorno =
    ultimaChamada && ultimaChamada.direcao === 'ENTRANTE' && STATUS_PERDIDA.includes(ultimaChamada.status) ? ultimaChamada.iniciadoEm : null;

  const temPreviaWhatsapp = contato.telefone
    ? (await prisma.chatPreview.count({ where: { numero: contato.telefone } })) > 0
    : false;

  return { contato, indicadores, atividadesAbertas: atividades, temPreviaWhatsapp, solicitacoesExclusao, ultimaLigacao, acoesSugeridas, ultimoContato, ligacaoPerdidaSemRetorno };
}

export async function fichaConta(contaId: string) {
  const conta = await prisma.account.findFirst({
    where: apenasVisivel(contaId, await filtroDe(politicaContas)),
    include: {
      operacoes: { select: { operacao: true } },
      contatos: {
        where: { AND: [await filtroDe(politicaContatos), { excluidoEm: null }] },
        select: { id: true, nome: true, telefone: true, email: true, segmentoParceiro: true },
        orderBy: { nome: 'asc' },
      },
    },
  });
  if (!conta) throw notFound('Conta não encontrada');

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
