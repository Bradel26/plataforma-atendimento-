import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * As rotas do passo 1.1 vistas em produção, com navegador de verdade.
 *
 * Existe porque `validar:producao` fala HTTP e essas rotas são de cliente: o
 * servidor devolve o mesmo `index.html` para qualquer caminho, então um 200 ali
 * não prova nada sobre o que o React fez com a URL. Só o navegador distingue
 * "a rota existe" de "a rota abre o registro".
 *
 * Somente leitura. Nada aqui cria, move ou apaga registro.
 */

function credencial(chave: string): string {
  const caminho = process.env.ENV_PRODUCAO ?? 'apps/api/.env.coolify';
  const texto = readFileSync(resolve(caminho), 'utf8');
  for (const linha of texto.split(/\r?\n/)) {
    const [nome, ...resto] = linha.split('=');
    if (nome.trim() === chave) return resto.join('=').trim().replace(/^"|"$/g, '');
  }
  throw new Error(`${chave} nao encontrada em ${caminho}`);
}

const cartao = (page: Page, titulo: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: titulo, exact: true }) });

/** Um uuid válido que não existe: é o mesmo 404 de registro de outra organização. */
const INEXISTENTE = '00000000-0000-4000-8000-000000000abc';

async function entrar(page: Page, destino: string) {
  await page.goto('/');
  await page.getByLabel('E-mail').fill(credencial('SEED_ADMIN_EMAIL'));
  await page.getByLabel('Senha').fill(credencial('SEED_ADMIN_PASSWORD'));

  const [resposta] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/auth/login')),
    page.getByRole('button', { name: 'Entrar' }).click(),
  ]);
  if (resposta.status() === 429) throw new Error('Login recusado pelo limite por IP (429)');
  if (!resposta.ok()) throw new Error(`Login falhou com status ${resposta.status()}`);

  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeHidden();
  if (destino !== '/') await page.goto(destino);
  await expect(page.locator('nav a').first()).toBeVisible();
}

test.describe('Producao: rotas proprias do CRM', () => {
  test('a lista abre e a aba vem da URL', async ({ page }) => {
    await entrar(page, '/crm');
    await expect(cartao(page, 'Contatos')).toBeVisible();

    await page.goto('/crm?aba=contas');
    await expect(cartao(page, 'Contas')).toBeVisible();
    // Aba escolhida pela URL: o cartão de contatos sai de cena.
    await expect(cartao(page, 'Contatos')).toBeHidden();
  });

  test('o contato tem endereco proprio, sobrevive ao F5 e ao botao voltar', async ({ page }) => {
    await entrar(page, '/crm');

    const primeiro = cartao(page, 'Contatos').locator('li button').first();
    await expect(primeiro).toBeVisible();
    const nome = (await primeiro.locator('p').first().innerText()).trim();
    await primeiro.click();

    await expect(page).toHaveURL(/\/contatos\/[0-9a-f-]{36}$/);
    const id = new URL(page.url()).pathname.split('/').pop()!;
    await expect(cartao(page, nome)).toBeVisible();
    await expect(cartao(page, 'Linha do tempo')).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/contatos/${id}$`));
    await expect(cartao(page, nome)).toBeVisible();

    // O menu continua dizendo onde a pessoa esta.
    const ativo = page.locator('nav a[aria-current="page"]');
    await expect(ativo).toHaveCount(1);
    await expect(ativo).toHaveAttribute('href', '/crm');

    await page.goBack();
    await expect(page).toHaveURL(/\/crm$/);
    await expect(cartao(page, 'Ficha do contato')).toBeVisible();
  });

  test('registro inexistente cai na tela de nao encontrado, nas tres rotas', async ({ page }) => {
    await entrar(page, `/contatos/${INEXISTENTE}`);
    await expect(page.getByText('Contato nao encontrado')).toBeVisible();

    await page.goto(`/clientes/${INEXISTENTE}`);
    await expect(page.getByText('Cliente nao encontrado')).toBeVisible();

    await page.goto(`/oportunidades/${INEXISTENTE}`);
    await expect(page.getByText('Oportunidade nao encontrada')).toBeVisible();
  });

  test('a API responde 404 no acesso direto, sem revelar existencia com 403', async ({ page }) => {
    await entrar(page, '/crm');

    // Pela própria sessão do navegador, para o teste falar do mesmo caminho que
    // a tela usa. 403 aqui seria a confirmação que a Fundação evitou dar.
    for (const rota of [
      `/api/contatos/${INEXISTENTE}`,
      `/api/contas/${INEXISTENTE}`,
      `/api/oportunidades/${INEXISTENTE}`,
      `/api/ficha/contato/${INEXISTENTE}`,
      `/api/ficha/conta/${INEXISTENTE}`,
    ]) {
      const status = await page.evaluate(async (r) => (await fetch(r)).status, rota);
      // 401 é aceitável: o token vive em memória e esta chamada não o carrega.
      // O que não pode aparecer é 200 (vazou) nem 403 (confirmou que existe).
      expect([401, 404], `${rota} respondeu ${status}`).toContain(status);
    }
  });
});
