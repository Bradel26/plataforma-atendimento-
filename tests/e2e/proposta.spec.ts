import { expect, test, type Page } from '@playwright/test';
import { entrar } from './helpers';

/**
 * Editor de itens da proposta (item 2.1 do plano em ANALISE-CRM.md).
 *
 * **Este arquivo nao salva.** A aritmetica gravada tem prova propria contra a API
 * (30 asercoes, incluindo desconto, recorrencia, margem parcial e o 400 do
 * desconto abusivo), e ali a oportunidade de prova e apagada no fim.
 *
 * Aqui nao ha como limpar: o `PUT /oportunidades/:id/itens` exige ao menos um
 * item, entao nao existe caminho para devolver uma oportunidade ao estado "sem
 * item nenhum" — e a base de desenvolvimento tem zero itens hoje. Um teste que
 * salvasse deixaria a proposta e o valor alterados para sempre, poluindo o funil
 * e os quatro relatorios da onda 1. Salvar sem poder limpar e pior que nao
 * cobrir: a proxima pessoa herda dado de teste que parece dado real.
 *
 * Sobra, e vale, o que so o navegador prova: que o editor abre com o estado
 * atual, que a previa do liquido reage ao desconto **antes** de salvar, e que o
 * aviso de linha negativa aparece. Nada disso passa pela API.
 */

const cartaoDoFunil = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Funil', exact: true }) });

const cartaoProposta = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Proposta', exact: true }) });

/** Abre a primeira oportunidade ABERTA do quadro. Devolve false se nao houver. */
async function abrirPrimeira(page: Page) {
  await expect(cartaoDoFunil(page)).toBeVisible();
  await expect(cartaoDoFunil(page).getByText('Carregando...')).toHaveCount(0, { timeout: 10_000 });

  const cartao = page.locator('li[draggable="true"]').first();
  if ((await cartao.count()) === 0) return false;
  await cartao.locator('button').first().click();
  await expect(page).toHaveURL(/\/oportunidades\/[0-9a-f-]{36}$/);
  // Espera o cartao Proposta existir antes de devolver. Sem isto, um `count()`
  // no botao do editor roda enquanto a ficha ainda carrega, devolve zero e o
  // teste PULA em silencio — foi o que aconteceu na primeira execucao deste
  // arquivo: 3 de 4 pularam com o dado todo no lugar.
  await expect(cartaoProposta(page)).toBeVisible();
  return true;
}

test.describe('Proposta da oportunidade', () => {
  test('o cartao se chama Proposta e traz as colunas de desconto e margem', async ({ page }) => {
    await entrar(page, 'admin', '/crm?aba=oportunidades');
    test.skip(!(await abrirPrimeira(page)), 'Nenhuma oportunidade aberta na base');

    await expect(cartaoProposta(page)).toBeVisible();
    // Sem item, o cartao mostra o estado vazio e o convite para montar. Com
    // item, mostra a tabela. Os dois caminhos sao validos na base de dev, e o
    // que nao pode e o cartao nao existir.
    const temItens = (await cartaoProposta(page).locator('table').count()) > 0;
    if (temItens) {
      await expect(cartaoProposta(page).getByRole('columnheader', { name: 'Desc.' })).toBeVisible();
      await expect(cartaoProposta(page).getByRole('columnheader', { name: 'Margem' })).toBeVisible();
    } else {
      await expect(cartaoProposta(page).getByRole('button', { name: 'Montar proposta' })).toBeVisible();
    }
  });

  test('a previa do liquido reage ao desconto antes de salvar', async ({ page }) => {
    await entrar(page, 'admin', '/crm?aba=oportunidades');
    test.skip(!(await abrirPrimeira(page)), 'Nenhuma oportunidade aberta na base');

    const abrirEditor = cartaoProposta(page).getByRole('button', { name: /Montar proposta|Editar proposta/ });
    test.skip((await abrirEditor.count()) === 0, 'Oportunidade fechada — o editor nao abre');
    await abrirEditor.click();

    // Preenche uma linha sem salvar.
    await cartaoProposta(page).getByLabel('Produto').first().selectOption({ index: 1 });
    const preco = cartaoProposta(page).getByLabel('Preco unitario').first();
    await preco.fill('1000');
    await cartaoProposta(page).getByLabel('Quantidade').first().fill('2');

    // Sem desconto: 2 x 1.000.
    await expect(cartaoProposta(page).getByRole('status')).toContainText('2.000');

    // Com desconto de 500, a previa cai — e isso acontece no navegador, sem
    // requisicao. E o unico jeito de quem digita ver o efeito antes de gravar.
    await cartaoProposta(page).getByLabel('Desconto').first().fill('500');
    await expect(cartaoProposta(page).getByRole('status')).toContainText('1.500');

    // Cancelar deixa a oportunidade como estava.
    await cartaoProposta(page).getByRole('button', { name: 'Cancelar' }).click();
    await expect(cartaoProposta(page).getByLabel('Desconto')).toHaveCount(0);
  });

  test('linha com desconto maior que o valor avisa antes de tentar salvar', async ({ page }) => {
    await entrar(page, 'admin', '/crm?aba=oportunidades');
    test.skip(!(await abrirPrimeira(page)), 'Nenhuma oportunidade aberta na base');

    const abrirEditor = cartaoProposta(page).getByRole('button', { name: /Montar proposta|Editar proposta/ });
    test.skip((await abrirEditor.count()) === 0, 'Oportunidade fechada — o editor nao abre');
    await abrirEditor.click();

    await cartaoProposta(page).getByLabel('Produto').first().selectOption({ index: 1 });
    await cartaoProposta(page).getByLabel('Preco unitario').first().fill('100');
    await cartaoProposta(page).getByLabel('Desconto').first().fill('300');

    // O aviso no navegador chega antes do 400 do servidor. Os dois existem de
    // proposito: o cliente explica enquanto se digita, o servidor recusa de
    // verdade — e e o servidor que ninguem contorna.
    await expect(cartaoProposta(page).getByText(/total negativo/i)).toBeVisible();

    await cartaoProposta(page).getByRole('button', { name: 'Cancelar' }).click();
  });

  test('a parte mensal aparece separada da parte de uma vez', async ({ page }) => {
    await entrar(page, 'admin', '/crm?aba=oportunidades');
    test.skip(!(await abrirPrimeira(page)), 'Nenhuma oportunidade aberta na base');

    const abrirEditor = cartaoProposta(page).getByRole('button', { name: /Montar proposta|Editar proposta/ });
    test.skip((await abrirEditor.count()) === 0, 'Oportunidade fechada — o editor nao abre');
    await abrirEditor.click();

    await cartaoProposta(page).getByLabel('Produto').first().selectOption({ index: 1 });
    await cartaoProposta(page).getByLabel('Preco unitario').first().fill('500');
    await cartaoProposta(page).getByLabel('Cobranca').first().selectOption('MENSAL');

    // Um valor mensal NAO entra em "uma vez": empilhar os dois daria o numero de
    // nada, que e o erro que o campo unico cometia.
    const resumo = cartaoProposta(page).getByRole('status');
    await expect(resumo).toContainText('por mes');
    await expect(resumo).toContainText('500');
    // E o total explica a conta, com o horizonte.
    await expect(cartaoProposta(page).getByRole('status')).toContainText('meses');

    await cartaoProposta(page).getByRole('button', { name: 'Cancelar' }).click();
  });

  test('sem itens, a plataforma nao oferece o PDF que a API recusaria', async ({ page }) => {
    /*
     * Item 2.2. O download em si e provado contra a API — 19 asercoes, incluindo
     * a assinatura `%PDF-`, o `%%EOF` do fim, o nome do arquivo com o numero da
     * proposta, a recusa com desconto pendente e o 403 do agente. Ali a
     * oportunidade de prova e apagada; aqui nao ha como limpar item nenhum (ver o
     * comentario no topo deste arquivo).
     *
     * O que o navegador prova, e que importa: o botao **nao aparece** quando nao
     * ha o que imprimir. Oferecer um download que volta 400 seria pior que nao
     * oferecer — quem clica ja decidiu mandar a proposta ao cliente.
     */
    await entrar(page, 'admin', '/crm?aba=oportunidades');
    test.skip(!(await abrirPrimeira(page)), 'Nenhuma oportunidade aberta na base');

    const temItens = (await cartaoProposta(page).locator('table').count()) > 0;
    const botao = cartaoProposta(page).getByRole('button', { name: /Baixar proposta/ });
    if (temItens) {
      // Com itens e desconto dentro da alcada, o botao existe.
      await expect(botao).toBeVisible();
    } else {
      await expect(botao).toHaveCount(0);
      await expect(cartaoProposta(page).getByRole('button', { name: 'Montar proposta' })).toBeVisible();
    }
  });
});