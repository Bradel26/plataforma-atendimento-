import Redis from 'ioredis';
import { env } from '../env';

/**
 * Prefixo efetivo das chaves.
 *
 * `keyPrefix` do ioredis e aplicado pelo proprio cliente em toda chave, entao
 * nao ha lugar no codigo de onde esquecer — e o mesmo motivo pelo qual o filtro
 * de organizacao vive na extensao do Prisma e nao em cada consulta.
 *
 * Em desenvolvimento o padrao e `dev:` porque o `.env` local e o de producao
 * apontam para o mesmo Upstash: sem isto, os dois workers disputam a mesma fila
 * e cada um descarta em silencio o trabalho do outro.
 */
const prefixo = env.REDIS_PREFIXO || (env.NODE_ENV === 'development' ? 'dev' : '');

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
  keyPrefix: prefixo ? `${prefixo}:` : undefined,
});

if (prefixo) console.log(`[redis] chaves com prefixo "${prefixo}:"`);

redis.on('error', (err) => {
  console.error('[redis] erro de conexao:', err.message);
});
