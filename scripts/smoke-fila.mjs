/**
 * Smoke test da fila de trabalho em Redis.
 *
 * Verifica que o disparo de campanha virou assincrono (a requisicao HTTP so
 * enfileira), que cada item registra o proprio desfecho, que recusa definitiva
 * da Meta nao vira nova tentativa e que falha transitoria vai para a fila de
 * atrasados.
 *
 * Uso: npm run smoke:fila  (com a API de pe e o seed aplicado)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHmac } from 'node:crypto';
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

const API = 'http://localhost:3333/api';
const APP_SECRET = 'segredo-de-teste-do-app-meta';
const TOKEN_FALSO = 'EAAG-token-falso-para-teste-de-erro';
const EXECUCAO = Date.now().toString(36);
// Mesmo prefixo que a aplicacao usa (ver lib/redis.ts): sem ele o script leria
// `fila:atrasados` enquanto a API escreve em `dev:fila:atrasados`, e a checagem
// falharia dizendo que a fila nao mexeu.
// `??` e nao `||`: prefixo definido como vazio de proposito tem de ser respeitado.
// E o padrao e 'dev' salvo em producao, porque o .env local nao declara NODE_ENV.
const prefixoRedis = env.REDIS_PREFIXO ?? (env.NODE_ENV === 'production' ? '' : 'dev');
const redis = new Redis(env.REDIS_URL, {
  keyPrefix: prefixoRedis ? `${prefixoRedis}:` : undefined,
});

let falhas = 0;
const checar = (cond, titulo, extra = '') => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok    ' : 'FALHOU'} ${titulo}${extra ? ` — ${extra}` : ''}`);
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

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

const { dados: filas } = await req('GET', '/filas', { token: admin });
const filaId = filas.filas[0].id;
const configurarWhatsApp = (ativo) =>
  req('PUT', '/canais/whatsapp', {
    token: admin,
    corpo: {
      ativo,
      accessToken: TOKEN_FALSO,
      appSecret: APP_SECRET,
      verifyToken: 'token-de-verificacao-123',
      filaId,
      phoneNumberId: '111222333444',
    },
  });
await configurarWhatsApp(true);

// 1. Dois contatos: um com telefone (chegou pelo WhatsApp) e um sem (webchat).
//    A plataforma nao tem cadastro manual de contato — quem cria e o canal.
const assinar = (corpo) => `sha256=${createHmac('sha256', APP_SECRET).update(corpo).digest('hex')}`;
const webhookWhatsApp = (telefone, nome, idMensagem, texto) =>
  fetch(`${API}/webhooks/whatsapp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': assinar(corpoWhats(telefone, nome, idMensagem, texto)) },
    body: corpoWhats(telefone, nome, idMensagem, texto),
  });

function corpoWhats(telefone, nome, idMensagem, texto) {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{
      id: 'WABA-1',
      changes: [{
        field: 'messages',
        value: {
          metadata: { phone_number_id: '111222333444', display_phone_number: '+5511999998888' },
          contacts: [{ wa_id: telefone, profile: { name: nome } }],
          messages: [{ id: idMensagem, from: telefone, timestamp: '1787577400', type: 'text', text: { body: texto } }],
        },
      }],
    }],
  });
}

const telefoneTeste = `5511${EXECUCAO.slice(-8).padStart(8, '9')}`;
const nomeComTelefone = `Fila WhatsApp ${EXECUCAO}`;
await webhookWhatsApp(telefoneTeste, nomeComTelefone, `wamid.contato-${EXECUCAO}`, 'Quero receber novidades');

const { dados: sessao } = await req('POST', '/webchat/sessoes', {
  corpo: { nome: `Fila Webchat ${EXECUCAO}`, email: `webchat-${EXECUCAO}@teste.local`, aceiteLgpd: true },
});

const { dados: achados } = await req('GET', `/contatos?busca=${encodeURIComponent(EXECUCAO)}`, { token: admin });
const contatoComTelefone = (achados.contatos ?? []).find((c) => c.telefone);
const contatoSemTelefone = sessao.conversa.contato;
checar(
  Boolean(contatoComTelefone && contatoSemTelefone),
  '1. contatos de teste criados pelos canais',
  `${contatoComTelefone?.telefone ?? 'sem telefone'} / ${contatoSemTelefone?.nome}`,
);

const { dados: nova } = await req('POST', '/campanhas', {
  token: admin,
  corpo: { nome: `Campanha fila ${EXECUCAO}`, canal: 'WHATSAPP', mensagem: 'Ola {{nome}}, tudo bem?' },
});
const campanhaId = nova.campanha.id;
await req('POST', `/campanhas/${campanhaId}/contatos`, {
  token: admin,
  corpo: { contatoIds: [contatoComTelefone.id, contatoSemTelefone.id] },
});
await req('PATCH', `/campanhas/${campanhaId}/status`, { token: admin, corpo: { status: 'ATIVA' } });

// 2. Disparo apenas enfileira
const inicio = Date.now();
const disparo = await req('POST', `/campanhas/${campanhaId}/disparar`, { token: admin, corpo: { limite: 500 } });
const duracao = Date.now() - inicio;
checar(disparo.dados.resultado?.enfileirados === 2 || disparo.dados.enfileirados === 2, '2. disparo enfileirou os dois itens', JSON.stringify(disparo.dados));
checar(duracao < 1500, '   a requisicao volta na hora, sem esperar o envio', `${duracao} ms`);

// 3. O worker processa e cada item grava o proprio desfecho
let itens = [];
for (let i = 0; i < 25; i++) {
  await esperar(600);
  const { dados } = await req('GET', `/campanhas/${campanhaId}`, { token: admin });
  itens = dados.itens ?? [];
  if (itens.length > 0 && itens.every((it) => it.status !== 'PENDENTE')) break;
}
const doTelefone = itens.find((i) => i.contato.id === contatoComTelefone.id);
const doSemTelefone = itens.find((i) => i.contato.id === contatoSemTelefone.id);

checar(doSemTelefone?.status === 'IGNORADO', '3. contato sem telefone fica IGNORADO', String(doSemTelefone?.status));
checar(doTelefone?.status === 'FALHOU', '   envio recusado pela Meta fica FALHOU', String(doTelefone?.status));
checar(
  Boolean(doTelefone?.erro?.includes('recusou')) && !doTelefone?.erro?.includes('tentativas'),
  '   recusa definitiva nao gera nova tentativa',
  doTelefone?.erro?.slice(0, 60),
);

const { dados: depois } = await req('GET', `/campanhas/${campanhaId}`, { token: admin });
checar(depois.campanha?.status === 'CONCLUIDA', '   campanha concluida quando a fila esvazia', String(depois.campanha?.status));

// 4. Reprocessar devolve os itens para PENDENTE sem disparar
const reproc = await req('POST', `/campanhas/${campanhaId}/reprocessar`, { token: admin });
checar(reproc.status === 200, '4. reprocessar falhas aceito', `status ${reproc.status}`);

// 5. Falha transitoria vai para a fila de atrasados (nova tentativa)
await webhookWhatsApp('5511922221111', 'Cliente Fila', `wamid.fila-${EXECUCAO}`, 'Oi');

// Canal desativado: a entrega do convite falha com erro que PODE passar depois.
await configurarWhatsApp(false);
const { dados: lista } = await req('GET', '/conversas?limite=100', { token: admin });
const conversa = (lista.conversas ?? []).find((c) => c.canal === 'WHATSAPP' && c.status !== 'FINALIZADO');
checar(Boolean(conversa), '5. conversa de WhatsApp em aberto localizada');

const atrasadosAntes = await redis.zcard('fila:atrasados');
await req('POST', `/conversas/${conversa.id}/finalizar`, { token: admin });
const atrasadosDepois = await redis.zcard('fila:atrasados');
checar(
  atrasadosDepois > atrasadosAntes,
  '   convite de pesquisa que falhou foi para a fila de atrasados',
  `${atrasadosAntes} -> ${atrasadosDepois}`,
);

const { dados: detalhe } = await req('GET', `/conversas/${conversa.id}`, { token: admin });
const nota = (detalhe.conversa?.mensagens ?? []).at(-1);
checar(
  Boolean(nota?.conteudo?.includes('Nova tentativa automatica')),
  '   e o agente ve que havera nova tentativa',
  nota?.conteudo?.slice(0, 70),
);

// 6. Estado da fila e visivel para a gestao
const { status: statusFila, dados: estado } = await req('GET', '/health/fila', { token: admin });
checar(statusFila === 200 && typeof estado.fila?.prontos === 'number', '6. estado da fila exposto para a gestao', JSON.stringify(estado.fila && { prontos: estado.fila.prontos, atrasados: estado.fila.atrasados, mortos: estado.fila.mortos }));

// Limpa a nova tentativa pendente para nao deixar trabalho orfao rodando.
await redis.del('fila:atrasados');
await configurarWhatsApp(true);
await redis.quit();
console.log(`\n${falhas} FALHOU`);
process.exit(falhas === 0 ? 0 : 1);
