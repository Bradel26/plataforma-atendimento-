import { expect, test } from '@playwright/test';
import { entrar } from './helpers';

/**
 * Campos customizados (item 6.4).
 *
 * O que so o navegador prova: que um campo criado em Configuracoes aparece de
 * verdade no formulario de "Nova conta", que um campo OBRIGATORIO barra a
 * criacao sem ele (nao so a API — a tela tambem tem que deixar preencher), e
 * que a ficha mostra e deixa editar o valor gravado.
 */

const cartao = (page: import('@playwright/test').Page, titulo: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: titulo, exact: true }) });

test.describe('Campos customizados', () => {
  let token = '';
  let campoId = '';
  let contaId = '';

  test.beforeEach(async ({ page }) => {
    token = '';
    campoId = '';
    contaId = '';
    page.on('request', (req) => {
      const auth = req.headers()['authorization'];
      if (auth && !token) token = auth;
    });
    await entrar(page, 'admin', '/configuracoes');
  });

  test.afterEach(async ({ page }) => {
    if (!token) return;
    if (contaId) await page.request.delete(`/api/contas/${contaId}`, { headers: { Authorization: token } }).catch(() => undefined);
    if (campoId) await page.request.delete(`/api/campos-customizados/${campoId}`, { headers: { Authorization: token } }).catch(() => undefined);
  });

  test('campo obrigatorio criado em Configuracoes aparece na Nova conta e barra a criacao sem ele', async ({ page }) => {
    await page.getByRole('button', { name: 'Campos customizados', exact: true }).click();
    // A aba "Contas" ja vem selecionada por padrao.
    const nomeCampo = `Cor favorita ${Date.now().toString(36)}`;
    const form = cartao(page, `Novo campo em Contas`);
    await form.getByLabel('Nome').fill(nomeCampo);
    await form.getByLabel('Tipo').selectOption('TEXTO');
    await page.getByLabel('Obrigatorio ao criar um registro novo').check();

    const [criacao] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/campos-customizados') && r.request().method() === 'POST'),
      form.getByRole('button', { name: 'Criar campo' }).click(),
    ]);
    campoId = (await criacao.json()).campo.id;
    await expect(cartao(page, 'Campos customizados').locator('li').filter({ hasText: nomeCampo })).toBeVisible();
    await expect(cartao(page, 'Campos customizados').getByText('Obrigatorio')).toBeVisible();

    await page.goto('/crm');
    await page.getByRole('button', { name: 'Contas', exact: true }).click();
    const novaConta = cartao(page, 'Nova conta');
    const nomeConta = `Conta com campo ${Date.now().toString(36)}`;
    await novaConta.getByLabel('Nome').fill(nomeConta);

    // Sem preencher o campo obrigatorio, a API recusa e a tela mostra o erro
    // — nao finge sucesso nem deixa a conta pela metade.
    const [semCampo] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/api/contas') && r.request().method() === 'POST'),
      novaConta.getByRole('button', { name: 'Criar conta' }).click(),
    ]);
    expect(semCampo.status()).toBe(400);
    await expect(page.getByText(/obrigat.rio/i)).toBeVisible();

    await novaConta.getByLabel(nomeCampo).fill('Azul');
    const [comCampo] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/api/contas') && r.request().method() === 'POST'),
      novaConta.getByRole('button', { name: 'Criar conta' }).click(),
    ]);
    expect(comCampo.status()).toBe(201);
    contaId = (await comCampo.json()).conta.id;

    await cartao(page, 'Contas').getByRole('button', { name: nomeConta }).click();
    const camposCard = cartao(page, 'Campos customizados');
    await expect(camposCard.getByLabel(nomeCampo)).toHaveValue('Azul');

    // Edita direto na ficha — o valor confirma no BLUR, nao a cada tecla (um
    // campo de texto nao pode salvar uma vez por letra digitada). `fill` nao
    // sai do campo sozinho, entao o Tab e o que dispara o PATCH.
    await camposCard.getByLabel(nomeCampo).fill('Verde');
    const [edicao] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/api/contas/${contaId}`) && r.request().method() === 'PATCH'),
      camposCard.getByLabel(nomeCampo).press('Tab'),
    ]);
    expect(edicao.status()).toBe(200);
    await expect(camposCard.getByLabel(nomeCampo)).toHaveValue('Verde');
  });
});
