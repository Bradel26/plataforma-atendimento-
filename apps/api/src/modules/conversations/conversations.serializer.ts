import type { Prisma } from '@prisma/client';
import { urlAssinada } from '../../lib/storage';
import { codificarCursor } from '../../lib/paginacao';

export const inclusaoResumo = {
  contato: true,
  fila: { select: { id: true, nome: true } },
  agente: { select: { id: true, nome: true } },
  mensagens: { orderBy: { criadoEm: 'desc' }, take: 1 },
} satisfies Prisma.ConversationInclude;

/** Ultimas mensagens da conversa. O resto vem por `GET /conversas/:id/mensagens`. */
export const MENSAGENS_NO_DETALHE = 50;

export const inclusaoDetalhe = {
  contato: true,
  fila: { select: { id: true, nome: true } },
  agente: { select: { id: true, nome: true } },
  // Busca as mais recentes (desc) e inverte na serializacao: um atendimento com
  // dois anos de historico nao pode chegar inteiro a cada abertura do painel.
  mensagens: { orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }], take: MENSAGENS_NO_DETALHE + 1 },
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
    // Vai no resumo, e nao so no detalhe: o chip aparece na propria lista, que e
    // onde o atendente decide qual conversa abrir.
    tags: c.tags,
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
  const temMais = c.mensagens.length > MENSAGENS_NO_DETALHE;
  const pagina = c.mensagens.slice(0, MENSAGENS_NO_DETALHE);
  const maisAntiga = pagina.at(-1);

  return {
    id: c.id,
    canal: c.canal,
    status: c.status,
    assunto: c.assunto,
    tags: c.tags,
    naoLidas: c.naoLidas,
    criadoEm: c.criadoEm,
    atribuidoEm: c.atribuidoEm,
    finalizadoEm: c.finalizadoEm,
    ultimaMensagemEm: c.ultimaMensagemEm,
    contato: c.contato,
    fila: c.fila,
    agente: c.agente,
    /**
     * Ordem cronologica para a tela. O registro extra (take + 1) nao vai para o
     * cliente: ele so serve para dizer se ha historico anterior.
     */
    mensagens: pagina.reverse().map(toMensagem),
    temHistoricoAnterior: temMais,
    /**
     * Ponto de partida para buscar o historico anterior. Vai pronto no detalhe
     * para a tela nao precisar de uma requisicao extra so para descobrir o
     * cursor — e porque cursor e opaco, o cliente nao poderia montar sozinho.
     */
    cursorAnterior: temMais && maisAntiga ? codificarCursor({ valor: maisAntiga.criadoEm, id: maisAntiga.id }) : null,
  };
}
