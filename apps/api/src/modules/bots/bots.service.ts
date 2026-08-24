import type { Channel } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/errors';
import { notificarConversaAtualizada, notificarMensagem } from '../../realtime/hub';
import { inclusaoDetalhe, toConversaDetalhe, toMensagem } from '../conversations/conversations.serializer';

/** Compara sem acento e sem caixa: "duvida" casa com "Dúvida". */
const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const inclusaoBot = { passos: { orderBy: { ordem: 'asc' } } } as const;

export async function listarBots() {
  return prisma.bot.findMany({
    include: { passos: { orderBy: { ordem: 'asc' }, include: { fila: { select: { id: true, nome: true } } } } },
    orderBy: { criadoEm: 'asc' },
  });
}

export async function salvarBot(input: {
  id?: string;
  nome: string;
  ativo: boolean;
  canal?: Channel | null;
  mensagemBoasVindas: string;
  fallback: string;
  limiteSemResposta?: number;
  passos: Array<{ gatilhos: string[]; resposta: string; acao: 'RESPONDER' | 'TRANSFERIR' | 'ENCERRAR'; filaId?: string | null }>;
}) {
  const { passos, id, ...dados } = input;

  const bot = id
    ? await prisma.bot.update({ where: { id }, data: dados })
    : await prisma.bot.create({ data: dados });

  // Passos sao substituidos por completo: e mais simples de raciocinar do que
  // reconciliar ordem item por item, e o volume e pequeno.
  await prisma.botStep.deleteMany({ where: { botId: bot.id } });
  await prisma.botStep.createMany({
    data: passos.map((p, indice) => ({
      botId: bot.id,
      ordem: indice + 1,
      gatilhos: p.gatilhos,
      resposta: p.resposta,
      acao: p.acao,
      filaId: p.filaId ?? null,
    })),
  });

  return prisma.bot.findUniqueOrThrow({ where: { id: bot.id }, include: inclusaoBot });
}

export async function excluirBot(id: string) {
  const bot = await prisma.bot.findUnique({ where: { id } });
  if (!bot) throw notFound('Bot nao encontrado');
  await prisma.bot.delete({ where: { id } });
}

/** Bot ativo do canal; se nao houver especifico, o generico (canal nulo). */
async function botDoCanal(canal: Channel) {
  return (
    (await prisma.bot.findFirst({ where: { ativo: true, canal }, include: inclusaoBot })) ??
    (await prisma.bot.findFirst({ where: { ativo: true, canal: null }, include: inclusaoBot }))
  );
}

/**
 * Responde automaticamente a uma mensagem do cliente.
 *
 * So age enquanto a conversa esta EM_ESPERA e sem agente: assim que alguem
 * assume, o bot cala — nunca fala em cima do atendente.
 *
 * Retorna se respondeu, para o chamador nao precisar reconsultar.
 */
export async function responderAutomaticamente(conversaId: string, textoCliente: string) {
  const conversa = await prisma.conversation.findUnique({ where: { id: conversaId } });
  if (!conversa || conversa.agenteId || conversa.status !== 'EM_ESPERA') return { respondeu: false };

  const bot = await botDoCanal(conversa.canal);
  if (!bot) return { respondeu: false };

  const mensagens = await prisma.message.findMany({
    where: { conversaId },
    orderBy: { criadoEm: 'asc' },
    select: { autor: true, conteudo: true },
  });

  const jaFalou = mensagens.some((m) => m.autor === 'BOT');
  const semCasar = mensagens.filter((m) => m.autor === 'BOT' && m.conteudo === bot.fallback).length;

  // Depois de insistir sem entender, para de tentar e deixa para o humano.
  if (semCasar >= bot.limiteSemResposta) return { respondeu: false };

  const texto = normalizar(textoCliente);
  const passo = bot.passos.find((p) => p.gatilhos.some((g) => g && texto.includes(normalizar(g))));

  const partes: string[] = [];
  if (!jaFalou) partes.push(bot.mensagemBoasVindas);
  partes.push(passo ? passo.resposta : bot.fallback);

  const criadas = [];
  for (const conteudo of partes) {
    criadas.push(await prisma.message.create({ data: { conversaId, autor: 'BOT', conteudo } }));
  }

  const acao = passo?.acao ?? 'RESPONDER';

  const atualizada = await prisma.conversation.update({
    where: { id: conversaId },
    data: {
      ultimaMensagemEm: criadas[criadas.length - 1]!.criadoEm,
      // TRANSFERIR move de fila e deixa na espera para o agente humano.
      ...(acao === 'TRANSFERIR' && passo?.filaId ? { filaId: passo.filaId } : {}),
      ...(acao === 'ENCERRAR' ? { status: 'FINALIZADO' as const, finalizadoEm: new Date() } : {}),
    },
    include: inclusaoDetalhe,
  });

  const detalhe = toConversaDetalhe(atualizada);
  const destinos = { conversaId, filaId: atualizada.filaId, agenteId: atualizada.agenteId };

  for (const mensagem of criadas) {
    notificarMensagem({ conversaId, mensagem: toMensagem(mensagem) }, destinos);
  }
  notificarConversaAtualizada(detalhe, destinos);

  return { respondeu: true, acao, mensagens: criadas.map(toMensagem) };
}
