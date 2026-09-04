import { expect, test, type Page } from '@playwright/test';
import { entrar } from './helpers';

/**
 * Custo e classificacao na lista de chamadas (item 6.6 do plano em
 * ANALISE-CRM.md) — as colunas CUSTO e AUDIO do Nectar.
 *
 * A gravacao da nota tem 21 asercoes contra a API (faixa recusada, autor e data
 * limpos junto com a nota, o CHECK do banco barrando por fora da rota) e 6 casos
 * de unidade na agregacao. Ali a chamada de prova e apagada no fim.
 *
 * Aqui esta o que so o navegador prova: que as duas colunas **existem na tabela**
 * e que os dois indicadores dizem sobre quantas chamadas cada media foi
 * calculada. Sem isso, `custo` continuaria no banco sem nunca aparecer — foi
 * exatamente o estado em que este campo passou tres fases.
 */

const cartaoChamadas = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Chamadas', exact: true }) });

test.describe('Custo e classificacao da ligacao', () => {
  test('a tabela de chamadas tem as colunas de custo e audio', async ({ page }) => {
    await entrar(page, 'admin', '/telefonia');
    await expect(cartaoChamadas(page)).toBeVisible({ timeout: 15_000 });

    /*
     * Espera a tabela, em vez de contar.
     *
     * Duas licoes empilhadas aqui, as duas cometidas neste arquivo:
     *
     * - um `return` silencioso quando nao ha tabela passa verde sem verificar
     *   nada, e o relatorio nao distingue isso de um teste que rodou. Pulado
     *   aparece como pulado, que e a informacao verdadeira;
     * - `count()` avaliado antes da renderizacao devolve zero. Foi o que
     *   aconteceu: a API devolvia cinco chamadas e o teste pulava. E a quarta vez
     *   que este mesmo defeito aparece no projeto, e a forma certa e sempre a
     *   mesma — **esperar**, e so entao decidir.
     */
    const temTabela = await cartaoChamadas(page)
      .locator('table')
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!temTabela, 'Nenhuma chamada registrada na base de dev');

    await expect(cartaoChamadas(page).getByRole('columnheader', { name: 'Custo' })).toBeVisible();
    await expect(cartaoChamadas(page).getByRole('columnheader', { name: 'Audio' })).toBeVisible();

    // O seletor de nota existe por linha, e comeca vazio quando ninguem ouviu.
    const seletores = cartaoChamadas(page).getByRole('combobox');
    await expect(seletores.first()).toBeVisible();
  });

  test('os indicadores dizem sobre quantas chamadas cada media foi calculada', async ({ page }) => {
    /*
     * A regra que o painel nao pode quebrar: media sem base declarada engana.
     * "Nota media 5" com uma chamada avaliada de cem parece resultado da
     * operacao inteira, e o detalhe do indicador e o que impede essa leitura.
     */
    await entrar(page, 'admin', '/telefonia');

    const custo = page.locator('div').filter({ hasText: /^Custo \(24h\)/ }).first();
    await expect(custo).toBeVisible({ timeout: 15_000 });
    await expect(custo).toContainText(/chamada\(s\) com custo informado|o provedor nao informou custo/);

    const nota = page.locator('div').filter({ hasText: /^Nota media/ }).first();
    await expect(nota).toBeVisible();
    await expect(nota).toContainText(/sem classificacao|todas as ligacoes classificadas/);
  });
});
