import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { env } from '../env';
import { prisma } from '../lib/prisma';
import { verifyAccessToken, verifyWebchatToken, type AccessPayload } from '../lib/tokens';
import { registrarIo } from './hub';
import { salas } from './events';

type DadosSocket = {
  usuario?: AccessPayload;
  conversaId?: string;
};

/**
 * Handshake aceita dois tipos de cliente:
 *  - agente/supervisor: { auth: { token } } com o access token JWT
 *  - visitante do webchat: { auth: { sessao } } com o token da sessao
 */
export function criarServidorRealtime(httpServer: HttpServer) {
  const io = new Server<Record<string, never>, Record<string, never>, Record<string, never>, DadosSocket>(
    httpServer,
    { cors: { origin: env.WEB_ORIGIN, credentials: true }, path: '/socket.io' },
  );

  io.use(async (socket, next) => {
    const { token, sessao } = socket.handshake.auth as { token?: string; sessao?: string };

    try {
      if (token) {
        socket.data.usuario = verifyAccessToken(token);
        return next();
      }
      if (sessao) {
        socket.data.conversaId = verifyWebchatToken(sessao).conversaId;
        return next();
      }
      return next(new Error('Credencial ausente'));
    } catch (err) {
      return next(err instanceof Error ? err : new Error('Credencial invalida'));
    }
  });

  io.on('connection', async (socket) => {
    const { usuario, conversaId } = socket.data;

    // Visitante do webchat: escuta apenas a propria conversa.
    if (conversaId) {
      await socket.join(salas.conversa(conversaId));
      return;
    }
    if (!usuario) return socket.disconnect(true);

    await socket.join(salas.usuario(usuario.sub));

    if (usuario.perfil === 'ADMIN' || usuario.perfil === 'SUPERVISOR') {
      await socket.join(salas.supervisao);
    } else {
      // Agente escuta as filas em que esta vinculado.
      const vinculos = await prisma.queueAgent.findMany({
        where: { usuarioId: usuario.sub },
        select: { filaId: true },
      });
      await Promise.all(vinculos.map((v) => socket.join(salas.fila(v.filaId))));
    }

    /** Abre/fecha a conversa em foco para receber mensagens em tempo real. */
    socket.on('conversa:entrar', async (id: string) => {
      if (typeof id === 'string' && id) await socket.join(salas.conversa(id));
    });
    socket.on('conversa:sair', async (id: string) => {
      if (typeof id === 'string' && id) await socket.leave(salas.conversa(id));
    });
  });

  registrarIo(io);
  return io;
}
