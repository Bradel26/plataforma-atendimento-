import type { Prisma, SentimentoDaLigacao } from '@prisma/client';
import { badRequest, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { registrarConsumo } from '../ia/consumo.service';
import {
  analisePrematura,
  estadoDaAcao,
  estadoDaAnalise,
  impedimentoDaTarefa,
  normalizarAcoes,
} from './analise';

/**
 * Assistente da ligacao (item E.2): recebe a analise do motor e a torna acionavel.
 *
 * A plataforma nao transcreve. Quem transcreve, resume e le o sentimento e um
 * motor externo, que posta o resultado pela ponte de integracao — a mesma
 * arquitetura do agente de IA que responde conversa (`modules/bots/ia`), e pelo
 * mesmo motivo: preco de token, escolha de modelo e qualidade de audio sao
 * problemas de quem processa, e nao da plataforma que guarda.
 *
 * O que e daqui e o que vem depois da analise: guardar com procedencia, nao
 * confundir ausencia com neutralidade, e transformar "proxima acao" em tarefa de
 * verdade na agenda de alguem.
 */

export type EntradaDaAnalise = {
  transcricao?: string | null;
  resumo?: string | null;
  sentimento?: SentimentoDaLigacao | null;
  proximasAcoes?: unknown;
  /** Nome do motor. Analise sem autor nao se discute. */
  motor?: string;
  analisadoEm?: Date;
  consumo?: { unidades?: number; custo?: number | null };
};

/**
 * Grava a analise de uma chamada.
 *
 * Aceita o id da plataforma **ou** o id do provedor: o motor externo costuma
 * conhecer a chamada pelo id do provedor, que e o que ele recebeu junto com o
 * audio, e obrigar uma traducao criaria um passo onde nada falha de forma
 * visivel — o motor simplesmente pararia de postar.
 */
export async function registrarAnalise(chave: string, entrada: EntradaDaAnalise) {
  const chamada = await prisma.call.findFirst({
    where: { OR: [{ id: chave }, { idExterno: chave }] },
    select: { id: true, encerradoEm: true },
  });
  if (!chamada) throw notFound('Chamada nao encontrada');

  const analisadoEm = entrada.analisadoEm ?? new Date();

  /*
   * Analise anterior ao fim da ligacao e recusada.
   *
   * Resumo de metade da conversa e pior que resumo nenhum: ele parece completo,
   * e quem le nao tem como saber que faltou o trecho em que o cliente decidiu.
   */
  if (analisePrematura(chamada.encerradoEm, analisadoEm)) {
    throw badRequest(
      chamada.encerradoEm === null
        ? 'A chamada ainda nao encerrou — nao ha audio completo para analisar'
        : 'A analise e anterior ao fim da ligacao',
    );
  }

  const acoes = normalizarAcoes(entrada.proximasAcoes);

  await prisma.$transaction(async (tx) => {
    await tx.call.update({
      where: { id: chamada.id },
      data: {
        // Campo ausente nao apaga o que existe: um motor que so transcreve nao
        // deve zerar o resumo que outro escreveu.
        ...(entrada.transcricao !== undefined ? { transcricao: entrada.transcricao } : {}),
        ...(entrada.resumo !== undefined ? { resumo: entrada.resumo } : {}),
        ...(entrada.sentimento !== undefined ? { sentimento: entrada.sentimento } : {}),
        analisadoPor: entrada.motor ?? null,
        analisadoEm,
      },
    });

    if (entrada.proximasAcoes !== undefined) {
      /*
       * Reanalise substitui so as sugestoes PENDENTES.
       *
       * As que viraram tarefa e as que foram descartadas sao decisoes de uma
       * pessoa, e o motor nao desfaz decisao de pessoa: apagar as descartadas
       * faria a mesma sugestao ruim voltar a cada reanalise, e apagar as que
       * viraram tarefa deixaria a atividade orfa da origem dela.
       */
      await tx.callSuggestedAction.deleteMany({
        where: { chamadaId: chamada.id, atividadeId: null, descartadoEm: null },
      });

      const jaResolvidas = await tx.callSuggestedAction.findMany({
        where: { chamadaId: chamada.id },
        select: { texto: true },
      });
      const conhecidas = new Set(jaResolvidas.map((a) => a.texto.toLocaleLowerCase('pt-BR')));

      const novas = acoes
        // Sugestao identica a uma que ja foi decidida nao volta: quem descartou
        // "ligar de novo" nao quer ve-la reaparecer a cada reanalise.
        .filter((texto) => !conhecidas.has(texto.toLocaleLowerCase('pt-BR')))
        .map((texto, i) => ({ chamadaId: chamada.id, texto, ordem: i }));

      if (novas.length > 0) await tx.callSuggestedAction.createMany({ data: novas });
    }
  });

  /*
   * O medidor de IA (item 6.8) ganha o uso, com o recurso certo.
   *
   * Transcricao e resumo tem preco muito diferente por unidade, e somar os dois
   * num recurso so faria a quebra por recurso — que existe para responder "onde
   * esta o gasto" — perder justamente a resposta.
   */
  await registrarConsumo({
    recurso:
      entrada.transcricao !== undefined && entrada.transcricao !== null ? 'TRANSCRICAO' : 'RESUMO',
    unidades: entrada.consumo?.unidades ?? 0,
    custo: entrada.consumo?.custo ?? null,
    referencia: chamada.id,
  });

  return analiseDaChamada(chamada.id);
}

const inclusaoDeAcoes = {
  acoesSugeridas: { orderBy: [{ ordem: 'asc' }, { criadoEm: 'asc' }] },
} satisfies Prisma.CallInclude;

/**
 * A analise de uma chamada, do jeito que a tela precisa dela.
 *
 * `estado` vem calculado aqui e nao na tela: "sem analise" e "analisada sem
 * proxima acao" sao dois estados diferentes, e deixar a tela deduzir isso de uma
 * lista vazia produziria a mesma tela para os dois.
 */
export async function analiseDaChamada(id: string) {
  const c = await prisma.call.findFirst({
    where: { OR: [{ id }, { idExterno: id }] },
    include: { ...inclusaoDeAcoes, contato: { select: { id: true, nome: true } } },
  });
  if (!c) throw notFound('Chamada nao encontrada');

  const temVinculo = c.contatoId !== null;

  return {
    chamadaId: c.id,
    estado: estadoDaAnalise(c),
    transcricao: c.transcricao,
    resumo: c.resumo,
    /** Nulo NAO e NEUTRO: significa que ninguem analisou esta ligacao. */
    sentimento: c.sentimento,
    analisadoPor: c.analisadoPor,
    analisadoEm: c.analisadoEm,
    contato: c.contato ?? null,
    acoes: c.acoesSugeridas.map((a) => ({
      id: a.id,
      texto: a.texto,
      ordem: a.ordem,
      estado: estadoDaAcao(a),
      atividadeId: a.atividadeId,
      descartadoEm: a.descartadoEm,
      /** Por que o botao nao esta disponivel. Nulo = pode virar tarefa. */
      impedimento: impedimentoDaTarefa(a, temVinculo),
    })),
  };
}

/**
 * Transforma uma sugestao em tarefa de verdade.
 *
 * E o que separa este item de um resumo bonito: na demonstracao as proximas
 * acoes eram **executaveis**, e sugestao que nao pode virar compromisso e
 * enfeite.
 *
 * A tarefa nasce **sem prazo**, e isso e deliberado: o motor nao sabe quando a
 * pessoa pode fazer, e um prazo inventado apareceria como atrasado no dia
 * seguinte — o sinal de atraso do funil perderia sentido se ele pudesse vir de
 * um palpite de maquina.
 */
export async function acaoViraTarefa(chamadaId: string, acaoId: string, usuarioId: string) {
  const acao = await prisma.callSuggestedAction.findFirst({
    // A chamada entra no filtro porque a sugestao e filha dela: sem isso, um id
    // de sugestao de outra organizacao passaria pela extensao de multi-tenant,
    // que filtra o modelo consultado e nao a relacao.
    where: { id: acaoId, chamada: { id: chamadaId } },
    include: { chamada: { select: { id: true, contatoId: true, agenteId: true } } },
  });
  if (!acao) throw notFound('Sugestao nao encontrada');

  const impedimento = impedimentoDaTarefa(acao, acao.chamada.contatoId !== null);
  if (impedimento) throw badRequest(impedimento);

  return prisma.$transaction(async (tx) => {
    const atividade = await tx.activity.create({
      data: {
        tipo: 'TAREFA',
        titulo: acao.texto,
        // A descricao diz de onde veio. Tarefa sem procedencia faz quem a recebe
        // perguntar "quem pediu isso?", e a resposta e uma ligacao especifica.
        descricao: 'Proxima acao sugerida pela analise da ligacao',
        contatoId: acao.chamada.contatoId,
        // Responsavel e quem atendeu, quando se sabe: a acao e continuacao da
        // conversa que ele teve. Sem agente, fica com quem clicou.
        responsavelId: acao.chamada.agenteId ?? usuarioId,
        criadoPorId: usuarioId,
      },
      select: { id: true, titulo: true, responsavelId: true },
    });

    await tx.callSuggestedAction.update({
      where: { id: acao.id },
      data: { atividadeId: atividade.id },
    });

    return { atividade, acaoId: acao.id };
  });
}

/**
 * Descarta uma sugestao, com autor.
 *
 * Descarte e registro, e nao delecao: sugestao apagada em silencio voltaria
 * igual na proxima analise, e ninguem saberia que ela ja tinha sido recusada.
 */
export async function descartarAcao(chamadaId: string, acaoId: string, usuarioId: string) {
  const acao = await prisma.callSuggestedAction.findFirst({
    where: { id: acaoId, chamada: { id: chamadaId } },
    select: { id: true, atividadeId: true, descartadoEm: true },
  });
  if (!acao) throw notFound('Sugestao nao encontrada');
  if (acao.atividadeId) throw badRequest('Esta sugestao ja virou tarefa');
  if (acao.descartadoEm) throw badRequest('Esta sugestao ja foi descartada');

  await prisma.callSuggestedAction.update({
    where: { id: acao.id },
    data: { descartadoEm: new Date(), descartadoPorId: usuarioId },
  });

  return analiseDaChamada(chamadaId);
}
