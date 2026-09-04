import { expect, test, type Page } from '@playwright/test';
import { entrar, menu } from './helpers';

/**
 * Aba "Leitura comercial" (itens 1.2 a 1.5 do plano em ANALISE-CRM.md).
 *
 * O que so o navegador prova: que os quatro blocos montam com o dado real da
 * base, que a barreira de perfil esconde a aba do agente em vez de deixar
 * clicar e receber 403, e que os textos que **explicam o numero** estao na tela.
 *
 * Esse ultimo ponto nao e detalhe de redacao. Tres numeros deste painel mentem
 * se lidos sem a ressalva: os baldes de risco se sobrepoem, "entrou" e
 * "avancou" nao se fecham entre si, e a previsao ponderada e foto do momento
 * sem periodo anterior. A ressalva na tela e parte do recurso.
 */

const bloco = (page: Page, titulo: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: titulo, exact: true }) });

/**
 * Espera a aba carregar.
 *
 * O cabecalho aparece com "Carregando..." antes de as quatro requisicoes
 * responderem. Decidir qualquer coisa antes disso e o erro que fez dois testes
 * do funil pularem calados na primeira versao daquele arquivo.
 */
async function esperarAba(page: Page) {
  await expect(bloco(page, 'Leitura comercial')).toBeVisible();
  await expect(bloco(page, 'Leitura comercial').getByText('Carregando...')).toHaveCount(0, { timeout: 15_000 });
}

test.describe('Leitura comercial', () => {
  test('os quatro blocos montam com o dado da base', async ({ page }) => {
    await entrar(page, 'admin', '/crm?aba=comercial');
    await esperarAba(page);

    await expect(page.getByRole('heading', { name: 'Oportunidades em risco' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Indicadores do periodo' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Conversao etapa a etapa' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Perdas por motivo' })).toBeVisible();

    // Nenhum bloco pode ter caido: o erro aparece como Alerta acima deles.
    await expect(page.getByText('Falha ao carregar a leitura comercial')).toHaveCount(0);
  });

  test('a tabela de conversao tem uma linha por etapa do funil', async ({ page }) => {
    await entrar(page, 'admin', '/crm?aba=comercial');
    await esperarAba(page);

    const tabela = bloco(page, 'Conversao etapa a etapa').locator('table');
    await expect(tabela).toBeVisible();
    // Ao menos uma etapa: o seed cria funil com estagios. Zero linhas aqui
    // significaria que a tabela montou sem dado, que e o caso que o painel
    // esconderia bem — cabecalho bonito, corpo vazio.
    await expect(tabela.locator('tbody tr')).not.toHaveCount(0);
  });

  test('as ressalvas que impedem o numero de mentir estao na tela', async ({ page }) => {
    await entrar(page, 'admin', '/crm?aba=comercial');
    await esperarAba(page);

    // Os baldes de risco se sobrepoem — sem isso alguem soma os cinco.
    await expect(page.getByText(/mais de um balde/i)).toBeVisible();
    // Fluxo do periodo x foto do momento: a previsao ponderada nao tem
    // comparacao possivel, e a tela precisa dizer isso onde ela aparece.
    await expect(page.getByText(/sem comparacao com periodo anterior/i)).toBeVisible();
    // "Entrou" e "avancou" nao se fecham entre si.
    await expect(page.getByText(/nao se fecham entre si/i)).toBeVisible();
  });

  test('trocar a janela recarrega os blocos', async ({ page }) => {
    await entrar(page, 'admin', '/crm?aba=comercial');
    await esperarAba(page);

    const resposta = page.waitForResponse((r) => r.url().includes('/comercial/indicadores'));
    await page.getByLabel('Janela').selectOption('30');
    const r = await resposta;
    expect(r.status()).toBe(200);
    // A descricao do bloco de indicadores carrega a janela escolhida.
    await expect(page.getByText('Comparados com os 30 dias anteriores')).toBeVisible();
  });

  test('o agente nao ve a aba — escondida, nao barrada no clique', async ({ page }) => {
    await entrar(page, 'agente', '/crm');
    // A aba aparece como botao na barra de abas do CRM.
    await expect(page.getByRole('button', { name: 'Leitura comercial' })).toHaveCount(0);

    // E digitar a URL cai em Contatos, nao numa tela de erro: a aba pedida so
    // vale se o perfil a enxerga.
    await page.goto('/crm?aba=comercial');
    await expect(menu(page)).not.toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Oportunidades em risco' })).toHaveCount(0);
  });
});
