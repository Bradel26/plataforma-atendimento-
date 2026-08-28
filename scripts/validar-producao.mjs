#!/usr/bin/env node
/**
 * Validacao de producao por HTTP: o que um usuario real consegue fazer.
 *
 * Serve para dois momentos do mesmo deploy — antes, para registrar a linha de
 * base, e depois, para comparar. Por isso e read-only: nao abre protocolo, nao
 * cria sessao de webchat, nao escreve nada. Um validador que suja a base nao
 * pode ser rodado duas vezes com o mesmo significado.
 *
 * As contagens vem de paginacao por cursor (a API nao expoe COUNT), entao o
 * script caminha as paginas ate o fim.
 *
 * Uso:
 *   node scripts/validar-producao.mjs <url> <arquivo .env> <saida.json>
 *
 * Le SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD do arquivo indicado e nunca as imprime.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { io } from 'socket.io-client';

const [base, arquivoEnv, saida] = process.argv.slice(2);
if (!base || !arquivoEnv) {
  console.error('uso: node scripts/validar-producao.mjs <url> <arquivo .env> [saida.json]');
  process.exit(2);
}

function env(caminho, chave) {
  const texto = readFileSync(resolve(caminho), 'utf8');
  for (const linha of texto.split(/\r?\n/)) {
    const m = new RegExp(`^\\s*${chave}\\s*=\\s*"?([^"\r\n]*)"?\\s*$`).exec(linha);
    if (m) return m[1];
  }
  throw new Error(`${chave} nao encontrada em ${caminho}`);
}

const EMAIL = env(arquivoEnv, 'SEED_ADMIN_EMAIL');
const SENHA = env(arquivoEnv, 'SEED_ADMIN_PASSWORD');

let ok = 0;
let falhas = 0;
const relatorio = { url: base, contagens: {}, checagens: [] };

function checar(nome, condicao, detalhe = '') {
  if (condicao) {
    ok += 1;
    console.log(`  ok      ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
  } else {
    falhas += 1;
    console.log(`  FALHOU  ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
  }
  relatorio.checagens.push({ nome, ok: Boolean(condicao), detalhe });
}

let token = null;

async function api(caminho, opcoes = {}) {
  const r = await fetch(`${base}${caminho}`, {
    ...opcoes,
    headers: {
      ...(opcoes.body ? { 'content-type': 'application/json' } : {}),
      ...(token && opcoes.semToken !== true ? { authorization: `Bearer ${token}` } : {}),
      ...(opcoes.headers ?? {}),
    },
  });
  const texto = await r.text();
  let corpo = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = texto.slice(0, 200);
  }
  return { status: r.status, corpo };
}

/** Caminha todas as paginas de uma listagem e devolve os itens. */
async function tudo(caminho) {
  const itens = [];
  let cursor = null;
  for (let pagina = 0; pagina < 200; pagina += 1) {
    const sep = caminho.includes('?') ? '&' : '?';
    const r = await api(`${caminho}${cursor ? `${sep}cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (r.status !== 200) return { erro: r.status, itens };
    // Cada listagem nomeia a propria colecao (`contatos`, `filas`, ...), entao o
    // script pega o primeiro array do objeto em vez de exigir um nome fixo.
    const lote = Array.isArray(r.corpo)
      ? r.corpo
      : Object.values(r.corpo ?? {}).find((v) => Array.isArray(v));
    if (!lote) return { erro: 'formato', itens, amostra: Object.keys(r.corpo ?? {}) };
    itens.push(...lote);
    cursor = r.corpo?.proximoCursor ?? null;
    if (!cursor) break;
  }
  return { itens };
}

console.log(`\nvalidando ${base}\n`);

// ── 1. login ────────────────────────────────────────────────────────────────
const entrada = await api('/api/auth/login', {
  method: 'POST',
  semToken: true,
  body: JSON.stringify({ email: EMAIL, senha: SENHA }),
});
checar('login do admin', entrada.status === 200, `status ${entrada.status}`);
if (entrada.status !== 200) {
  console.log('\nsem sessao, o resto nao pode ser verificado');
  process.exit(1);
}
token = entrada.corpo.accessToken;
checar(
  'resposta do login nao traz senhaHash',
  !JSON.stringify(entrada.corpo).toLowerCase().includes('senhahash'),
);

// ── 2. sessao e permissoes ──────────────────────────────────────────────────
const eu = await api('/api/auth/me');
checar('GET /auth/me', eu.status === 200, `status ${eu.status}`);
const perfil = eu.corpo?.usuario?.perfil;
checar('perfil do admin preservado', perfil === 'ADMIN', `perfil=${perfil}`);
relatorio.perfil = perfil;

// sem token, tudo fechado — prova que a autorizacao nao caiu junto com a mudanca
const semSessao = await api('/api/contatos', { semToken: true });
checar('rota interna sem token recusa', semSessao.status === 401, `status ${semSessao.status}`);

// ── 3. contagens ────────────────────────────────────────────────────────────
const LISTAGENS = {
  usuarios: '/api/usuarios',
  contatos: '/api/contatos',
  contas: '/api/contas',
  conversas: '/api/conversas',
  filas: '/api/filas',
  canais: '/api/canais',
  funis: '/api/funis',
  oportunidades: '/api/oportunidades',
  protocolos: '/api/protocolos',
  atividades: '/api/atividades',
  produtos: '/api/produtos',
  campanhas: '/api/campanhas',
};

console.log('\ncontagens:');
for (const [nome, caminho] of Object.entries(LISTAGENS)) {
  const r = await tudo(caminho);
  if (r.erro) {
    falhas += 1;
    relatorio.contagens[nome] = { erro: String(r.erro), chaves: r.amostra };
    console.log(`  FALHOU  ${nome.padEnd(14)} ${r.erro}${r.amostra ? ` (chaves: ${r.amostra})` : ''}`);
  } else {
    ok += 1;
    relatorio.contagens[nome] = r.itens.length;
    console.log(`  ok      ${nome.padEnd(14)} ${r.itens.length}`);
  }
}

// ── 4. numeracao de protocolo ───────────────────────────────────────────────
const prot = await tudo('/api/protocolos');
const numeros = (prot.itens ?? []).map((p) => p.numero).filter((n) => typeof n === 'number');
const maior = numeros.length ? Math.max(...numeros) : 0;
relatorio.protocolo = { quantidade: numeros.length, maiorNumero: maior, repetidos: numeros.length - new Set(numeros).size };
checar('numeros de protocolo sem repeticao', numeros.length === new Set(numeros).size, `maior=${maior}`);

// ── 5. arquivos ─────────────────────────────────────────────────────────────
// Um anexo existente e a unica prova de que a chave antiga continua legivel
// depois de o prefixo por organizacao entrar em cena.
let anexo = null;
for (const c of (await tudo('/api/conversas')).itens ?? []) {
  const msgs = await api(`/api/conversas/${c.id}/mensagens`);
  const lista = Array.isArray(msgs.corpo) ? msgs.corpo : (Object.values(msgs.corpo ?? {}).find((v) => Array.isArray(v)) ?? []);
  const achado = lista.find((m) => m.anexoUrl ?? m.anexo);
  if (achado) {
    anexo = achado.anexoUrl ?? achado.anexo?.url ?? null;
    if (anexo) break;
  }
}
if (anexo) {
  const url = anexo.startsWith('http') ? anexo : `${base}${anexo}`;
  const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  checar('anexo antigo continua servivel', r.status === 200, `status ${r.status}`);
  relatorio.anexo = { url: anexo.replace(/(\?|&)(assinatura|sig)=[^&]*/g, '$1<assinatura>'), status: r.status };
} else {
  relatorio.anexo = 'nenhum anexo encontrado na base';
  console.log('  --      nenhum anexo na base para testar (nao e falha)');
}
const semAssinatura = await api('/api/arquivos/inexistente.png');
checar(
  'arquivo sem assinatura recusado',
  semAssinatura.status === 401 || semAssinatura.status === 403 || semAssinatura.status === 404,
  `status ${semAssinatura.status}`,
);

// ── 6. webchat (sem escrever) ───────────────────────────────────────────────
// Corpo invalido de proposito: prova que a rota esta montada e validando, sem
// criar contato nem conversa na base de producao.
const wc = await api('/api/webchat/sessoes', { method: 'POST', semToken: true, body: JSON.stringify({}) });
checar('webchat montado e validando', wc.status === 400, `status ${wc.status}`);

// ── 7. ponte de IA ──────────────────────────────────────────────────────────
const ia = await api('/api/bots/ia/ping', { semToken: true });
checar('ponte de IA exige token', ia.status === 401, `status ${ia.status}`);

// ── 8. Socket.IO ────────────────────────────────────────────────────────────
const conectado = await new Promise((resolver) => {
  const s = io(base, { auth: { token }, transports: ['websocket'], timeout: 15000, reconnection: false });
  const fim = (v) => {
    s.close();
    resolver(v);
  };
  s.on('connect', () => fim(true));
  s.on('connect_error', (e) => fim(`erro: ${e.message}`));
  setTimeout(() => fim('tempo esgotado'), 16000);
});
checar('Socket.IO aceita a sessao', conectado === true, String(conectado));

// ── 9. saude ────────────────────────────────────────────────────────────────
const saude = await api('/api/health', { semToken: true });
checar('health ok', saude.corpo?.status === 'ok', JSON.stringify(saude.corpo));
relatorio.health = saude.corpo;

console.log(`\n${ok} ok, ${falhas} falha(s)`);
if (saida) {
  mkdirSync(dirname(resolve(saida)), { recursive: true });
  writeFileSync(resolve(saida), JSON.stringify(relatorio, null, 2), 'utf8');
  console.log(`relatorio: ${saida}`);
}
process.exit(falhas ? 1 : 0);
