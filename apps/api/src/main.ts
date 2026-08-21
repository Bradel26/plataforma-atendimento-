import { createApp } from './app';
import { env } from './env';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';

const server = createApp().listen(env.PORT, () => {
  console.log(`API ouvindo em http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

async function shutdown(signal: string) {
  console.log(`\n${signal} recebido, encerrando...`);
  server.close();
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
