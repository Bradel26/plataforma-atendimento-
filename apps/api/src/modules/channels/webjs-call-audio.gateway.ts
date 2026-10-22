import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { env } from '../../env';
import { prisma } from '../../lib/prisma';
import { comOrganizacao } from '../../lib/tenant';
import { consumirTicketWebJsCall } from './webjs-call-ticket';

const CAMINHO = '/api/canais/whatsapp/chamadas/audio';

function rejeitar(socket: Duplex, codigo = 401, texto = 'Unauthorized') {
  if (socket.destroyed) return;
  socket.write(`HTTP/1.1 ${codigo} ${texto}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function origemPermitida(req: IncomingMessage) {
  const origem = req.headers.origin;
  if (!origem) return env.NODE_ENV !== 'production';
  return origem === env.WEB_ORIGIN;
}

/**
 * Faz o áudio WebSocket passar pelo mesmo domínio HTTPS da plataforma.
 * O navegador só recebe um ticket de uso único; nunca recebe o token interno
 * do conector nem escolhe o identificador da sessão WhatsApp.
 */
export function registrarGatewayDeAudioWebJs(server: HttpServer) {
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 64 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname !== CAMINHO) return;
    if (!origemPermitida(req)) return rejeitar(socket, 403, 'Forbidden');
    const ticket = url.searchParams.get('ticket') || '';

    void (async () => {
      const dados = await consumirTicketWebJsCall(ticket);
      if (!dados) return rejeitar(socket);

      const config = await comOrganizacao(dados.organizacaoId, () =>
        prisma.channelConfig.findFirst({
          where: { id: dados.canalConfigId, canal: 'WHATSAPP', ponteSessao: dados.sessao, ativo: true, modo: 'NAO_OFICIAL' },
          select: { id: true, donoId: true },
        }),
      );
      if (!config || (config.donoId && config.donoId !== dados.usuarioId)) return rejeitar(socket, 403, 'Forbidden');

      wss.handleUpgrade(req, socket, head, (browserSocket) => {
        const port = process.env.WEBJS_LOCAL_PORT?.trim() || '4174';
        const upstream = new WebSocket(`ws://127.0.0.1:${port}/audio?session=${encodeURIComponent(dados.sessao)}`);
        upstream.binaryType = 'arraybuffer';
        browserSocket.binaryType = 'arraybuffer';

        const fecharPonte = () => {
          if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) upstream.close();
        };
        browserSocket.on('message', (data, isBinary) => {
          if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
        });
        upstream.on('message', (data, isBinary) => {
          if (browserSocket.readyState === WebSocket.OPEN) browserSocket.send(data, { binary: isBinary });
        });
        browserSocket.on('close', fecharPonte);
        browserSocket.on('error', fecharPonte);
        upstream.on('close', () => browserSocket.close());
        upstream.on('error', () => browserSocket.close(1011, 'Serviço de áudio indisponível'));
      });
    })().catch((erro) => {
      console.error('[webjs-call] Falha ao autorizar o canal de áudio:', erro instanceof Error ? erro.message : 'erro interno');
      rejeitar(socket, 503, 'Service Unavailable');
    });
  });

  return wss;
}
