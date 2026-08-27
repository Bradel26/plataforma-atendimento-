import { expect, type Cookie, type Page } from '@playwright/test';

/** Credenciais do seed de desenvolvimento. */
export const CONTAS = {
  admin: { email: 'admin@plataforma.local', senha: 'Admin@123' },
  supervisor: { email: 'supervisor@plataforma.local', senha: 'Super@123' },
  agente: { email: 'agente1@plataforma.local', senha: 'Agente@123' },
} as const;

/** Itens do menu lateral visiveis para o perfil logado. */
export const menu = (page: Page) => page.locator('nav a');

/**
 * Sessao guardada por conta, para nao logar de novo a cada teste.
 *
 * O `/auth/login` tem limite de 30 tentativas por IP a cada 5 minutos, e a
 * suite passou de 33 testes: logando em todos, ela estoura o proprio limite e
 * falha por 429 no meio — nao por defeito nenhum da aplicacao.
 *
 * O refresh token e de **uso unico**: cada restauracao gasta o cookie guardado e
 * recebe outro. Por isso o cache e reescrito depois de cada uso, e nao apenas
 * na primeira vez. Funciona porque `workers: 1` faz os testes rodarem em serie.
 */
const sessoes: Partial<Record<keyof typeof CONTAS, Cookie[]>> = {};

/** Esquece a sessao guardada — para quem sai da conta de proposito no teste. */
export const esquecerSessao = (conta: keyof typeof CONTAS) => delete sessoes[conta];

/**
 * Coloca a sessao logada na pagina.
 *
 * Tenta pelo cookie guardado; se ele nao servir mais (logout num teste
 * anterior, expiracao), cai no login de verdade. O caminho de login continua
 * exercitado pelo `login.spec`, que sempre passa pelo formulario.
 */
export async function entrar(page: Page, conta: keyof typeof CONTAS, destino = '/') {
  const guardada = sessoes[conta];
  if (guardada?.length) {
    delete sessoes[conta];
    await page.context().addCookies(guardada);
    // Vai direto para o destino: o token de acesso vive em memoria, entao cada
    // navegacao gasta uma restauracao — e cada restauracao e uma ida ao Redis e
    // ao banco. Entrar em "/" e depois navegar dobrava esse custo em todo teste.
    await page.goto(destino);

    // Espera um marcador de "dentro", e nao a ausencia do titulo Entrar: logo
    // depois do goto o React ainda esta restaurando a sessao e o titulo tambem
    // nao existe, entao "ausente" nao distingue carregando de logado — e o teste
    // seguiria na tela de login achando que entrou.
    const dentro = await menu(page)
      .first()
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false);

    if (dentro) {
      // Guarda o cookie ja rotacionado por esta restauracao.
      sessoes[conta] = await page.context().cookies();
      return;
    }
    await page.context().clearCookies();
  }

  await entrarPeloFormulario(page, conta);
  if (destino !== '/') await page.goto(destino);

  /*
   * Espera estar logado antes de guardar o cookie.
   *
   * Cada navegacao perde o token de acesso (ele vive em memoria) e dispara uma
   * renovacao. O `goto` resolve no evento de load, com essa renovacao ainda em
   * voo — ler os cookies ali guarda o refresh que ela esta gastando naquele
   * instante, e o teste seguinte tenta restaurar com um token ja consumido.
   * Era exatamente isso: a restauracao falhava sempre, esperava os 8 segundos
   * do timeout e caia no login, deixando cada teste 4x mais lento.
   */
  await menu(page).first().waitFor({ state: 'visible' });
  sessoes[conta] = await page.context().cookies();
}

/** Entra pela tela de login de verdade, como o usuario entra. */
export async function entrarPeloFormulario(page: Page, conta: keyof typeof CONTAS) {
  const { email, senha } = CONTAS[conta];
  await page.goto('/');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(senha);

  // Le a resposta do login para poder explicar a falha. Sem isso, um 429 do
  // limite por IP aparece como "o titulo Entrar nao desapareceu", que manda
  // quem le procurar no lugar errado.
  const [resposta] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/auth/login')),
    page.getByRole('button', { name: 'Entrar' }).click(),
  ]);

  if (resposta.status() === 429) {
    throw new Error(
      'Login recusado pelo limite por IP (429). O e2e faz muitos logins; se voce acabou de rodar ' +
        'as suites de smoke, espere a janela de 5 minutos e rode de novo.',
    );
  }
  if (!resposta.ok()) throw new Error(`Login falhou com status ${resposta.status()}`);

  // A tela de login sai de cena: o titulo "Entrar" desaparece.
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeHidden();
}

/**
 * Pre-requisito: pilha de pe (npm run dev) e seed aplicado. Nao ha webServer no
 * playwright.config porque a API precisa de Postgres e Redis, e subir isso
 * junto com o teste esconderia falha de ambiente dentro de falha de teste.
 */
