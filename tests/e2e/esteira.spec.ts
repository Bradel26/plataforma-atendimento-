import { expect, test } from '@playwright/test';
import { entrar } from './helpers';

/**
 * Fluxo minimo da Esteira de Credenciamento: criar, ver na primeira coluna,
 * mover para outra e marcar uma excecao sem o card sumir do quadro.
 */
test.describe('Esteira de Credenciamento', () => {
  test('cria um credenciamento, move de estagio e marca excecao', async ({ page }) => {
    await entrar(page, 'admin', '/esteira');

    const nomeContato = `Parceiro E2E ${Date.now()}`;

    // A tela so cria a partir de um contato existente — usa o primeiro
    // disponivel no seletor em vez de depender de um nome fixo da base de dev.
    const selecao = page.getByRole('combobox', { name: 'Contato (parceiro)' });
    await expect(selecao).toBeVisible();
    const opcao = await selecao.locator('option').nth(1).textContent();
    await selecao.selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Criar' }).click();

    const cartao = page.locator('li[draggable="true"]').filter({ hasText: opcao ?? '' }).first();
    await expect(cartao).toBeVisible();

    // Move pelo seletor "Mover para...", que e a alternativa ao arraste — mais
    // confiavel em Playwright do que simular drag-and-drop nativo.
    await cartao.getByRole('combobox').selectOption({ label: 'Pendencia' });
    await expect(cartao).toBeVisible();

    await cartao.getByRole('button', { name: 'Marcar excecao' }).click();
    await page.getByLabel('Motivo').fill('Teste automatizado');
    await page.getByRole('button', { name: 'Confirmar' }).click();

    await expect(cartao.getByText('Cancelado', { exact: true })).toBeVisible();
    // O card continua visivel no quadro — excecao nao remove do fluxo.
    await expect(cartao).toBeVisible();

    void nomeContato; // reservado caso o teste precise diferenciar contatos no futuro
  });
});
