import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `findUnique`/`findUniqueOrThrow` dentro de uma transação interativa escapa da transação.
 *
 * A extensão de isolamento (`lib/prisma.ts`) reescreve `findUnique` como
 * `findFirst` chamando o cliente BASE — não o `tx` do callback. A leitura sai
 * por outra conexão e não enxerga o que a própria transação acabou de gravar:
 * a importação da esteira lia o vínculo recém-criado assim e falhava com P2025
 * ("No record was found") em toda linha nova (achado do smoke da Task 22).
 *
 * Dentro de `$transaction(async (tx) => ...)`, use `tx.<modelo>.findFirst`/
 * `findFirstOrThrow` com o `where` por id.
 */

// O vitest roda da raiz do repositório (mesmo critério de `tenant.schema.test.ts`).
const SRC = join(process.cwd(), 'apps', 'api', 'src');

function arquivosTs(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivosTs(caminho);
    return nome.endsWith('.ts') && !nome.endsWith('.test.ts') ? [caminho] : [];
  });
}

describe('leituras dentro de transação interativa', () => {
  it('nenhum tx.<modelo>.findUnique (a extensão o desvia para fora da transação)', () => {
    const ocorrencias = arquivosTs(SRC).flatMap((arquivo) =>
      readFileSync(arquivo, 'utf8')
        .split(/\r?\n/)
        .flatMap((linha, i) =>
          /\btx\.\w+\.findUnique(OrThrow)?\s*\(/.test(linha) ? [`${relative(SRC, arquivo)}:${i + 1}`] : [],
        ),
    );
    expect(ocorrencias).toEqual([]);
  });
});
