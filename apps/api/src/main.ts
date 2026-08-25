import { createServer } from 'node:http';
import { createApp } from './app';
import { env } from './env';
import { avisarChaveDerivada } from './lib/crypto-box';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';
import { iniciarWorker } from './lib/fila';
// Importar registra os handlers da fila (efeito de modulo).
import './modules/campaigns/campaigns.worker';
import './modules/surveys/surveys.worker';
import { agendarExpurgo } from './modules/lgpd/agendador';
import { criarServidorRealtime } from './realtime/server';

// O Socket.IO precisa do servidor HTTP cru, por isso nao usamos app.listen().
const server = createServer(createApp());
const io = criarServidorRealtime(server);

avisarChaveDerivada();
agendarExpurgo();
const pararWorker = iniciarWorker();

server.listen(env.PORT, () => {
  console.log(`API ouvindo em http://localhost:${env.PORT} (${env.NODE_ENV})`);
  console.log(`WebSocket em ws://localhost:${env.PORT}/socket.io`);
});

async function shutdown(signal: string) {
  console.log(`\n${signal} recebido, encerrando...`);
  server.close();
  await io.close();
  await Promise.allSettled([pararWorker(), prisma.$disconnect(), redis.quit()]);
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
