import { expect, test } from '@playwright/test';
import { CONTAS, entrar, menu } from './helpers';

test.describe('Login e permissao no menu', () => {
  test('senha errada mostra erro e nao entra', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('E-mail').fill(CONTAS.admin.email);
    await page.getByLabel('Senha').fill('senha-errada-de-proposito');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
    await expect(page.getByText(/credenciais|invalid|incorret/i)).toBeVisible();
    await expect(page.locator('nav a')).toHaveCount(0);
  });

  test('admin entra e ve o menu completo', async ({ page }) => {
    await entrar(page, 'admin');
    const rotulos = await menu(page).allInnerTexts();
    for (const esperado of ['Dashboards', 'Atendimento', 'Telefonia', 'CRM', 'Configuracoes']) {
      expect(rotulos.join('|')).toContain(esperado);
    }
  });

  test('agente nao ve dashboards nem configuracoes', async ({ page }) => {
    await entrar(page, 'agente');
    const rotulos = (await menu(page).allInnerTexts()).join('|');

    expect(rotulos).toContain('Atendimento');
    expect(rotulos).toContain('Protocolo');
    // Numero da operacao inteira e area de gestao nao sao do agente.
    expect(rotulos).not.toContain('Dashboards');
    expect(rotulos).not.toContain('Configuracoes');
    expect(rotulos).not.toContain('Area da Gestao');
  });

  test('rota de admin digitada na barra nao vaza para o agente', async ({ page }) => {
    await entrar(page, 'agente');
    await page.goto('/configuracoes');

    // Nao basta esconder o item do menu: a rota redireciona para a primeira
    // pagina que o perfil pode ver, em vez de renderizar a tela proibida.
    await expect(page).toHaveURL(new RegExp("/atendimento"));
    await expect(page.getByRole('heading', { name: /White Label/i })).toHaveCount(0);
  });

  test('sair encerra a sessao e recarregar nao volta para dentro', async ({ page }) => {
    await entrar(page, 'admin');
    await page.getByRole('button', { name: /sair/i }).click();
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  });
});
