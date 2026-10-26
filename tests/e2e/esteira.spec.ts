import { expect, test, type Page } from '@playwright/test';
import { entrar } from './helpers';

/**
 * Fluxo mínimo da esteira TIM (API `/api/esteiras/:operacao`): cadastrar um
 * parceiro `[TESTE]`, movê-lo para a 2ª etapa do trilho pela gaveta, ver o
 * movimento no histórico e trocar Kanban → Lista → Funil mantendo o filtro.
 *
 * Precisa da pilha de pé e do seed (ver `playwright.config.ts`). O parceiro
 * fica com o prefixo `[TESTE]` para a limpeza do smoke (`smoke:esteiras`)
 * encontrá-lo; nenhum dado real é tocado.
 */

/** 2ª etapa do trilho TIM (catálogo da API). O nome vem da tela: o ADMIN pode renomear. */
const SEGUNDA_ETAPA_TIM = 'TIM_DOCUMENTACAO';

const busca = (page: Page) => page.getByRole('searchbox', { name: 'Buscar parceiro' });
const visao = (page: Page, nome: 'Kanban' | 'Lista' | 'Funil') =>
  page.getByRole('group', { name: 'Visualização' }).getByRole('button', { name: nome, exact: true });

test.describe('Esteira TIM', () => {
  test('cadastra [TESTE], move para a 2ª etapa, vê o histórico e troca de visão mantendo o filtro', async ({ page }) => {
    await entrar(page, 'admin', '/esteira/tim');

    const marca = String(Date.now());
    const nome = `[TESTE] Parceiro E2E ${marca}`;
    // Celular de Goiânia com final único: a busca por telefone não acha ninguém.
    const telefone = `629${marca.slice(-8)}`;

    // --- Novo parceiro ------------------------------------------------------
    await page.getByRole('button', { name: 'Novo parceiro' }).click();
    const modal = page.getByRole('dialog', { name: 'Novo parceiro · TIM' });
    await modal.getByRole('group', { name: 'Procurar por' }).getByRole('button', { name: 'Telefone', exact: true }).click();
    await modal.getByLabel('Telefone').fill(telefone);
    await modal.getByRole('button', { name: 'Procurar' }).click();
    await expect(modal.getByText('Nenhum parceiro com este documento nas esteiras')).toBeVisible();
    await modal.getByLabel('Nome do contato').fill(nome);
    await modal.getByLabel('UF').selectOption('GO');
    await modal.getByRole('button', { name: 'Adicionar à TIM' }).click();

    // A casca abre a gaveta do parceiro recém-criado.
    const gaveta = page.getByRole('dialog', { name: nome });
    await expect(gaveta).toBeVisible();

    // --- Mover para a 2ª etapa (pelo "Mover para…", alternativa ao arraste) --
    const mover = gaveta.getByLabel('Mover para outra etapa');
    const rotuloDestino = (await mover.locator(`option[value="${SEGUNDA_ETAPA_TIM}"]`).textContent()) ?? '';
    const etapaDestino = rotuloDestino.split(' — ')[0]!.trim();
    await mover.selectOption(SEGUNDA_ETAPA_TIM);
    await expect(gaveta.getByText(etapaDestino, { exact: true }).first()).toBeVisible();

    // --- Histórico ------------------------------------------------------------
    await gaveta.getByRole('tab', { name: 'Histórico' }).click();
    await expect(gaveta.getByRole('listitem').filter({ hasText: `→ ${etapaDestino}` })).toBeVisible();

    await gaveta.getByRole('button', { name: 'Fechar' }).click();
    await expect(gaveta).toBeHidden();

    // --- Filtro + troca de visão ---------------------------------------------
    await busca(page).fill(nome);
    await expect(page).toHaveURL(/busca=/);
    const coluna = page.getByRole('region', { name: new RegExp(`^${etapaDestino.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`) });
    await expect(coluna.getByRole('button', { name: `Abrir ${nome}` })).toBeVisible();

    await visao(page, 'Lista').click();
    await expect(page).toHaveURL(/visao=lista/);
    await expect(page).toHaveURL(/busca=/);
    await expect(busca(page)).toHaveValue(nome);
    await expect(page.getByRole('row').filter({ hasText: nome })).toBeVisible();

    await visao(page, 'Funil').click();
    await expect(page).toHaveURL(/visao=funil/);
    await expect(page).toHaveURL(/busca=/);
    await expect(busca(page)).toHaveValue(nome);
  });
});
