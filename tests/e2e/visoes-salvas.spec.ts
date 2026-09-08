import { expect, test } from '@playwright/test';
import { entrar } from './helpers';

/**
 * Visoes salvas (item 6.1).
 *
 * O que so o navegador prova: que salvar o filtro atual cria um chip que, ao
 * ser clicado, repreenche os MESMOS campos de busca/etiqueta da tela — nao uma
 * consulta paralela — e que remover o chip funciona. Cobre Contas a fundo;
 * Leads e Oportunidades so confirmam que o seletor monta e aplica, para nao
 * duplicar o mesmo teste tres vezes.
 */

const cartao = (page: import('@playwright/test').Page, titulo: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: titulo, exact: true }) });

test.describe('Visoes salvas', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, 'admin', '/crm');
  });

  test('salvar o filtro de Contas cria um chip que reaplica busca ao ser clicado', async ({ page }) => {
    await page.getByRole('link', { name: 'Contas', exact: true }).click();
    const contas = cartao(page, 'Contas');

    // Sem filtro nenhum, o formulario de salvar nem aparece.
    await expect(contas.getByPlaceholder('Nome da visao')).toHaveCount(0);
    await expect(contas.getByText('Preencha algum filtro para poder salva-lo como visao.')).toBeVisible();

    const marcaBusca = `busca-${Date.now().toString(36)}`;
    await contas.getByPlaceholder('Buscar por nome, CNPJ ou segmento').fill(marcaBusca);

    const nomeVisao = `Visao teste ${Date.now().toString(36)}`;
    await contas.getByPlaceholder('Nome da visao').fill(nomeVisao);
    await contas.getByRole('button', { name: 'Salvar visao' }).click();

    const chip = contas.getByRole("button", { name: nomeVisao, exact: true });
    await expect(chip).toBeVisible();

    // Limpa a busca na mao...
    await contas.getByPlaceholder('Buscar por nome, CNPJ ou segmento').fill('');
    await expect(contas.getByPlaceholder('Buscar por nome, CNPJ ou segmento')).toHaveValue('');

    // ...e o chip devolve o MESMO valor, porque guarda o filtro da tela, nao uma consulta propria.
    await chip.click();
    await expect(contas.getByPlaceholder('Buscar por nome, CNPJ ou segmento')).toHaveValue(marcaBusca);

    // "Todas" desliga a visao ativa e nao mexe no campo (e so um estado de selecao).
    await contas.getByRole('button', { name: 'Todas' }).click();

    // Remove o chip pelo botao que aparece no hover (forca o hover via hover()).
    await chip.hover();
    // Remover abre o ConfirmDialog (Fase 9 substituiu o window.confirm nativo).
    await contas.getByRole('button', { name: `Remover visao ${nomeVisao}` }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remover' }).click();
    await expect(chip).toHaveCount(0);
  });

  test('Leads: visao salva reaplica o filtro de responsavel/atraso', async ({ page }) => {
    await page.getByRole('link', { name: 'Leads', exact: true }).click();
    const filtros = cartao(page, 'Filtros');

    await filtros.getByLabel('Prazo').selectOption('true');
    const nomeVisao = `Atrasados ${Date.now().toString(36)}`;
    await filtros.getByPlaceholder('Nome da visao').fill(nomeVisao);
    await filtros.getByRole('button', { name: 'Salvar visao' }).click();

    const chip = filtros.getByRole("button", { name: nomeVisao, exact: true });
    await expect(chip).toBeVisible();

    await filtros.getByLabel('Prazo').selectOption('');
    await chip.click();
    await expect(filtros.getByLabel('Prazo')).toHaveValue('true');

    await chip.hover();
    // Remover abre o ConfirmDialog (Fase 9 substituiu o window.confirm nativo).
    await filtros.getByRole('button', { name: `Remover visao ${nomeVisao}` }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remover' }).click();
    await expect(chip).toHaveCount(0);
  });

  test('Oportunidades: visao salva reaplica o funil escolhido', async ({ page }) => {
    await page.getByRole('link', { name: 'Oportunidades', exact: true }).click();
    const funilCard = cartao(page, 'Funil');
    await expect(funilCard.getByLabel('Funil')).toBeVisible();

    const opcoes = await funilCard.getByLabel('Funil').locator('option').all();
    if (opcoes.length < 2) test.skip(true, 'precisa de ao menos um funil alem do padrao');
    const valorFunil = await opcoes[1]!.getAttribute('value');

    await funilCard.getByLabel('Funil').selectOption(valorFunil!);
    const nomeVisao = `Funil especifico ${Date.now().toString(36)}`;
    await funilCard.getByPlaceholder('Nome da visao').fill(nomeVisao);
    await funilCard.getByRole('button', { name: 'Salvar visao' }).click();

    const chip = funilCard.getByRole("button", { name: nomeVisao, exact: true });
    await expect(chip).toBeVisible();

    await funilCard.getByLabel('Funil').selectOption('');
    await chip.click();
    await expect(funilCard.getByLabel('Funil')).toHaveValue(valorFunil!);

    await chip.hover();
    // Remover abre o ConfirmDialog (Fase 9 substituiu o window.confirm nativo).
    await funilCard.getByRole('button', { name: `Remover visao ${nomeVisao}` }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remover' }).click();
    await expect(chip).toHaveCount(0);
  });
});
