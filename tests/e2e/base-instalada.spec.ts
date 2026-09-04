import { expect, test } from '@playwright/test';
import { entrar } from './helpers';

/**
 * Base instalada (item 5.1).
 *
 * O que so o navegador prova: que o card monta na ficha da conta entre
 * "Contatos vinculados" e "Leads", que cadastrar um equipamento com garantia
 * aparece na hora com o status certo, e que remover some da lista — sem
 * recarregar a pagina.
 */

const cartao = (page: import('@playwright/test').Page, titulo: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: titulo, exact: true }) });

test.describe('Base instalada', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, 'admin', '/crm');
    await page.getByRole('button', { name: 'Contas' }).click();
  });

  test('cadastrar equipamento, ver status da garantia e remover', async ({ page }) => {
    const marca = `Base instalada ${Date.now().toString(36)}`;

    const contas = cartao(page, 'Contas');
    const novaConta = cartao(page, 'Nova conta');
    await novaConta.getByLabel('Nome').fill(marca);
    await novaConta.getByRole('button', { name: 'Criar conta' }).click();

    // Criar conta so recarrega a lista — nao abre a ficha sozinha, diferente do
    // cadastro de contato. E preciso clicar para abrir.
    await contas.getByText(marca).click();
    await expect(page.getByRole('heading', { name: marca, exact: true })).toBeVisible();

    const base = cartao(page, 'Base instalada');
    await expect(base).toBeVisible();
    await expect(base.getByText('Nenhum equipamento cadastrado')).toBeVisible();

    await base.getByRole('button', { name: '+ Registrar equipamento' }).click();
    const modelo = `Split Hi-Wall 12000 BTU ${Date.now().toString(36)}`;
    await base.getByLabel('Modelo').fill(modelo);
    // Garantia unica, deixada no tipo padrao (Legal), so precisa do prazo.
    await base.locator('input[placeholder="Dias"]').fill('90');
    await base.getByRole('button', { name: 'Cadastrar equipamento' }).click();

    const linha = base.locator('li').filter({ hasText: modelo });
    await expect(linha).toBeVisible();
    // Sem data de instalacao informada, a garantia nao tem como calcular
    // vencimento — o estado e proprio, e nao "vencida".
    await expect(linha.getByText('Sem data de inicio')).toBeVisible();

    // O formulario fecha e esvazia depois de salvar.
    await expect(base.getByLabel('Modelo')).toHaveCount(0);

    page.once('dialog', (d) => void d.accept());
    await linha.getByRole('button', { name: 'Remover' }).click();
    await expect(linha).toHaveCount(0);
    await expect(base.getByText('Nenhum equipamento cadastrado')).toBeVisible();
  });

  test('garantia contratual sem instalador credenciado avisa que falta o requisito', async ({ page }) => {
    const marca = `Base instalada contratual ${Date.now().toString(36)}`;
    const novaConta = cartao(page, 'Nova conta');
    await novaConta.getByLabel('Nome').fill(marca);
    await novaConta.getByRole('button', { name: 'Criar conta' }).click();
    await cartao(page, 'Contas').getByText(marca).click();
    await expect(page.getByRole('heading', { name: marca, exact: true })).toBeVisible();

    const base = cartao(page, 'Base instalada');
    await base.getByRole('button', { name: '+ Registrar equipamento' }).click();
    const modelo = `Split contratual ${Date.now().toString(36)}`;
    await base.getByLabel('Modelo').fill(modelo);
    await base.getByLabel('Data de instalacao').fill('2026-01-01');
    // Tipo de garantia CONTRATUAL, sem informar instalador credenciado.
    await base.getByLabel('Tipo da garantia 1').selectOption('CONTRATUAL');
    await base.locator('input[placeholder="Dias"]').fill('360');
    await base.getByRole('button', { name: 'Cadastrar equipamento' }).click();

    const linha = base.locator('li').filter({ hasText: modelo });
    await expect(linha.getByText('Instalador nao informado')).toBeVisible();

    page.once('dialog', (d) => void d.accept());
    await linha.getByRole('button', { name: 'Remover' }).click();
    await expect(linha).toHaveCount(0);
  });
});
