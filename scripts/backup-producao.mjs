#!/usr/bin/env node
/**
 * Retrato logico completo de um banco, tabela por tabela, em JSON.
 *
 * Existe porque esta maquina nao tem `pg_dump` e a conta do Neon nao tem chave de
 * API disponivel aqui: sem isto, um deploy com migration estrutural nao teria
 * nenhuma rede de seguranca local. O arquivo gerado permite reconstruir os dados
 * por INSERT caso algo precise ser desfeito.
 *
 * Nao e substituto de um branch do Neon (que preserva schema, indices e
 * sequences); e o que da para garantir sem acesso ao console.
 *
 * Uso:
 *   node scripts/backup-producao.mjs apps/api/.env.production [destino.json]
 *
 * Le apenas DIRECT_URL do arquivo indicado e nunca imprime a credencial.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const arquivoEnv = process.argv[2] ?? 'apps/api/.env.production';
const destino = process.argv[3] ?? `backups/producao-${process.env.SELO ?? 'sem-selo'}.json`;

function lerUrl(caminho) {
  const texto = readFileSync(resolve(caminho), 'utf8');
  for (const linha of texto.split(/\r?\n/)) {
    const m = /^\s*DIRECT_URL\s*=\s*"?([^"\r\n]+)"?\s*$/.exec(linha);
    if (m) return m[1];
  }
  throw new Error(`DIRECT_URL nao encontrada em ${caminho}`);
}

const url = lerUrl(arquivoEnv);
// O host aparece no relatorio para provar de qual banco veio o retrato; a senha, nao.
const alvo = url.replace(/^([a-z+]+:\/\/)[^@]*@/, '$1<credencial>@').replace(/\?.*$/, '');

const prisma = new PrismaClient({ datasources: { db: { url } } });

const tabelas = await prisma.$queryRawUnsafe(`
  SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
   ORDER BY table_name`);

const retrato = { banco: alvo, tabelas: {} };
let total = 0;
for (const { table_name: nome } of tabelas) {
  const linhas = await prisma.$queryRawUnsafe(`SELECT * FROM "${nome}"`);
  // BigInt e Buffer nao sobrevivem a JSON.stringify sem tratamento.
  retrato.tabelas[nome] = JSON.parse(
    JSON.stringify(linhas, (_, v) => {
      if (typeof v === 'bigint') return Number(v);
      if (v instanceof Uint8Array) return { __buffer: Buffer.from(v).toString('base64') };
      return v;
    }),
  );
  total += linhas.length;
  console.log(`${String(linhas.length).padStart(6)}  ${nome}`);
}

mkdirSync(dirname(resolve(destino)), { recursive: true });
writeFileSync(resolve(destino), JSON.stringify(retrato, null, 2), 'utf8');

console.log(`\n${tabelas.length} tabelas, ${total} linhas`);
console.log(`banco:   ${alvo}`);
console.log(`arquivo: ${destino}`);

await prisma.$disconnect();
