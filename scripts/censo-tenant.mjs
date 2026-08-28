/**
 * Censo do banco: quantas linhas por tabela, e quantas sem organizacao.
 *
 * Existe para a migracao de multi-tenancy poder ser *verificada* em vez de
 * acreditada. O uso e sanduiche: rodar antes de migrar, guardar o resultado,
 * rodar depois e comparar. Total por tabela tem de ser identico — a migracao
 * acrescenta coluna, nunca linha — e `sem_org` tem de ser zero em toda tabela
 * que ganhou a coluna.
 *
 * Nao substitui backup. Um censo diz que nada se perdeu; ele nao devolve nada.
 * Antes dos passos irreversiveis (troca de unicidade em diante), o caminho de
 * volta e um branch do Neon, que e copy-on-write e instantaneo.
 *
 *   node scripts/censo-tenant.mjs              # imprime a tabela
 *   node scripts/censo-tenant.mjs --json > a   # guarda para comparar
 *   node scripts/censo-tenant.mjs --comparar a # confere contra o guardado
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const JSON_MODO = process.argv.includes('--json');
const arquivoBase = (() => {
  const i = process.argv.indexOf('--comparar');
  return i >= 0 ? process.argv[i + 1] : null;
})();

/** Tabelas do banco, na ordem do nome. Le do catalogo: nao ha lista para manter. */
async function tabelas() {
  const linhas = await prisma.$queryRawUnsafe(`
    SELECT table_name AS nome
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_type = 'BASE TABLE'
       AND table_name NOT LIKE '_prisma%'
     ORDER BY table_name
  `);
  return linhas.map((l) => l.nome);
}

/** Quais dessas tabelas tem a coluna de organizacao. */
async function comColunaOrg() {
  const linhas = await prisma.$queryRawUnsafe(`
    SELECT table_name AS nome
      FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name = 'organizacao_id'
  `);
  return new Set(linhas.map((l) => l.nome));
}

async function censo() {
  const nomes = await tabelas();
  const temOrg = await comColunaOrg();
  const resultado = {};

  for (const nome of nomes) {
    // Aspas duplas: nomes de tabela vem do catalogo do proprio banco, mas
    // interpolar identificador sem quote e o habito que produz injecao no dia
    // em que a fonte muda.
    const [{ total }] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS total FROM "${nome}"`);
    const linha = { total, tem_coluna_org: temOrg.has(nome) };
    if (temOrg.has(nome)) {
      const [{ sem }] = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS sem FROM "${nome}" WHERE organizacao_id IS NULL`,
      );
      linha.sem_org = sem;
    }
    resultado[nome] = linha;
  }
  return resultado;
}

function imprimir(atual, base) {
  const nomes = Object.keys(atual);
  const largura = Math.max(...nomes.map((n) => n.length), 12);
  console.log(`${'tabela'.padEnd(largura)}  linhas  sem_org  ${base ? 'antes  ' : ''}situacao`);
  console.log('-'.repeat(largura + (base ? 34 : 26)));

  let problemas = 0;
  for (const nome of nomes) {
    const a = atual[nome];
    const b = base?.[nome];
    const semOrg = a.tem_coluna_org ? String(a.sem_org) : '-';

    let situacao = 'ok';
    if (a.tem_coluna_org && a.sem_org > 0) {
      situacao = `FALTA BACKFILL (${a.sem_org})`;
      problemas++;
    } else if (base && !b) {
      situacao = 'tabela nova';
    } else if (b && b.total !== a.total) {
      situacao = `LINHAS MUDARAM (${b.total} -> ${a.total})`;
      problemas++;
    }

    console.log(
      `${nome.padEnd(largura)}  ${String(a.total).padStart(6)}  ${semOrg.padStart(7)}  ` +
        `${base ? String(b?.total ?? '-').padStart(5) + '  ' : ''}${situacao}`,
    );
  }

  if (base) {
    for (const nome of Object.keys(base)) {
      if (!atual[nome]) {
        console.log(`${nome.padEnd(largura)}  ${'-'.padStart(6)}  ${'-'.padStart(7)}  TABELA DESAPARECEU`);
        problemas++;
      }
    }
  }

  const comOrg = nomes.filter((n) => atual[n].tem_coluna_org).length;
  console.log(`\n${nomes.length} tabelas, ${comOrg} com organizacao_id.`);
  return problemas;
}

const atual = await censo();
if (JSON_MODO) {
  console.log(JSON.stringify(atual, null, 2));
} else {
  const base = arquivoBase ? JSON.parse(readFileSync(arquivoBase, 'utf8')) : null;
  const problemas = imprimir(atual, base);
  if (problemas > 0) {
    console.error(`\n${problemas} problema(s). A migracao NAO esta consistente.`);
    process.exitCode = 1;
  } else {
    console.log('Consistente.');
  }
}

await prisma.$disconnect();
