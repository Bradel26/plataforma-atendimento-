import { expect, test, type Page } from '@playwright/test';
import { entrar } from './helpers';

/**
 * Endereco proprio para cada registro do CRM.
 *
 * O que so o navegador prova: que a URL digitada a mao abre a ficha sem passar
 * pela lista, que o F5 devolve o mesmo registro (era estado local, e voltava em
 * branco), que o botao voltar do navegador desfaz a navegacao e que id
 * inexistente — ou de outra organizacao, que a API responde igual de proposito —
 * chega na tela como "nao encontrado" em vez de tela quebrada.
 *
 * A permissao das rotas novas e verificada no vitest (`nav.test.ts`), onde da
 * para afirmar que ela e *a mesma* do modulo. Aqui checa-se o efeito: o perfil
 * mais restrito que tem CRM entra, e o menu continua marcando onde a pessoa esta.
 */

const cartao = (page: Page, titulo: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: titulo, exact: true }) });

/** Abre o primeiro contato pela lista e devolve nome e id (lido da URL). */
async function abrirPrimeiroContato(page: Page) {
  const lista = cartao(page, 'Contatos');
  const primeiro = lista.locator('li button').first();
  await expect(primeiro).toBeVisible();
  const nome = (await primeiro.locator('p').first().innerText()).trim();
  await primeiro.click();
  // A URL passa a ser a fonte da selecao: esperar por ela e esperar pelo estado.
  await expect(page).toHaveURL(/\/contatos\/[0-9a-f-]{36}$/);
  const id = new URL(page.url()).pathname.split('/').pop()!;
  return { nome, id };
}

test.describe('Rotas proprias do CRM', () => {
  test('clicar num contato leva a URL dele, e o F5 mantem a ficha aberta', async ({ page }) => {
    await entrar(page, 'admin', '/crm');
    const { nome, id } = await abrirPrimeiroContato(page);
    await expect(cartao(page, nome)).toBeVisible();

    // O ponto do passo: recarregar. Com a selecao em `useState`, aqui voltava a
    // tela "Selecione um contato" e o endereco na barra ficava mentindo.
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/contatos/${id}$`));
    await expect(cartao(page, nome)).toBeVisible();
  });

  test('a URL do contato aberta direto monta a ficha sem passar pela lista', async ({ page }) => {
    await entrar(page, 'admin', '/crm');
    const { nome, id } = await abrirPrimeiroContato(page);

    /*
     * Sai do CRM e volta pelo endereco, como quem recebeu o link no chat.
     *
     * A saida e pelo menu, e nao por um segundo `page.goto`: cada carregamento
     * de pagina gasta o refresh token, que e de uso unico, e dois seguidos
     * derrubam a sessao antes de o teste chegar ao que interessa. Foi
     * exatamente o que aconteceu na primeira versao deste caso — a falha
     * apareceu como "a ficha nao montou", com a tela de login por tras.
     */
    await page.locator('nav a[href="/dashboards"]').click();
    await expect(cartao(page, 'Contatos')).toBeHidden();
    await page.goto(`/contatos/${id}`);

    await expect(cartao(page, nome)).toBeVisible();
    // A ficha inteira, e nao so o cabecalho: os indicadores vem de outra chamada.
    await expect(cartao(page, nome).getByText('Conversas', { exact: true })).toBeVisible();
    await expect(cartao(page, 'Linha do tempo')).toBeVisible();
  });

  test('o menu continua marcando o CRM estando numa rota de registro', async ({ page }) => {
    await entrar(page, 'admin', '/crm');
    const { id } = await abrirPrimeiroContato(page);
    await page.goto(`/contatos/${id}`);

    // `aria-current="page"` e o que o menu usa para dizer onde a pessoa esta.
    // Sem herdar a subrota, nenhum item ficaria marcado e o menu diria que ela
    // nao esta em lugar nenhum.
    const ativo = page.locator('nav a[aria-current="page"]');
    await expect(ativo).toHaveCount(1);
    await expect(ativo).toHaveAttribute('href', '/crm');
  });

  test('voltar no navegador desfaz a abertura do registro', async ({ page }) => {
    await entrar(page, 'admin', '/crm');
    await abrirPrimeiroContato(page);

    await page.goBack();
    await expect(page).toHaveURL(/\/crm$/);
    await expect(cartao(page, 'Ficha do contato')).toBeVisible();
  });

  test('o link "Todos os contatos" volta para a lista limpa', async ({ page }) => {
    await entrar(page, 'admin', '/crm');
    await abrirPrimeiroContato(page);

    await page.getByRole('button', { name: 'Todos os contatos' }).click();
    await expect(page).toHaveURL(/\/crm$/);
    await expect(cartao(page, 'Ficha do contato')).toBeVisible();
  });

  test('cliente tem endereco proprio e sobrevive ao F5', async ({ page }) => {
    await entrar(page, 'admin', '/crm?aba=contas');

    const lista = cartao(page, 'Contas');
    const primeiro = lista.locator('li button').first();
    await expect(primeiro).toBeVisible();
    const nome = (await primeiro.locator('p').first().innerText()).trim();
    await primeiro.click();

    await expect(page).toHaveURL(/\/clientes\/[0-9a-f-]{36}$/);
    await expect(cartao(page, nome)).toBeVisible();

    await page.reload();
    // A aba tambem tem de voltar: recarregar em `/clientes/:id` precisa devolver
    // a aba Contas, e nao a primeira aba com o registro perdido.
    await expect(cartao(page, nome)).toBeVisible();
    await expect(cartao(page, 'Contas')).toBeVisible();
  });

  test('oportunidade tem endereco proprio, com itens e volta para o cliente', async ({ page }) => {
    await entrar(page, 'admin', '/crm?aba=oportunidades');

    /*
     * Espera o kanban montar antes de procurar cartao.
     *
     * A primeira versao usava `isVisible()` sem espera, que responde sobre o
     * instante em que e chamada — e nesse instante a chamada do kanban ainda
     * estava em voo. O teste se pulava sozinho e passava como "skipped", que e
     * a pior forma de falhar: parece verde.
     */
    await expect(page.getByText('Previsao ponderada')).toBeVisible();

    const cartoes = page.locator('li button').first();
    if ((await page.locator('li button').count()) === 0) {
      // Funil vazio (banco recem-semeado): cria uma para o caso ter o que abrir.
      await page.getByLabel('Titulo').fill(`Oportunidade rota ${Date.now() % 100000}`);
      await page.getByLabel('Conta').selectOption({ index: 1 });
      await page.getByLabel('Valor').fill('1500');
      await page.getByRole('button', { name: 'Criar' }).click();
      await expect(cartoes).toBeVisible();
    }

    const titulo = (await cartoes.innerText()).trim();
    await cartoes.click();

    await expect(page).toHaveURL(/\/oportunidades\/[0-9a-f-]{36}$/);
    await expect(cartao(page, titulo)).toBeVisible();
    await expect(cartao(page, 'Itens')).toBeVisible();

    await page.reload();
    await expect(cartao(page, titulo)).toBeVisible();

    // O caminho de ida para o cliente, que so existe porque `/clientes/:id` existe.
    await cartao(page, titulo).getByRole('link').first().click();
    await expect(page).toHaveURL(/\/clientes\/[0-9a-f-]{36}$/);
  });

  test('id que nao existe mostra "nao encontrado", nao tela quebrada', async ({ page }) => {
    await entrar(page, 'admin', '/crm');

    // Um uuid valido e inexistente. E o mesmo 404 que a API devolve para
    // registro de outra organizacao — de proposito, para nao confirmar que
    // existe. Os dois casos tem de chegar nesta tela.
    const inexistente = '00000000-0000-4000-8000-000000000abc';

    await page.goto(`/contatos/${inexistente}`);
    await expect(page.getByText('Contato nao encontrado')).toBeVisible();

    await page.goto(`/clientes/${inexistente}`);
    await expect(page.getByText('Cliente nao encontrado')).toBeVisible();

    await page.goto(`/oportunidades/${inexistente}`);
    await expect(page.getByText('Oportunidade nao encontrada')).toBeVisible();
  });

  test('o perfil mais restrito com CRM entra pela rota de registro', async ({ page }) => {
    // AGENTE e o perfil mais restrito que ve o CRM. Se a rota de registro nao
    // herdasse a permissao do modulo, ela cairia no redirecionamento de rota
    // desconhecida e ele acabaria em Atendimento.
    await entrar(page, 'agente', '/crm');
    const { nome, id } = await abrirPrimeiroContato(page);

    await page.goto(`/contatos/${id}`);
    await expect(page).toHaveURL(new RegExp(`/contatos/${id}$`));
    await expect(cartao(page, nome)).toBeVisible();
  });
});
