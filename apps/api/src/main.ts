import { createServer } from 'node:http';
import { createApp } from './app';
import { env } from './env';
import { avisarChaveDerivada } from './lib/crypto-box';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';
import { agendarExpurgo } from './modules/lgpd/agendador';
import { criarServidorRealtime } from './realtime/server';

// O Socket.IO precisa do servidor HTTP cru, por isso nao usamos app.listen().
const server = createServer(createApp());
const io = criarServidorRealtime(server);

avisarChaveDerivada();
agendarExpurgo();

server.listen(env.PORT, () => {
  console.log(`API ouvindo em http://localhost:${env.PORT} (${env.NODE_ENV})`);
  console.log(`WebSocket em ws://localhost:${env.PORT}/socket.io`);
});

async function shutdown(signal: string) {
  console.log(`\n${signal} recebido, encerrando...`);
  server.close();
  await io.close();
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
