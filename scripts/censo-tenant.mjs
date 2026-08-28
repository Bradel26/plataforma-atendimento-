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
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

/**
 * `--env <arquivo>` aponta o censo para outro banco (producao, tipicamente).
 * A credencial vem de dentro do arquivo de proposito: passada na linha de
 * comando, ela apareceria no historico do shell e em qualquer log de terminal.
 */
const alvoEnv = (() => {
  const i = process.argv.indexOf('--env');
  if (i < 0) return null;
  const caminho = process.argv[i + 1];
  const texto = readFileSync(resolve(caminho), 'utf8');
  for (const linha of texto.split(/\r?\n/)) {
    const [chave, ...resto] = linha.split('=');
    if (chave.trim() === 'DIRECT_URL') return resto.join('=').trim().replace(/^"|"$/g, '');
  }
  throw new Error(`DIRECT_URL nao encontrada em ${caminho}`);
})();

const prisma = alvoEnv ? new PrismaClient({ datasources: { db: { url: alvoEnv } } }) : new PrismaClient();
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
        `SELECT COUNT(*)::int AS sem FROM "${nome}"
          WHERE organizacao_id IS NULL OR organizacao_id::text = ''`,
      );
      linha.sem_org = sem;
      // Quais organizacoes aparecem na tabela. `sem_org = 0` prova que todo
      // registro tem dono; isto prova *quem* e o dono — a diferenca importa
      // depois de uma migracao que carimba a base inteira de uma vez.
      const donos = await prisma.$queryRawUnsafe(
        `SELECT DISTINCT organizacao_id AS org FROM "${nome}"`,
      );
      linha.organizacoes = donos.map((d) => d.org);
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

  const donos = new Set(nomes.flatMap((n) => atual[n].organizacoes ?? []));
  if (donos.size) {
    console.log(`organizacoes presentes nos dados: ${[...donos].sort().join(', ')}`);
  }
  return problemas;
}

/** Migrations aplicadas, na ordem em que o Prisma as registrou. */
async function migrations() {
  try {
    return await prisma.$queryRawUnsafe(`
      SELECT migration_name AS nome, finished_at AS fim, rolled_back_at AS desfeita,
             applied_steps_count AS passos
        FROM "_prisma_migrations"
       ORDER BY started_at`);
  } catch {
    return null;
  }
}

/**
 * As organizacoes e o contador de protocolo de cada uma.
 *
 * O contador merece linha propria: ele substituiu a sequencia do Postgres, e um
 * contador atras da numeracao em uso so apareceria como violacao de unicidade no
 * proximo protocolo aberto — tarde.
 */
async function organizacoes() {
  try {
    return await prisma.$queryRawUnsafe(`
      SELECT o."id", o."nome", o."slug", o."ativa", o."proximo_protocolo" AS proximo,
             COALESCE(MAX(p."numero"), 0) AS maior_em_uso
        FROM "organizacoes" o
        LEFT JOIN "protocolos" p ON p."organizacao_id" = o."id"
       GROUP BY o."id", o."nome", o."slug", o."ativa", o."proximo_protocolo"
       ORDER BY o."nome"`);
  } catch {
    return null;
  }
}

const historico = await migrations();
if (!JSON_MODO && historico) {
  console.log('migrations aplicadas:');
  for (const m of historico.slice(-6)) {
    // Desfeita e aberta sao coisas diferentes: a primeira foi marcada como
    // revertida de proposito, a segunda parou no meio e exige atencao.
    const marca = m.desfeita ? 'desfeita' : m.fim ? 'ok      ' : 'ABERTA  ';
    console.log(`  ${marca} ${m.nome}  (${m.passos} passo(s))`);
  }
  console.log(`  ... ${historico.length} no total
`);
}

const orgs = await organizacoes();
if (!JSON_MODO && orgs) {
  console.log('organizacoes:');
  for (const o of orgs) {
    const atrasado = Number(o.maior_em_uso) >= Number(o.proximo);
    console.log(
      `  ${o.ativa ? 'ativa  ' : 'inativa'} ${o.nome} (${o.slug})  proximo protocolo ${o.proximo}, ` +
        `maior em uso ${o.maior_em_uso}${atrasado ? '  <-- CONTADOR ATRASADO' : ''}`,
    );
  }
  console.log('');
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
