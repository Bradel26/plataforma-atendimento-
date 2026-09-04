import { expect, test, type Page } from '@playwright/test';
import { entrar } from './helpers';

/**
 * Ciclo de vida do contato (item E.4) — o funil "Leads -> Suspects" da
 * demonstracao.
 *
 * O que a API prova em 16 asercoes: que o degrau e **derivado** (criar uma
 * conversa muda de LEAD para CONTATADO sem ninguem editar campo), que a soma dos
 * degraus e o total da base, e que nao existe rota para digitar o ciclo.
 *
 * O que so o navegador prova, e que e onde este item viraria enfeite: que o
 * grafico **e o filtro**. Clicar num degrau estreita a lista de contatos ao lado
 * — sem isso, o funil seria um desenho bonito que nao leva a nenhuma acao.
 */

const cartaoCiclo = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Ciclo de vida', exact: true }) });

const listaDeContatos = (page: Page) =>
  page.locator('section').filter({ has: page.getByPlaceholder('Buscar por nome, e-mail ou telefone') });

test.describe('Ciclo de vida', () => {
  test('o funil mostra os seis degraus e a base de onde eles saem', async ({ page }) => {
    await entrar(page, 'admin', '/crm?aba=contatos');
    await expect(cartaoCiclo(page)).toBeVisible({ timeout: 15_000 });

    for (const degrau of ['Cliente', 'Em negociacao', 'Perdido', 'Qualificado', 'Contatado', 'Lead']) {
      // Degrau vazio continua na tela: escada que muda de forma a cada leitura
      // esconde justamente o "nao temos nenhum qualificado".
      await expect(cartaoCiclo(page).getByText(degrau, { exact: true })).toBeVisible();
    }

    // A descricao diz de que base o numero fala, e avisa que nao e conversao do
    // periodo — ler uma foto como fluxo produz a conclusao errada.
    await expect(cartaoCiclo(page)).toContainText('contato(s) na carteira');
    await expect(cartaoCiclo(page)).toContainText('nao conversao do periodo');
  });

  test('a tela diz que o degrau e derivado, e nao digitado', async ({ page }) => {
    /*
     * Importa dizer isso na tela, e nao so no codigo: um usuario que procura o
     * seletor "mudar para Cliente" e nao encontra conclui que falta recurso. A
     * frase explica que o degrau sai do que acontece com o contato.
     */
    await entrar(page, 'admin', '/crm?aba=contatos');
    await expect(cartaoCiclo(page)).toBeVisible({ timeout: 15_000 });
    await expect(cartaoCiclo(page)).toContainText('derivado');
    await expect(cartaoCiclo(page)).toContainText('Nenhum degrau e digitado');
  });

  test('clicar num degrau filtra a lista de contatos', async ({ page }) => {
    await entrar(page, 'admin', '/crm?aba=contatos');
    await expect(cartaoCiclo(page)).toBeVisible({ timeout: 15_000 });

    const lista = listaDeContatos(page);
    const linhas = lista.locator('ul > li');
    await expect(linhas.first()).toBeVisible({ timeout: 15_000 });
    const antes = await linhas.count();

    // "Lead" e o degrau que a base de dev tem povoado (contato sem conversa).
    const degrau = cartaoCiclo(page).getByRole('button').filter({ hasText: 'Lead' }).first();
    await degrau.click();
    await expect(degrau).toHaveAttribute('aria-pressed', 'true');

    // A lista tem de mudar de conteudo: ou encolhe, ou passa a mostrar so um
    // degrau. Comparar so a contagem seria fraco — a base pode ter exatamente o
    // mesmo tamanho —, entao o teste confere as etiquetas das linhas.
    await expect(linhas.first()).toBeVisible({ timeout: 15_000 });
    const etiquetas = await lista.getByText('Lead', { exact: true }).count();
    const depois = await linhas.count();
    expect(depois).toBeLessThanOrEqual(antes);
    expect(etiquetas).toBeGreaterThan(0);

    // Nenhuma linha filtrada por "Lead" pode exibir outro degrau.
    for (const outro of ['Cliente', 'Em negociacao', 'Perdido', 'Qualificado', 'Contatado']) {
      await expect(lista.getByText(outro, { exact: true })).toHaveCount(0);
    }

    // E desligar volta atras: filtro que nao desliga prende quem clicou.
    await degrau.click();
    await expect(degrau).toHaveAttribute('aria-pressed', 'false');
    await expect(linhas.first()).toBeVisible({ timeout: 15_000 });
  });
});
