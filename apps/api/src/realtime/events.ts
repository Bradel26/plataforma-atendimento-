/**
 * Contrato de eventos do WebSocket. Mantenha em sincronia com
 * apps/web/src/lib/realtime.ts — as duas pontas usam os mesmos nomes.
 */
export const EVENTOS = {
  /** Conversa entrou na fila (novo atendimento aguardando). */
  conversaNova: 'conversa:nova',
  /** Status, agente ou fila da conversa mudou. */
  conversaAtualizada: 'conversa:atualizada',
  /** Nova mensagem numa conversa. */
  mensagemNova: 'mensagem:nova',
  /** Agente mudou de status de presenca. */
  agenteStatus: 'agente:status',
  /** Chamado criado ou alterado (status, comentario, anexo, agendamento). */
  protocoloAtualizado: 'protocolo:atualizado',
  /** Chamada de voz criada ou com status alterado. */
  chamadaAtualizada: 'chamada:atualizada',
} as const;

/**
 * Salas: um agente escuta as filas dele e a propria caixa; gestao escuta tudo
 * **da organizacao dele**.
 *
 * Todo nome comeca pela organizacao, inclusive os que ja tinham id proprio. O
 * caso que obrigou isso foi `supervisao`, que era um nome fixo: todo ADMIN e
 * SUPERVISOR entrava nele, e com duas empresas na mesma instalacao o supervisor
 * de uma recebia em tempo real cada mensagem e cada transferencia da outra —
 * sem nenhuma requisicao HTTP no caminho para filtrar.
 */
export const salas = {
  usuario: (org: string, id: string) => `org:${org}:usuario:${id}`,
  fila: (org: string, id: string) => `org:${org}:fila:${id}`,
  conversa: (org: string, id: string) => `org:${org}:conversa:${id}`,
  supervisao: (org: string) => `org:${org}:supervisao`,
} as const;
