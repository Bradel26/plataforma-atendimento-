import type { Prisma } from '@prisma/client';
import { urlAssinada } from '../../lib/storage';

export const inclusaoResumo = {
  contato: true,
  fila: { select: { id: true, nome: true } },
  agente: { select: { id: true, nome: true } },
  mensagens: { orderBy: { criadoEm: 'desc' }, take: 1 },
} satisfies Prisma.ConversationInclude;

export const inclusaoDetalhe = {
  contato: true,
  fila: { select: { id: true, nome: true } },
  agente: { select: { id: true, nome: true } },
  mensagens: { orderBy: { criadoEm: 'asc' } },
} satisfies Prisma.ConversationInclude;

type ConversaResumo = Prisma.ConversationGetPayload<{ include: typeof inclusaoResumo }>;
type ConversaDetalhe = Prisma.ConversationGetPayload<{ include: typeof inclusaoDetalhe }>;
type MensagemDb = ConversaDetalhe['mensagens'][number];

export function toMensagem(m: MensagemDb) {
  return {
    id: m.id,
    conversaId: m.conversaId,
    autor: m.autor,
    autorId: m.autorId,
    conteudo: m.conteudo,
    tipoAnexo: m.tipoAnexo,
    anexoUrl: m.anexoUrl ? urlAssinada(m.anexoUrl) : null,
    criadoEm: m.criadoEm,
  };
}

/** Formato usado na lista de conversas (abas do painel de atendimento). */
export function toConversaResumo(c: ConversaResumo) {
  const ultima = c.mensagens[0];
  return {
    id: c.id,
    canal: c.canal,
    status: c.status,
    assunto: c.assunto,
    naoLidas: c.naoLidas,
    criadoEm: c.criadoEm,
    atribuidoEm: c.atribuidoEm,
    finalizadoEm: c.finalizadoEm,
    ultimaMensagemEm: c.ultimaMensagemEm,
    contato: { id: c.contato.id, nome: c.contato.nome, email: c.contato.email, telefone: c.contato.telefone },
    fila: c.fila,
    agente: c.agente,
    ultimaMensagem: ultima ? toMensagem(ultima) : null,
  };
}

/** Formato usado no painel de chat aberto. */
export function toConversaDetalhe(c: ConversaDetalhe) {
  return {
    id: c.id,
    canal: c.canal,
    status: c.status,
    assunto: c.assunto,
    naoLidas: c.naoLidas,
    criadoEm: c.criadoEm,
    atribuidoEm: c.atribuidoEm,
    finalizadoEm: c.finalizadoEm,
    ultimaMensagemEm: c.ultimaMensagemEm,
    contato: c.contato,
    fila: c.fila,
    agente: c.agente,
    mensagens: c.mensagens.map(toMensagem),
  };
}
