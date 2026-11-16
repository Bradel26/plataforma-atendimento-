import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Guarda de regressao: toda escrita em `User` que mexe em perfil, senha ou ativo
 * tem de tratar `sessaoVersao` — senao a sessao antiga continua valendo depois da
 * mudanca (o defeito que a versao de sessao corrige).
 *
 * E uma varredura de TEXTO por arquivo, nao uma analise de fluxo: pega um arquivo
 * novo que escreva esses campos sem nunca citar `sessaoVersao`. Nao prova que cada
 * chamada dentro de um arquivo que cita `sessaoVersao` esta certa — isso e dos
 * testes de cada servico. Escritas fora do TypeScript (SQL manual) ficam de fora.
 */

const raiz = join(__dirname, '..', '..'); // apps/api
const ESCRITA = /\b(?:user|usuario)\.(?:update|updateMany|upsert)\(/;
const CAMPO_DE_SEGURANCA = /\b(?:senhaHash|perfil|ativo)\s*[:,}]/;

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (nome === 'node_modules' || nome === 'dist') return [];
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return caminho.endsWith('.ts') && !caminho.endsWith('.test.ts') ? [caminho] : [];
  });
}

/** Caminho relativo a apps/api, sempre com "/" (independe do sistema operacional). */
const relativo = (arquivo: string) => relative(raiz, arquivo).split(sep).join('/');

const fontes = [...arquivos(join(raiz, 'src')), ...arquivos(join(raiz, 'prisma'))];

describe('escritas em User que mexem em perfil/senha/ativo tratam sessaoVersao', () => {
  it('a varredura enxerga os arquivos conhecidos (sanidade do proprio teste)', () => {
    expect(fontes.map(relativo)).toEqual(
      expect.arrayContaining([
        'src/modules/users/users.service.ts',
        'src/modules/auth/auth.service.ts',
        'src/cli/criar-admin.ts',
        'prisma/seed.ts',
      ]),
    );
  });

  it('nenhum arquivo escreve perfil/senha/ativo de User sem citar sessaoVersao', () => {
    const suspeitos = fontes
      .filter((f) => {
        const texto = readFileSync(f, 'utf8');
        return ESCRITA.test(texto) && CAMPO_DE_SEGURANCA.test(texto) && !texto.includes('sessaoVersao');
      })
      .map(relativo);

    expect(suspeitos).toEqual([]);
  });

  it('o seed, o CLI e os dois servicos citam sessaoVersao (os caminhos conhecidos)', () => {
    for (const rel of ['prisma/seed.ts', 'src/cli/criar-admin.ts', 'src/modules/users/users.service.ts', 'src/modules/auth/auth.service.ts']) {
      expect(readFileSync(join(raiz, rel), 'utf8'), rel).toContain('sessaoVersao');
    }
  });
});
