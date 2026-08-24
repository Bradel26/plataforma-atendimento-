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
} as const;

/** Salas: um agente escuta as filas dele e a propria caixa; gestao escuta tudo. */
export const salas = {
  usuario: (id: string) => `usuario:${id}`,
  fila: (id: string) => `fila:${id}`,
  conversa: (id: string) => `conversa:${id}`,
  supervisao: 'supervisao',
} as const;
