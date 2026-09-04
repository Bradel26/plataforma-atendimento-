import { expect, test, type Page } from '@playwright/test';
import { entrar } from './helpers';

/**
 * Agenda da semana (item E.5) — a agenda embutida do dashboard da demonstracao.
 *
 * As 19 asercoes contra a API cobrem o que a conta pode errar: o dia certo com o
 * fuso de quem pergunta (a tarefa de sabado as 22h ficando no sabado), a faixa de
 * atrasadas, a pendente sem data contada a parte.
 *
 * O que so o navegador prova: que os **sete dias aparecem**, inclusive os vazios,
 * que a faixa de atrasadas vem **antes** dos dias, e que a navegacao de semana
 * muda o que a tela mostra sem recarregar a pagina.
 *
 * Somente leitura: nao cria nem conclui nada.
 */

const cartaoAgenda = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Agenda da semana', exact: true }) });

test.describe('Agenda da semana', () => {
  test('mostra os sete dias, inclusive os livres', async ({ page }) => {
    await entrar(page, 'admin', '/crm?aba=agenda');
    await expect(cartaoAgenda(page)).toBeVisible({ timeout: 15_000 });

    // Sete blocos de dia: dia vazio continua na tela, porque dia livre e
    // informacao para quem vai marcar visita.
    const dias = cartaoAgenda(page).locator('div.grid > div');
    await expect(dias).toHaveCount(7);

    // O cabecalho diz de que conta o numero fala.
    await expect(cartaoAgenda(page)).toContainText('compromisso(s) com data nesta semana');
  });

  test('o agente ve a propria agenda: ela nao e tela de gestao', async ({ page }) => {
    /*
     * A agenda nao tem perfil restrito, e isso e decisao: o agente tem tarefa como
     * qualquer um, e o escopo do que ele ve continua sendo a politica de
     * atividades. Uma agenda so para gestao seria uma agenda que ninguem usa.
     */
    await entrar(page, 'agente', '/crm?aba=agenda');
    await expect(cartaoAgenda(page)).toBeVisible({ timeout: 15_000 });
  });

  test('navegar de semana muda a tela, e "Hoje" volta', async ({ page }) => {
    await entrar(page, 'admin', '/crm?aba=agenda');
    await expect(cartaoAgenda(page)).toBeVisible({ timeout: 15_000 });

    /*
     * Compara so o ROTULO do dia (o "seg 31/08"), e nao o bloco inteiro.
     *
     * A primeira versao usava `innerText()` do bloco e comparava com
     * `toHaveText`: o primeiro preserva as quebras de linha e o segundo
     * normaliza, entao o texto com quebras nunca casava com a versao
     * normalizada ("seg 31/08livre"). O comportamento estava certo e o teste,
     * errado.
     */
    const rotuloDoPrimeiroDia = () =>
      cartaoAgenda(page).locator('div.grid > div').first().locator('span.font-medium').first();
    const rotulo = (await rotuloDoPrimeiroDia().textContent())?.trim() ?? '';
    expect(rotulo).not.toBe('');

    await cartaoAgenda(page).getByRole('button', { name: '→' }).click();
    // A semana seguinte tem outra data no primeiro bloco.
    await expect(rotuloDoPrimeiroDia()).not.toHaveText(rotulo, { timeout: 15_000 });

    await cartaoAgenda(page).getByRole('button', { name: 'Hoje' }).click();
    await expect(rotuloDoPrimeiroDia()).toHaveText(rotulo, { timeout: 15_000 });
  });

  test('a faixa de atrasadas vem antes dos dias, quando existe', async ({ page }) => {
    /*
     * A ordem e a decisao central da tela: agenda que mostra so segunda a domingo
     * esconde o que venceu antes, e e o trabalho mais urgente que existe.
     */
    await entrar(page, 'admin', '/crm?aba=agenda');
    await expect(cartaoAgenda(page)).toBeVisible({ timeout: 15_000 });

    const faixa = cartaoAgenda(page).getByText(/atrasada\(s\) de antes desta semana/);
    const temAtraso = await faixa
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!temAtraso, 'Nenhuma tarefa atrasada na base de dev nesta semana');

    // A faixa aparece acima da grade dos dias — comparado pela posicao na tela,
    // e nao pela ordem do DOM, que poderia coincidir por acidente.
    const caixaFaixa = await faixa.boundingBox();
    const caixaDias = await cartaoAgenda(page).locator('div.grid > div').first().boundingBox();
    expect(caixaFaixa && caixaDias && caixaFaixa.y < caixaDias.y).toBe(true);
  });
});
