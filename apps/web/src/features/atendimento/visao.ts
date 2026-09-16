import type { ConversaResumo, ConversaStatus } from '../../lib/types';

/**
 * As tres visoes da Inbox (Fase 11.3) — uma camada ACIMA de `ConversaStatus`,
 * nao um substituto dele: `Conversation.status` continua tendo os quatro
 * valores de sempre (`EM_ESPERA`, `ATRIBUIDO`, `EM_ATENDIMENTO`, `FINALIZADO`),
 * e a visao so escolhe COMO consultar/filtrar essas conversas, do mesmo jeito
 * que WhatsApp Web tem "conversas" e nao um status por chat.
 */
export type VisaoInbox = 'MINHAS' | 'NAO_ATRIBUIDAS' | 'TODAS';

export const VISOES_INBOX: readonly VisaoInbox[] = ['MINHAS', 'NAO_ATRIBUIDAS', 'TODAS'];

export const LABEL_VISAO_INBOX: Record<VisaoInbox, string> = {
  MINHAS: 'Minhas',
  NAO_ATRIBUIDAS: 'Nao atribuidas',
  TODAS: 'Todas',
};

/**
 * Parametros de `GET /conversas` para cada visao.
 *
 * Nao inventa filtro novo: `status` e `minhas` sao os dois parametros que
 * `listarConversasSchema`/`listarConversas` (conversations.service.ts) ja
 * aceitavam antes desta fase. Quem decide o que cabe em cada um continua
 * sendo `politicaConversas.filtro`, no backend — esta funcao so escolhe QUAIS
 * dos dois parametros existentes mandar, nunca reimplementa a regra deles.
 *
 * "Nao atribuidas" usa so `status=EM_ESPERA`, sem precisar de um filtro novo
 * de "sem agente": no schema atual, toda transicao PARA `EM_ESPERA` zera o
 * agente no mesmo `update` (`inbound.service.ts`, `conversations.service.ts`
 * — `transferirConversa` devolvendo para fila) — nunca existe conversa
 * `EM_ESPERA` com agente. `status=EM_ESPERA` e "sem agente" sao a mesma coisa.
 */
export function parametrosDaVisao(visao: VisaoInbox): { status?: ConversaStatus; minhas?: true } {
  switch (visao) {
    case 'MINHAS':
      return { minhas: true };
    case 'NAO_ATRIBUIDAS':
      return { status: 'EM_ESPERA' };
    case 'TODAS':
      return {};
  }
}

/**
 * Uma conversa que chegou por evento de socket pertence a visao ativa?
 *
 * So decide ENTRE as visoes — nunca decide visibilidade. O servidor so manda
 * o evento (`conversa:nova`/`conversa:atualizada`) para quem ja esta na sala
 * certa (fila, agente ou supervisao — ver `realtime/hub.ts`), entao chegar
 * aqui ja significa que a politica de visibilidade liberou a conversa para
 * este usuario. Esta funcao so escolhe a ABA, do mesmo jeito que a politica
 * ja escolheu a SALA — nenhuma regra de organizacao, perfil ou fila e
 * reimplementada aqui.
 */
export function pertenceAVisao(
  conversa: Pick<ConversaResumo, 'status' | 'agente'>,
  visao: VisaoInbox,
  meuUsuarioId: string | null,
): boolean {
  switch (visao) {
    case 'MINHAS':
      return conversa.agente?.id === meuUsuarioId;
    case 'NAO_ATRIBUIDAS':
      return conversa.status === 'EM_ESPERA';
    case 'TODAS':
      return true;
  }
}

/**
 * Pertence a LISTA (visao + arquivamento), nao so a visao — usada pelo
 * handler de eventos de socket (Fase 11.9-B).
 *
 * Arquivada sai de TODAS as tres visoes, sempre, antes de qualquer outra
 * regra: a consulta inicial (`GET /conversas` sem `arquivadas=true`) ja
 * exclui arquivadas por padrao no backend, mas o evento de socket carrega a
 * conversa inteira sem saber qual filtro a tela pediu — sem esta checagem,
 * arquivar uma conversa a deixaria visivel ate a proxima consulta em vez de
 * sumir na hora, em qualquer uma das tres abas.
 */
export function pertenceALista(
  conversa: Pick<ConversaResumo, 'status' | 'agente' | 'arquivada'>,
  visao: VisaoInbox,
  meuUsuarioId: string | null,
): boolean {
  if (conversa.arquivada) return false;
  return pertenceAVisao(conversa, visao, meuUsuarioId);
}
