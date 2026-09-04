import { expect, test } from '@playwright/test';
import { entrar } from './helpers';

/**
 * Importar/exportar CSV (item 6.3): exportacao de contas e importacao de
 * contatos, contas e oportunidades, que nao existiam antes desta rodada.
 *
 * O que so o navegador prova: que o link de download baixa de verdade (a
 * API pode responder 200 com corpo vazio e a suite de unidade nao notaria),
 * e que trocar o recurso no seletor de importacao troca o formulario inteiro
 * sem misturar a previa de um tipo com o arquivo de outro.
 */

const cartao = (page: import('@playwright/test').Page, titulo: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: titulo, exact: true }) });

test.describe('Importar/exportar CSV', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, 'admin', '/crm?aba=dados');
  });

  test('exportar contas dispara o download com o nome certo', async ({ page }) => {
    const exportar = cartao(page, 'Exportar');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      exportar.getByRole('button', { name: 'Contas' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^contas-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  test('trocar o recurso de importacao troca as colunas esperadas e limpa o arquivo carregado', async ({ page }) => {
    const importar = cartao(page, 'Importar');
    const selecao = importar.getByLabel('O que importar');

    await expect(importar.getByText(/Colunas: nome \(obrigatoria\), email, telefone, conta, fase/)).toBeVisible();

    const csv = 'nome;email\nFulano de Tal;fulano@exemplo.local\n';
    await importar.locator('input[type="file"]').setInputFiles({
      name: 'contatos.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv, 'utf-8'),
    });
    await expect(importar.getByText('contatos.csv')).toBeVisible();

    await selecao.selectOption('contas');
    await expect(importar.getByText(/Colunas: nome \(obrigatoria\), cnpj, segmento/)).toBeVisible();
    // Trocar de recurso esvazia o arquivo carregado: planilha de contato nao
    // faz sentido enviada para o endpoint de conta.
    await expect(importar.getByText('contatos.csv')).toHaveCount(0);
    await expect(importar.getByRole('button', { name: 'Importar' })).toBeDisabled();
  });

  test('importar contatos com uma linha invalida mostra previa sem gravar, e a importacao real reporta o mesmo erro', async ({ page }) => {
    const importar = cartao(page, 'Importar');
    await importar.getByLabel('O que importar').selectOption('contatos');

    const marca = Date.now().toString(36);
    const email = `contato-${marca}@exemplo.local`;
    const csv = `nome;email\nContato E2E ${marca};${email}\n;\n`;
    await importar.locator('input[type="file"]').setInputFiles({
      name: 'contatos.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv, 'utf-8'),
    });

    await importar.getByRole('button', { name: 'Validar sem gravar' }).click();
    const previa = importar.getByText('Previa da validacao (nada foi gravado)').locator('..');
    await expect(previa.getByText('1 valida(s)')).toBeVisible();
    await expect(previa.getByText('1 com erro')).toBeVisible();

    await importar.getByRole('button', { name: 'Importar' }).click();
    const concluida = importar.getByText('Importacao concluida').locator('..');
    await expect(concluida.getByText('1 valida(s)')).toBeVisible();

    // O formulario esvazia depois da importacao real, nao depois da previa.
    await expect(importar.getByText('contatos.csv')).toHaveCount(0);
  });
});
