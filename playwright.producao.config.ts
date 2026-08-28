import { defineConfig, devices } from '@playwright/test';

/**
 * Teste de navegador contra produção.
 *
 * Separado do `playwright.config.ts` de propósito: a suíte de desenvolvimento
 * cria e move conversas, muda status de agente e registra atividades. Rodar
 * aquilo contra produção seria sujar a base de quem usa o sistema. O que vive
 * aqui é **somente leitura** — abre endereço, confere o que apareceu na tela.
 *
 * A URL vem de `E2E_BASE_URL` e as credenciais de um arquivo `.env`, nunca da
 * linha de comando:
 *
 *   E2E_BASE_URL=https://... ENV_PRODUCAO=apps/api/.env.coolify \
 *     npx playwright test -c playwright.producao.config.ts
 */
export default defineConfig({
  testDir: './tests/producao',
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [['list']],
  timeout: 45_000,
  expect: { timeout: 12_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
