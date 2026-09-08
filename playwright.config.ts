import { defineConfig, devices } from '@playwright/test';

/**
 * Teste de navegador. Cobre a camada que nenhum outro teste alcanca: o que o
 * usuario ve depois que o React montou.
 *
 * Precisa da pilha de pe (Postgres, Redis, API e web) e do seed aplicado —
 * mesmo pre-requisito dos smokes. Nao roda no CI por isso; ver README.
 */
export default defineConfig({
  testDir: './tests/e2e',
  // Sequencial de proposito: os testes mexem em conversa e status de agente,
  // e em paralelo um roubaria a conversa do outro.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        /*
         * O padrao do Desktop Chrome (1280x720) da um container de conteudo de
         * ~992px (1280 menos a sidebar fixa de 240px e o padding de 48px do
         * `main`) — cai na faixa "tablet" do `useFaixaDeLargura`, que em
         * Contatos/Contas mostra so um lado por vez de proposito (os
         * componentes da ficha usam grids responsivos por VIEWPORT, e
         * ganhariam menos largura que assumem se dividissem espaco com a
         * lista nessa faixa). Ningueem usa este CRM numa janela de tablet:
         * 1440x900 e o notebook mais comum que a equipe realmente usa, e da
         * um container de ~1152px — solidamente "notebook", o mesmo patamar
         * que a Fase 6 pretendia testar.
         */
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
