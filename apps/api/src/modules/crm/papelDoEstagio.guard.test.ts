import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Teste contra erosão: `papelDoEstagio(nome)` sem a chave classifica pelo NOME,
 * e o ADMIN pode renomear etapas (PATCH da Task 12). Uma chamada só com o nome
 * faria um renome distorcer indicadores, metas e públicos de campanha.
 *
 * Todo chamador passa a chave (`papelDoEstagio(e.nome, e.chave)`); o fallback
 * por nome fica dentro de `crm/esteira.ts` e só vale para funis sem chave.
 */

// `process.cwd()`: o vitest roda a suíte da raiz do repositório (ver tenant.schema.test.ts).
const SRC = join(process.cwd(), 'apps', 'api', 'src');

function arquivosTs(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivosTs(caminho);
    return nome.endsWith('.ts') && !nome.endsWith('.test.ts') ? [caminho] : [];
  });
}

/** Argumentos de cada chamada `papelDoEstagio(...)`, separados por vírgula de nível zero. */
function chamadasSoComNome(fonte: string): string[] {
  const achadas: string[] = [];
  const re = /\bpapelDoEstagio\s*\(/g;
  for (let m = re.exec(fonte); m; m = re.exec(fonte)) {
    // Declaração da função não é chamada.
    if (/function\s+$/.test(fonte.slice(Math.max(0, m.index - 20), m.index))) continue;
    let nivel = 0;
    let virgulas = 0;
    let i = m.index + m[0].length;
    for (; i < fonte.length; i += 1) {
      const ch = fonte[i];
      if (ch === '(' || ch === '[' || ch === '{') nivel += 1;
      else if (ch === ')' || ch === ']' || ch === '}') {
        if (nivel === 0) break;
        nivel -= 1;
      } else if (ch === ',' && nivel === 0) virgulas += 1;
    }
    const args = fonte.slice(m.index + m[0].length, i).trim();
    const semVirgulaFinal = args.replace(/,\s*$/, '');
    if (virgulas === 0 || (virgulas === 1 && semVirgulaFinal !== args)) achadas.push(`papelDoEstagio(${args})`);
  }
  return achadas;
}

describe('papelDoEstagio — guarda contra chamada só com o nome', () => {
  it('o detector reconhece chamada com e sem chave', () => {
    expect(chamadasSoComNome('papelDoEstagio(e.nome)')).toEqual(['papelDoEstagio(e.nome)']);
    expect(chamadasSoComNome('papelDoEstagio(e.nome, e.chave)')).toEqual([]);
    expect(chamadasSoComNome('papelDoEstagio(f(a, b))')).toHaveLength(1);
    expect(chamadasSoComNome('type P = ReturnType<typeof papelDoEstagio>;')).toEqual([]);
    expect(chamadasSoComNome('export function papelDoEstagio(nome: string) {')).toEqual([]);
  });

  it('nenhum fonte da API chama papelDoEstagio sem a chave (fora de crm/esteira.ts)', () => {
    const permitido = join(SRC, 'modules', 'crm', 'esteira.ts');
    const violacoes = arquivosTs(SRC)
      .filter((f) => f !== permitido)
      .flatMap((f) => chamadasSoComNome(readFileSync(f, 'utf8')).map((c) => `${relative(SRC, f).split(sep).join('/')}: ${c}`));
    expect(violacoes).toEqual([]);
  });
});
