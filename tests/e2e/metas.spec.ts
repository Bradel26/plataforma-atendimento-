import { expect, test, type Page } from '@playwright/test';
import { entrar } from './helpers';

/**
 * Metas mensais (item 4.1 do plano em ANALISE-CRM.md).
 *
 * A aritmetica tem 21 casos de unidade (projecao, rampa, nulo != zero, mes
 * encerrado sem projecao inventada) e 36 asercoes contra a API — inclusive a
 * venda criada, fechada como GANHA e conferida no realizado, e apagada depois.
 *
 * Aqui esta o que so o navegador alcanca: que a rampa e **editavel mes a mes** na
 * tela, e que o painel diz a verdade quando nao ha meta. Sem tela, "meta
 * diferente por mes" seriam doze chamadas de API que ninguem faz.
 *
 * Este arquivo **escreve** metas e apaga as que criou no fim, pelo formulario.
 */

const cartaoRampa = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Rampa mensal', exact: true }) });

const cartaoIndividuais = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Metas individuais', exact: true }) });

async function abrirMetas(page: Page, conta: 'admin' | 'supervisor' | 'comercial') {
  await entrar(page, conta, '/crm?aba=metas');
  const topo = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Metas', exact: true }) });
  await expect(topo).toBeVisible({ timeout: 15_000 });
  await expect(cartaoIndividuais(page)).toBeVisible({ timeout: 15_000 });
}

test.describe('Metas mensais', () => {
  test('sem meta no mes, o painel diz isso e nao esconde venda', async ({ page }) => {
    await abrirMetas(page, 'admin');

    // A base de dev nao tem meta. O texto tem de dizer o que esta acontecendo —
    // um painel vazio sem explicacao parece tela quebrada.
    await expect(cartaoIndividuais(page)).toContainText(/Nenhuma meta/i);
    await expect(cartaoIndividuais(page)).toContainText(/meta ausente nao esconde venda/i);
  });

  test('a rampa abre mes a mes e o valor gravado aparece no painel', async ({ page }) => {
    await abrirMetas(page, 'admin');

    const rampa = cartaoRampa(page);
    await expect(rampa).toBeVisible();

    // Uma pessoa qualquer da lista: o teste nao presume quem existe na base.
    const pessoa = rampa.getByLabel('Pessoa');
    const opcoes = await pessoa.locator('option').all();
    test.skip(opcoes.length < 2, 'Nenhum usuario ativo para receber meta');
    const valorDaOpcao = await opcoes[1]!.getAttribute('value');
    await pessoa.selectOption(valorDaOpcao!);

    await rampa.getByRole('button', { name: 'Abrir rampa' }).click();

    // Doze campos, um por mes: e isto que faz a rampa existir na pratica.
    const campos = rampa.getByRole('spinbutton');
    await expect(campos.first()).toBeVisible({ timeout: 15_000 });
    expect(await campos.count()).toBeGreaterThan(1);

    try {
      await campos.first().fill('40000');
      await rampa.getByRole('button', { name: 'Gravar rampa' }).click();
      await expect(rampa).toContainText(/mes\(es\) gravado/i, { timeout: 15_000 });

      // O painel do mes corrente passa a mostrar a linha com a meta.
      await expect(cartaoIndividuais(page).locator('table')).toBeVisible({ timeout: 15_000 });
      await expect(cartaoIndividuais(page)).toContainText('40.000');
    } finally {
      /*
       * Restauracao pelo proprio botao da tela.
       *
       * Esvaziar o campo e gravar de novo NAO apaga: mes em branco significa
       * "nao mandei", e a gravacao ignora — de proposito, porque gravar zero
       * significaria "meta de nao vender nada". A tela tem o botao Remover
       * justamente porque voltar para "sem meta" precisa ser possivel; a
       * primeira versao deste teste nao tinha como limpar, e a falta apareceu
       * aqui antes de aparecer para um usuario.
       */
      const remover = cartaoIndividuais(page).getByRole('button', { name: /^Remover meta de/ });
      const quantos = await remover.count();
      for (let i = 0; i < quantos; i += 1) {
        await remover.first().click();
        await expect(cartaoIndividuais(page).getByRole('button', { name: /^Remover meta de/ })).toHaveCount(
          quantos - i - 1,
          { timeout: 15_000 },
        );
      }
      await expect(cartaoIndividuais(page)).toContainText(/Nenhuma meta/i, { timeout: 15_000 });
    }
  });

  test('o comercial nao ve a aba de metas', async ({ page }) => {
    // Ler o painel de todos e trabalho de gestao. A propria meta do vendedor tem
    // rota separada (`/metas/minha`, sem restricao de perfil) — o que nao existe
    // para ele e o painel da equipe inteira.
    await entrar(page, 'comercial', '/crm?aba=oportunidades');
    await expect(page.getByRole('heading', { name: 'Funil', exact: true })).toBeVisible({ timeout: 15_000 });
    // Metas mora no menu "Mais" (Fase 9) — o comercial nao tem nenhuma das seis
    // abas desse grupo, entao o menu inteiro nem aparece para ele.
    await expect(page.getByRole('button', { name: 'Mais' })).toHaveCount(0);
  });
});
