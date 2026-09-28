import { expect, test } from '@playwright/test';
import { entrar } from './helpers';

/**
 * Fluxo minimo da Esteira de Credenciamento: cadastrar um parceiro novo, ver na
 * primeira coluna, mover para outra e marcar uma excecao sem o card sumir do
 * quadro.
 */
test.describe('Esteira de Credenciamento', () => {
  test('cadastra parceiro, move de etapa e marca excecao', async ({ page }) => {
    await entrar(page, 'admin', '/esteira');

    const nome = `Parceiro E2E ${Date.now()}`;

    await page.getByRole('button', { name: 'Parceiro novo' }).click();
    await page.getByLabel('Nome do parceiro').fill(nome);
    await page.getByLabel('UF').last().selectOption('PA');
    await page.getByRole('button', { name: 'Adicionar a esteira' }).click();

    const cartao = page.locator('li[draggable="true"]').filter({ hasText: nome }).first();
    await expect(cartao).toBeVisible();

    // Move pelo seletor "Mover para...", que e a alternativa ao arraste — mais
    // confiavel em Playwright do que simular drag-and-drop nativo.
    await cartao.getByRole('combobox').selectOption({ label: 'Pendencia' });
    await expect(cartao).toBeVisible();

    await cartao.getByRole('button', { name: 'Excecao' }).click();
    await page.getByLabel('Motivo').fill('Teste automatizado');
    await page.getByRole('button', { name: 'Confirmar' }).click();

    await expect(cartao.getByText('Cancelado', { exact: true })).toBeVisible();
    // O card continua visivel no quadro — excecao nao remove do fluxo.
    await expect(cartao).toBeVisible();
  });
});
