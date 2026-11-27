// Diagnostico SOMENTE LEITURA de contatos e conversas duplicadas.
// Uso: PROD_DATABASE_URL="postgres://..." node scripts/diagnostico-contatos-duplicados.mjs
// Nao escreve nada: abre transacao READ ONLY e so executa SELECT.
import pg from 'pg';

const url = process.env.PROD_DATABASE_URL;
if (!url) {
  console.error('Defina PROD_DATABASE_URL (use a URL direta/pooled do banco a diagnosticar).');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: true });
await client.connect();
await client.query('BEGIN READ ONLY');

const consultas = {
  'Contatos com o mesmo telefone normalizado': `
    SELECT telefone_normalizado, count(*) AS contatos, array_agg(id) AS ids, array_agg(nome) AS nomes
    FROM contatos
    WHERE excluido_em IS NULL AND telefone_normalizado IS NOT NULL
    GROUP BY telefone_normalizado HAVING count(*) > 1`,
  'Contatos sem telefone que tem conversa (provaveis @lid)': `
    SELECT c.id, c.nome, count(v.id) AS conversas, min(v.endereco_externo) AS endereco
    FROM contatos c JOIN conversas v ON v.contato_id = c.id
    WHERE c.excluido_em IS NULL AND c.telefone IS NULL
    GROUP BY c.id, c.nome`,
  'Contato com mais de uma conversa aberta na mesma linha': `
    SELECT contato_id, canal, canal_config_id, count(*) AS abertas, array_agg(protocolo) AS protocolos
    FROM conversas
    WHERE status <> 'FINALIZADO'
    GROUP BY contato_id, canal, canal_config_id HAVING count(*) > 1`,
  'Variantes com/sem nono digito (55 + DDD + 8 ou 9 digitos)': `
    SELECT a.id AS id_a, a.nome AS nome_a, a.telefone_normalizado AS tel_a,
           b.id AS id_b, b.nome AS nome_b, b.telefone_normalizado AS tel_b
    FROM contatos a JOIN contatos b
      ON a.id < b.id
     AND a.excluido_em IS NULL AND b.excluido_em IS NULL
     AND length(a.telefone_normalizado) = 12 AND length(b.telefone_normalizado) = 13
     AND b.telefone_normalizado = substr(a.telefone_normalizado, 1, 4) || '9' || substr(a.telefone_normalizado, 5)
     OR (a.id < b.id AND length(b.telefone_normalizado) = 12 AND length(a.telefone_normalizado) = 13
         AND a.telefone_normalizado = substr(b.telefone_normalizado, 1, 4) || '9' || substr(b.telefone_normalizado, 5)
         AND a.excluido_em IS NULL AND b.excluido_em IS NULL)`,
};

for (const [titulo, sql] of Object.entries(consultas)) {
  try {
    const { rows } = await client.query(sql);
    console.log(`\n## ${titulo}: ${rows.length}`);
    for (const linha of rows.slice(0, 50)) console.log(JSON.stringify(linha));
  } catch (erro) {
    console.log(`\n## ${titulo}: erro (${erro.message}) - confira os nomes de tabela/coluna`);
    await client.query('ROLLBACK');
    await client.query('BEGIN READ ONLY');
  }
}

await client.query('ROLLBACK');
await client.end();
