import { expect, test } from '@playwright/test';
import { CONTAS, entrar } from './helpers';

/**
 * Sessao atravessando recarga de pagina.
 *
 * Este arquivo existe por causa de um bug que so o navegador revela: o refresh
 * token e de uso unico, o StrictMode do React chamava a renovacao duas vezes, e
 * a segunda voltava 401 com a sessao ainda boa — recarregar deslogava.
 */
for (const perfil of ['admin', 'supervisor', 'agente'] as const) {
  test(`${perfil}: recarregar a pagina mantem a sessao`, async ({ page }) => {
    await entrar(page, perfil);
    const antes = page.url();

    await page.reload();

    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeHidden();
    await expect(page).toHaveURL(antes);
    await expect(page.locator('nav a').first()).toBeVisible();
  });
}

test('renovacao concorrente nao derruba a sessao', async ({ page }) => {
  await entrar(page, 'agente');

  // Cinco renovacoes ao mesmo tempo: sem compartilhar a chamada em curso, uma
  // consome o token e as outras quatro invalidam a sessao.
  const resultados = await page.evaluate(async () => {
    const chamadas = Array.from({ length: 5 }, () =>
      fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' }).then((r) => r.status),
    );
    return Promise.all(chamadas);
  });
  expect(resultados.filter((s) => s === 200).length).toBeGreaterThanOrEqual(1);

  // O que importa: depois da tempestade o usuario continua dentro.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeHidden();
});

test('refresh sem cookie devolve SEM_SESSAO, nao erro genérico', async ({ page }) => {
  await page.goto('/');
  const corpo = await page.evaluate(async () => {
    const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    return { status: res.status, dados: await res.json() };
  });

  expect(corpo.status).toBe(401);
  // O cliente usa este codigo para nao tentar de novo quando nao ha o que renovar.
  expect(corpo.dados?.error?.code).toBe('SEM_SESSAO');
  expect(CONTAS.admin.email).toBeTruthy();
});
