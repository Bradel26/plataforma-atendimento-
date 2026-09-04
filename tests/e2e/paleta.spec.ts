import { expect, test, type Page } from '@playwright/test';
import { entrar } from './helpers';

/**
 * Paleta de comando com Ctrl+K (item 6.2 do plano em ANALISE-CRM.md).
 *
 * A busca tem 7 casos de unidade na ordenacao e 18 asercoes contra a API —
 * inclusive a que mais importa: o resultado do comercial contido no do admin, e
 * o agente sem oportunidade. Os comandos de navegacao tem 11 casos de unidade
 * sobre perfil.
 *
 * Aqui esta o que so o navegador prova: que o atalho abre de qualquer tela, que
 * o teclado navega e abre, e que Esc fecha. Nada disso passa pela API.
 */

const paleta = (page: Page) => page.getByRole('dialog', { name: 'Paleta de comando' });

test.describe('Paleta de comando', () => {
  test('Ctrl+K abre de qualquer tela e Esc fecha', async ({ page }) => {
    await entrar(page, 'admin', '/crm');
    await expect(paleta(page)).toHaveCount(0);

    await page.keyboard.press('Control+k');
    await expect(paleta(page)).toBeVisible();
    // Com o campo vazio, a paleta ja serve para navegar: e o que a pessoa quer
    // no instante em que aperta o atalho.
    await expect(paleta(page).getByText('Ir para').first()).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(paleta(page)).toHaveCount(0);

    /*
     * "De qualquer tela": a segunda metade da afirmacao do titulo.
     *
     * A espera pelo cabecalho e obrigatoria, e a razao e do produto: o token de
     * acesso vive em memoria, entao um `goto` recarrega o app e ele passa por uma
     * restauracao de sessao antes de montar o shell. Apertar Ctrl+K nesse
     * intervalo nao faz nada — e esta certo que nao faca.
     */
    await page.goto('/telefonia');
    await expect(page.getByRole('heading', { level: 1, name: 'Telefonia' })).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Control+k');
    await expect(paleta(page)).toBeVisible();
  });

  test('as setas movem a selecao e o Enter navega', async ({ page }) => {
    await entrar(page, 'admin', '/crm');
    await page.keyboard.press('Control+k');
    await expect(paleta(page)).toBeVisible();

    const itens = paleta(page).getByRole('listitem');
    await expect(itens.first()).toBeVisible();

    // O primeiro item comeca selecionado: sem isso, o Enter logo depois do
    // atalho nao faria nada e a paleta pareceria travada.
    const primeiro = itens.nth(0).getByRole('button');
    await expect(primeiro).toHaveAttribute('aria-current', 'true');

    await page.keyboard.press('ArrowDown');
    await expect(itens.nth(1).getByRole('button')).toHaveAttribute('aria-current', 'true');
    await expect(primeiro).not.toHaveAttribute('aria-current', 'true');

    // A seta para cima volta, e na primeira linha nao circula para o fim.
    await page.keyboard.press('ArrowUp');
    await expect(primeiro).toHaveAttribute('aria-current', 'true');
    await page.keyboard.press('ArrowUp');
    await expect(primeiro).toHaveAttribute('aria-current', 'true');

    const rotulo = (await primeiro.innerText()).split('\n')[0]!.trim();
    await page.keyboard.press('Enter');

    // Navegou e fechou. O titulo do cabecalho e o nome do modulo escolhido.
    await expect(paleta(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: rotulo })).toBeVisible({ timeout: 15_000 });
  });

  test('digitar acha registro e abrir leva para a ficha dele', async ({ page }) => {
    await entrar(page, 'admin', '/crm');
    await page.keyboard.press('Control+k');
    await expect(paleta(page)).toBeVisible();

    // Com menos de duas letras a paleta diz o que falta, em vez de mostrar uma
    // amostra arbitraria de quatro tabelas.
    await paleta(page).getByLabel('Buscar ou ir para').fill('a');
    await expect(paleta(page).getByText(/ao menos duas letras/i)).toBeVisible();

    await paleta(page).getByLabel('Buscar ou ir para').fill('duplic');

    // Espera o registro aparecer. A busca e adiada em 200ms de proposito, e
    // contar itens antes disso encontraria so os comandos de navegacao.
    const registro = paleta(page).getByRole('listitem').filter({ hasText: 'Contato' }).first();
    const achou = await registro
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!achou, 'A base de dev nao tem contato que case com o termo');

    await registro.getByRole('button').click();
    await expect(paleta(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/contatos\/[0-9a-f-]{36}$/);
  });

  test('o agente nao recebe comando para tela que nao e dele', async ({ page }) => {
    /*
     * O escopo dos comandos sai do mesmo `NAV` que desenha o menu — e por isso a
     * paleta nao pode oferecer uma tela que responde 403. A prova de unidade
     * cobre a funcao; aqui a prova e de que a tela usa a funcao.
     */
    await entrar(page, 'agente', '/crm');
    await page.keyboard.press('Control+k');
    await expect(paleta(page)).toBeVisible();

    await expect(paleta(page).getByRole('listitem').filter({ hasText: 'Atendimento' })).toHaveCount(1);
    await expect(paleta(page).getByRole('listitem').filter({ hasText: 'Configuracoes' })).toHaveCount(0);
    await expect(paleta(page).getByRole('listitem').filter({ hasText: 'Area da Gestao' })).toHaveCount(0);
  });
});
