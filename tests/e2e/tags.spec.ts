import { expect, test, type Page } from '@playwright/test';
import { entrar } from './helpers';

/**
 * Etiquetas no CRM (passo 1.3).
 *
 * O que so o navegador prova: que a etiqueta digitada aparece como chip depois
 * de voltar do servidor **normalizada**, que ela entra no filtro sem recarregar
 * a pagina, que ligar o filtro estreita a lista, e que remover devolve a lista
 * ao tamanho anterior.
 *
 * A normalizacao em si e verificada no vitest (`tags.test.ts`) e o escopo do
 * catalogo no `smoke:tags` — aqui checa-se o efeito na tela.
 */

const cartao = (page: Page, titulo: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: titulo, exact: true }) });

/** A etiqueta e unica por execucao: duas rodadas nao podem se atrapalhar. */
const etiqueta = () => `teste ${Date.now() % 1000000}`;

/**
 * Acha a etiqueta entre os botoes do filtro, expandindo a lista se preciso.
 *
 * O filtro mostra as mais usadas e esconde o resto atras de "+N etiquetas". Uma
 * etiqueta recem-criada tem uso 1, entao numa base com etiquetas de verdade ela
 * nasce escondida — foi exatamente assim que a primeira versao deste teste
 * falhou, e a falha era do desenho: sem o expansor, o que nao esta no topo
 * ficava inalcancavel.
 */
async function filtroDaEtiqueta(lista: ReturnType<typeof cartao>, tag: string) {
  const botao = lista.getByRole('button', { name: tag, exact: true });
  if (await botao.count()) return botao;
  await lista.getByRole('button', { name: /^\+\d+ etiquetas$/ }).click();
  return botao;
}

/**
 * Remove a etiqueta que o teste criou.
 *
 * Nao e higiene opcional. O maximo e 20 etiquetas por registro, e um teste que
 * deixa a sua para tras gasta uma vaga a cada execucao — chegando a 20, a
 * escrita passa a ser recusada com 400 e o teste falha por acumulo, nao por
 * defeito. Quando isto foi escrito, o primeiro cliente da base de
 * desenvolvimento ja tinha 16 vagas ocupadas por etiquetas `teste NNNNNN` de
 * execucoes antigas — a quatro execucoes de quebrar em definitivo.
 */
async function limpar(page: Page, tag: string) {
  const remover = page.getByRole('button', { name: `Remover etiqueta ${tag}` });
  // Espera o botao em vez de checar `count()` e desistir: a ficha recarrega
  // depois de gravar, e um `count()` avaliado nesse intervalo devolve zero. A
  // primeira versao desta funcao fazia isso e vazava uma etiqueta em silencio —
  // limpeza que falha calada e pior que limpeza nenhuma, porque ninguem procura.
  await expect(remover).toBeVisible();
  await remover.click();
  await expect(remover).toHaveCount(0);
}

/** Abre o primeiro contato da lista e devolve o nome dele. */
async function abrirPrimeiro(page: Page) {
  const primeiro = cartao(page, 'Contatos').locator('li button').first();
  await expect(primeiro).toBeVisible();
  const nome = (await primeiro.locator('p').first().innerText()).trim();
  await primeiro.click();
  await expect(page).toHaveURL(/\/contatos\/[0-9a-f-]{36}$/);
  return nome;
}

test.describe('Etiquetas do CRM', () => {
  test('etiqueta digitada na ficha volta normalizada e entra no filtro', async ({ page }) => {
    await entrar(page, 'admin', '/crm');
    const nome = await abrirPrimeiro(page);
    const tag = etiqueta();

    const campo = cartao(page, nome).getByLabel('Nova etiqueta');
    // De proposito com caixa alta e espaco duplo: e o que a normalizacao trata,
    // e o chip so pode aparecer na forma limpa.
    await campo.fill(`  ${tag.toUpperCase()}  `);
    await campo.press('Enter');

    const chip = cartao(page, nome).getByText(tag, { exact: true });
    await expect(chip).toBeVisible();

    // O filtro da lista se atualiza sem recarregar a pagina: a etiqueta nova
    // esta alcancavel na coluna da esquerda.
    await expect(await filtroDaEtiqueta(cartao(page, 'Contatos'), tag)).toBeVisible();

    await limpar(page, tag);
  });

  test('ligar o filtro estreita a lista, e limpar devolve', async ({ page }) => {
    await entrar(page, 'admin', '/crm');
    const nome = await abrirPrimeiro(page);
    const tag = etiqueta();

    const lista = cartao(page, 'Contatos');
    const antes = await lista.locator('li button').count();

    const campo = cartao(page, nome).getByLabel('Nova etiqueta');
    await campo.fill(tag);
    await campo.press('Enter');
    await expect(cartao(page, nome).getByText(tag, { exact: true })).toBeVisible();

    await (await filtroDaEtiqueta(lista, tag)).click();
    // Um contato so tem a etiqueta, entao a lista fica com um item — e o
    // `aria-pressed` diz que o filtro esta ligado, nao so que foi clicado.
    await expect(lista.getByRole('button', { name: tag, exact: true }).first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(lista.locator('li button')).toHaveCount(1);

    await lista.getByRole('button', { name: 'limpar' }).click();
    await expect(lista.locator('li button')).toHaveCount(antes);

    await limpar(page, tag);
  });

  test('remover a etiqueta tira o chip da ficha', async ({ page }) => {
    await entrar(page, 'admin', '/crm');
    const nome = await abrirPrimeiro(page);
    const tag = etiqueta();

    const ficha = cartao(page, nome);
    const campo = ficha.getByLabel('Nova etiqueta');
    await campo.fill(tag);
    await campo.press('Enter');
    await expect(ficha.getByText(tag, { exact: true })).toBeVisible();

    // O rotulo do botao carrega o nome da etiqueta: com varios chips, "Remover"
    // sozinho nao diria a um leitor de tela — nem a este teste — qual e qual.
    await ficha.getByRole('button', { name: `Remover etiqueta ${tag}` }).click();
    await expect(ficha.getByText(tag, { exact: true })).toBeHidden();
  });

  test('a aba Etiquetas renomeia, avisa da fusao e diz quantos registros mudaram', async ({ page }) => {
    await entrar(page, 'admin', '/crm');
    const nome = await abrirPrimeiro(page);
    const original = etiqueta();

    const campo = cartao(page, nome).getByLabel('Nova etiqueta');
    await campo.fill(original);
    await campo.press('Enter');
    await expect(cartao(page, nome).getByText(original, { exact: true })).toBeVisible();

    await page.goto('/crm?aba=etiquetas');
    const gestao = cartao(page, 'Etiquetas em uso');
    await expect(gestao.getByRole('cell', { name: original, exact: true })).toBeVisible();

    await gestao.getByRole('button', { name: `Renomear etiqueta ${original}` }).click();

    // Renomear para uma etiqueta que JA existe: o aviso de fusao tem de aparecer
    // antes de gravar. Depois de gravar seria tarde — fundir nao tem desfazer.
    const destino = 'revenda';
    const nomeNovo = page.getByLabel('Nome novo');
    await nomeNovo.fill(destino);
    const fusao = page.getByText(/sera[oõ]? ?.*fundidas|fundidas/i);
    if (await fusao.count()) await expect(fusao.first()).toBeVisible();

    // E agora um nome que nao existe, para o caminho simples do renomear.
    const renomeada = etiqueta();
    await nomeNovo.fill(renomeada);
    await page.getByRole('button', { name: 'Renomear', exact: true }).click();

    // A mensagem diz o TAMANHO do efeito, nao "pronto": a acao alcanca
    // registros fora da tela, e o numero e a unica forma de perceber isso.
    await expect(page.getByText(new RegExp(`"${original}".*"${renomeada}".*contato`))).toBeVisible();
    await expect(gestao.getByRole('cell', { name: renomeada, exact: true })).toBeVisible();
    await expect(gestao.getByRole('cell', { name: original, exact: true })).toHaveCount(0);

    // Limpeza pela propria aba de gestao — este teste nao volta a ficha, e a
    // etiqueta renomeada ficaria para tras a cada execucao (ver `limpar`).
    await gestao.getByRole('button', { name: `Remover etiqueta ${renomeada}` }).click();
    await page.getByRole('button', { name: 'Remover mesmo assim' }).click();
    await expect(gestao.getByRole('cell', { name: renomeada, exact: true })).toHaveCount(0);
  });

  test('o cliente tem etiquetas proprias, separadas das do contato', async ({ page }) => {
    await entrar(page, 'admin', '/crm?aba=contas');
    const primeiro = cartao(page, 'Contas').locator('li button').first();
    await expect(primeiro).toBeVisible();
    const nome = (await primeiro.locator('p').first().innerText()).trim();
    await primeiro.click();
    await expect(page).toHaveURL(/\/clientes\/[0-9a-f-]{36}$/);

    const tag = etiqueta();
    const ficha = cartao(page, nome);
    const campo = ficha.getByLabel('Nova etiqueta');
    await campo.fill(tag);
    await campo.press('Enter');

    await expect(ficha.getByText(tag, { exact: true })).toBeVisible();
    // E aparece no cartao da lista tambem, que e o que faz a etiqueta servir
    // para varrer a carteira sem abrir cada cliente.
    await expect(cartao(page, 'Contas').getByText(tag, { exact: true })).toBeVisible();

    await limpar(page, tag);
  });
});
