import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { env } from '../env';
import { prisma } from '../lib/prisma';
import { conversaVisivel } from '../lib/politicas';
import { comOrganizacao } from '../lib/tenant';
import { verifyAccessToken, verifyWebchatToken, type AccessPayload } from '../lib/tokens';
import { validarSessao } from '../lib/sessao';
import { AppError } from '../lib/errors';
import { registrarIo } from './hub';
import { criarRevalidador } from './revalidacao';
import { salas } from './events';

type DadosSocket = {
  usuario?: AccessPayload;
  conversaId?: string;
  /** Organizacao do visitante do webchat (o usuario interno traz a dele no token). */
  org?: string;
};

export type CredencialDoHandshake = { token?: string; sessao?: string };

/**
 * Situacao da sessao de um socket ja aberto. `indisponivel` (banco fora) e
 * diferente de `revogada`: nao se derruba quem esta conectado por uma falha
 * transitoria, mas tambem nao se concede nada novo.
 */
export async function situacaoDaSessao(usuario: AccessPayload): Promise<'valida' | 'revogada' | 'indisponivel'> {
  try {
    await validarSessao(usuario);
    return 'valida';
  } catch (erro) {
    return erro instanceof AppError && erro.status === 401 ? 'revogada' : 'indisponivel';
  }
}

/**
 * Valida a credencial do handshake e devolve o que vai para `socket.data`.
 *
 * O token de usuario passa tambem pela versao de sessao: sem isso, quem teve a
 * conta desativada ou o perfil rebaixado reconectaria com o token antigo (ate 15
 * min) e voltaria a entrar nas salas do perfil que tinha. A verificacao vale so
 * no handshake — a conexao ja aberta e encerrada por evento de revogacao
 * (`desconectarUsuario`), nao por expiracao do token (risco residual conhecido).
 */
export async function autenticarHandshake({ token, sessao }: CredencialDoHandshake): Promise<DadosSocket> {
  if (token) {
    const usuario = verifyAccessToken(token);
    await validarSessao(usuario);
    return { usuario };
  }
  if (sessao) {
    const visitante = verifyWebchatToken(sessao);
    return { conversaId: visitante.conversaId, org: visitante.org };
  }
  throw new Error('Credencial ausente');
}

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
    try {
      Object.assign(socket.data, await autenticarHandshake(socket.handshake.auth as CredencialDoHandshake));
      return next();
    } catch (err) {
      return next(err instanceof Error ? err : new Error('Credencial inválida'));
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

    if (usuario.perfil === 'ADMIN') {
      await socket.join(salas.admin(org));
    } else if (usuario.perfil === 'SUPERVISOR') {
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

    // Uma revogacao que chegou ENTRE o handshake e os joins acima nao encontrou
    // este socket nas salas (`desconectarUsuario` mira a sala do usuario): sem esta
    // segunda conferencia ele ficaria com as salas do perfil antigo ate reconectar.
    if ((await situacaoDaSessao(usuario)) === 'revogada') return socket.disconnect(true);

    /**
     * Abre/fecha a conversa em foco para receber mensagens em tempo real.
     *
     * O id vem do cliente, mas o prefixo da sala vem da credencial: pedir a
     * conversa de outra empresa entra numa sala que nao existe, e nao na dela.
     */
    socket.on('conversa:entrar', async (id: string) => {
      if (typeof id !== 'string' || !id) return;
      // O socket aberto nao e revalidado por expiracao; entrar numa conversa e o
      // ponto em que ele pede algo novo, e aqui a sessao e conferida (cache de 5 s).
      // Revogada: encerra. Banco fora: nao concede, mas tambem nao derruba.
      const situacao = await situacaoDaSessao(usuario);
      if (situacao === 'revogada') return void socket.disconnect(true);
      if (situacao !== 'valida') return;
      // Mesma politica da lista e do acesso por id: sem isto, qualquer usuario
      // da organizacao escutaria as mensagens de qualquer conversa pelo id.
      const pode = await comOrganizacao(org, () => conversaVisivel(id), {
        id: usuario.sub,
        perfil: usuario.perfil,
      }).catch(() => false);
      if (pode) await socket.join(salas.conversa(org, id));
    });
    socket.on('conversa:sair', async (id: string) => {
      if (typeof id === 'string' && id) await socket.leave(salas.conversa(org, id));
    });
  });

  registrarIo(io);

  // Revalida periodicamente os sockets DESTA instancia (alternativa D): cobre a
  // revogacao feita em outra instancia, que `desconectarUsuario` nao alcanca.
  const revalidador = criarRevalidador({ io, situacao: situacaoDaSessao });
  revalidador.iniciar();
  httpServer.once('close', () => revalidador.parar());

  return io;
}
