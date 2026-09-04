import { prisma, type ClienteDeEscrita } from '../../lib/prisma';
import { badRequest } from '../../lib/errors';
import { usuarioAtual } from '../../lib/tenant';

/**
 * Tarefa obrigatoria por etapa (item 3.1 do plano em ANALISE-CRM.md).
 *
 * A etapa do funil pode exigir que algo seja feito antes de o negocio avancar.
 * Sem isso, o funil registra por onde o negocio passou e nada sobre o que foi
 * feito la — que e exatamente a queixa que o processo de vendas do Nectar
 * resolve.
 *
 * O modelo tem tres pecas, e cada uma existe por um motivo:
 *
 * - `FunnelStage.tarefaObrigatoria` guarda o **titulo** da tarefa, nao um
 *   sim/nao. Um booleano diria ao vendedor que falta algo sem dizer o que;
 * - a tarefa e criada **na entrada** da etapa, como atividade de verdade — ela
 *   aparece na agenda, tem responsavel e entra na linha do tempo. Uma exigencia
 *   que so existe como checagem na hora de mover seria invisivel ate o momento
 *   em que atrapalha;
 * - `Activity.estagioId` amarra a tarefa a etapa que a exigiu. E o que faz o
 *   bloqueio sobreviver a alguem reescrever o texto da exigencia depois.
 */

/** O que o bloqueio precisa saber de cada tarefa em aberto. */
export type TarefaDeEtapa = { oportunidadeId: string | null; estagioId: string | null; titulo: string };

/**
 * So avanco e barrado.
 *
 * Voltar o cartao para tras fica livre de proposito: quase todo movimento
 * regressivo e correcao de erro — alguem arrastou para a coluna errada — e
 * exigir a tarefa da etapa para poder desfazer o proprio engano prenderia o
 * cartao no lugar errado. Etapas de mesma ordem nao existem (`@@unique([funilId,
 * ordem])`), entao igualdade aqui e a mesma etapa.
 */
export function ehAvanco(deOrdem: number, paraOrdem: number): boolean {
  return paraOrdem > deOrdem;
}

/**
 * A mensagem do bloqueio, ou `null` quando o caminho esta livre.
 *
 * A mensagem **nomeia as tarefas**. "Existe tarefa obrigatoria pendente" faria o
 * vendedor abrir a ficha para descobrir o que e; dizer o titulo resolve no
 * proprio aviso. Mais de uma tarefa e possivel (a etapa pode ter tido o texto
 * trocado, ou a oportunidade pode ter entrado nela antes), e todas aparecem.
 */
export function bloqueioDeEtapa(titulosPendentes: string[], nomeDaEtapa: string): string | null {
  if (titulosPendentes.length === 0) return null;
  const lista = titulosPendentes.join('; ');
  return `A etapa "${nomeDaEtapa}" exige concluir antes de avancar: ${lista}.`;
}

/**
 * Indexa as tarefas de etapa em aberto por oportunidade, **considerando so a
 * etapa em que cada oportunidade esta agora**.
 *
 * Uma tarefa deixada em aberto numa etapa da qual o cartao ja saiu (o que
 * acontece quando alguem volta o cartao, ja que voltar e livre) nao barra nada e
 * nao vira aviso: ela continua na lista de atividades como qualquer outra. Contar
 * essa tarefa como bloqueio faria o cartao ficar preso por uma exigencia de um
 * lugar onde ele nao esta.
 */
export function pendentesPorOportunidade(
  tarefas: TarefaDeEtapa[],
  estagioAtual: Map<string, string>,
): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  for (const t of tarefas) {
    if (!t.oportunidadeId || !t.estagioId) continue;
    if (estagioAtual.get(t.oportunidadeId) !== t.estagioId) continue;
    const atual = mapa.get(t.oportunidadeId);
    if (atual) atual.push(t.titulo);
    else mapa.set(t.oportunidadeId, [t.titulo]);
  }
  return mapa;
}

/**
 * Tarefas de etapa em aberto das oportunidades pedidas.
 *
 * Consulta de topo pelo mesmo motivo de `tarefasPorOportunidade`: a extensao de
 * multi-tenant filtra a operacao consultada, e nao o que vem por `include`.
 */
export async function tarefasDeEtapaAbertas(ids: string[]): Promise<TarefaDeEtapa[]> {
  if (ids.length === 0) return [];
  return prisma.activity.findMany({
    where: { oportunidadeId: { in: ids }, obrigatoria: true, concluidoEm: null },
    select: { oportunidadeId: true, estagioId: true, titulo: true },
    orderBy: { criadoEm: 'asc' },
  });
}

/**
 * Junta a pendencia de etapa a cada oportunidade ja serializada.
 *
 * `tarefaDaEtapaPendente` e uma lista de titulos, nao um booleano, para o cartao
 * poder dizer no `title` o que falta sem uma segunda chamada.
 */
export function comTarefaDeEtapa<T extends { id: string; estagio: { id: string } }>(
  oportunidades: T[],
  tarefas: TarefaDeEtapa[],
) {
  const pendentes = pendentesPorOportunidade(
    tarefas,
    new Map(oportunidades.map((o) => [o.id, o.estagio.id])),
  );
  return oportunidades.map((o) => ({ ...o, tarefaDaEtapaPendente: pendentes.get(o.id) ?? [] }));
}

/**
 * Cria a tarefa da etapa na entrada, se a etapa exigir uma.
 *
 * Idempotente por par (oportunidade, etapa): se ja existe atividade obrigatoria
 * daquela etapa para aquela oportunidade — concluida ou nao — nada e criado.
 * Reentrar numa etapa e comum (o cartao vai e volta por engano, ou o negocio
 * legitimamente retrocede) e criar uma tarefa a cada passagem transformaria o
 * processo em ruido, com quatro copias de "Registrar a visita tecnica" na agenda.
 *
 * Roda **dentro da mesma transacao** que move o cartao: um cartao na etapa nova
 * sem a tarefa que ela exige e um cartao que ninguem sabe que esta pendente.
 */
export async function garantirTarefaDaEtapa(
  tx: ClienteDeEscrita,
  entrada: { oportunidadeId: string; estagioId: string; tarefaObrigatoria: string | null; responsavelId: string | null },
) {
  const titulo = entrada.tarefaObrigatoria?.trim();
  if (!titulo) return null;

  const jaExiste = await tx.activity.findFirst({
    where: { oportunidadeId: entrada.oportunidadeId, estagioId: entrada.estagioId, obrigatoria: true },
    select: { id: true },
  });
  if (jaExiste) return null;

  const { id: autorId } = usuarioAtual();
  return tx.activity.create({
    data: {
      // `organizacaoId` nao entra a mao: a extensao marca criacao de `Activity`,
      // que esta em COM_ORGANIZACAO. Passar por cima seria a chance de passar o
      // valor errado.
      tipo: 'TAREFA',
      titulo,
      oportunidadeId: entrada.oportunidadeId,
      estagioId: entrada.estagioId,
      obrigatoria: true,
      criadoPorId: autorId,
      /*
       * Responsavel: o da oportunidade, ou quem moveu o cartao. Tarefa sem dono
       * nao aparece em nenhuma lista e morre — e esta em especial nao pode
       * morrer, porque ela e o que destrava a etapa.
       *
       * Sem prazo, de proposito: um prazo inventado apareceria como "tarefa
       * atrasada" no cartao dias depois, sem ninguem ter combinado data alguma.
       * O aviso desta tarefa e outro, e ele nao depende de prazo — ver
       * `sinalDeAcao` no front.
       */
      responsavelId: entrada.responsavelId ?? autorId,
    },
  });
}

/**
 * Barra a saida da etapa atual enquanto a tarefa que ela exige estiver aberta.
 *
 * Chamada antes da escrita, com a etapa de origem em maos. `nomeDaEtapa` entra
 * como parametro porque quem chama ja carregou a etapa — reconsultar aqui seria
 * uma ida ao banco para repetir o que o chamador tem na mao.
 */
export async function conferirEtapaLiberada(oportunidadeId: string, estagio: { id: string; nome: string }) {
  const abertas = await prisma.activity.findMany({
    where: { oportunidadeId, estagioId: estagio.id, obrigatoria: true, concluidoEm: null },
    select: { titulo: true },
    orderBy: { criadoEm: 'asc' },
  });
  const erro = bloqueioDeEtapa(abertas.map((a) => a.titulo), estagio.nome);
  if (erro) throw badRequest(erro);
}
