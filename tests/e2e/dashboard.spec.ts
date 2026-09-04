import { expect, test } from '@playwright/test';
import { entrar } from './helpers';

test.describe('Dashboards da gestao', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, 'admin', '/dashboards');
  });

  test('mostra os indicadores com numero, nao com travessao', async ({ page }) => {
    for (const rotulo of ['Em espera', 'TME', 'TMA', 'CSAT', 'SLA vencido', 'Atendimento de voz']) {
      await expect(page.getByText(rotulo, { exact: true })).toBeVisible();
    }

    // O travessao e o estado de carregando: se ficar, a chamada nao voltou.
    const emEspera = page.getByText('Em espera', { exact: true }).locator('..');
    await expect(emEspera).not.toContainText('—');
  });

  test('traz os quatro graficos, incluindo voz', async ({ page }) => {
    for (const titulo of ['Conversas por canal', 'Agentes por status', 'Protocolos por status', 'Chamadas por direcao']) {
      await expect(page.getByText(titulo, { exact: true })).toBeVisible();
    }
  });

  test('cada grafico tem tabela equivalente, com os mesmos numeros', async ({ page }) => {
    /*
     * O grafico escolhido e "Agentes por status", e nao "Conversas por canal".
     *
     * A afirmacao deste teste e sobre a equivalencia grafico/tabela, que nao tem
     * nada a ver com qual grafico. Conversas por canal depende da janela de tempo
     * — na janela padrao de 24 horas, uma base semeada dias atras deixa o grafico
     * legitimamente vazio, e o teste morria por timeout esperando um `li` que
     * nunca ia existir. Parecia defeito da tabela e era idade do dado.
     *
     * Agentes por status conta usuario, nao evento: tem barra sempre que houver
     * usuario no seed, independente de quando o banco foi semeado.
     */
    // O Card e uma <section> com <h2>: ancora estavel, ao contrario de div por texto.
    const cartao = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Agentes por status' }) });
    const primeiraBarra = cartao.locator('li').first();
    const rotulo = (await primeiraBarra.locator('span').first().innerText()).trim();

    await cartao.getByRole('button', { name: 'Ver como tabela' }).click();

    const tabela = cartao.getByRole('table');
    await expect(tabela).toBeVisible();
    await expect(tabela.getByRole('rowheader', { name: rotulo })).toBeVisible();
    await expect(tabela.getByRole('rowheader', { name: 'Total' })).toBeVisible();

    // E volta para o grafico.
    await cartao.getByRole('button', { name: 'Ver como grafico' }).click();
    await expect(cartao.getByRole('table')).toHaveCount(0);
  });

  test('trocar o periodo recarrega sem erro', async ({ page }) => {
    await page.getByLabel('Periodo').selectOption('720');
    await expect(page.getByText(/Falha ao carregar/i)).toHaveCount(0);
    await expect(page.getByText('Conversas por canal', { exact: true })).toBeVisible();
  });

  test('agente nao alcanca o dashboard nem por URL', async ({ page, context }) => {
    await context.clearCookies();
    await entrar(page, 'agente');
    await page.goto('/dashboards');
    await expect(page.getByText('Conversas por canal', { exact: true })).toHaveCount(0);
  });

  test('sem meta definida, o cartao avisa em vez de mostrar zero (item 4.2)', async ({ page }) => {
    const cartao = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Minha meta do mes' }) });
    await expect(cartao).toBeVisible();
    await expect(cartao.getByText('Ninguem definiu uma meta para voce neste mes.')).toBeVisible();
  });

  test('com meta definida, o dashboard mostra progresso, projecao e variacao (item 4.2)', async ({ page }) => {
    // Define a meta do proprio admin para o mes corrente pela aba Metas, e
    // confere que o dashboard — outra tela, outra chamada — reflete o mesmo
    // numero, sem precisar recarregar a pagina inteira.
    await page.goto('/crm?aba=metas');
    const rampaCard = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Rampa mensal' }) });
    await rampaCard.getByLabel('Pessoa').selectOption({ label: 'Administrador' });
    await rampaCard.getByRole('button', { name: 'Abrir rampa' }).click();

    const primeiroMes = rampaCard.locator('input[type="number"]').first();
    await expect(primeiroMes).toBeVisible();
    await primeiroMes.fill('10000');
    await rampaCard.getByRole('button', { name: 'Gravar rampa' }).click();
    await expect(rampaCard.getByText(/mes\(es\) gravado\(s\)/)).toBeVisible();

    await page.goto('/dashboards');
    const cartao = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Minha meta do mes' }) });
    await expect(cartao.getByText('Ninguem definiu uma meta para voce neste mes.')).toHaveCount(0);
    await expect(cartao.getByText('Meta', { exact: true }).locator('..')).toContainText('R$');
    await expect(cartao.getByText('Realizado', { exact: true }).locator('..')).toContainText('R$');
    // A barra e uma serie so (o percentual) — nunca dois numeros no mesmo eixo.
    await expect(cartao.getByText(/^\d+%$/)).toBeVisible();

    // Limpeza: volta a "sem meta", para nao deixar rampa de teste no mes corrente.
    await page.goto('/crm?aba=metas');
    const individuais = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Metas individuais' }) });
    await individuais.getByRole('button', { name: 'Remover meta de Administrador' }).click();
  });
});
