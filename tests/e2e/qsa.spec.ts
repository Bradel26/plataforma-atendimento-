import { expect, test, type Page } from '@playwright/test';
import { entrar } from './helpers';

/**
 * Papel na conta e enriquecimento por CNPJ (item 5.2 do plano em ANALISE-CRM.md).
 *
 * A leitura do cadastro publico tem 27 casos de unidade (payload estranho, CPF
 * descartado, conflito reportado e nao aplicado) e 26 asercoes contra a API —
 * incluindo a consulta real, o socio virando contato com papel classificado, e a
 * classificacao humana sobrevivendo a um segundo enriquecimento. La o cliente de
 * prova e apagado no fim.
 *
 * Aqui esta o que so o navegador prova: que o papel e **editavel na lista de
 * contatos do cliente** e que o botao de consulta so aparece para quem tem CNPJ.
 *
 * Este arquivo **escreve** um papel num contato existente e o restaura no
 * `finally` — o campo aceita nulo, que e o estado original da base de dev.
 */

const cartaoContatos = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Contatos vinculados', exact: true }) });

const cartaoCnpj = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Cadastro publico (CNPJ)', exact: true }) });

/** Abre o primeiro cliente que tenha contato vinculado. Devolve false se nao houver. */
async function abrirClienteComContato(page: Page) {
  await entrar(page, 'admin', '/crm?aba=contas');
  const lista = page.locator('li button').filter({ hasText: /contato\(s\)/ });
  await expect(lista.first()).toBeVisible({ timeout: 15_000 });

  const total = await lista.count();
  for (let i = 0; i < Math.min(total, 8); i += 1) {
    const texto = (await lista.nth(i).innerText()) ?? '';
    // Pula quem tem zero contatos: o seletor de papel so existe havendo pessoa.
    if (/(^|\D)0 contato/.test(texto)) continue;
    await lista.nth(i).click();
    await expect(page).toHaveURL(/\/clientes\/[0-9a-f-]{36}$/);
    await expect(cartaoContatos(page)).toBeVisible({ timeout: 15_000 });
    if ((await cartaoContatos(page).getByRole('combobox').count()) > 0) return true;
    // Cliente sem contato de verdade: volta e tenta o proximo.
    await page.goBack();
    await expect(lista.first()).toBeVisible({ timeout: 15_000 });
  }
  return false;
}

test.describe('Quadro societario e cadastro publico', () => {
  test('o papel de cada pessoa na conta e editavel na ficha do cliente', async ({ page }) => {
    test.skip(!(await abrirClienteComContato(page)), 'Nenhum cliente com contato vinculado na base');

    const seletor = cartaoContatos(page).getByRole('combobox').first();
    const original = await seletor.inputValue();

    try {
      await seletor.selectOption('DECISOR');
      // A ficha e recarregada depois de salvar: esperar o valor voltar do
      // servidor prova que gravou, e nao apenas que o `select` mudou na tela.
      await expect(cartaoContatos(page).getByRole('combobox').first()).toHaveValue('DECISOR', {
        timeout: 15_000,
      });
    } finally {
      const atual = cartaoContatos(page).getByRole('combobox').first();
      await atual.selectOption(original);
      await expect(cartaoContatos(page).getByRole('combobox').first()).toHaveValue(original, { timeout: 15_000 });
    }
  });

  test('o cartao de cadastro publico so aparece para cliente com CNPJ', async ({ page }) => {
    /*
     * Oferecer a consulta a quem nao tem CNPJ seria oferecer um botao que volta
     * 400 — a API recusa com mensagem que pede o CNPJ, e a tela evita o passo.
     */
    await entrar(page, 'admin', '/crm?aba=contas');
    const lista = page.locator('li button').filter({ hasText: /contato\(s\)/ });
    await expect(lista.first()).toBeVisible({ timeout: 15_000 });

    await lista.first().click();
    await expect(page).toHaveURL(/\/clientes\/[0-9a-f-]{36}$/);
    await expect(cartaoContatos(page)).toBeVisible({ timeout: 15_000 });

    /*
     * O cartao DO CLIENTE, e nao o primeiro `section` da pagina.
     *
     * A primeira versao usava `.first()`, que pegava o cartao de filtros da lista
     * — e aquele cartao contem os CNPJs dos clientes listados. O teste concluia
     * "este cliente tem CNPJ" olhando o CNPJ de outro. `Segmento` so existe no
     * cartao do cliente aberto.
     */
    const cabecalho = page.locator('section').filter({ hasText: 'Segmento' }).first();
    await expect(cabecalho).toBeVisible();
    const temCnpj = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(await cabecalho.innerText());

    if (temCnpj) {
      await expect(cartaoCnpj(page)).toBeVisible();
      await expect(cartaoCnpj(page).getByRole('button', { name: /Consultar cadastro publico/ })).toBeVisible();
      // O botao de aplicar NAO existe antes da consulta: aplicar sem ver o que
      // muda e exatamente o que as duas etapas evitam.
      await expect(cartaoCnpj(page).getByRole('button', { name: /Aplicar/ })).toHaveCount(0);
    } else {
      await expect(cartaoCnpj(page)).toHaveCount(0);
    }
  });
});
