import { randomBytes } from 'node:crypto';
import type { Channel } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError, badRequest, notFound } from '../../lib/errors';
import { env } from '../../env';
import { notificarMensagem } from '../../realtime/hub';
import { enviarParaCanal, exigeEnvioExterno } from '../channels/outbound.service';
import { toMensagem } from '../conversations/conversations.serializer';

/** Limites de nota por tipo de pesquisa. */
const FAIXA = { CSAT: { min: 1, max: 5 }, NPS: { min: 0, max: 10 } } as const;

/**
 * Cria a pesquisa ao finalizar o atendimento. Idempotente por conversa
 * (a conversa pode ser finalizada mais de uma vez apos reabertura).
 */
export async function criarPesquisa(conversaId: string, tipo: 'CSAT' | 'NPS' = 'CSAT') {
  const existente = await prisma.survey.findUnique({ where: { conversaId } });
  if (existente) return existente;

  return prisma.survey.create({
    data: { conversaId, tipo, token: randomBytes(16).toString('hex') },
  });
}

/** Tipo do trabalho na fila (declarado aqui para o worker nao virar dependencia do service). */
export const TIPO_CONVITE_PESQUISA = 'pesquisa:convite';

/** Canais em que a plataforma consegue devolver uma mensagem ao cliente. */
const CANAIS_COM_RETORNO: Channel[] = ['WEBCHAT', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK'];

export const linkPesquisa = (token: string) => `${env.WEB_ORIGIN}/avaliacao/${token}`;

async function textoConvite(tipo: 'CSAT' | 'NPS', token: string) {
  const branding = await prisma.branding.findUnique({ where: { id: 'default' } });
  const faixa = FAIXA[tipo];
  return [
    `Seu atendimento foi encerrado. Como voce avalia de ${faixa.min} a ${faixa.max}?`,
    `Leva menos de um minuto: ${linkPesquisa(token)}`,
    branding?.appName ? `Obrigado! — ${branding.appName}` : 'Obrigado!',
  ].join('\n');
}

/** Grava a mensagem no historico e avisa quem esta com a conversa aberta. */
async function registrarMensagem(
  conversaId: string,
  conteudo: string,
  idExterno: string | null,
  destinos: { filaId: string | null; agenteId: string | null },
) {
  const mensagem = await prisma.message.create({
    data: { conversaId, autor: 'SISTEMA', conteudo, idExterno },
  });
  await prisma.conversation.update({
    where: { id: conversaId },
    data: { ultimaMensagemEm: mensagem.criadoEm },
  });
  notificarMensagem({ conversaId, mensagem: toMensagem(mensagem) }, { conversaId, ...destinos });
  return mensagem;
}

/**
 * Entrega o link da pesquisa ao cliente como ultima mensagem da conversa.
 *
 * Nunca lanca: o atendimento ja foi finalizado e nao pode ser desfeito porque o
 * canal recusou uma mensagem. A falha e registrada no historico para o agente
 * ver, e `entregueEm` fica nulo — e essa a diferenca entre pesquisa criada e
 * pesquisa que o cliente realmente recebeu.
 */
export async function entregarPesquisa(
  conversaId: string,
  opcoes: { anotarFalha?: boolean } = {},
): Promise<{ entregue: boolean; motivo?: string; permanente?: boolean }> {
  const anotarFalha = opcoes.anotarFalha ?? true;
  const pesquisa = await prisma.survey.findUnique({ where: { conversaId } });
  if (!pesquisa) return { entregue: false, motivo: 'Pesquisa nao encontrada' };
  if (pesquisa.entregueEm) return { entregue: true };

  const conversa = await prisma.conversation.findUnique({
    where: { id: conversaId },
    select: { canal: true, enderecoExterno: true, filaId: true, agenteId: true },
  });
  if (!conversa) return { entregue: false, motivo: 'Conversa nao encontrada' };

  const destinos = { filaId: conversa.filaId, agenteId: conversa.agenteId };

  if (!CANAIS_COM_RETORNO.includes(conversa.canal)) {
    const motivo = `o canal ${conversa.canal} nao tem caminho de volta para o cliente`;
    if (anotarFalha) {
      await registrarMensagem(conversaId, `Pesquisa de satisfacao nao enviada: ${motivo}.`, null, destinos);
    }
    // Nao adianta tentar de novo: o canal nao vai passar a ter caminho de volta.
    return { entregue: false, motivo, permanente: true };
  }

  // Mesma regra do envio do agente: fala com o canal ANTES de gravar, para nao
  // marcar como entregue um convite que o cliente nunca recebeu.
  let idExterno: string | null = null;
  const texto = await textoConvite(pesquisa.tipo, pesquisa.token);
  try {
    if (exigeEnvioExterno(conversa.canal)) {
      idExterno = (await enviarParaCanal(conversa.canal, conversa.enderecoExterno, texto)).idExterno;
    }
  } catch (err) {
    const motivo = err instanceof Error ? err.message : 'erro desconhecido';
    if (anotarFalha) {
      await registrarMensagem(conversaId, `Pesquisa de satisfacao nao enviada: ${motivo}`, null, destinos);
    }
    /**
     * Recusa da Meta e definitiva (token invalido, cliente fora da janela de 24h):
     * a mesma mensagem nao passa a ser aceita na terceira tentativa. Erro de rede
     * ou canal ainda sem configuracao merece nova tentativa.
     */
    const permanente = err instanceof AppError && err.code === 'ENVIO_RECUSADO';
    return { entregue: false, motivo, permanente };
  }

  await registrarMensagem(conversaId, texto, idExterno, destinos);
  await prisma.survey.update({ where: { conversaId }, data: { entregueEm: new Date() } });
  return { entregue: true };
}

/** Dados minimos para a tela publica de resposta — sem expor histórico. */
export async function obterPorToken(token: string) {
  const pesquisa = await prisma.survey.findUnique({
    where: { token },
    include: {
      conversa: {
        select: {
          canal: true,
          finalizadoEm: true,
          contato: { select: { nome: true } },
          agente: { select: { nome: true } },
        },
      },
    },
  });
  if (!pesquisa) throw notFound('Pesquisa nao encontrada');

  return {
    tipo: pesquisa.tipo,
    faixa: FAIXA[pesquisa.tipo],
    respondida: pesquisa.respondidoEm !== null,
    nota: pesquisa.nota,
    comentario: pesquisa.comentario,
    cliente: pesquisa.conversa.contato.nome,
    atendente: pesquisa.conversa.agente?.nome ?? null,
    canal: pesquisa.conversa.canal,
    finalizadoEm: pesquisa.conversa.finalizadoEm,
  };
}

export async function responder(token: string, nota: number, comentario?: string) {
  const pesquisa = await prisma.survey.findUnique({ where: { token } });
  if (!pesquisa) throw notFound('Pesquisa nao encontrada');
  if (pesquisa.respondidoEm) throw badRequest('Esta pesquisa ja foi respondida');

  const faixa = FAIXA[pesquisa.tipo];
  if (!Number.isInteger(nota) || nota < faixa.min || nota > faixa.max) {
    throw badRequest(`A nota do ${pesquisa.tipo} deve ser um inteiro entre ${faixa.min} e ${faixa.max}`);
  }

  await prisma.survey.update({
    where: { token },
    data: { nota, comentario: comentario?.trim() || null, respondidoEm: new Date() },
  });

  return { agradecimento: 'Obrigado pela sua avaliacao!' };
}

/** Resultados para a Area da Gestao. */
export async function resultados(desde: Date, ate: Date) {
  const pesquisas = await prisma.survey.findMany({
    where: { enviadoEm: { gte: desde, lte: ate } },
    include: {
      conversa: {
        select: {
          canal: true,
          agente: { select: { id: true, nome: true } },
          fila: { select: { nome: true } },
          contato: { select: { nome: true } },
        },
      },
    },
    orderBy: { enviadoEm: 'desc' },
  });

  const respondidas = pesquisas.filter((p) => p.nota !== null);
  const porAgente = new Map<string, { nome: string; notas: number[] }>();

  for (const p of respondidas) {
    const agente = p.conversa.agente;
    if (!agente) continue;
    const atual = porAgente.get(agente.id) ?? { nome: agente.nome, notas: [] };
    atual.notas.push(p.nota!);
    porAgente.set(agente.id, atual);
  }

  const entregues = pesquisas.filter((p) => p.entregueEm !== null).length;
  /**
   * Denominador da taxa e o que o cliente recebeu, nao o que foi criado: uma
   * pesquisa que nunca saiu da plataforma nao e uma pesquisa ignorada. O
   * Math.max cobre as pesquisas anteriores a coluna entregue_em, que respondidas
   * ficariam fora do denominador e inflariam a taxa acima de 100%.
   */
  const base = Math.max(entregues, respondidas.length);

  return {
    enviadas: pesquisas.length,
    entregues,
    naoEntregues: pesquisas.length - entregues,
    respondidas: respondidas.length,
    taxaResposta: base === 0 ? null : Math.round((respondidas.length / base) * 100),
    porAgente: [...porAgente.entries()].map(([id, dados]) => ({
      id,
      nome: dados.nome,
      respostas: dados.notas.length,
      media: Math.round((dados.notas.reduce((a, b) => a + b, 0) / dados.notas.length) * 100) / 100,
    })),
    comentarios: respondidas
      .filter((p) => p.comentario)
      .slice(0, 50)
      .map((p) => ({
        nota: p.nota,
        tipo: p.tipo,
        comentario: p.comentario,
        cliente: p.conversa.contato.nome,
        agente: p.conversa.agente?.nome ?? null,
        respondidoEm: p.respondidoEm,
      })),
  };
}
