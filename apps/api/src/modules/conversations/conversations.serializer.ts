import type { Message, Prisma } from '@prisma/client';
import { urlAssinada } from '../../lib/storage';
import { codificarCursor } from '../../lib/paginacao';

const autorDaMensagem = { autorUsuario: { select: { nome: true } } } satisfies Prisma.MessageInclude;

export const inclusaoResumo = {
  contato: true,
  fila: { select: { id: true, nome: true } },
  agente: { select: { id: true, nome: true } },
  atendenteInicial: { select: { id: true, nome: true } },
  canalConfig: { select: { id: true, donoId: true, iaAtiva: true, nome: true, modo: true } },
  mensagens: { orderBy: { criadoEm: 'desc' }, take: 1, include: autorDaMensagem },
} satisfies Prisma.ConversationInclude;

/** Ultimas mensagens da conversa. O resto vem por `GET /conversas/:id/mensagens`. */
export const MENSAGENS_NO_DETALHE = 50;

export const inclusaoDetalhe = {
  contato: true,
  fila: { select: { id: true, nome: true } },
  agente: { select: { id: true, nome: true } },
  atendenteInicial: { select: { id: true, nome: true } },
  canalConfig: { select: { id: true, donoId: true, iaAtiva: true, nome: true, modo: true } },
  // Busca as mais recentes (desc) e inverte na serializacao: um atendimento com
  // dois anos de historico nao pode chegar inteiro a cada abertura do painel.
  mensagens: {
    orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
    take: MENSAGENS_NO_DETALHE + 1,
    include: autorDaMensagem,
  },
} satisfies Prisma.ConversationInclude;

export { autorDaMensagem };

type ConversaResumo = Prisma.ConversationGetPayload<{ include: typeof inclusaoResumo }>;
type ConversaDetalhe = Prisma.ConversationGetPayload<{ include: typeof inclusaoDetalhe }>;

/** Mensagem como sai do banco; `autorUsuario` so vem quando a consulta incluiu. */
export type MensagemSerializavel = Message & { autorUsuario?: { nome: string } | null };

export function toMensagem(m: MensagemSerializavel) {
  return {
    id: m.id,
    conversaId: m.conversaId,
    autor: m.autor,
    autorId: m.autorId,
    autorNome: m.autorUsuario?.nome ?? null,
    conteudo: m.conteudo,
    tipoAnexo: m.tipoAnexo,
    anexoUrl: m.anexoUrl ? urlAssinada(m.anexoUrl) : null,
    interno: m.interno,
    evento: m.evento,
    enviadaPorDispositivo: m.enviadaPorDispositivo,
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
    arquivada: c.arquivada,
    criadoEm: c.criadoEm,
    atribuidoEm: c.atribuidoEm,
    finalizadoEm: c.finalizadoEm,
    ultimaMensagemEm: c.ultimaMensagemEm,
    protocolo: c.protocolo,
    origem: c.origem,
    atendenteInicial: c.atendenteInicial,
    contato: { id: c.contato.id, nome: c.contato.nome, email: c.contato.email, telefone: c.contato.telefone },
    fila: c.fila,
    agente: c.agente,
    // null = conversa sem canal configurado (ex. Webchat) — nao confundir
    // com false ("IA desligada"), que so se aplica quando ha canal.
    iaAtiva: c.canalConfig?.iaAtiva ?? null,
    modoWhatsApp: c.canal === 'WHATSAPP' ? (c.canalConfig?.modo ?? 'OFICIAL') : null,
    // De qual numero a conversa e — decide a aba (Minhas/Fila/Acompanhar).
    // Nulo = Numero da empresa sem linha registrada.
    linha: c.canalConfig ? { id: c.canalConfig.id, donoId: c.canalConfig.donoId, nome: c.canalConfig.nome } : null,
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
    arquivada: c.arquivada,
    criadoEm: c.criadoEm,
    atribuidoEm: c.atribuidoEm,
    finalizadoEm: c.finalizadoEm,
    ultimaMensagemEm: c.ultimaMensagemEm,
    protocolo: c.protocolo,
    origem: c.origem,
    atendenteInicial: c.atendenteInicial,
    contato: c.contato,
    fila: c.fila,
    agente: c.agente,
    // null = conversa sem canal configurado (ex. Webchat) — nao confundir
    // com false ("IA desligada"), que so se aplica quando ha canal.
    iaAtiva: c.canalConfig?.iaAtiva ?? null,
    modoWhatsApp: c.canal === 'WHATSAPP' ? (c.canalConfig?.modo ?? 'OFICIAL') : null,
    // De qual numero a conversa e — decide a aba (Minhas/Fila/Acompanhar).
    // Nulo = Numero da empresa sem linha registrada.
    linha: c.canalConfig ? { id: c.canalConfig.id, donoId: c.canalConfig.donoId, nome: c.canalConfig.nome } : null,
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

/**
 * Remove notas internas das mensagens de um detalhe ja serializado.
 *
 * `toConversaDetalhe` continua devolvendo tudo (o PainelChat da equipe PRECISA
 * ver as notas internas) — este filtro e para os caminhos que expoem esse
 * detalhe a alguem de fora da equipe: o visitante do Webchat (REST) e a sala
 * de socket da conversa, que o visitante tambem escuta (tempo real).
 */
export function semNotasInternas<T extends { mensagens: { interno: boolean }[] }>(detalhe: T): T {
  return { ...detalhe, mensagens: detalhe.mensagens.filter((m) => !m.interno) };
}
