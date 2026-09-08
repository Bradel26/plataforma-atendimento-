import { expect, test } from '@playwright/test';
import { entrar } from './helpers';

/**
 * Matriz de produtividade (item 3.3).
 *
 * O que so o navegador prova: que registrar duas ligacoes com prazo e concluir
 * uma delas produz "1/2 (50%)" na celula certa da matriz, que o drill-down
 * abre a lista com as duas atividades, e que um tipo sem nenhuma agendada
 * aparece como travessao — nunca "0/0" nem "0%".
 *
 * A limpeza no fim e por API (`page.request`, com o token capturado do
 * proprio trafego da pagina): sem ela, rodar a suite duas vezes no mesmo mes
 * acumula atividade de uma execucao na outra e o "1/2" da segunda vez vira
 * "1/4" — foi exatamente o que aconteceu ao escrever este teste.
 */

const cartao = (page: import('@playwright/test').Page, titulo: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: titulo, exact: true }) });

// Mes bem no futuro, para nao colidir com dado de seed nem com o roteiro de
// smoke (que usa 2031-05).
const MES = '2031-08';
const PRAZO = `${MES}-15T10:00`;

test.describe('Matriz de produtividade', () => {
  let token = '';
  const idsParaApagar: string[] = [];

  test.beforeEach(async ({ page }) => {
    token = '';
    idsParaApagar.length = 0;
    // Captura o Authorization que a propria pagina manda, para a limpeza por
    // API no fim poder autenticar sem reimplementar o login por token.
    page.on('request', (req) => {
      const auth = req.headers()['authorization'];
      if (auth && !token) token = auth;
    });
    await entrar(page, 'admin', '/crm');
  });

  test.afterEach(async ({ page }) => {
    if (!token) return;
    for (const id of idsParaApagar) {
      await page.request.delete(`/api/atividades/${id}`, { headers: { Authorization: token } }).catch(() => undefined);
    }
  });

  test('feitas/agendadas aparece certo na celula, com drill-down, e tipo sem agendada e travessao', async ({ page }) => {
    // Cadastra um contato novo para registrar as duas ligacoes nele — a aba
    // padrao (Contatos) e a que tem o card "Tarefas marcadas" com o botao
    // "Concluir", que a ficha de conta nao tem.
    const cadastro = cartao(page, 'Contatos');
    await cadastro.getByRole('button', { name: 'Novo contato' }).click();
    const marca = `Produtividade ${Date.now().toString(36)}`;
    await cadastro.getByLabel('Nome').fill(marca);
    await cadastro.getByLabel('Telefone').fill('62999990000');
    await cadastro.getByRole('button', { name: 'Cadastrar contato' }).click();
    await expect(page.getByRole('heading', { name: marca, exact: true })).toBeVisible();

    const registrar = cartao(page, 'Registrar');
    const tituloFeita = `Ligacao feita ${Date.now().toString(36)}`;
    const tituloAberta = `Ligacao aberta ${Date.now().toString(36)}`;

    for (const titulo of [tituloFeita, tituloAberta]) {
      await registrar.getByLabel('Tipo').selectOption('LIGACAO');
      await registrar.getByLabel('O que aconteceu').fill(titulo);
      await registrar.getByRole('button', { name: 'Detalhes e prazo' }).click();
      await registrar.getByLabel('Prazo').fill(PRAZO);
      const [resposta] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('/api/atividades') && r.request().method() === 'POST'),
        registrar.getByRole('button', { name: 'Criar tarefa' }).click(),
      ]);
      idsParaApagar.push((await resposta.json()).atividade.id);
      await expect(cartao(page, 'Linha do tempo').getByText(titulo)).toBeVisible();
    }

    // Conclui so uma das duas.
    const tarefas = cartao(page, 'Tarefas marcadas');
    const linhaTarefa = tarefas.locator('li').filter({ hasText: tituloFeita });
    await expect(linhaTarefa).toBeVisible();
    const [concluirResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/concluir') && r.request().method() === 'POST'),
      linhaTarefa.getByRole('button', { name: 'Concluir' }).click(),
    ]);
    expect(concluirResp.status(), 'POST /concluir deveria responder 200').toBe(200);

    // "Produtividade" e leitura de gestao: mora dentro do menu "Mais", nao
    // como aba direta.
    await page.getByRole('button', { name: 'Mais' }).click();
    await page.getByRole('menuitem', { name: 'Produtividade', exact: true }).click();
    const painel = cartao(page, 'Produtividade');
    await painel.getByLabel('Mes').fill(MES);

    const matriz = cartao(page, 'Matriz');
    const linhaAdmin = matriz.locator('tr').filter({ hasText: 'Administrador' });
    await expect(linhaAdmin).toBeVisible();

    const celulaLigacao = linhaAdmin.locator('td').nth(3); // Pessoa, Nota, Tarefa, Ligacao
    await expect(celulaLigacao.getByText('1/2')).toBeVisible();
    await expect(celulaLigacao.getByText('(50%)')).toBeVisible();

    // Visita (9a coluna: Pessoa, Nota, Tarefa, Ligacao, WhatsApp, E-mail, Reuniao,
    // Visita) nao tem nenhuma atividade agendada nesta linha — travessao, nao "0/0".
    const celulaVisita = linhaAdmin.locator('td').nth(7);
    await expect(celulaVisita).toHaveText('—');

    await celulaLigacao.getByRole('button').click();
    const drillDown = cartao(page, 'Administrador — Ligacao');
    await expect(drillDown).toBeVisible();
    await expect(drillDown.getByText(tituloFeita)).toBeVisible();
    await expect(drillDown.getByText(tituloAberta)).toBeVisible();
    await expect(drillDown.getByText(/Feita em/)).toBeVisible();
    await expect(drillDown.getByText('Em aberto')).toBeVisible();
  });
});
