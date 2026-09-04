import { expect, test, type Page } from '@playwright/test';
import { entrar } from './helpers';

/**
 * Processo do funil (item 3.1 do plano em ANALISE-CRM.md).
 *
 * O fluxo do bloqueio tem prova propria contra a API — 28 asercoes, incluindo o
 * 400 do avanco com a mensagem nomeando a tarefa, o 400 do "ganhou", a perda
 * passando, a nao duplicacao ao ir e voltar e o 403 do comercial. Aqui esta o que
 * so o navegador alcanca: que a exigencia e **editavel na tela** e que a coluna
 * do quadro anuncia o que ela exige. Sem tela, `tarefaObrigatoria` nunca sai de
 * nulo e a regra nao existe na pratica; sem o aviso na coluna, o vendedor
 * descobre a exigencia so quando o cartao nao anda — e isso parece defeito.
 *
 * Este arquivo **escreve** na configuracao do funil, e restaura no fim. Deixar
 * uma etapa exigindo tarefa na base de dev travaria o funil de quem testar
 * depois.
 */

const EXIGENCIA = 'Registrar a visita tecnica';

const cartaoProcesso = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Processo do funil', exact: true }) });

/**
 * Abre o funil e espera o quadro montar.
 *
 * A espera e explicita porque `count()` avaliado antes da renderizacao ja
 * produziu teste pulado tres vezes neste projeto — e teste pulado nao e teste
 * verde. O card de processo depende de `/funis` e do kanban, que sao duas
 * chamadas: esperar por ele cobre as duas.
 */
async function abrirFunil(page: Page) {
  await entrar(page, 'admin', '/crm?aba=oportunidades');
  await expect(cartaoProcesso(page)).toBeVisible({ timeout: 15_000 });
  const primeira = cartaoProcesso(page).getByRole('listitem').first();
  await expect(primeira).toBeVisible();
  return primeira;
}

test.describe('Processo do funil', () => {
  test('a exigencia e editavel e a coluna do quadro passa a anuncia-la', async ({ page }) => {
    const linha = await abrirFunil(page);

    const campo = linha.getByRole('textbox');
    const original = await campo.inputValue();
    const salvar = linha.getByRole('button', { name: 'Salvar' });

    // O nome da etapa sai da propria linha, para o teste nao presumir qual e a
    // primeira etapa do funil de dev.
    const rotulo = (await linha.locator('p').first().innerText()).replace(/^\d+\.\s*/, '').trim();

    try {
      await expect(salvar).toBeDisabled(); // nada mudou ainda
      await campo.fill(EXIGENCIA);
      await expect(salvar).toBeEnabled();
      await salvar.click();

      // Esperar o botao ficar inerte de novo prova que a resposta voltou e o
      // estado foi relido — um aviso de sucesso poderia aparecer antes disso.
      await expect(salvar).toBeDisabled({ timeout: 15_000 });

      // A coluna correspondente do quadro anuncia a exigencia.
      const coluna = page.locator('div').filter({ hasText: new RegExp(`^${rotulo}\\d+%`) }).first();
      await expect(page.getByText(`Exige: ${EXIGENCIA}`).first()).toBeVisible();
      await expect(coluna).toBeVisible();
    } finally {
      // Restauracao conferida, em `finally`: uma asercao que falha no meio nao
      // pode deixar a etapa exigindo tarefa.
      await campo.fill(original);
      await salvar.click();
      await expect(salvar).toBeDisabled();
      await expect(campo).toHaveValue(original);
      await expect(page.getByText(`Exige: ${EXIGENCIA}`)).toHaveCount(0);
    }
  });

  test('texto vazio desliga a exigencia', async ({ page }) => {
    const linha = await abrirFunil(page);
    const campo = linha.getByRole('textbox');
    const salvar = linha.getByRole('button', { name: 'Salvar' });
    const original = await campo.inputValue();

    try {
      await campo.fill(EXIGENCIA);
      await salvar.click();
      await expect(salvar).toBeDisabled({ timeout: 15_000 });
      await expect(page.getByText(`Exige: ${EXIGENCIA}`).first()).toBeVisible();

      // Apagar o texto e salvar volta a etapa a "sem exigencia" — o aviso sai do
      // quadro. Sem este caminho, ligar a exigencia seria irreversivel pela tela.
      await campo.fill('');
      await salvar.click();
      await expect(page.getByText(`Exige: ${EXIGENCIA}`)).toHaveCount(0, { timeout: 15_000 });
      await expect(campo).toHaveAttribute('placeholder', 'Sem exigencia');
    } finally {
      await campo.fill(original);
      if (await salvar.isEnabled()) await salvar.click();
      await expect(campo).toHaveValue(original);
    }
  });

  test('o comercial nao ve o card de processo', async ({ page }) => {
    // Definir o processo e decidir por todo mundo que usa o funil: e escrita de
    // ADMIN/SUPERVISOR, o mesmo corte da politica de desconto. A recusa na API e
    // verificada la (403); aqui o que importa e nao oferecer um campo que a
    // pessoa nao consegue salvar.
    await entrar(page, 'comercial', '/crm?aba=oportunidades');
    await expect(page.getByRole('heading', { name: 'Funil', exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(cartaoProcesso(page)).toHaveCount(0);
  });
});
