/**
 * Preparacao dos testes de integracao com PostgreSQL real.
 *
 * Falha ALTO (nao pula em silencio) se TEST_DATABASE_URL nao for um banco local e
 * descartavel, e SOBRESCREVE DATABASE_URL/DIRECT_URL com ela — um `.env` ou uma
 * variavel herdada apontando para o Neon nunca chega ao cliente Prisma.
 */
import './setup';
import { validarUrlDeBancoDeTeste } from '../apps/api/src/lib/banco-teste';

const guarda = validarUrlDeBancoDeTeste(process.env.TEST_DATABASE_URL);
if (!guarda.ok) {
  throw new Error(
    `Testes de integracao recusados: ${guarda.motivo}. ` +
      'Suba um PostgreSQL local descartavel, aplique as migrations (npm run test:integracao:preparar) ' +
      'e defina TEST_DATABASE_URL. Veja docs/seguranca/testes-integracao-postgres.md.',
  );
}

process.env.DATABASE_URL = guarda.url;
process.env.DIRECT_URL = guarda.url;
