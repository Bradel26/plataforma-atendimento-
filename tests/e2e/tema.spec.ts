import { expect, test } from '@playwright/test';
import { entrar } from './helpers';

/** Cor de fundo do cartao, que e a superficie onde a paleta foi validada. */
const fundoDo = (seletor: string) => `getComputedStyle(document.querySelector('${seletor}')).backgroundColor`;

test.describe('Tema claro e escuro', () => {
  test('o botao vira o app e a preferencia sobrevive a recarga', async ({ page }) => {
    await entrar(page, 'admin');

    const html = page.locator('html');
    await expect(html).not.toHaveClass(/tema-escuro/);
    const claroBody = await page.evaluate(fundoDo('body'));

    await page.getByRole('button', { name: 'Usar tema escuro' }).click();
    await expect(html).toHaveClass(/tema-escuro/);

    const escuroBody = await page.evaluate(fundoDo('body'));
    expect(escuroBody).not.toBe(claroBody);

    // Sobrevive a recarga: preferencia de tema que volta ao padrao e defeito.
    await page.reload();
    await expect(html).toHaveClass(/tema-escuro/);
    expect(await page.evaluate(fundoDo('body'))).toBe(escuroBody);

    await page.getByRole('button', { name: 'Usar tema claro' }).click();
    await expect(html).not.toHaveClass(/tema-escuro/);
  });

  test('a paleta de dados troca junto com o tema', async ({ page }) => {
    await entrar(page, 'admin');
    await page.goto('/dashboards');

    const serie = () => page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--serie-1').trim()");
    expect(await serie()).toBe('#2a78d6');

    await page.getByRole('button', { name: 'Usar tema escuro' }).click();
    // Cor propria do modo escuro, nao a clara com filtro.
    expect(await serie()).toBe('#3986e5');

    await page.getByRole('button', { name: 'Usar tema claro' }).click();
  });

  test('no escuro o texto continua legivel sobre o cartao', async ({ page }) => {
    await entrar(page, 'admin');
    await page.goto('/dashboards');
    // Espera o cartao existir antes de medir: navegar e medir na mesma tacada
    // media a tela anterior.
    await expect(page.getByRole('heading', { name: 'Conversas por canal' })).toBeVisible();
    await page.getByRole('button', { name: 'Usar tema escuro' }).click();

    // Se a inversao da escala estivesse errada, texto e fundo colariam.
    const { texto, fundo } = await page.evaluate(() => {
      const secao = document.querySelector('section')!;
      const titulo = secao.querySelector('h2')!;
      return {
        texto: getComputedStyle(titulo).color,
        fundo: getComputedStyle(secao).backgroundColor,
      };
    });
    expect(texto).not.toBe(fundo);

    const luminancia = (cor: string) => {
      const [r, g, b] = cor.match(/\d+/g)!.map(Number) as [number, number, number];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    // Texto claro sobre superficie escura.
    expect(luminancia(texto)).toBeGreaterThan(luminancia(fundo) + 80);

    await page.getByRole('button', { name: 'Usar tema claro' }).click();
  });
});
