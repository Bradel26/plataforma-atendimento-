/**
 * Smoke test das defesas de autenticacao e do segredo em repouso.
 *
 * Cobre: bloqueio por tentativas de senha, limite por IP, cifragem dos segredos
 * de canal no banco e recusa da API em devolver hash de senha.
 *
 * O script fala com o Redis e com o Postgres direto porque e a unica forma de
 * verificar o que ficou *gravado* — e limpa as chaves de limite no inicio e no
 * fim para nao deixar a plataforma bloqueada depois do teste.
 *
 * Uso: npm run smoke:seguranca  (com a API de pe e o seed aplicado)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Redis from 'ioredis';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  readFileSync(join(raiz, 'apps/api/.env'), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    }),
);
process.env.DATABASE_URL = env.DATABASE_URL;

const API = 'http://localhost:3333/api';
const EXECUCAO = Date.now().toString(36);
const TOKEN_CANAL = `EAAG-segredo-${EXECUCAO}`;

let falhas = 0;
const checar = (cond, titulo, extra = '') => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok    ' : 'FALHOU'} ${titulo}${extra ? ` — ${extra}` : ''}`);
};

// O prefixo e aplicado a mao, e nao por `keyPrefix` do cliente: com `keyPrefix`,
// `KEYS` devolve o nome COMPLETO e o `DEL` seguinte prefixaria de novo, apagando
// `dev:dev:limite:...` — que nao existe. Explicito evita a pegadinha.
const prefixoRedis = env.REDIS_PREFIXO ?? (env.NODE_ENV === 'production' ? '' : 'dev');
const K = (nome) => (prefixoRedis ? `${prefixoRedis}:${nome}` : nome);
const redis = new Redis(env.REDIS_URL);
const limparLimites = async () => {
  const chaves = [...(await redis.keys(K('limite:*'))), ...(await redis.keys(K('login:falhas:*')))];
  if (chaves.length) await redis.del(chaves);
  return chaves.length;
};
await limparLimites();

async function req(metodo, rota, { corpo, token } = {}) {
  const resp = await fetch(API + rota, {
    method: metodo,
    headers: {
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { status: resp.status, dados: await resp.json().catch(() => ({})) };
}

const { dados: login } = await req('POST', '/auth/login', {
  corpo: { email: 'admin@plataforma.local', senha: 'Admin@123' },
});
const admin = login.accessToken;
checar(Boolean(admin), '0. login do administrador');

// 1. Bloqueio por tentativas: conta inexistente tambem conta, senao varrer
//    email sai de graca.
const vitima = `naoexiste-${EXECUCAO}@teste.local`;
const codigos = [];
for (let i = 0; i < 6; i++) {
  const { status, dados } = await req('POST', '/auth/login', {
    corpo: { email: vitima, senha: 'senha-errada' },
  });
  codigos.push(status === 429 ? dados.error?.code : status);
}
checar(
  codigos.slice(0, 5).every((c) => c === 401),
  '1. cinco senhas erradas devolvem 401',
  codigos.slice(0, 5).join(','),
);
checar(codigos[5] === 'CONTA_BLOQUEADA', '   a sexta tentativa e bloqueada', String(codigos[5]));

// A senha certa nao vale mais nada enquanto o bloqueio durar.
const bloqueado = await req('POST', '/auth/login', {
  corpo: { email: vitima, senha: 'qualquer' },
});
checar(bloqueado.status === 429, '   bloqueio vale por conta, nao por tentativa', `status ${bloqueado.status}`);

// 2. Login que da certo limpa o contador da propria conta
await req('POST', '/auth/login', { corpo: { email: 'admin@plataforma.local', senha: 'errada' } });
const depois = await req('POST', '/auth/login', {
  corpo: { email: 'admin@plataforma.local', senha: 'Admin@123' },
});
const falhasAdmin = await redis.get(K('login:falhas:admin@plataforma.local'));
checar(depois.status === 200 && !falhasAdmin, '2. login correto zera as falhas da conta', `restou ${falhasAdmin}`);

// 3. Limite por IP: acima do teto, 429 mesmo com credencial diferente a cada vez
let ultimo = 0;
for (let i = 0; i < 32; i++) {
  const { status } = await req('POST', '/auth/login', {
    corpo: { email: `varredura-${i}-${EXECUCAO}@teste.local`, senha: 'x' },
  });
  ultimo = status;
}
checar(ultimo === 429, '3. limite por IP corta a varredura de emails', `ultimo status ${ultimo}`);
const retry = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'a@b.c', senha: 'x' }),
});
checar(Boolean(retry.headers.get('retry-after')), '   resposta diz quando tentar de novo', `Retry-After: ${retry.headers.get('retry-after')}`);

const limpas = await limparLimites();
checar(limpas > 0, '   chaves de limite removidas depois do teste', `${limpas} chaves`);

// 4. Segredo de canal cifrado em repouso
const { dados: filas } = await req('GET', '/filas', { token: admin });
const salvo = await req('PUT', '/canais/facebook', {
  token: admin,
  corpo: {
    ativo: false,
    accessToken: TOKEN_CANAL,
    appSecret: `app-secret-${EXECUCAO}`,
    verifyToken: `verify-${EXECUCAO}`,
    pageId: '555666777',
    filaId: filas.filas[0].id,
  },
});
checar(salvo.status === 200, '4. canal salvo', `status ${salvo.status}`);

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();
// findFirst: o canal passou a ser unico POR organizacao, entao ele sozinho nao e
// mais chave. O script fala com o banco direto, sem o filtro da extensao, e por
// isso ve todas as organizacoes — o que aqui e proposital: ele confere o que
// ficou GRAVADO.
const noBanco = await prisma.channelConfig.findFirst({ where: { canal: 'FACEBOOK' } });
checar(noBanco?.accessToken?.startsWith('v1:'), '   token gravado cifrado (AES-256-GCM)', noBanco?.accessToken?.slice(0, 22));
checar(!noBanco?.accessToken?.includes(TOKEN_CANAL), '   texto em claro nao aparece no banco');
checar(noBanco?.appSecret?.startsWith('v1:') && noBanco?.verifyToken?.startsWith('v1:'), '   app secret e verify token tambem');

// 5. A API continua devolvendo a mascara do valor em claro (prova que decifra)
const { dados: canais } = await req('GET', '/canais', { token: admin });
const fb = canais.canais.find((c) => c.canal === 'FACEBOOK');
checar(
  fb?.accessTokenMascarado?.startsWith('EAAG') && fb.accessTokenMascarado.endsWith(TOKEN_CANAL.slice(-4)),
  '5. leitura decifra e mascara',
  fb?.accessTokenMascarado,
);
checar(!JSON.stringify(canais).includes(TOKEN_CANAL), '   valor completo nunca sai pela API');

// 6. Hash de senha nunca vaza
const { dados: usuarios } = await req('GET', '/usuarios', { token: admin });
checar(!JSON.stringify(usuarios).includes('senhaHash'), '6. hash de senha nao aparece na API');

// Devolve o Facebook ao estado nao configurado: outro teste conta com isso, e
// teste que deixa sujeira quebra o vizinho.
const limpo = await req('PUT', '/canais/facebook', {
  token: admin,
  corpo: { ativo: false, accessToken: null, appSecret: null, verifyToken: null },
});
checar(limpo.status === 200, '7. canal do teste devolvido ao estado inicial', `status ${limpo.status}`);

await prisma.$disconnect();
await redis.quit();
console.log(`\n${falhas} FALHOU`);
process.exit(falhas === 0 ? 0 : 1);
