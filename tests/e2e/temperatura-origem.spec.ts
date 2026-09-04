import { expect, test, type Page } from '@playwright/test';
import { entrar } from './helpers';

/**
 * Temperatura e origem no cartao do funil (item esquecido do plano).
 *
 * O caso central e o percurso completo da informacao: marcar na ficha e ver a
 * etiqueta aparecer **no quadro**, sem abrir cartao nenhum. E esse o ponto do
 * item — a demonstracao mostrava o vendedor varrendo o funil e lendo a
 * temperatura de olho, e informacao que fica so no detalhe existe sem ser usada.
 *
 * Este arquivo **escreve** numa oportunidade da base de dev e restaura no
 * `finally`. A restauracao e possivel porque vazio e o estado original: os dois
 * campos aceitam nulo de proposito.
 */

const cartaoDoFunil = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Funil', exact: true }) });

const cartaoHistorico = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Historico', exact: true }) });

/** Abre a primeira oportunidade aberta e devolve o titulo dela. */
async function abrirPrimeira(page: Page): Promise<string | null> {
  await expect(cartaoDoFunil(page)).toBeVisible();
  await expect(cartaoDoFunil(page).getByText('Carregando...')).toHaveCount(0, { timeout: 10_000 });

  const cartao = page.locator('li[draggable="true"]').first();
  if ((await cartao.count()) === 0) return null;
  const titulo = (await cartao.locator('button').first().innerText()).trim();
  await cartao.locator('button').first().click();
  await expect(page).toHaveURL(/\/oportunidades\/[0-9a-f-]{36}$/);
  // Espera explicita: `count()` avaliado antes da renderizacao devolve zero e
  // faz o teste pular em silencio — foi o que aconteceu quatro vezes ja.
  await expect(page.getByRole('button', { name: 'Editar dados' })).toBeVisible({ timeout: 15_000 });
  return titulo;
}

/** O cartao daquele negocio no quadro, achado pelo titulo. */
const cartaoDe = (page: Page, titulo: string) =>
  page.locator('li[draggable="true"]').filter({ hasText: titulo }).first();

async function limpar(page: Page) {
  await page.getByRole('button', { name: 'Editar dados' }).click();
  await page.getByLabel('Temperatura').selectOption('');
  await page.getByLabel('Origem').selectOption('');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Editar dados' })).toBeVisible({ timeout: 15_000 });
}

test.describe('Temperatura e origem', () => {
  test('a leitura marcada na ficha aparece no cartao do quadro', async ({ page }) => {
    await entrar(page, 'admin', '/crm?aba=oportunidades');
    const titulo = await abrirPrimeira(page);
    test.skip(titulo === null, 'Nenhuma oportunidade aberta na base');

    try {
      await page.getByRole('button', { name: 'Editar dados' }).click();
      await page.getByLabel('Temperatura').selectOption('QUENTE');
      await page.getByLabel('Origem').selectOption('WHATSAPP');
      await page.getByRole('button', { name: 'Salvar', exact: true }).click();

      // Primeiro na ficha, que prova que a resposta voltou e foi relida.
      await expect(page.locator('dl').getByText('Quente', { exact: true })).toBeVisible({ timeout: 15_000 });

      // E depois no QUADRO, que e o ponto do item: o vendedor le sem abrir.
      await page.goto('/crm?aba=oportunidades');
      await expect(cartaoDoFunil(page)).toBeVisible();
      const cartao = cartaoDe(page, titulo!);
      await expect(cartao).toBeVisible({ timeout: 15_000 });
      await expect(cartao).toContainText('Quente');
      await expect(cartao).toContainText('WhatsApp');
    } finally {
      await page.goto('/crm?aba=oportunidades');
      await abrirPrimeira(page);
      await limpar(page);
    }
  });

  test('sem leitura o cartao nao mostra etiqueta — ausencia nao vira "Fria"', async ({ page }) => {
    /*
     * A regra central do item, do lado da tela. As oportunidades da base nunca
     * foram lidas por ninguem: se a ausencia virasse um degrau, o funil inteiro
     * apareceria com uma leitura que nenhum vendedor fez.
     */
    await entrar(page, 'admin', '/crm?aba=oportunidades');
    await expect(cartaoDoFunil(page)).toBeVisible();
    await expect(cartaoDoFunil(page).getByText('Carregando...')).toHaveCount(0, { timeout: 10_000 });

    const cartoes = page.locator('li[draggable="true"]');
    const quantos = await cartoes.count();
    test.skip(quantos === 0, 'Nenhuma oportunidade aberta na base');

    // Nenhum cartao pode dizer "Fria", "Morna" ou "Quente" sem que alguem tenha
    // marcado — e nada foi marcado neste caso.
    for (const palavra of ['Fria', 'Morna', 'Quente']) {
      await expect(cartaoDoFunil(page).getByText(palavra, { exact: true })).toHaveCount(0);
    }
  });

  test('a mudanca de origem entra na trilha; a de temperatura nao', async ({ page }) => {
    /*
     * As duas metades da decisao, no mesmo caso — porque separar deixaria a
     * segunda passar por esquecimento em vez de por regra.
     *
     * Origem e fato sobre a procedencia do negocio: mudar em silencio
     * reescreveria de onde a venda veio. Temperatura e leitura subjetiva que
     * muda toda semana, e registrar cada mudanca encheria a trilha e esconderia
     * as linhas que importam.
     */
    await entrar(page, 'admin', '/crm?aba=oportunidades');
    const titulo = await abrirPrimeira(page);
    test.skip(titulo === null, 'Nenhuma oportunidade aberta na base');

    try {
      await page.getByRole('button', { name: 'Editar dados' }).click();
      await page.getByLabel('Temperatura').selectOption('FRIA');
      await page.getByLabel('Origem').selectOption('EMAIL');
      await page.getByRole('button', { name: 'Salvar', exact: true }).click();

      await expect(cartaoHistorico(page)).toContainText('Origem', { timeout: 15_000 });
      await expect(cartaoHistorico(page)).not.toContainText('Temperatura');
    } finally {
      await limpar(page);
    }
  });
});
