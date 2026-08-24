import { io, type Socket } from 'socket.io-client';

/** Espelho de apps/api/src/realtime/events.ts. */
export const EVENTOS = {
  conversaNova: 'conversa:nova',
  conversaAtualizada: 'conversa:atualizada',
  mensagemNova: 'mensagem:nova',
  agenteStatus: 'agente:status',
  protocoloAtualizado: 'protocolo:atualizado',
} as const;

/**
 * Conecta como usuario interno (access token) ou como visitante do webchat
 * (token de sessao). O path do socket passa pelo proxy do Vite em dev.
 */
export function conectar(credencial: { token: string } | { sessao: string }): Socket {
  return io({
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: credencial,
  });
}
