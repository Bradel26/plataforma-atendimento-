import { expect, test, type Page } from '@playwright/test';
import { entrar } from './helpers';

/**
 * Assistente da ligacao (item E.2 do plano em ANALISE-CRM.md).
 *
 * O percurso completo — motor posta analise, sugestao vira tarefa na agenda,
 * reanalise nao desfaz decisao de pessoa — esta nas **36 asercoes contra a API**,
 * e tem de estar la: postar analise exige token de integracao e uma chamada
 * encerrada, e nenhuma das duas coisas o navegador pode criar.
 *
 * Aqui esta o que so o navegador prova, e que e justamente onde este item pode
 * mentir: que a chamada **sem analise nao ganha um painel de aparencia
 * analisada**. A coluna diz "sem analise" no lugar do botao, e o indicador de
 * sentimento diz sobre quantas ligacoes ele fala.
 */

const cartaoChamadas = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Chamadas', exact: true }) });

/** Espera de verdade, e nao `count()`: contar antes da renderizacao da zero. */
const apareceu = (alvo: ReturnType<Page['locator']>) =>
  alvo
    .first()
    .waitFor({ state: 'visible', timeout: 15_000 })
    .then(() => true)
    .catch(() => false);

test.describe('Assistente da ligacao', () => {
  test('a tabela de chamadas tem a coluna do assistente', async ({ page }) => {
    await entrar(page, 'admin', '/telefonia');
    await expect(cartaoChamadas(page)).toBeVisible({ timeout: 15_000 });

    const tabela = cartaoChamadas(page).locator('table');
    test.skip(!(await apareceu(tabela)), 'Nenhuma chamada registrada na base de dev');

    await expect(tabela.getByRole('columnheader', { name: 'Assistente' })).toBeVisible();
  });

  test('chamada sem analise diz "sem analise", em vez de abrir painel vazio', async ({ page }) => {
    /*
     * A regra central do item, do lado da tela.
     *
     * A base de dev nao tem motor de transcricao ligado — nenhuma chamada foi
     * analisada. Um botao "Abrir" em todas elas levaria a um painel de campos
     * vazios, que se parece com falha de carregamento; e um "Neutro" na coluna
     * de sentimento faria ausencia de analise parecer ligacao morna.
     */
    await entrar(page, 'admin', '/telefonia');
    await expect(cartaoChamadas(page)).toBeVisible({ timeout: 15_000 });

    const tabela = cartaoChamadas(page).locator('table');
    test.skip(!(await apareceu(tabela)), 'Nenhuma chamada registrada na base de dev');

    const semAnalise = tabela.getByText('sem analise', { exact: true });
    test.skip(
      !(await apareceu(semAnalise)),
      'Todas as chamadas da base foram analisadas — este caso descreve o estado sem motor',
    );

    // E o texto nao esta sozinho: o titulo do hover explica o que aconteceu.
    await expect(semAnalise.first()).toHaveAttribute('title', /Nenhum motor analisou/);

    // Nenhuma palavra de sentimento aparece numa linha sem analise.
    for (const palavra of ['Positivo', 'Neutro', 'Negativo']) {
      await expect(tabela.getByText(palavra, { exact: true })).toHaveCount(0);
    }
  });

  test('o indicador de sentimento diz sobre quantas ligacoes ele fala', async ({ page }) => {
    /*
     * "1 negativa" pode sair de duas analisadas ou de duzentas, e as duas frases
     * pedem decisoes opostas. Com nada analisado, o mostrador nao mostra 0% — ele
     * diz que nenhuma ligacao foi analisada.
     */
    await entrar(page, 'admin', '/telefonia');
    await expect(page.getByText('Ligacoes negativas')).toBeVisible({ timeout: 15_000 });

    const painel = page
      .locator('div')
      .filter({ has: page.getByText('Ligacoes negativas', { exact: true }) })
      .last();

    await expect(painel).toContainText(
      /nenhuma ligacao analisada por motor de IA|de \d+ analisada/,
    );
  });
});
