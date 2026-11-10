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

/**
 * Nomes usados para o cliente da transação (`tx`, `trx`, `cliente` — este último
 * nos helpers tipados com `ClienteDeEscrita`). O texto inteiro é varrido, para
 * pegar também a chamada quebrada em linhas (`tx.credenciamento\n  .findUnique(`).
 */
const LEITURA_UNICA_NA_TRANSACAO = /\b(?:tx|trx|cliente)\s*\.\s*\w+\s*\.\s*findUnique(?:OrThrow)?\s*\(/g;

function ocorrenciasNoTexto(texto: string): number[] {
  return [...texto.matchAll(LEITURA_UNICA_NA_TRANSACAO)].map((m) => texto.slice(0, m.index).split('\n').length);
}

describe('leituras dentro de transação interativa', () => {
  it('o detector pega os aliases e a chamada quebrada em linhas, e ignora o cliente de fora', () => {
    expect(ocorrenciasNoTexto('await tx.credenciamento.findUniqueOrThrow({})')).toEqual([1]);
    expect(ocorrenciasNoTexto('x\nawait trx.user.findUnique({})')).toEqual([2]);
    expect(ocorrenciasNoTexto('await cliente\n  .conta\n  .findUnique({})')).toEqual([1]);
    expect(ocorrenciasNoTexto('await prisma.user.findUnique({}); await tx.user.findFirst({}); await meutx.a.findUnique({})')).toEqual([]);
  });

  it('nenhum <cliente da transação>.<modelo>.findUnique (a extensão o desvia para fora da transação)', () => {
    const ocorrencias = arquivosTs(SRC).flatMap((arquivo) =>
      ocorrenciasNoTexto(readFileSync(arquivo, 'utf8')).map((linha) => `${relative(SRC, arquivo)}:${linha}`),
    );
    expect(ocorrencias).toEqual([]);
  });
});
