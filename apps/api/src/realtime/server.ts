import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { env } from '../env';
import { prisma } from '../lib/prisma';
import { comOrganizacao } from '../lib/tenant';
import { verifyAccessToken, verifyWebchatToken, type AccessPayload } from '../lib/tokens';
import { registrarIo } from './hub';
import { salas } from './events';

type DadosSocket = {
  usuario?: AccessPayload;
  conversaId?: string;
  /** Organizacao do visitante do webchat (o usuario interno traz a dele no token). */
  org?: string;
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
        const visitante = verifyWebchatToken(sessao);
        socket.data.conversaId = visitante.conversaId;
        socket.data.org = visitante.org;
        return next();
      }
      return next(new Error('Credencial ausente'));
    } catch (err) {
      return next(err instanceof Error ? err : new Error('Credencial invalida'));
    }
  });

  io.on('connection', async (socket) => {
    const { usuario, conversaId } = socket.data;

    // A organizacao vem da credencial, nunca de dado enviado pelo cliente: e ela
    // que prefixa toda sala, e um socket que pudesse escolher o prefixo escolheria
    // qual empresa escutar.
    const org: string | undefined = usuario?.org ?? socket.data.org;
    if (!org) return socket.disconnect(true);

    // Visitante do webchat: escuta apenas a propria conversa.
    if (conversaId) {
      await socket.join(salas.conversa(org, conversaId));
      return;
    }
    if (!usuario) return socket.disconnect(true);

    await socket.join(salas.usuario(org, usuario.sub));

    if (usuario.perfil === 'ADMIN' || usuario.perfil === 'SUPERVISOR') {
      await socket.join(salas.supervisao(org));
    } else {
      // Agente escuta as filas em que esta vinculado. A consulta roda no contexto
      // da organizacao dele: um vinculo de outra empresa nao apareceria nem se
      // existisse.
      const vinculos = await comOrganizacao(org, () =>
        prisma.queueAgent.findMany({
          where: { usuarioId: usuario.sub },
          select: { filaId: true },
        }),
      );
      await Promise.all(vinculos.map((v) => socket.join(salas.fila(org, v.filaId))));
    }

    /**
     * Abre/fecha a conversa em foco para receber mensagens em tempo real.
     *
     * O id vem do cliente, mas o prefixo da sala vem da credencial: pedir a
     * conversa de outra empresa entra numa sala que nao existe, e nao na dela.
     */
    socket.on('conversa:entrar', async (id: string) => {
      if (typeof id === 'string' && id) await socket.join(salas.conversa(org, id));
    });
    socket.on('conversa:sair', async (id: string) => {
      if (typeof id === 'string' && id) await socket.leave(salas.conversa(org, id));
    });
  });

  registrarIo(io);
  return io;
}
