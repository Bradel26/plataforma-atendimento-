import { expect, test } from '@playwright/test';
import { entrar } from './helpers';

/**
 * Aba de IA: token de integracao e a ponte por canal.
 *
 * O que importa aqui e o que nao pode vazar e o que nao pode travar: o valor do
 * token aparece uma vez e a lista nunca o repete; e a ponte nao liga sem
 * webhook e segredo, porque ligada pela metade ela entregaria mensagem sem
 * assinatura para um endereco vazio.
 */

const cartao = (page: import('@playwright/test').Page, titulo: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: titulo, exact: true }) });

const abrirAba = async (page: import('@playwright/test').Page) => {
  await page.goto('/configuracoes');
  await page.getByRole('button', { name: 'IA (motor externo)' }).click();
  await expect(cartao(page, 'Ponte por canal')).toBeVisible();
};

test.describe('IA: motor externo', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, 'admin');
    await abrirAba(page);
  });

  test('o token aparece uma vez, e a lista nao o repete', async ({ page }) => {
    const nome = `e2e-${Date.now().toString(36)}`;
    const tokens = cartao(page, 'Tokens de integracao');

    await tokens.getByLabel('Nome da integracao').fill(nome);
    await tokens.getByRole('button', { name: 'Criar token' }).click();

    // O valor em claro sai num campo selecionavel, com o aviso de que nao volta.
    const campo = tokens.locator('input[readonly]');
    await expect(campo).toBeVisible();
    const valor = await campo.inputValue();
    expect(valor.startsWith('pi_')).toBe(true);
    await expect(tokens.getByText(/nao aparece de novo/i)).toBeVisible();

    // Esconder e o fim do valor: nada na tela o traz de volta.
    await tokens.getByRole('button', { name: 'Ja copiei, esconder' }).click();
    await expect(tokens.locator('input[readonly]')).toHaveCount(0);
    await expect(page.getByText(valor)).toHaveCount(0);

    // A lista mostra o nome e so o prefixo — nunca o valor.
    const linha = tokens.locator('li').filter({ hasText: nome });
    await expect(linha).toBeVisible();
    await expect(linha).toContainText(valor.slice(0, 8));
    await expect(linha).not.toContainText(valor);
  });

  test('revogar tira o token dos ativos e ele volta atras do contador', async ({ page }) => {
    const nome = `e2e-rev-${Date.now().toString(36)}`;
    const tokens = cartao(page, 'Tokens de integracao');

    await tokens.getByLabel('Nome da integracao').fill(nome);
    await tokens.getByRole('button', { name: 'Criar token' }).click();
    await expect(tokens.locator('li').filter({ hasText: nome })).toBeVisible();

    await tokens.locator('li').filter({ hasText: nome }).getByRole('button', { name: 'Revogar' }).click();

    // Sai da lista de ativos...
    await expect(tokens.locator('li').filter({ hasText: nome })).toHaveCount(0);
    // ...e continua existindo: revogar e trilha, nao exclusao.
    await tokens.getByRole('button', { name: /Mostrar \d+ token/ }).click();
    const revogado = tokens.locator('li').filter({ hasText: nome });
    await expect(revogado).toBeVisible();
    await expect(revogado).toContainText('Revogado');
    // Sem botao de revogar de novo.
    await expect(revogado.getByRole('button', { name: 'Revogar' })).toHaveCount(0);
  });

  test('a ponte nao liga sem webhook e segredo', async ({ page }) => {
    const ponte = cartao(page, 'Ponte por canal');
    await ponte.getByLabel('Canal').selectOption('INSTAGRAM');

    // Com os campos vazios o botao esta desabilitado e a tela diz por que.
    await expect(ponte.getByRole('button', { name: 'Ligar a IA' })).toBeDisabled();
    await expect(ponte.getByText(/Informe o webhook e o segredo/)).toBeVisible();

    // So o webhook nao basta: entrega sem assinatura e entrega que qualquer um
    // consegue forjar.
    await ponte.getByLabel('Webhook do motor de IA').fill('https://whatsbot.exemplo.com/api/webhook/plataforma/c1');
    await expect(ponte.getByRole('button', { name: 'Ligar a IA' })).toBeDisabled();

    await ponte.getByLabel('Segredo de assinatura').fill('segredo-de-teste-e2e-longo');
    await expect(ponte.getByRole('button', { name: 'Ligar a IA' })).toBeEnabled();
  });

  test('liga, mostra o estado e desliga — sem nunca devolver o segredo', async ({ page }) => {
    const ponte = cartao(page, 'Ponte por canal');
    await ponte.getByLabel('Canal').selectOption('FACEBOOK');

    const segredo = `segredo-e2e-${Date.now().toString(36)}`;
    await ponte.getByLabel('Webhook do motor de IA').fill('https://whatsbot.exemplo.com/api/webhook/plataforma/fb');
    await ponte.getByLabel('Segredo de assinatura').fill(segredo);
    await ponte.getByRole('button', { name: 'Ligar a IA' }).click();

    await expect(ponte.getByText('IA ligada')).toBeVisible();
    await expect(ponte.getByText('Entrega assinada')).toBeVisible();

    // O campo do segredo esvazia depois de salvar, e o valor nao esta em lugar
    // nenhum da pagina — nem no atributo do input.
    await expect(ponte.getByLabel('Segredo de assinatura')).toHaveValue('');
    expect(await page.content()).not.toContain(segredo);

    // Recarregar traz o estado do banco, com o webhook e sem o segredo.
    await abrirAba(page);
    const depois = cartao(page, 'Ponte por canal');
    await depois.getByLabel('Canal').selectOption('FACEBOOK');
    await expect(depois.getByText('IA ligada')).toBeVisible();
    await expect(depois.getByLabel('Webhook do motor de IA')).toHaveValue(/whatsbot\.exemplo\.com/);
    await expect(depois.getByLabel('Segredo de assinatura')).toHaveValue('');
    expect(await page.content()).not.toContain(segredo);

    // Desligar deixa a configuracao gravada, so para de entregar.
    await depois.getByRole('button', { name: 'Desligar a IA' }).click();
    await expect(depois.getByText('IA desligada')).toBeVisible();
    await expect(depois.getByText('Entrega assinada')).toBeVisible();
  });

  test('a janela do canal aparece, e o webchat nao tem janela', async ({ page }) => {
    const ponte = cartao(page, 'Ponte por canal');

    // WhatsApp e o caso que a Meta limita: 24h desde a ultima mensagem do
    // cliente. Se a tela mentisse aqui, alguem ligaria a IA achando que ela
    // responde a qualquer hora.
    await ponte.getByLabel('Canal').selectOption('WHATSAPP');
    await expect(ponte.getByText('Janela de 24h')).toBeVisible();

    await ponte.getByLabel('Canal').selectOption('WEBCHAT');
    await expect(ponte.getByText('Sem janela')).toBeVisible();
  });
});
