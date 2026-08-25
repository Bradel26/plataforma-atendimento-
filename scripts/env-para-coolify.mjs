/**
 * Gera apps/api/.env.coolify a partir do .env.production.
 *
 * O Coolify cola variaveis em bloco, uma por linha, e engasga com comentario e
 * com aspas em alguns campos. Este script produz o bloco limpo, ja com os
 * ajustes de container:
 *
 *   PORT=3333             a porta que o Traefik espera
 *   WORKER_EMBUTIDO=true  um container e um processo; o worker vai junto
 *   STATIC_DIR            o front compilado dentro da imagem
 *
 * Uso: node scripts/env-para-coolify.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const origem = join(raiz, 'apps/api/.env.production');
const destino = join(raiz, 'apps/api/.env.coolify');

const lido = Object.fromEntries(
  readFileSync(origem, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    }),
);

// Ajustes de container. O resto vem do .env.production como esta.
const ajustes = {
  NODE_ENV: 'production',
  PORT: '3333',
  WORKER_EMBUTIDO: 'true',
  STATIC_DIR: '../web/dist',
  TRUST_PROXY: 'true',
};

const ORDEM = [
  'NODE_ENV',
  'PORT',
  'DATABASE_URL',
  'DIRECT_URL',
  'REDIS_URL',
  'WEB_ORIGIN',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'JWT_ACCESS_TTL',
  'JWT_REFRESH_TTL_DAYS',
  'SECRETS_KEY',
  'TRUST_PROXY',
  'WORKER_EMBUTIDO',
  'STORAGE_DIR',
  'STATIC_DIR',
  'UPLOAD_MAX_MB',
  'SEED_ADMIN_EMAIL',
  'SEED_ADMIN_PASSWORD',
  'LGPD_EXPURGO_AUTOMATICO',
];

const final = { ...lido, ...ajustes };
const linhas = ORDEM.filter((k) => final[k] !== undefined && final[k] !== '').map((k) => `${k}=${final[k]}`);

const faltando = ['DATABASE_URL', 'DIRECT_URL', 'REDIS_URL', 'WEB_ORIGIN'].filter((k) => !final[k]);
if (faltando.length) {
  console.error('Faltam valores no .env.production:', faltando.join(', '));
  process.exit(1);
}

writeFileSync(destino, linhas.join('\n') + '\n', { encoding: 'utf8', mode: 0o600 });

console.log(`Escrito: apps/api/.env.coolify (${linhas.length} variaveis, permissao 600)`);
console.log('');
console.log('Abra o arquivo, selecione tudo, copie, e cole no Coolify em');
console.log('Environment Variables > Developer view.');
console.log('');
console.log('Nenhum valor foi impresso aqui de proposito.');
