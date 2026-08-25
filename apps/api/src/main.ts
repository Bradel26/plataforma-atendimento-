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
import './modules/voice/voice.worker';
import { agendarExpurgo } from './modules/lgpd/agendador';
import { criarServidorRealtime } from './realtime/server';

// O Socket.IO precisa do servidor HTTP cru, por isso nao usamos app.listen().
const server = createServer(createApp());
const io = criarServidorRealtime(server);

avisarChaveDerivada();

// Worker embutido: comodo em desenvolvimento, indesejado em producao. Quando
// desligado, quem consome a fila e dist/src/worker.js, e o expurgo da LGPD vai
// com ele — sao os dois trabalhos de fundo.
const pararWorker = env.WORKER_EMBUTIDO ? (agendarExpurgo(), iniciarWorker()) : async () => {};

if (!env.WORKER_EMBUTIDO) console.log('Worker embutido desligado: suba o processo do worker separadamente.');

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
