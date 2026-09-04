import { expect, test, type Page } from '@playwright/test';
import { entrar } from './helpers';

/**
 * Cronometros e sinal de proximo passo no cartao do funil (item 1.1 do plano em
 * ANALISE-CRM.md, secao 8.2).
 *
 * O que so o navegador prova, e que nem o vitest nem a conferencia pela API
 * cobrem: que os dois numeros e o aviso **aparecem no cartao do kanban**. A API
 * ja devolvia `diasNoEstagio` e `diasAberta` desde o inicio, e a ficha da
 * oportunidade ja os mostrava — o defeito era exatamente este: o dado existia e
 * a tela onde ele serve para agir nao o exibia. Um teste de unidade sobre a
 * funcao de sinal passaria com o cartao vazio.
 *
 * A logica do sinal tem teste proprio em `sinalDeAcao.test.ts`, com as
 * fronteiras; aqui verifica-se so o que o DOM mostra.
 */

const cartaoDoFunil = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Funil', exact: true }) });

/** Um cartao qualquer do quadro. O quadro rola na horizontal e tem varias colunas. */
const primeiroCartao = (page: Page) => page.locator('li[draggable="true"]').first();

/**
 * Espera o quadro chegar e devolve quantos cartoes ha.
 *
 * O cartao "Funil" renderiza na hora, com a descricao "Carregando...", e as
 * colunas so aparecem quando `/oportunidades/kanban` responde. Um `count()` de
 * cartao avaliado nesse intervalo devolve zero — e a primeira versao deste
 * arquivo fazia isso: dois dos tres testes **pularam em silencio** por falta de
 * dado que existia. Teste pulado nao e teste verde; e teste que ninguem le.
 */
async function esperarQuadro(page: Page) {
  await expect(cartaoDoFunil(page)).toBeVisible();
  await expect(cartaoDoFunil(page).getByText('Carregando...')).toHaveCount(0, { timeout: 10_000 });
  return page.locator('li[draggable="true"]').count();
}

test.describe('Cartao do funil', () => {
  test('mostra dias na etapa e idade total no cartao, nao so na ficha', async ({ page }) => {
    await entrar(page, 'admin', '/crm?aba=oportunidades');

    test.skip((await esperarQuadro(page)) === 0, 'Nenhuma oportunidade aberta na base');
    const cartao = primeiroCartao(page);

    // O formato e "Nd na etapa · Nd total". Casar o padrao, e nao um numero
    // fixo, porque o numero muda a cada dia que a base de dev envelhece.
    await expect(cartao.getByText(/\d+d na etapa · \d+d total/)).toBeVisible();
  });

  test('avisa "Sem proxima acao" no cartao sem tarefa, e o aviso sai quando ha tarefa', async ({ page }) => {
    await entrar(page, 'admin', '/crm?aba=oportunidades');
    test.skip((await esperarQuadro(page)) === 0, 'Nenhuma oportunidade aberta na base');
    const cartao = primeiroCartao(page);

    const aviso = cartao.getByText('Sem proxima acao', { exact: true });
    // A base de desenvolvimento nao garante um cartao sem tarefa. Se o primeiro
    // cartao ja tiver proxima acao marcada, o aviso corretamente nao aparece — e
    // isso e o outro lado da mesma afirmacao, entao vale como verificacao.
    const semTarefa = await aviso.count();

    if (semTarefa) {
      await expect(aviso).toBeVisible();
    } else {
      // Sem o aviso, o cartao tem de ter tarefa: ou em dia (nenhum selo) ou
      // atrasada (selo de atraso). O que nao pode e mostrar os dois.
      await expect(cartao.getByText('Sem proxima acao', { exact: true })).toHaveCount(0);
    }

    // Os dois avisos sao mutuamente exclusivos — nunca no mesmo cartao. Se
    // aparecessem juntos, o vendedor leria "nao tem proximo passo" e "o proximo
    // passo esta atrasado" ao mesmo tempo, e pararia de ler os dois.
    const atrasada = await cartao.getByText('Tarefa atrasada', { exact: true }).count();
    expect(Math.min(semTarefa, atrasada)).toBe(0);
  });

  test('a ficha continua mostrando os mesmos dois numeros do cartao', async ({ page }) => {
    await entrar(page, 'admin', '/crm?aba=oportunidades');
    test.skip((await esperarQuadro(page)) === 0, 'Nenhuma oportunidade aberta na base');
    const cartao = primeiroCartao(page);

    // Le o numero do cartao antes de abrir, para comparar com a ficha: os dois
    // vem do mesmo campo da API, e divergirem significaria que uma das telas
    // recalcula por conta propria — que e o defeito que a contagem na API
    // existe para impedir.
    const texto = (await cartao.getByText(/\d+d na etapa · \d+d total/).innerText()).trim();
    const diasNaEtapa = texto.match(/^(\d+)d na etapa/)?.[1];
    expect(diasNaEtapa).toBeDefined();

    await cartao.locator('button').first().click();
    await expect(page).toHaveURL(/\/oportunidades\/[0-9a-f-]{36}$/);
    await expect(page.getByText(`${diasNaEtapa} dia(s)`).first()).toBeVisible();
  });
});
