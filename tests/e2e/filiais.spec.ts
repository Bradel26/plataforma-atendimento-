import { expect, test } from '@playwright/test';
import { entrar } from './helpers';

/**
 * Filiais (item 6.5): so classificacao, sem gate de visibilidade.
 *
 * O navegador prova o que o roteiro nao alcanca: que a filial criada em
 * Configuracoes aparece nos seletores de Contas e Usuarios, e que classificar
 * uma conta reflete de volta na ficha.
 *
 * A limpeza no fim e por API (`page.request`, com o token capturado do proprio
 * trafego da pagina, mesmo padrao do `produtividade.spec.ts`): a UI nao tem
 * botao de remover conta, e sem apagar a conta e a filial de teste elas se
 * acumulam a cada execucao da suite.
 */

const cartao = (page: import('@playwright/test').Page, titulo: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: titulo, exact: true }) });

test.describe('Filiais', () => {
  let token = '';
  let contaId = '';
  let filialId = '';

  test.beforeEach(async ({ page }) => {
    token = '';
    contaId = '';
    filialId = '';
    page.on('request', (req) => {
      const auth = req.headers()['authorization'];
      if (auth && !token) token = auth;
    });
    await entrar(page, 'admin', '/configuracoes');
  });

  test.afterEach(async ({ page }) => {
    if (!token) return;
    if (contaId) await page.request.delete(`/api/contas/${contaId}`, { headers: { Authorization: token } }).catch(() => undefined);
    if (filialId) await page.request.delete(`/api/filiais/${filialId}`, { headers: { Authorization: token } }).catch(() => undefined);
  });

  test('criar, desativar e remover uma filial em Configuracoes', async ({ page }) => {
    await page.getByRole('button', { name: 'Filiais', exact: true }).click();
    const lista = cartao(page, 'Filiais');
    const nome = `Filial teste ${Date.now().toString(36)}`;

    await cartao(page, 'Nova filial').getByLabel('Nome').fill(nome);
    await cartao(page, 'Nova filial').getByLabel('Cidade').fill('Anapolis');
    await cartao(page, 'Nova filial').getByLabel('UF').fill('go');
    await cartao(page, 'Nova filial').getByRole('button', { name: 'Criar filial' }).click();

    const linha = lista.locator('li').filter({ hasText: nome });
    await expect(linha).toBeVisible();
    await expect(linha.getByText('Anapolis/GO')).toBeVisible();
    await expect(linha.getByText('Ativa', { exact: true })).toBeVisible();

    await linha.getByRole('button', { name: 'Desativar' }).click();
    await expect(linha.getByText('Inativa', { exact: true })).toBeVisible();

    // Remove pela propria UI aqui — a este ponto nao ha conta vinculada, entao
    // nao precisa da limpeza por API do afterEach para esta filial.
    page.once('dialog', (d) => void d.accept());
    await linha.getByRole('button', { name: 'Remover' }).click();
    await expect(lista.locator('li').filter({ hasText: nome })).toHaveCount(0);
  });

  test('filial aparece no seletor de Contas e classifica a conta', async ({ page }) => {
    await page.getByRole('button', { name: 'Filiais', exact: true }).click();
    const nome = `Filial contas ${Date.now().toString(36)}`;
    await cartao(page, 'Nova filial').getByLabel('Nome').fill(nome);

    const [criacaoFilial] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/filiais') && r.request().method() === 'POST'),
      cartao(page, 'Nova filial').getByRole('button', { name: 'Criar filial' }).click(),
    ]);
    filialId = (await criacaoFilial.json()).filial.id;
    await expect(cartao(page, 'Filiais').locator('li').filter({ hasText: nome })).toBeVisible();

    await page.goto('/crm');
    await page.getByRole('button', { name: 'Contas', exact: true }).click();

    const nomeConta = `Conta com filial ${Date.now().toString(36)}`;
    const novaConta = cartao(page, 'Nova conta');
    await novaConta.getByLabel('Nome').fill(nomeConta);
    await novaConta.getByLabel('Filial').selectOption({ label: nome });

    const [criacaoConta] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/api/contas') && r.request().method() === 'POST'),
      novaConta.getByRole('button', { name: 'Criar conta' }).click(),
    ]);
    contaId = (await criacaoConta.json()).conta.id;

    await cartao(page, 'Contas').getByRole('button', { name: nomeConta }).click();
    const ficha = cartao(page, nomeConta);
    await expect(ficha.getByLabel('Filial desta conta')).toHaveValue(filialId);

    // A ficha edita a classificacao direto — nao e so leitura.
    const [limpeza] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/api/contas/${contaId}`) && r.request().method() === 'PATCH'),
      ficha.getByLabel('Filial desta conta').selectOption(''),
    ]);
    expect(limpeza.status()).toBe(200);
    await expect(ficha.getByLabel('Filial desta conta')).toHaveValue('');
  });
});
