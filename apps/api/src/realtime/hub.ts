import type { Server } from 'socket.io';
import { EVENTOS, salas } from './events';

/**
 * Ponte entre os services (que nao conhecem o Socket.IO) e o servidor de sockets.
 * O servidor registra a instancia no bootstrap; antes disso os emits sao no-op,
 * o que mantem os services testaveis sem WebSocket.
 */
let io: Server | null = null;

export const registrarIo = (instancia: Server) => {
  io = instancia;
};

type Destinos = {
  filaId?: string | null;
  agenteId?: string | null;
  conversaId?: string | null;
  /** Agente que deixou de ser responsavel (transferencia) — precisa remover da lista dele. */
  agenteAnteriorId?: string | null;
};

/**
 * Emite para todos os interessados numa conversa: a fila dela, o agente
 * responsavel, quem esta com a conversa aberta e a gestao.
 */
function emitir(evento: string, payload: unknown, destinos: Destinos) {
  if (!io) return;

  const alvos = new Set<string>([salas.supervisao]);
  if (destinos.filaId) alvos.add(salas.fila(destinos.filaId));
  if (destinos.agenteId) alvos.add(salas.usuario(destinos.agenteId));
  if (destinos.agenteAnteriorId) alvos.add(salas.usuario(destinos.agenteAnteriorId));
  if (destinos.conversaId) alvos.add(salas.conversa(destinos.conversaId));

  io.to([...alvos]).emit(evento, payload);
}

export const notificarConversaNova = (conversa: unknown, destinos: Destinos) =>
  emitir(EVENTOS.conversaNova, conversa, destinos);

export const notificarConversaAtualizada = (conversa: unknown, destinos: Destinos) =>
  emitir(EVENTOS.conversaAtualizada, conversa, destinos);

export const notificarMensagem = (payload: unknown, destinos: Destinos) =>
  emitir(EVENTOS.mensagemNova, payload, destinos);

/** Chamados: interessa ao responsavel, a fila e a gestao. */
export const notificarProtocolo = (
  protocolo: unknown,
  destinos: { responsavelId?: string | null; filaId?: string | null },
) => emitir(EVENTOS.protocoloAtualizado, protocolo, { agenteId: destinos.responsavelId, filaId: destinos.filaId });

export const notificarStatusAgente = (payload: unknown) => {
  io?.to(salas.supervisao).emit(EVENTOS.agenteStatus, payload);
};
