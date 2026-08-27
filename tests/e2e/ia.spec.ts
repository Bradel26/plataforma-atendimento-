import { expect, test } from '@playwright/test';
import { entrar } from './helpers';

/**
 * Aba de IA: token de integracao e a ponte por canal.
 *
 * O que importa aqui e o que nao pode vazar e o que nao pode travar: o valor do
 * token aparece uma vez e a lista nunca o repete; e a ponte nao liga sem
 * webhook e segredo, porque ligada pela metade ela entregaria mensagem sem
 * assinatura para um endereco vazio.
 */

const cartao = (page: import('@playwright/test').Page, titulo: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: titulo, exact: true }) });

/** `ja` evita uma navegacao quando a pagina de configuracoes ja esta aberta. */
const abrirAba = async (page: import('@playwright/test').Page, ja = false) => {
  if (!ja) await page.goto('/configuracoes');
  await page.getByRole('button', { name: 'IA (motor externo)' }).click();
  await expect(cartao(page, 'Ponte por canal')).toBeVisible();
};

test.describe('IA: motor externo', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, 'admin', '/configuracoes');
    await abrirAba(page, true);
  });

  test('o token aparece uma vez, e a lista nao o repete', async ({ page }) => {
    const nome = `e2e-${Date.now().toString(36)}`;
    const tokens = cartao(page, 'Tokens de integracao');

    await tokens.getByLabel('Nome da integracao').fill(nome);
    await tokens.getByRole('button', { name: 'Criar token' }).click();

    // O valor em claro sai num campo selecionavel, com o aviso de que nao volta.
    const campo = tokens.locator('input[readonly]');
    await expect(campo).toBeVisible();
    const valor = await campo.inputValue();
    expect(valor.startsWith('pi_')).toBe(true);
    await expect(tokens.getByText(/nao aparece de novo/i)).toBeVisible();

    // Esconder e o fim do valor: nada na tela o traz de volta.
    await tokens.getByRole('button', { name: 'Ja copiei, esconder' }).click();
    await expect(tokens.locator('input[readonly]')).toHaveCount(0);
    await expect(page.getByText(valor)).toHaveCount(0);

    // A lista mostra o nome e so o prefixo — nunca o valor.
    const linha = tokens.locator('li').filter({ hasText: nome });
    await expect(linha).toBeVisible();
    await expect(linha).toContainText(valor.slice(0, 8));
    await expect(linha).not.toContainText(valor);
  });

  test('revogar tira o token dos ativos e ele volta atras do contador', async ({ page }) => {
    const nome = `e2e-rev-${Date.now().toString(36)}`;
    const tokens = cartao(page, 'Tokens de integracao');

    await tokens.getByLabel('Nome da integracao').fill(nome);
    await tokens.getByRole('button', { name: 'Criar token' }).click();
    await expect(tokens.locator('li').filter({ hasText: nome })).toBeVisible();

    await tokens.locator('li').filter({ hasText: nome }).getByRole('button', { name: 'Revogar' }).click();

    // Sai da lista de ativos...
    await expect(tokens.locator('li').filter({ hasText: nome })).toHaveCount(0);
    // ...e continua existindo: revogar e trilha, nao exclusao.
    await tokens.getByRole('button', { name: /Mostrar \d+ token/ }).click();
    const revogado = tokens.locator('li').filter({ hasText: nome });
    await expect(revogado).toBeVisible();
    await expect(revogado).toContainText('Revogado');
    // Sem botao de revogar de novo.
    await expect(revogado.getByRole('button', { name: 'Revogar' })).toHaveCount(0);
  });

  /**
   * Deixa o canal desligado e volta dizendo se ele tinha webhook gravado.
   *
   * Sem isto os testes deste arquivo dependiam do estado que a rodada anterior
   * deixou no banco: um deles falhava, o canal ficava ligado, e na rodada
   * seguinte falhava outro. Cada teste normaliza o proprio ponto de partida.
   */
  const desligar = async (page: import('@playwright/test').Page, canal: string) => {
    const ponte = cartao(page, 'Ponte por canal');
    await ponte.getByLabel('Canal').selectOption(canal);

    // Espera o estado do canal chegar antes de perguntar se esta ligado: com a
    // busca em voo, o botao de desligar ainda nao existe e a checagem responde
    // "nao esta ligado" para um canal que esta.
    await expect(ponte.getByLabel('Webhook do motor de IA')).toBeEnabled();

    const botao = ponte.getByRole('button', { name: 'Desligar a IA', exact: true });
    if (await botao.isVisible().catch(() => false)) {
      await expect(botao).toBeEnabled();
      // Espera a gravacao TERMINAR, e nao o selo mudar.
      //
      // O selo pode virar "IA desligada" por outro motivo — uma busca de canal
      // que voltou nesse instante, por exemplo — e ai o teste seguia com o PUT
      // ainda no ar. O PUT de desligar chegava ao banco depois do PUT de ligar,
      // e o canal terminava desligado com o teste afirmando o contrario.
      await Promise.all([
        page.waitForResponse((r) => r.url().includes('/ia') && r.request().method() === 'PUT'),
        botao.dispatchEvent('click'),
      ]);
      await expect(ponte.getByText('IA desligada', { exact: true })).toBeVisible();
    }
    return ponte;
  };

  test('a ponte nao liga sem webhook e segredo', async ({ page }) => {
    // EMAIL de proposito: e o canal que nenhum teste daqui liga, entao ele
    // continua sem webhook gravado — que e a premissa deste caso.
    const ponte = cartao(page, 'Ponte por canal');
    await ponte.getByLabel('Canal').selectOption('EMAIL');

    // Com os campos vazios o botao esta desabilitado e a tela diz por que.
    await expect(ponte.getByRole('button', { name: 'Ligar a IA', exact: true })).toBeDisabled();
    await expect(ponte.getByText(/Informe o webhook e o segredo/)).toBeVisible();

    // So o webhook nao basta: entrega sem assinatura e entrega que qualquer um
    // consegue forjar.
    await ponte.getByLabel('Webhook do motor de IA').fill('https://whatsbot.exemplo.com/api/webhook/plataforma/c1');
    await expect(ponte.getByRole('button', { name: 'Ligar a IA', exact: true })).toBeDisabled();

    await ponte.getByLabel('Segredo de assinatura').fill('segredo-de-teste-e2e-longo');
    await expect(ponte.getByRole('button', { name: 'Ligar a IA', exact: true })).toBeEnabled();
  });

  /** Liga a ponte do canal e devolve o segredo usado. */
  const ligar = async (page: import('@playwright/test').Page, canal: string, sufixo: string) => {
    const ponte = await desligar(page, canal);
    const segredo = `segredo-e2e-${Date.now().toString(36)}`;

    await ponte.getByLabel('Webhook do motor de IA').fill(
      `https://whatsbot.exemplo.com/api/webhook/plataforma/${sufixo}`,
    );
    await ponte.getByLabel('Segredo de assinatura').fill(segredo);
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/ia') && r.request().method() === 'PUT'),
      ponte.getByRole('button', { name: 'Ligar a IA', exact: true }).click(),
    ]);
    await expect(ponte.getByText('IA ligada', { exact: true })).toBeVisible();

    return { ponte, segredo };
  };

  test('ligar mostra os selos e nao devolve o segredo', async ({ page }) => {
    const { ponte, segredo } = await ligar(page, 'FACEBOOK', 'fb');

    await expect(ponte.getByText('Entrega assinada', { exact: true })).toBeVisible();

    // O campo do segredo esvazia depois de salvar, e o valor nao esta em lugar
    // nenhum da pagina — nem no atributo do input.
    await expect(ponte.getByLabel('Segredo de assinatura')).toHaveValue('');
    expect(await page.content()).not.toContain(segredo);
  });

  test('a configuracao volta do servidor, e desligar nao a apaga', async ({ page }) => {
    // Estabelece o proprio ponto de partida em vez de contar com o teste
    // anterior: os dois mexem no mesmo registro do banco, e um teste que
    // depende do que o outro deixou falha na ordem errada e passa na certa.
    const { segredo } = await ligar(page, 'FACEBOOK', 'fb');

    // Sai do canal e volta: forca uma busca nova no servidor, que e o que este
    // teste quer provar. Recarregar a pagina inteira provaria o mesmo, mas
    // acrescenta a restauracao de sessao e a remontagem da aba ao caminho — mais
    // partes moveis para verificar uma coisa so.
    const depois = cartao(page, 'Ponte por canal');
    await depois.getByLabel('Canal').selectOption('WEBCHAT');
    // Espera o campo deixar de mostrar o webhook do FACEBOOK, e nao que ele
    // fique vazio: o WEBCHAT pode ter configuracao propria — o `smoke:ia` grava
    // uma — e afirmar vazio ali amarra este teste ao que outro script deixou.
    await expect(depois.getByLabel('Webhook do motor de IA')).not.toHaveValue(/plataforma\/fb/);
    await depois.getByLabel('Canal').selectOption('FACEBOOK');

    // Espera o estado DESTE canal chegar antes de conferir os selos: trocar o
    // canal dispara uma busca, e ate ela voltar a tela mostra o selo do canal
    // anterior — afirmar "IA ligada" ali passaria pelo motivo errado.
    await expect(depois.getByLabel('Webhook do motor de IA')).toHaveValue(
      /whatsbot\.exemplo\.com\/api\/webhook\/plataforma\/fb/,
    );
    await expect(depois.getByText('IA ligada', { exact: true })).toBeVisible();
    await expect(depois.getByLabel('Segredo de assinatura')).toHaveValue('');
    expect(await page.content()).not.toContain(segredo);

    // Desligar para de entregar e mantem o que estava gravado.
    const botao = depois.getByRole('button', { name: 'Desligar a IA', exact: true });
    await expect(botao).toBeEnabled();

    // `dispatchEvent` e nao `click`: este botao desaparece como consequencia do
    // proprio clique, e o `click` do Playwright reataca ao ver o elemento
    // remontar — encontrando-o removido e esperando o timeout inteiro. O alvo
    // aqui e a transicao de estado; o clique com hit-testing e exercitado no
    // "Ligar a IA".
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/ia') && r.request().method() === 'PUT'),
      botao.dispatchEvent('click'),
    ]);
    await expect(depois.getByText('IA desligada', { exact: true })).toBeVisible();
    await expect(depois.getByText('Entrega assinada', { exact: true })).toBeVisible();
  });

  test('a janela do canal aparece, e o webchat nao tem janela', async ({ page }) => {
    const ponte = cartao(page, 'Ponte por canal');

    // WhatsApp e o caso que a Meta limita: 24h desde a ultima mensagem do
    // cliente. Se a tela mentisse aqui, alguem ligaria a IA achando que ela
    // responde a qualquer hora.
    await ponte.getByLabel('Canal').selectOption('WHATSAPP');
    await expect(ponte.getByText('Janela de 24h', { exact: true })).toBeVisible();

    await ponte.getByLabel('Canal').selectOption('WEBCHAT');
    await expect(ponte.getByText('Sem janela', { exact: true })).toBeVisible();
  });
});
