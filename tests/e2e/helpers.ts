import { expect, type Page } from '@playwright/test';

/** Credenciais do seed de desenvolvimento. */
export const CONTAS = {
  admin: { email: 'admin@plataforma.local', senha: 'Admin@123' },
  supervisor: { email: 'supervisor@plataforma.local', senha: 'Super@123' },
  agente: { email: 'agente1@plataforma.local', senha: 'Agente@123' },
} as const;

/** Entra pela tela de login de verdade, como o usuario entra. */
export async function entrar(page: Page, conta: keyof typeof CONTAS) {
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

/** Itens do menu lateral visiveis para o perfil logado. */
export const menu = (page: Page) => page.locator('nav a');

/**
 * Pre-requisito: pilha de pe (npm run dev) e seed aplicado. Nao ha webServer no
 * playwright.config porque a API precisa de Postgres e Redis, e subir isso
 * junto com o teste esconderia falha de ambiente dentro de falha de teste.
 */
