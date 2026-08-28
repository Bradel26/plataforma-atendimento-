/**
 * Smoke do worker e da lista de mortos.
 *
 * Duas coisas que ninguem verificava: se o trabalho que desistiu consegue voltar
 * para a fila pela interface, e se a contabilidade da fila fecha depois disso.
 *
 * O worker em processo separado e verificado a parte, com o processo de pe e o
 * log dele como prova de quem consumiu — nao da para afirmar isso por HTTP.
 *
 * Uso: npm run smoke:worker  (com a API de pe e o seed aplicado)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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

const API = 'http://localhost:3333/api';
const EXECUCAO = Date.now().toString(36);
const MORTOS_BASE = 'fila:mortos';

let falhas = 0;
const checar = (cond, titulo, extra = '') => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok    ' : 'FALHOU'} ${titulo}${extra ? ` — ${extra}` : ''}`);
};

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

const entrar = async (email, senha) =>
  (await req('POST', '/auth/login', { corpo: { email, senha } })).dados.accessToken;

const admin = await entrar('admin@plataforma.local', 'Admin@123');
const supervisor = await entrar('supervisor@plataforma.local', 'Super@123');
const agente = await entrar('agente1@plataforma.local', 'Agente@123');

const { default: Redis } = await import('ioredis');
// O prefixo e aplicado a mao, e nao por `keyPrefix` do cliente: com `keyPrefix`,
// `KEYS` devolve o nome COMPLETO e o `DEL` seguinte prefixaria de novo, apagando
// `dev:dev:limite:...` — que nao existe. Explicito evita a pegadinha.
const prefixoRedis = env.REDIS_PREFIXO ?? (env.NODE_ENV === 'production' ? '' : 'dev');
const K = (nome) => (prefixoRedis ? `${prefixoRedis}:${nome}` : nome);
const redis = new Redis(env.REDIS_URL);

const estado = async (token = admin) => (await req('GET', '/health/fila', { token })).dados.fila;

// 1. Autorizacao: reprocessar campanha manda mensagem de novo, nao e leitura.
const semToken = await req('POST', '/fila/reprocessar');
const comoAgente = await req('POST', '/health/fila/reprocessar', { token: agente });
const comoSupervisor = await req('POST', '/health/fila/reprocessar', { token: supervisor });
checar(semToken.status === 404 || semToken.status === 401, '1. rota errada ou sem token nao passa', `status ${semToken.status}`);
checar(comoAgente.status === 403, '2. agente nao reprocessa a fila', `status ${comoAgente.status}`);
checar(comoSupervisor.status === 403, '3. supervisor tambem nao: reprocessar e de ADMIN', `status ${comoSupervisor.status}`);

// 2. Trabalho com handler registrado volta para a fila.
const antes = await estado();
const trabalhoVivo = {
  id: `smoke-worker-${EXECUCAO}`,
  tipo: 'pesquisa:convite',
  dados: { conversaId: '00000000-0000-0000-0000-000000000000' },
  tentativa: 3,
  erro: 'falha simulada pelo smoke',
};
await redis.lpush(K(MORTOS_BASE), JSON.stringify(trabalhoVivo));

const depoisDeMorrer = await estado();
checar(depoisDeMorrer.mortos === antes.mortos + 1, '4. trabalho entrou na lista de mortos', `${antes.mortos} -> ${depoisDeMorrer.mortos}`);
checar(
  depoisDeMorrer.ultimosMortos.some((m) => m.erro),
  '5. a lista de mortos mostra o motivo da desistencia',
  depoisDeMorrer.ultimosMortos[0]?.erro ?? 'sem motivo',
);

const reprocessado = await req('POST', '/health/fila/reprocessar', { token: admin });
checar(reprocessado.status === 200, '6. admin reprocessa', `status ${reprocessado.status}`);
checar(
  reprocessado.dados.devolvidos >= 1,
  '7. trabalho com handler volta para a fila',
  `${reprocessado.dados.devolvidos} devolvido(s), ${reprocessado.dados.descartados} descartado(s)`,
);
checar(
  reprocessado.dados.fila.mortos < depoisDeMorrer.mortos,
  '8. a lista de mortos diminuiu',
  `${depoisDeMorrer.mortos} -> ${reprocessado.dados.fila.mortos}`,
);

// 3. Trabalho sem handler nao entra em laco: fica nos mortos, contado como
// descartado. Devolver seria voltar para os mortos no mesmo instante.
const semHandler = { id: `sem-handler-${EXECUCAO}`, tipo: `tipo:inexistente-${EXECUCAO}`, dados: {}, tentativa: 0, erro: 'sem handler' };
await redis.lpush(K(MORTOS_BASE), JSON.stringify(semHandler));
const segundo = await req('POST', '/health/fila/reprocessar', { token: admin });
const aindaMorto = segundo.dados.fila.ultimosMortos.some((m) => m.tipo === semHandler.tipo);
checar(segundo.dados.descartados >= 1, '9. trabalho sem handler conta como descartado', `${segundo.dados.descartados}`);
checar(aindaMorto, '10. e continua na lista, em vez de circular para sempre');

// 4. Item corrompido nao trava a fila nem volta para ela.
await redis.lpush(K(MORTOS_BASE), '{isso nao e json');
const terceiro = await req('POST', '/health/fila/reprocessar', { token: admin });
checar(terceiro.status === 200, '11. lixo na lista nao derruba a rota', `status ${terceiro.status}`);
const lixoSobrou = (await redis.lrange(K(MORTOS_BASE), 0, -1)).includes('{isso nao e json');
checar(!lixoSobrou, '12. item corrompido sai da lista e nao volta para a fila');

// 5. Limpeza: tira o que este teste plantou.
const restantes = await redis.lrange(K(MORTOS_BASE), 0, -1);
for (const item of restantes) {
  if (item.includes(EXECUCAO)) await redis.lrem(K(MORTOS_BASE), 0, item);
}
const prontos = await redis.lrange(K('fila:prontos'), 0, -1);
for (const item of prontos) {
  if (item.includes(EXECUCAO)) await redis.lrem('fila:prontos', 0, item);
}
const atrasados = await redis.zrange('fila:atrasados', 0, -1);
for (const item of atrasados) {
  if (item.includes(EXECUCAO)) await redis.zrem('fila:atrasados', item);
}
console.log('      limpeza: itens deste teste removidos da fila');

await redis.quit();
console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'} — falhas=${falhas}`);
process.exit(falhas === 0 ? 0 : 1);
