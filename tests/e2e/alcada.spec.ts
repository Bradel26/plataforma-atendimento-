import { expect, test, type Page } from '@playwright/test';
import { entrar } from './helpers';

/**
 * Politica de desconto (item 2.3 do plano em ANALISE-CRM.md).
 *
 * O fluxo de aprovacao em si tem prova propria contra a API (17 asercoes,
 * incluindo o 403 do comercial tentando aprovar o proprio desconto e o bloqueio
 * do fechamento). Aqui esta o que so o navegador alcanca: que o teto e
 * **editavel na tela** e que o texto explicativo muda com ele — sem tela, o teto
 * nunca sai de 100 e a alcada e uma regra que nao existe na pratica.
 *
 * Este arquivo **escreve** numa configuracao de organizacao, e por isso restaura
 * o valor original no fim. Deixar a base de dev com alcada de 10% poria em
 * pendencia toda proposta editada depois, e ninguem entenderia por que.
 */

const cartaoPolitica = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Politica de desconto', exact: true }) });

/** Espera a aba comercial terminar de carregar. */
async function abrirAba(page: Page) {
  await entrar(page, 'admin', '/crm?aba=comercial');
  const cabecalho = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Leitura comercial', exact: true }) });
  await expect(cabecalho).toBeVisible();
  await expect(cabecalho.getByText('Carregando...')).toHaveCount(0, { timeout: 15_000 });
  await expect(cartaoPolitica(page)).toBeVisible();
}

test.describe('Politica de desconto', () => {
  test('o teto aparece na tela e o texto explica o efeito', async ({ page }) => {
    await abrirAba(page);

    const campo = cartaoPolitica(page).getByLabel('Desconto maximo (%)');
    await expect(campo).toBeVisible();

    const valor = await campo.inputValue();
    // O texto de baixo tem de concordar com o campo: 100 diz "sem restricao",
    // qualquer outro numero diz o que acontece acima dele. Um texto fixo faria a
    // tela afirmar algo que o numero contradiz.
    if (valor === '100') {
      // "Hoje" e o que distingue o paragrafo explicativo da dica do campo, que
      // tambem diz "100 = sem restricao". Sem isso o localizador casa com dois.
      await expect(cartaoPolitica(page).getByText(/Hoje sem restricao/i)).toBeVisible();
    } else {
      await expect(cartaoPolitica(page).getByText(new RegExp(`acima de ${valor}%`))).toBeVisible();
    }
  });

  test('salvar muda o teto e o texto, e o valor volta ao original', async ({ page }) => {
    await abrirAba(page);

    const campo = cartaoPolitica(page).getByLabel('Desconto maximo (%)');
    const original = await campo.inputValue();

    try {
      await campo.fill('15');
      await cartaoPolitica(page).getByRole('button', { name: 'Salvar politica' }).click();

      // O texto passa a nomear o teto novo. Esperar por ele, e nao por um
      // "salvo com sucesso", prova que a resposta do servidor voltou e foi lida —
      // um aviso de sucesso poderia aparecer antes de o estado mudar.
      await expect(cartaoPolitica(page).getByText(/acima de 15%/)).toBeVisible();
      await expect(cartaoPolitica(page).getByText(/nao pode ser marcada como ganha/i)).toBeVisible();

      // O botao volta a ficar inerte: nao ha mais diferenca entre campo e salvo.
      await expect(cartaoPolitica(page).getByRole('button', { name: 'Salvar politica' })).toBeDisabled();
    } finally {
      // Restauracao explicita e conferida. `finally` porque uma asercao que falha
      // no meio nao pode deixar o teto baixo para trás.
      await campo.fill(original);
      await cartaoPolitica(page).getByRole('button', { name: 'Salvar politica' }).click();
      await expect(cartaoPolitica(page).getByRole('button', { name: 'Salvar politica' })).toBeDisabled();
      await expect(campo).toHaveValue(original);
    }
  });

  test('o campo aceita zero — todo desconto passando por aprovacao e uma escolha valida', async ({ page }) => {
    await abrirAba(page);

    const campo = cartaoPolitica(page).getByLabel('Desconto maximo (%)');
    const original = await campo.inputValue();

    try {
      await campo.fill('0');
      await cartaoPolitica(page).getByRole('button', { name: 'Salvar politica' }).click();
      await expect(cartaoPolitica(page).getByText(/acima de 0%/)).toBeVisible();
    } finally {
      await campo.fill(original);
      await cartaoPolitica(page).getByRole('button', { name: 'Salvar politica' }).click();
      await expect(campo).toHaveValue(original);
    }
  });

  test('o supervisor tambem edita a politica', async ({ page }) => {
    // ADMIN e SUPERVISOR mudam o teto; GESTOR aprova caso a caso mas nao mexe na
    // regra — aprovar e decidir um caso, mudar o teto e decidir todos os futuros.
    // A recusa do GESTOR na escrita e verificada na API; aqui basta provar que o
    // campo nao esta travado para quem tem a alcada de politica.
    await entrar(page, 'supervisor', '/crm?aba=comercial');
    const cabecalho = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Leitura comercial', exact: true }) });
    await expect(cabecalho).toBeVisible();
    await expect(cabecalho.getByText('Carregando...')).toHaveCount(0, { timeout: 15_000 });

    // Supervisor PODE mudar — a checagem aqui e que o campo existe e esta
    // habilitado para quem tem alcada de politica, que e o contraponto do teste
    // de perfil na API. Um perfil sem alcada nem chega nesta aba.
    const campo = cartaoPolitica(page).getByLabel('Desconto maximo (%)');
    await expect(campo).toBeEnabled();
  });
});
