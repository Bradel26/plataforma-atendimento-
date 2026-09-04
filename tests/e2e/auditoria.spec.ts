import { expect, test, type Page } from '@playwright/test';
import { entrar } from './helpers';

/**
 * Historico da oportunidade (item 3.2 do plano em ANALISE-CRM.md).
 *
 * **Este arquivo nao escreve.** A gravacao da trilha tem prova propria contra a
 * API — 22 asercoes, incluindo o PATCH que nao inventa linha para campo ausente,
 * o reenvio do mesmo valor que nao gera linha, a proposta com quantidade e total,
 * a etapa vindo da outra tabela sem duplicar, a ordem e o 404 fora do escopo. Ali
 * a oportunidade de prova e apagada no fim.
 *
 * Aqui esta o que so o navegador prova: que o card existe na ficha, que a entrada
 * no funil aparece como **entrada** e nao como "de vazio para X", e que cada
 * linha diz quem fez e quando. Toda oportunidade da base tem ao menos o evento
 * de entrada no funil, entao nao ha nada a criar para o teste ver a trilha.
 */

const cartaoDoFunil = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Funil', exact: true }) });

const cartaoHistorico = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Historico', exact: true }) });

/**
 * Abre a primeira oportunidade do quadro e espera o historico montar.
 *
 * A espera pelo proprio card e explicita: um `count()` avaliado antes da
 * renderizacao devolve zero e faz o teste PULAR em silencio — aconteceu tres
 * vezes neste projeto, e teste pulado nao e teste verde.
 */
async function abrirPrimeira(page: Page) {
  await expect(cartaoDoFunil(page)).toBeVisible();
  await expect(cartaoDoFunil(page).getByText('Carregando...')).toHaveCount(0, { timeout: 10_000 });

  const cartao = page.locator('li[draggable="true"]').first();
  if ((await cartao.count()) === 0) return false;
  await cartao.locator('button').first().click();
  await expect(page).toHaveURL(/\/oportunidades\/[0-9a-f-]{36}$/);
  await expect(cartaoHistorico(page)).toBeVisible({ timeout: 15_000 });
  return true;
}

test.describe('Historico da oportunidade', () => {
  test('a ficha mostra o historico, e a entrada no funil aparece como entrada', async ({ page }) => {
    await entrar(page, 'admin', '/crm?aba=oportunidades');
    test.skip(!(await abrirPrimeira(page)), 'Nenhuma oportunidade aberta na base');

    const linhas = cartaoHistorico(page).getByRole('listitem');
    await expect(linhas.first()).toBeVisible();

    // A linha mais antiga e a entrada no funil. Ela nao pode ler "— → Etapa":
    // ninguem mexeu num estagio que nao existia.
    const ultima = linhas.last();
    await expect(ultima).toContainText('Etapa:');
    await expect(ultima).toContainText(/entrou em/);
    /*
     * A negativa vale para ESTA linha, nao para o card.
     *
     * A primeira versao afirmava que o historico inteiro nunca conteria "— → ", e
     * isso e falso — e legitimamente falso: um campo que sai de vazio para
     * preenchido le "— → 15 dias uteis", que e a verdade. A regra e so sobre a
     * entrada no funil, onde nao houve mudanca de nada.
     */
    await expect(ultima).not.toContainText('— → ');
  });

  test('cada linha diz quem fez e quando', async ({ page }) => {
    await entrar(page, 'admin', '/crm?aba=oportunidades');
    test.skip(!(await abrirPrimeira(page)), 'Nenhuma oportunidade aberta na base');

    const primeira = cartaoHistorico(page).getByRole('listitem').first();
    // Data no formato pt-BR: sem quando, a trilha nao responde "quando isso
    // mudou?", que e metade da pergunta que ela existe para responder.
    await expect(primeira).toContainText(/\d{2}\/\d{2}\/\d{4}/);
    // O autor aparece como nome ou como "automatico" — nunca em branco, que
    // deixaria a linha sem sujeito.
    const autor = await primeira.locator('p').last().innerText();
    expect(autor.trim().length).toBeGreaterThan(0);
  });

  test('o comercial tambem ve o historico da propria oportunidade', async ({ page }) => {
    // Sem perfil extra de proposito: restringir a leitura a gestao faria o
    // vendedor perguntar "quem mudou meu valor?" por mensagem, e o dono do
    // registro e quem mais precisa da resposta.
    await entrar(page, 'comercial', '/crm?aba=oportunidades');
    test.skip(!(await abrirPrimeira(page)), 'Nenhuma oportunidade visivel para o comercial');

    await expect(cartaoHistorico(page)).toBeVisible();
    await expect(cartaoHistorico(page).getByRole('listitem').first()).toBeVisible();
  });
});
