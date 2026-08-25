/**
 * Worker em processo separado.
 *
 * Rodar a fila dentro da API custa em dois momentos: um lote grande de campanha
 * disputa CPU com quem esta sendo atendido, e reiniciar a API mata o worker no
 * meio do trabalho. Aqui e o mesmo codigo, o mesmo Redis e a mesma imagem —
 * so o processo e outro.
 *
 * Em producao: `node dist/src/worker.js` com WORKER_EMBUTIDO=false na API.
 * Em desenvolvimento a API continua com o worker embutido, para `npm run dev`
 * seguir sendo um comando.
 */
import { env } from './env';
import { avisarChaveDerivada } from './lib/crypto-box';
import { iniciarWorker } from './lib/fila';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';
// Importar registra os handlers da fila (efeito de modulo). Sem estes imports o
// worker sobe e manda todo trabalho para a lista de mortos por falta de handler.
import './modules/campaigns/campaigns.worker';
import './modules/surveys/surveys.worker';
import './modules/voice/voice.worker';
import { agendarExpurgo } from './modules/lgpd/agendador';

avisarChaveDerivada();

// O expurgo da LGPD roda aqui, nao na API: e trabalho de fundo, e o lock em
// Redis garante que uma unica instancia execute mesmo com varios workers.
agendarExpurgo();

const pararWorker = iniciarWorker();

console.log(`Worker da fila iniciado (${env.NODE_ENV})`);

async function encerrar(sinal: string) {
  console.log(`\n${sinal} recebido, encerrando o worker...`);
  // Ordem importa: para de consumir antes de fechar banco e Redis, senao o
  // trabalho em andamento morre no meio de uma consulta.
  await pararWorker();
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  process.exit(0);
}

process.on('SIGINT', () => void encerrar('SIGINT'));
process.on('SIGTERM', () => void encerrar('SIGTERM'));
