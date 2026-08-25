import { defineConfig } from 'vitest/config';

/**
 * Testes de unidade das funcoes puras.
 *
 * O que depende de Postgres, Redis ou da Graph API continua coberto pelos smoke
 * tests (`npm run smoke:*`), que exercitam a API de pe. A divisao e proposital:
 * teste de unidade aqui roda em segundos, sem infraestrutura, e cabe no CI.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['apps/*/src/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    reporters: 'default',
  },
});
