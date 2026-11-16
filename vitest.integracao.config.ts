import { defineConfig } from 'vitest/config';

/**
 * Testes de INTEGRACAO com PostgreSQL real (`*.integracao.test.ts`).
 *
 * Ficam fora de `npm test` (ver `vitest.config.ts`): exigem um banco local e
 * descartavel e criam/apagam dados. Rodam com `npm run test:integracao`, depois de
 * `npm run test:integracao:preparar`. Um arquivo por vez: eles compartilham o banco.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['apps/*/src/**/*.integracao.test.ts'],
    setupFiles: ['tests/setup-integracao.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    reporters: 'default',
  },
});
