import { expect, test, type Page } from '@playwright/test';
import { entrar } from './helpers';

/**
 * WhatsApp nos dois modos: API oficial e ponte nao oficial.
 *
 * As 31 asercoes contra a API cobrem o caminho inteiro com uma **ponte falsa**
 * subida no proprio roteiro: a mensagem entra assinada, a resposta sai pela
 * ponte, a reentrega nao duplica, e a ponte fora do ar da 502 dizendo que e a
 * ponte. La a configuracao do canal e restaurada no fim.
 *
 * O que so o navegador prova, e o que mais importa nesta tela: que **o aviso de
 * risco aparece antes de a escolha ser gravada**, e que cada modo pede a
 * credencial dele — quem esta na ponte nao ve campo de token da Meta.
 *
 * **Este arquivo nao grava nada.** Trocar o radio e estado local; nenhum caso
 * clica em Salvar, porque isso mudaria o canal de WhatsApp da organizacao de dev
 * — e o canal e compartilhado com o resto da suite.
 */

const cartaoConfigurar = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: /^Configurar WhatsApp/ }) });

async function abrirCanais(page: Page) {
  await entrar(page, 'admin', '/configuracoes');
  await page.getByRole('button', { name: 'Canais', exact: true }).click();
  await expect(cartaoConfigurar(page)).toBeVisible({ timeout: 15_000 });
}

const radioOficial = (page: Page) => cartaoConfigurar(page).getByRole('radio').first();
const radioPonte = (page: Page) => cartaoConfigurar(page).getByRole('radio').nth(1);

test.describe('WhatsApp nos dois modos', () => {
  test('a tela oferece os dois modos, e comeca no oficial', async ({ page }) => {
    await abrirCanais(page);

    await expect(cartaoConfigurar(page)).toContainText('API oficial (Meta Cloud API)');
    await expect(cartaoConfigurar(page)).toContainText('Sem API oficial (ponte externa)');

    // O canal de dev nao tem modo gravado, e nulo vale como OFICIAL: o canal
    // configurado antes de a pergunta existir nao muda de comportamento.
    await expect(radioOficial(page)).toBeChecked();
  });

  test('o modo nao oficial mostra o risco ANTES de qualquer gravacao', async ({ page }) => {
    /*
     * O aviso e o ponto do caso. Escolher a ponte e uma decisao de negocio com
     * consequencia real — o numero pode ser bloqueado —, e ela precisa ser tomada
     * por quem tem autoridade para toma-la, em vez de descoberta no dia em que o
     * WhatsApp da empresa para de funcionar.
     */
    await abrirCanais(page);

    // Antes de escolher, nenhum aviso: aviso permanente nos dois modos seria
    // ignorado nos dois.
    await expect(cartaoConfigurar(page).getByText('Leia antes de ligar')).toHaveCount(0);

    await radioPonte(page).check();

    await expect(cartaoConfigurar(page).getByText('Leia antes de ligar')).toBeVisible();
    await expect(cartaoConfigurar(page)).toContainText('termos de uso');
    await expect(cartaoConfigurar(page)).toContainText('bloqueado sem aviso');
    // E diz que a ponte e um servico separado: quem esperava a plataforma
    // hospedar a sessao precisa saber disso antes de escolher.
    await expect(cartaoConfigurar(page)).toContainText('nao hospeda a ponte');
  });

  test('cada modo pede a credencial dele, e nao a do outro', async ({ page }) => {
    await abrirCanais(page);

    // Oficial: campos da Meta.
    await expect(cartaoConfigurar(page).getByLabel('Access Token')).toBeVisible();
    await expect(cartaoConfigurar(page).getByLabel('Phone Number ID')).toBeVisible();
    await expect(cartaoConfigurar(page).getByLabel('Endereco da ponte')).toHaveCount(0);

    await radioPonte(page).check();

    // Ponte: endereco, token e segredo de assinatura — e nenhum campo da Meta.
    // Pedir "Access Token" a quem esta na ponte manda a pessoa procurar um token
    // que ela nunca vai ter.
    await expect(cartaoConfigurar(page).getByLabel('Endereco da ponte')).toBeVisible();
    await expect(cartaoConfigurar(page).getByLabel('Token da ponte')).toBeVisible();
    await expect(cartaoConfigurar(page).getByLabel('Segredo de assinatura')).toBeVisible();
    await expect(cartaoConfigurar(page).getByLabel('Access Token')).toHaveCount(0);
    await expect(cartaoConfigurar(page).getByLabel('Phone Number ID')).toHaveCount(0);

    // Voltar ao oficial devolve os campos: a escolha nao e um caminho sem volta.
    await radioOficial(page).check();
    await expect(cartaoConfigurar(page).getByLabel('Access Token')).toBeVisible();
  });

  test('o painel de instrucoes troca a URL da Meta pela URL da ponte', async ({ page }) => {
    /*
     * No modo oficial a URL e cadastrada NA META; no nao oficial, e a ponte que
     * chama a plataforma. Mostrar a errada produz um canal silencioso — tudo
     * parece configurado e nenhuma mensagem chega.
     */
    await abrirCanais(page);

    const painel = page.getByText('Antes de ativar').locator('..');
    await expect(painel).toContainText('/api/webhooks/whatsapp');
    await expect(painel.getByText('No modo nao oficial')).toHaveCount(0);

    await radioPonte(page).check();

    await expect(painel.getByText('No modo nao oficial')).toBeVisible();
    await expect(painel).toContainText('/api/webhooks/ponte/whatsapp/');
    // E diz como assinar, porque sem assinatura a rota recusa tudo.
    await expect(painel).toContainText('X-Ponte-Assinatura');
    await expect(painel).toContainText('idExterno');
  });
});
