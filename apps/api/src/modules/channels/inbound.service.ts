import type { Channel } from '@prisma/client';
import { baixarAnexo } from './media.service';
import { prisma } from '../../lib/prisma';
import { redigirTexto } from '../../lib/redacao';
import { notificarConversaAtualizada, notificarConversaNova, notificarMensagem } from '../../realtime/hub';
import { responderAutomaticamente } from '../bots/bots.service';
import { inclusaoDetalhe, toConversaDetalhe, toMensagem } from '../conversations/conversations.serializer';
import type { MensagemNormalizada } from './meta.types';

/** Fila de destino: a configurada no canal, ou a primeira fila ativa daquele canal. */
async function filaDoCanal(canal: Channel) {
  const config = await prisma.channelConfig.findUnique({ where: { canal } });
  if (config?.filaId) return config.filaId;

  const fila =
    (await prisma.queue.findFirst({ where: { ativa: true, canalPadrao: canal }, orderBy: { criadoEm: 'asc' } })) ??
    (await prisma.queue.findFirst({ where: { ativa: true }, orderBy: { criadoEm: 'asc' } }));
  return fila?.id ?? null;
}

/**
 * Grava uma mensagem recebida de canal externo.
 *
 * Idempotente: o webhook da Meta reentrega quando nao recebe 200, e `idExterno`
 * e unico — reentrega devolve `duplicada: true` sem criar nada.
 * Reaproveita a conversa aberta do mesmo interlocutor; se a ultima foi
 * finalizada, abre uma nova.
 */
export async function registrarMensagemEntrante(dados: MensagemNormalizada) {
  const jaExiste = await prisma.message.findUnique({ where: { idExterno: dados.idExterno } });
  if (jaExiste) return { duplicada: true as const };

  const contato = await encontrarOuCriarContato(dados);

  const emAberto = await prisma.conversation.findFirst({
    where: {
      contatoId: contato.id,
      canal: dados.canal,
      status: { not: 'FINALIZADO' },
    },
    orderBy: { ultimaMensagemEm: 'desc' },
  });

  const nova = !emAberto;
  const filaId = emAberto?.filaId ?? (await filaDoCanal(dados.canal));

  const conversa =
    emAberto ??
    (await prisma.conversation.create({
      data: {
        canal: dados.canal,
        status: 'EM_ESPERA',
        contatoId: contato.id,
        filaId,
        enderecoExterno: dados.enderecoExterno,
      },
    }));

  // Traz a midia para o storage proprio. Se falhar, guarda a URL da Meta como
  // ela veio: expira em pouco tempo, mas e melhor que anexo nenhum, e o motivo
  // fica no log para quem for investigar.
  const anexo = await baixarAnexo(dados.canal, dados);
  if (anexo.motivo) {
    console.warn(`[anexo] ${dados.canal} ${dados.idExterno}: ${redigirTexto(anexo.motivo)}`);
  }

  const mensagem = await prisma.message.create({
    data: {
      conversaId: conversa.id,
      autor: 'CLIENTE',
      conteudo: dados.conteudo,
      tipoAnexo: dados.tipoAnexo,
      anexoUrl: anexo.url ?? dados.anexoUrl,
      idExterno: dados.idExterno,
    },
  });

  const atualizada = await prisma.conversation.update({
    where: { id: conversa.id },
    data: {
      ultimaMensagemEm: mensagem.criadoEm,
      naoLidas: { increment: 1 },
      // Endereco pode mudar de forma (ex.: numero reportado com/sem prefixo).
      enderecoExterno: dados.enderecoExterno,
    },
    include: inclusaoDetalhe,
  });

  const detalhe = toConversaDetalhe(atualizada);
  const destinos = { conversaId: conversa.id, filaId: atualizada.filaId, agenteId: atualizada.agenteId };

  notificarMensagem({ conversaId: conversa.id, mensagem: toMensagem(mensagem) }, destinos);
  if (nova) notificarConversaNova(detalhe, destinos);
  else notificarConversaAtualizada(detalhe, destinos);

  // Chatbot (Fase 4): mesmo tratamento do webchat nos canais externos.
  await responderAutomaticamente(conversa.id, dados.conteudo);

  return { duplicada: false as const, conversaId: conversa.id, mensagemId: mensagem.id };
}

async function encontrarOuCriarContato(dados: MensagemNormalizada) {
  // O endereco externo e a chave estavel; o telefone e a forma legivel dele no WhatsApp.
  const porConversa = await prisma.conversation.findFirst({
    where: { enderecoExterno: dados.enderecoExterno, canal: dados.canal },
    orderBy: { criadoEm: 'desc' },
    select: { contatoId: true },
  });
  if (porConversa) {
    return prisma.contact.findUniqueOrThrow({ where: { id: porConversa.contatoId } });
  }

  if (dados.telefone) {
    const porTelefone = await prisma.contact.findFirst({ where: { telefone: dados.telefone } });
    if (porTelefone) return porTelefone;
  }

  return prisma.contact.create({
    data: {
      nome: dados.nomeExibicao ?? `Contato ${dados.enderecoExterno.slice(-4)}`,
      telefone: dados.telefone,
      canalOrigem: dados.canal,
    },
  });
}
