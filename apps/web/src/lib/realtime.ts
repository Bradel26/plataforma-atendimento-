import { io, type Socket } from 'socket.io-client';

/** Espelho de apps/api/src/realtime/events.ts. */
export const EVENTOS = {
  conversaNova: 'conversa:nova',
  conversaAtualizada: 'conversa:atualizada',
  mensagemNova: 'mensagem:nova',
  agenteStatus: 'agente:status',
  protocoloAtualizado: 'protocolo:atualizado',
  chamadaAtualizada: 'chamada:atualizada',
  canalStatus: 'canal:status',
  /** ChatPreview criada ou atualizada (Fase 11.7) -- so chega a quem e dono daquela linha pessoal. */
  previaAtualizada: 'previa:atualizada',
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
