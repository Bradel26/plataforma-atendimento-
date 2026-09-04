import { expect, test, type Page } from '@playwright/test';
import { entrar } from './helpers';

/**
 * Edicao dos campos da oportunidade.
 *
 * A tela nasceu de duas faltas que se encontraram: a proposta impressa (item
 * 2.2) precisa de condicao de pagamento e prazo de entrega, e a trilha de
 * auditoria (item 3.2) grava edicao de campo — mas o unico PATCH que a interface
 * fazia era o arraste de etapa. Titulo, valor, responsavel e previsao existiam na
 * API desde a Fase 2 e so podiam ser mudados por quem chamasse a rota direto.
 *
 * Este arquivo **escreve** numa oportunidade da base de dev, e restaura tudo no
 * `finally` — inclusive apagando o texto que escreveu. Diferente dos itens, aqui
 * a restauracao e possivel: os dois campos aceitam nulo, que e o estado original.
 */

const cartaoDoFunil = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Funil', exact: true }) });

const cartaoHistorico = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Historico', exact: true }) });

/** Abre a primeira oportunidade ABERTA e espera o botao de edicao existir. */
async function abrirPrimeira(page: Page) {
  await expect(cartaoDoFunil(page)).toBeVisible();
  await expect(cartaoDoFunil(page).getByText('Carregando...')).toHaveCount(0, { timeout: 10_000 });

  const cartao = page.locator('li[draggable="true"]').first();
  if ((await cartao.count()) === 0) return false;
  await cartao.locator('button').first().click();
  await expect(page).toHaveURL(/\/oportunidades\/[0-9a-f-]{36}$/);
  // Espera explicita: `count()` avaliado antes da renderizacao devolve zero e
  // faz o teste pular em silencio.
  await expect(page.getByRole('button', { name: 'Editar dados' })).toBeVisible({ timeout: 15_000 });
  return true;
}

const PRAZO = 'Teste automatizado — 10 dias uteis';

/**
 * O prazo **na lista de dados da ficha**, e nao em qualquer lugar da pagina.
 *
 * O localizador amplo falhou na restauracao e a causa e instrutiva: depois de
 * salvar, o proprio card de Historico passa a conter o texto ("Prazo de entrega:
 * — → Teste automatizado..."). Procurar na pagina inteira nunca veria o campo
 * esvaziar, porque a trilha guarda — corretamente — o que foi escrito.
 */
const prazoNaFicha = (page: Page) => page.locator('dl').getByText(PRAZO);

test.describe('Editar dados da oportunidade', () => {
  test('o prazo de entrega vai para a ficha e a mudanca entra no historico', async ({ page }) => {
    await entrar(page, 'admin', '/crm?aba=oportunidades');
    test.skip(!(await abrirPrimeira(page)), 'Nenhuma oportunidade aberta na base');

    try {
      await page.getByRole('button', { name: 'Editar dados' }).click();
      const campo = page.getByLabel('Prazo de entrega');
      await expect(campo).toBeVisible();
      await campo.fill(PRAZO);
      await page.getByRole('button', { name: 'Salvar', exact: true }).click();

      // Volta para a leitura mostrando o valor novo. Esperar pelo texto, e nao
      // por um aviso de sucesso, prova que a resposta voltou e foi relida.
      await expect(prazoNaFicha(page)).toBeVisible({ timeout: 15_000 });

      // E a trilha registrou — o que liga esta tela ao item 3.2. Sem edicao de
      // campo pela interface, a trilha nasceria sem nada para registrar.
      await expect(cartaoHistorico(page)).toContainText('Prazo de entrega:', { timeout: 15_000 });
    } finally {
      // Restauracao: apaga o campo, que volta a nulo — o estado original.
      await page.getByRole('button', { name: 'Editar dados' }).click();
      await page.getByLabel('Prazo de entrega').fill('');
      await page.getByRole('button', { name: 'Salvar', exact: true }).click();
      await expect(prazoNaFicha(page)).toHaveCount(0, { timeout: 15_000 });
    }
  });

  test('abrir e salvar sem mudar nada nao gera linha no historico', async ({ page }) => {
    /*
     * O formulario manda so os campos que mudaram. Mandar tudo criaria uma linha
     * de "Titulo: X para X" a cada salvamento, e a trilha ficaria ilegivel
     * justamente por excesso de registro.
     */
    await entrar(page, 'admin', '/crm?aba=oportunidades');
    test.skip(!(await abrirPrimeira(page)), 'Nenhuma oportunidade aberta na base');

    await expect(cartaoHistorico(page)).toBeVisible({ timeout: 15_000 });
    const antes = await cartaoHistorico(page).getByRole('listitem').count();

    await page.getByRole('button', { name: 'Editar dados' }).click();
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Editar dados' })).toBeVisible();

    await page.reload();
    await expect(cartaoHistorico(page)).toBeVisible({ timeout: 15_000 });
    expect(await cartaoHistorico(page).getByRole('listitem').count()).toBe(antes);
  });

  /*
   * Nao ha caso de navegador para "oportunidade fechada nao oferece edicao", e a
   * ausencia e deliberada: o quadro mostra so as ABERTAS, e fechar uma da base de
   * dev para ver o botao desaparecer nao tem volta — reabrir nao e operacao que a
   * API ofereca. A recusa esta provada onde ela mora, na API ("Oportunidade
   * fechada nao pode ser alterada"). Um teste chamado assim que na verdade
   * afirmasse o contrario seria pior que nenhum.
   */
});
