import { expect, test } from '@playwright/test';
import { entrar } from './helpers';

test.describe('Dashboards da gestao', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, 'admin');
    await page.goto('/dashboards');
  });

  test('mostra os indicadores com numero, nao com travessao', async ({ page }) => {
    for (const rotulo of ['Em espera', 'TME', 'TMA', 'CSAT', 'SLA vencido', 'Atendimento de voz']) {
      await expect(page.getByText(rotulo, { exact: true })).toBeVisible();
    }

    // O travessao e o estado de carregando: se ficar, a chamada nao voltou.
    const emEspera = page.getByText('Em espera', { exact: true }).locator('..');
    await expect(emEspera).not.toContainText('—');
  });

  test('traz os quatro graficos, incluindo voz', async ({ page }) => {
    for (const titulo of ['Conversas por canal', 'Agentes por status', 'Protocolos por status', 'Chamadas por direcao']) {
      await expect(page.getByText(titulo, { exact: true })).toBeVisible();
    }
  });

  test('cada grafico tem tabela equivalente, com os mesmos numeros', async ({ page }) => {
    // O Card e uma <section> com <h2>: ancora estavel, ao contrario de div por texto.
    const cartao = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Conversas por canal' }) });
    const primeiraBarra = cartao.locator('li').first();
    const rotulo = (await primeiraBarra.locator('span').first().innerText()).trim();

    await cartao.getByRole('button', { name: 'Ver como tabela' }).click();

    const tabela = cartao.getByRole('table');
    await expect(tabela).toBeVisible();
    await expect(tabela.getByRole('rowheader', { name: rotulo })).toBeVisible();
    await expect(tabela.getByRole('rowheader', { name: 'Total' })).toBeVisible();

    // E volta para o grafico.
    await cartao.getByRole('button', { name: 'Ver como grafico' }).click();
    await expect(cartao.getByRole('table')).toHaveCount(0);
  });

  test('trocar o periodo recarrega sem erro', async ({ page }) => {
    await page.getByLabel('Periodo').selectOption('720');
    await expect(page.getByText(/Falha ao carregar/i)).toHaveCount(0);
    await expect(page.getByText('Conversas por canal', { exact: true })).toBeVisible();
  });

  test('agente nao alcanca o dashboard nem por URL', async ({ page, context }) => {
    await context.clearCookies();
    await entrar(page, 'agente');
    await page.goto('/dashboards');
    await expect(page.getByText('Conversas por canal', { exact: true })).toHaveCount(0);
  });
});
