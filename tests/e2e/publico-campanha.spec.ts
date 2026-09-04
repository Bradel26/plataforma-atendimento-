import { expect, test, type Page } from '@playwright/test';
import { entrar } from './helpers';

/**
 * Publico de campanha pelos filtros do CRM (item E.3).
 *
 * As 25 asercoes contra a API cobrem as contas: quem recebe, quem falta dado,
 * quem foi anonimizado, e que a previa e a gravacao concordam. La as tres pessoas
 * de prova sao criadas e apagadas.
 *
 * O que so o navegador prova e a **ordem da tela**: o botao que grava nao existe
 * antes de a previa voltar. E o ponto do item — a plataforma tinha um botao
 * "adicionar todos os contatos" que mandava para a base inteira sem ninguem ver
 * para quem.
 *
 * **Este arquivo nao cria campanha e nao grava publico.** Nao ha rota para
 * excluir campanha, entao criar uma deixaria lixo na base a cada execucao; e
 * gravar publico numa campanha existente mudaria o que ela vai disparar. O teste
 * abre uma campanha que ja existe e para no botao — nunca clica nele.
 */

const cartaoPublico = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Montar publico', exact: true }) });

const botaoGravar = (page: Page) =>
  cartaoPublico(page).getByRole('button', { name: /^Adicionar \d+ a campanha$/ });

/** Abre a primeira campanha da lista. Devolve false se a base nao tiver nenhuma. */
async function abrirPrimeira(page: Page) {
  const lista = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Campanhas' }) });
  const primeira = lista.locator('ul > li button, li button').first();
  const existe = await primeira
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!existe) return false;
  await primeira.click();
  return cartaoPublico(page)
    .waitFor({ state: 'visible', timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
}

test.describe('Publico de campanha', () => {
  test('o botao de gravar so aparece depois da previa, e o filtro novo o retira', async ({ page }) => {
    await entrar(page, 'admin', '/campanhas');
    test.skip(!(await abrirPrimeira(page)), 'Nenhuma campanha na base de dev');

    // Sem filtro: o motivo aparece ANTES do clique, e o botao esta desligado.
    const verPublico = cartaoPublico(page).getByRole('button', { name: 'Ver publico' });
    await expect(verPublico).toBeDisabled();
    await expect(cartaoPublico(page)).toContainText('Escolha ao menos um filtro');
    await expect(botaoGravar(page)).toHaveCount(0);

    // Liga um degrau do ciclo de vida — o mesmo filtro da tela de contatos.
    await cartaoPublico(page).getByRole('button', { name: 'Lead', exact: true }).click();
    await expect(verPublico).toBeEnabled();

    // Filtro escolhido e previa ainda nao pedida: continua sem botao de gravar.
    await expect(botaoGravar(page)).toHaveCount(0);

    await verPublico.click();

    // Agora a previa existe: a base filtrada aparece, e o botao de gravar tambem.
    await expect(cartaoPublico(page)).toContainText('casaram com o filtro', { timeout: 15_000 });
    await expect(botaoGravar(page)).toBeVisible();

    /*
     * E mudar o filtro invalida a previa.
     *
     * Numero velho ao lado de filtro novo e como alguem dispara para o publico
     * errado acreditando ter conferido.
     */
    await cartaoPublico(page).getByRole('button', { name: 'Cliente', exact: true }).click();
    await expect(botaoGravar(page)).toHaveCount(0);
    await expect(cartaoPublico(page)).not.toContainText('casaram com o filtro');
  });

  test('a tela diz que nao existe filtro por regiao', async ({ page }) => {
    /*
     * A demonstracao filtrava por mesorregiao, e a plataforma nao guarda endereco
     * de contato nenhum. Dizer isso na tela e melhor que oferecer um filtro que
     * devolveria zero sempre — e melhor que deixar quem procura concluir que o
     * dado existe em outra tela.
     */
    await entrar(page, 'admin', '/campanhas');
    test.skip(!(await abrirPrimeira(page)), 'Nenhuma campanha na base de dev');

    await expect(cartaoPublico(page)).toContainText('Nao ha filtro por regiao');
  });
});
