/**
 * Diagnostico SOMENTE LEITURA do vazamento de conversas entre linhas.
 *
 * Nao executa INSERT, UPDATE nem DELETE — so SELECT. Nao imprime nenhuma
 * coluna de segredo (access_token, ponte_token, ponte_segredo ficam de fora
 * das consultas de proposito).
 *
 * Responde a pergunta: as conversas atribuidas a um vendedor apontam para a
 * linha pessoal dele (`canal_config_id`), ou estao nulas / na compartilhada —
 * que e o que as deixa visiveis para os outros, via o termo `canalConfig: null`
 * da politica em apps/api/src/lib/politicas.ts.
 */
import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';

function lerEnv(caminho) {
  const valores = {};
  const bruto = readFileSync(caminho, 'utf8').replace(/^﻿/, '');
  for (const linha of bruto.split(/\r?\n/)) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith('#')) continue;
    const pos = limpa.indexOf('=');
    if (pos <= 0) continue;
    const chave = limpa.slice(0, pos).trim();
    let valor = limpa.slice(pos + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    valores[chave] = valor;
  }
  return valores;
}

/*
 * Prefere `scripts/.env.producao` quando ele existe: o `.env` local aponta para
 * OUTRO banco Neon (verificado em 2026-10-02 — conjuntos de conversas
 * disjuntos), entao diagnosticar producao pelo .env local descreve o banco
 * errado.
 */
const arquivo = existsSync('scripts/.env.producao') ? 'scripts/.env.producao' : 'apps/api/.env';
console.log('Lendo credenciais de:', arquivo);
const env = lerEnv(arquivo);
const url = env.DATABASE_URL;

if (!url) {
  console.error('DATABASE_URL nao encontrada em apps/api/.env.');
  console.error('Chaves lidas:', Object.keys(env).join(', ') || '(nenhuma)');
  process.exit(1);
}
console.log('Conectando em:', new URL(url).host);

const cliente = new pg.Client({ connectionString: url, connectionTimeoutMillis: 20000 });
await cliente.connect();

const linhas = await cliente.query(`
  select
    c.id,
    c.ativo,
    c.modo,
    c.dono_id,
    c.ponte_sessao,
    c.nome,
    u.nome as dono_nome
  from canais_config c
  left join usuarios u on u.id = c.dono_id
  where c.canal = 'WHATSAPP'
  order by c.dono_id nulls first
`);

console.log('\n=== LINHAS DE WHATSAPP ===');
for (const l of linhas.rows) {
  const tipo = l.dono_id ? 'PESSOAL     ' : 'COMPARTILHADA';
  console.log(
    `${tipo} | ativo=${String(l.ativo).padEnd(5)} | modo=${String(l.modo ?? '-').padEnd(12)} | dono=${String(l.dono_nome ?? '-').padEnd(16)} | sessao=${l.ponte_sessao ?? '-'}`,
  );
  console.log(`              id=${l.id}`);
}

const conversas = await cliente.query(`
  select
    v.id,
    v.canal_config_id,
    v.status,
    v.criado_em,
    ct.nome as contato,
    ag.nome as agente
  from conversas v
  left join contatos ct on ct.id = v.contato_id
  left join usuarios ag on ag.id = v.agente_id
  where v.canal = 'WHATSAPP'
  order by v.criado_em desc
  limit 50
`);

console.log('\n=== TODAS AS CONVERSAS DE WHATSAPP ===');
for (const c of conversas.rows) {
  console.log(
    `${String(c.contato ?? '?').padEnd(20)} | ${String(c.status).padEnd(12)} | agente=${String(c.agente ?? '-').padEnd(16)} | canal_config_id=${c.canal_config_id ?? 'NULO'}`,
  );
}

const usuarios = await cliente.query(`
  select u.nome, u.perfil, u.email
  from usuarios u
  order by u.nome
  limit 30
`);
console.log('\n=== USUARIOS ===');
for (const u of usuarios.rows) {
  console.log(`${String(u.nome).padEnd(20)} | perfil=${u.perfil}`);
}

const detalhe = await cliente.query(`
  select ct.nome as contato, v.fila_id, v.criado_em, f.nome as fila
  from conversas v
  left join contatos ct on ct.id = v.contato_id
  left join filas f on f.id = v.fila_id
  where v.canal = 'WHATSAPP'
  order by v.criado_em asc
`);
console.log('\n=== ORIGEM DAS CONVERSAS ===');
for (const d of detalhe.rows) {
  console.log(
    `${String(d.contato ?? '?').padEnd(20)} | fila=${String(d.fila ?? 'nenhuma').padEnd(16)} | criada=${d.criado_em.toISOString().slice(0, 10)}`,
  );
}

const filas = await cliente.query(`
  select f.nome, f.ativa, string_agg(u.nome || ' (' || u.perfil || ')', ', ' order by u.nome) as membros
  from filas f
  left join filas_agentes fa on fa.fila_id = f.id
  left join usuarios u on u.id = fa.usuario_id
  group by f.id, f.nome, f.ativa
  order by f.nome
`);
console.log('\n=== FILAS E MEMBROS ===');
for (const f of filas.rows) {
  console.log(`${String(f.nome).padEnd(20)} | ativa=${String(f.ativa).padEnd(5)} | ${f.membros ?? '(sem membros)'}`);
}

const previas = await cliente.query(`
  select p.nome, p.numero, p.canal_config_id, p.ultima_mensagem_em, c.ponte_sessao, c.dono_id
  from previas_chat p
  left join canais_config c on c.id = p.canal_config_id
  order by p.ultima_mensagem_em desc
  limit 50
`);

console.log('\n=== PREVIAS DE CHAT ===');
for (const p of previas.rows) {
  console.log(
    `${String(p.nome ?? '?').padEnd(20)} | sessao=${String(p.ponte_sessao ?? '-').padEnd(20)} | dono_id=${p.dono_id ?? 'NULO'}`,
  );
}

const semLinha = conversas.rows.filter((c) => !c.canal_config_id).length;
console.log(
  `\nResumo: ${conversas.rows.length} conversas, ${semLinha} sem canal_config_id, ${previas.rows.length} previas.`,
);

await cliente.end();
