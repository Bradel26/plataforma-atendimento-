import { expect, test, type Page } from '@playwright/test';
import { entrar } from './helpers';

/**
 * Etiquetas na conversa (item 5.2).
 *
 * O que so o navegador prova, e nem o vitest nem o `smoke:tags` cobrem:
 *
 * - que a etiqueta digitada no painel volta **normalizada** e aparece como chip
 *   no cartao da conversa, na coluna da esquerda — sao dois componentes
 *   diferentes lendo o mesmo dado, e a lista se atualiza por evento;
 * - que a etiqueta recem-criada entra no **filtro** sem recarregar a pagina. A
 *   decisao 53 registra que este defeito exato ja aconteceu na aba de contatos
 *   e passou por typecheck, vitest e API;
 * - que ligar o filtro estreita a lista e desligar a devolve.
 *
 * O relatorio por assunto tem checagem propria no `smoke:tags`, com numero
 * conferivel; aqui verifica-se apenas que o cartao existe e nao explode.
 */

const cartao = (page: Page, titulo: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: titulo, exact: true }) });

/** A etiqueta e unica por execucao: duas rodadas nao podem se atrapalhar. */
const etiqueta = () => `assunto ${Date.now() % 1000000}`;

/** A coluna da esquerda do painel de atendimento, onde ficam a busca e as abas. */
const colunaConversas = (page: Page) =>
  page.locator('section').filter({ has: page.getByPlaceholder('Buscar por contato ou mensagem') });

/**
 * Acha a etiqueta entre os botoes do filtro, expandindo a lista se preciso.
 *
 * O filtro mostra as mais usadas e esconde o resto atras de "+N etiquetas", e
 * uma etiqueta recem-criada tem uso 1 — numa base com etiquetas de verdade ela
 * nasce escondida. Foi assim que a versao equivalente deste teste no CRM
 * falhou, e a falha era do desenho, nao do teste.
 */
async function filtroDaEtiqueta(page: Page, tag: string) {
  const coluna = colunaConversas(page);
  const botao = coluna.getByRole('button', { name: tag, exact: true });
  if (await botao.count()) return botao;
  const expandir = coluna.getByRole('button', { name: /^\+\d+ etiquetas$/ });
  if (await expandir.count()) await expandir.click();
  return botao;
}

/**
 * Remove a etiqueta que o teste criou.
 *
 * Não é higiene opcional. O máximo é 20 etiquetas por registro, e um teste que
 * deixa a sua para trás gasta uma vaga a cada execução — no vigésimo dia a
 * escrita passa a ser recusada com 400 e o teste falha por acúmulo, não por
 * defeito. Foi o que se encontrou na suíte do CRM: 16 de 20 vagas ocupadas por
 * etiquetas `teste NNNNNN` de execuções antigas.
 */
async function limpar(page: Page, tag: string) {
  const remover = page.getByRole('button', { name: `Remover etiqueta ${tag}` });
  // Espera o botao em vez de checar `count()` e desistir: o painel recarrega
  // depois de gravar, e um `count()` avaliado nesse intervalo devolve zero —
  // limpeza que falha calada e pior que limpeza nenhuma, porque ninguem procura.
  await expect(remover).toBeVisible();
  await remover.click();
  await expect(remover).toHaveCount(0);
}

/**
 * Abre a primeira conversa que houver, procurando aba por aba.
 *
 * A base de desenvolvimento nao garante conversa em nenhuma aba especifica, e
 * fixar "Em espera" faria o teste falhar por falta de dado — o que se parece
 * com defeito e nao e.
 */
async function abrirPrimeiraConversa(page: Page) {
  const coluna = colunaConversas(page);
  for (const aba of ['Em espera', 'Em atendimento', 'Atribuido', 'Finalizado']) {
    await coluna.getByRole('button', { name: new RegExp(`^${aba}`) }).click();
    const primeira = coluna.locator('li button').first();
    // A lista carrega por requisicao: sem a espera, a primeira aba responderia
    // "vazia" antes de a resposta chegar e o teste pularia para a proxima.
    await page.waitForTimeout(500);
    if (await primeira.count()) {
      await primeira.click();
      return true;
    }
  }
  return false;
}

test.describe('Etiquetas da conversa', () => {
  test('etiqueta digitada no painel volta normalizada, chega ao cartao e ao filtro', async ({ page }) => {
    await entrar(page, 'admin', '/atendimento');

    test.skip(!(await abrirPrimeiraConversa(page)), 'Nenhuma conversa na base para etiquetar');

    const tag = etiqueta();
    const campo = page.getByLabel('Nova etiqueta');
    await expect(campo).toBeVisible();

    // Caixa alta e espaco duplo de proposito: e o que a normalizacao trata, e o
    // chip so pode aparecer na forma normalizada.
    await campo.fill(`  ${tag.toUpperCase()}  `);
    await campo.press('Enter');

    // No painel, dentro do editor: chip com o botao de remover ao lado.
    await expect(page.getByRole('button', { name: `Remover etiqueta ${tag}` })).toBeVisible();

    // E no cartao da lista, que e outro componente — ele se atualiza pelo
    // evento de conversa atualizada, nao por recarregar a coluna.
    await expect(colunaConversas(page).getByText(tag, { exact: true }).first()).toBeVisible();

    // E no filtro, sem recarregar a pagina.
    const botaoFiltro = await filtroDaEtiqueta(page, tag);
    await expect(botaoFiltro).toBeVisible();

    await limpar(page, tag);
  });

  test('filtro por etiqueta estreita a lista e desligar devolve', async ({ page }) => {
    await entrar(page, 'admin', '/atendimento');

    test.skip(!(await abrirPrimeiraConversa(page)), 'Nenhuma conversa na base para etiquetar');

    const coluna = colunaConversas(page);
    const tag = etiqueta();
    const campo = page.getByLabel('Nova etiqueta');
    await campo.fill(tag);
    await campo.press('Enter');
    await expect(page.getByRole('button', { name: `Remover etiqueta ${tag}` })).toBeVisible();

    const antes = await coluna.locator('li button').count();

    const botaoFiltro = await filtroDaEtiqueta(page, tag);
    await botaoFiltro.click();
    // `aria-pressed` e o que diz que o filtro esta ligado; a cor nao e
    // verificavel nem serve a quem usa leitor de tela.
    await expect(botaoFiltro).toHaveAttribute('aria-pressed', 'true');

    // A conversa etiquetada e uma so, entao a lista filtrada tem de ser menor
    // ou igual — e nunca maior, que seria o filtro somando em vez de estreitar.
    await expect
      .poll(async () => coluna.locator('li button').count(), { timeout: 5000 })
      .toBeLessThanOrEqual(antes);

    await botaoFiltro.click();
    await expect(botaoFiltro).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(async () => coluna.locator('li button').count(), { timeout: 5000 }).toBe(antes);

    await limpar(page, tag);
  });

  test('Dashboards mostra os cartoes de assunto', async ({ page }) => {
    await entrar(page, 'admin', '/dashboards');

    await expect(page.getByRole('heading', { name: 'Atendimentos por assunto' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tempo medio por assunto' })).toBeVisible();
  });
});
