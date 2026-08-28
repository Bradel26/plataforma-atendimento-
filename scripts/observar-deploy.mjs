#!/usr/bin/env node
/**
 * Detecta a troca de container em producao.
 *
 * O problema: `/api/health` responde 200 antes e depois do deploy, e nestes
 * commits o bundle do front nao mudou (vite hasheia por conteudo), entao o nome
 * do asset tambem nao distingue. O que distingue e o processo: uma conexao
 * Socket.IO aberta **cai** quando o container e substituido.
 *
 * Uso: node scripts/observar-deploy.mjs <url> <arquivo .env> [minutos]
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { io } from 'socket.io-client';

const [base, arquivoEnv, minutos = '20'] = process.argv.slice(2);

function env(caminho, chave) {
  const texto = readFileSync(resolve(caminho), 'utf8');
  const m = new RegExp(`^\\s*${chave}\\s*=\\s*"?([^"\r\n]*)"?\\s*$`, 'm').exec(texto);
  if (!m) throw new Error(`${chave} nao encontrada`);
  return m[1];
}

const hora = () => new Date().toISOString().slice(11, 19);

const r = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    email: env(arquivoEnv, 'SEED_ADMIN_EMAIL'),
    senha: env(arquivoEnv, 'SEED_ADMIN_PASSWORD'),
  }),
});
if (r.status !== 200) {
  console.log(`${hora()}  login falhou (${r.status}) — nao consigo observar`);
  process.exit(1);
}
const { accessToken } = await r.json();

const s = io(base, { auth: { token: accessToken }, transports: ['websocket'], reconnection: true, reconnectionDelay: 3000 });
let quedas = 0;

s.on('connect', () => console.log(`${hora()}  socket conectado${quedas ? ` (reconexao ${quedas})` : ''}`));
s.on('disconnect', (motivo) => {
  // `io client disconnect` e este proprio script fechando o socket no fim da
  // janela. Contar isso como troca de container faria o observador anunciar um
  // deploy que nao houve — exatamente o erro que ele existe para evitar.
  if (motivo === 'io client disconnect') return;
  quedas += 1;
  console.log(`${hora()}  SOCKET CAIU (${motivo}) — container sendo substituido`);
});
s.on('connect_error', (e) => console.log(`${hora()}  ainda fora do ar (${e.message})`));

const fim = Date.now() + Number(minutos) * 60_000;
while (Date.now() < fim) {
  await new Promise((res) => setTimeout(res, 15_000));
  const h = await fetch(`${base}/api/health`).then((x) => x.status).catch(() => 'sem resposta');
  if (h !== 200) console.log(`${hora()}  health -> ${h}`);
}

console.log(`\n${quedas} queda(s) de conexao na janela observada`);
console.log(quedas ? 'container foi substituido' : 'nenhuma troca de container detectada');
s.close();
