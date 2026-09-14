import type { Channel } from '@prisma/client';
import { baixarAnexo } from './media.service';
import { configDoDestino } from './channels.service';
import { prisma } from '../../lib/prisma';
import { redigirTexto } from '../../lib/redacao';
import { notificarConversaAtualizada, notificarConversaNova, notificarMensagem } from '../../realtime/hub';
import { responderAutomaticamente } from '../bots/bots.service';
import { entregarParaIa } from '../bots/ia.service';
import { inclusaoDetalhe, toConversaDetalhe, toMensagem } from '../conversations/conversations.serializer';
import type { MensagemNormalizada } from './meta.types';

type DestinoConversa = { canalConfigId: string | null; filaId: string | null; agenteId: string | null };

/**
 * Parte PURA de `destinoDaMensagem`: dada uma config ja resolvida, decide
 * fila-vs-dono sem tocar em banco. Extraida para ser reaproveitada por
 * `iniciarConversa` (conversations.service.ts) — o vendedor que abre uma
 * conversa a partir da ficha do contato resolve a config de outro jeito
 * (linha pessoal do RESPONSAVEL do contato, nao do identificador da mensagem),
 * mas a regra de "linha pessoal atribui, linha comum cai na fila dela" e a
 * mesma e nao pode ser duplicada.
 */
export function decidirDestino(
  config: { id: string; donoId: string | null; filaId: string | null } | null,
): DestinoConversa {
  if (config?.donoId) {
    return { canalConfigId: config.id, filaId: null, agenteId: config.donoId };
  }
  if (config?.filaId) {
    return { canalConfigId: config?.id ?? null, filaId: config.filaId, agenteId: null };
  }
  return { canalConfigId: config?.id ?? null, filaId: null, agenteId: null };
}

/**
 * Destino de uma conversa nova: a linha que recebeu a mensagem decide.
 *
 * Linha pessoal (`donoId` preenchido — o vendedor com WhatsApp proprio): a
 * conversa nasce ja atribuida a ele, sem fila — o cliente que fala com o
 * numero dele nao devia esperar em espera compartilhada por algo que ja tem
 * dono. Linha comum: cai na fila configurada, ou na primeira fila ativa do
 * canal, como sempre foi.
 */
export async function destinoDaMensagem(canal: Channel, identificadorDestino: string | null): Promise<DestinoConversa> {
  const config = await configDoDestino(canal, identificadorDestino);
  const decidido = decidirDestino(config);
  if (decidido.filaId || decidido.agenteId) return decidido;

  const fila =
    (await prisma.queue.findFirst({ where: { ativa: true, canalPadrao: canal }, orderBy: { criadoEm: 'asc' } })) ??
    (await prisma.queue.findFirst({ where: { ativa: true }, orderBy: { criadoEm: 'asc' } }));
  return { ...decidido, filaId: fila?.id ?? null };
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
  const destino = emAberto
    ? { canalConfigId: emAberto.canalConfigId, filaId: emAberto.filaId, agenteId: null }
    : await destinoDaMensagem(dados.canal, dados.identificadorDestino);

  const conversa =
    emAberto ??
    (await prisma.conversation.create({
      data: {
        canal: dados.canal,
        // Linha pessoal ja nasce atribuida: nao ha "esperando na fila" para
        // quem tem numero proprio, o cliente ja falou com o dono.
        status: destino.agenteId ? 'ATRIBUIDO' : 'EM_ESPERA',
        contatoId: contato.id,
        filaId: destino.filaId,
        agenteId: destino.agenteId,
        atribuidoEm: destino.agenteId ? new Date() : null,
        canalConfigId: destino.canalConfigId,
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

  // Motor de IA externo tem precedencia sobre o bot de arvore local: dois bots
  // respondendo a mesma mensagem e pior que nenhum. Entregar nao lanca — canal
  // com IA fora do ar cai no bot local, e a mensagem do cliente ja esta gravada.
  const ia = await entregarParaIa(mensagem, atualizada);
  if (!ia.entregue) await responderAutomaticamente(conversa.id, dados.conteudo);

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
