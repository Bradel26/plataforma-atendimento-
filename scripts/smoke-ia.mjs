/**
 * Smoke test da ponte com o motor de IA externo.
 *
 * Existe porque as duas metades desta ponte nao se veem: o plugin vive em outro
 * repositorio, em outra linguagem, e o typecheck daqui nao alcanca nada dele.
 * Este script fecha o circuito de verdade — sobe um webhook local no lugar do
 * whatsbot, confere a assinatura que a plataforma manda e devolve a resposta
 * pelas rotas reais, com token de integracao real.
 *
 * Cobre: ciclo de vida do token, autenticacao das rotas de IA, assinatura da
 * entrega (formato, timestamp, corpo), o campo `acionarIa` nos quatro estados,
 * a resposta virando mensagem BOT no historico, e as tres recusas com codigo
 * proprio (sem conversa, atendimento humano, e a rota que nao aceita sessao de
 * usuario).
 *
 * Uso: npm run smoke:ia  (com a API de pe e o seed aplicado)
 */
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';

const API = 'http://localhost:3333/api';
const EXECUCAO = Date.now().toString(36);
const PORTA_WEBHOOK = 4599;

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

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── webhook falso, no lugar do whatsbot ────────────────────────────────── */

const SEGREDO = `segredo-de-smoke-${EXECUCAO}`;
const recebidas = [];

const servidor = createServer((pedido, resposta) => {
  let bruto = '';
  pedido.on('data', (parte) => (bruto += parte));
  pedido.on('end', () => {
    recebidas.push({
      bruto,
      timestamp: pedido.headers['x-plataforma-timestamp'],
      assinatura: pedido.headers['x-plataforma-assinatura'],
      corpo: JSON.parse(bruto || '{}'),
    });
    resposta.writeHead(200, { 'Content-Type': 'application/json' });
    resposta.end('{"ok":true}');
  });
});
await new Promise((r) => servidor.listen(PORTA_WEBHOOK, r));

const proxima = async (quantas = 1) => {
  // A entrega e feita fora do caminho da resposta HTTP; esperar e o preco.
  for (let i = 0; i < 40 && recebidas.length < quantas; i++) await espera(50);
  return recebidas[quantas - 1];
};

/* ── login e cenario ───────────────────────────────────────────────────── */

const entrar = async (email, senha) =>
  (await req('POST', '/auth/login', { corpo: { email, senha } })).dados.accessToken;

const admin = await entrar('admin@plataforma.local', 'Admin@123');
checar(Boolean(admin), 'login do admin');
if (!admin) process.exit(1);
const t = { token: admin };

/* ── 1. token de integracao ────────────────────────────────────────────── */

const nomeToken = `Smoke IA ${EXECUCAO}`;
const criado = await req('POST', '/integracoes/tokens', {
  ...t,
  corpo: { nome: nomeToken },
});
checar(criado.status === 201, 'token de integracao criado', `HTTP ${criado.status}`);
const TOKEN_IA = criado.dados.valor;
checar(typeof TOKEN_IA === 'string' && TOKEN_IA.startsWith('pi_'), 'valor do token vem em claro uma vez');

const listados = await req('GET', '/integracoes/tokens', t);
const naLista = listados.dados.tokens?.find((x) => x.id === criado.dados.token.id);
checar(Boolean(naLista), 'token aparece na listagem');
checar(
  JSON.stringify(listados.dados).includes(TOKEN_IA) === false,
  'a listagem NAO devolve o valor do token',
);
checar(naLista?.prefixo === TOKEN_IA.slice(0, 8), 'prefixo identifica qual token esta em uso');

const semPermissao = await entrar('agente1@plataforma.local', 'Agente@123');
const negado = await req('GET', '/integracoes/tokens', { token: semPermissao });
checar(negado.status === 403, 'agente nao lista tokens de integracao', `HTTP ${negado.status}`);

/* ── 1b. ping: o unico jeito de o plugin saber se o token e aceito ────────
 *
 * O diagnostico do plugin conferia a ponte pelo `/health`, que e publico: ele
 * respondia igual com token certo, errado ou vazio, e a tela dizia "ponte
 * operante" com o segredo do webhook colado no campo do token. Estas checagens
 * existem para que o verde da tela signifique alguma coisa.
 */
const ping = await req('GET', '/bots/ia/ping', { token: TOKEN_IA });
checar(ping.status === 200 && ping.dados.ok === true, 'ping aceita o token de integracao', `HTTP ${ping.status}`);
checar(ping.dados?.integracao === nomeToken, 'ping diz QUAL integracao a plataforma reconheceu');
checar(
  !JSON.stringify(ping.dados ?? {}).includes(TOKEN_IA),
  'ping nao devolve o valor do token',
);

const pingSemToken = await req('GET', '/bots/ia/ping');
checar(pingSemToken.status === 401, 'ping recusa chamada sem token', `HTTP ${pingSemToken.status}`);

const pingTokenErrado = await req('GET', '/bots/ia/ping', { token: 'pi_naoexiste' });
checar(pingTokenErrado.status === 401, 'ping recusa token invalido', `HTTP ${pingTokenErrado.status}`);

// O token de sessao do painel nao serve aqui: se servisse, revogar o acesso de
// uma pessoa derrubaria o bot, e um usuario comum falaria pelas rotas de maquina.
const pingComSessao = await req('GET', '/bots/ia/ping', { token: admin });
checar(pingComSessao.status === 401, 'ping recusa token de sessao de usuario', `HTTP ${pingComSessao.status}`);

/* ── 2. ponte ligada no webchat ────────────────────────────────────────── */

// Limpa antes de conferir a recusa: sem isto o teste passa na primeira
// execucao e falha na segunda, porque a configuracao da rodada anterior ficou
// no banco e "ligar" passa a ser valido.
await req('PUT', '/canais/WEBCHAT/ia', {
  ...t,
  corpo: { iaAtiva: false, iaUrlWebhook: null, iaSegredo: null },
});

const semSegredo = await req('PUT', '/canais/WEBCHAT/ia', { ...t, corpo: { iaAtiva: true } });
checar(semSegredo.status === 409, 'nao liga a IA sem webhook e segredo', `HTTP ${semSegredo.status}`);

const ligada = await req('PUT', '/canais/WEBCHAT/ia', {
  ...t,
  corpo: {
    iaAtiva: true,
    iaUrlWebhook: `http://localhost:${PORTA_WEBHOOK}/api/webhook/plataforma/canal-1`,
    iaSegredo: SEGREDO,
  },
});
checar(ligada.status === 200 && ligada.dados.ia?.ativa === true, 'ponte ligada no WEBCHAT');
checar(ligada.dados.ia?.assinado === true, 'estado diz que a entrega vai assinada');
checar(
  JSON.stringify(ligada.dados).includes(SEGREDO) === false,
  'a resposta NAO devolve o segredo de assinatura',
);

/* ── 3. mensagem do cliente vira entrega assinada ──────────────────────── */

const sessao = await req('POST', '/webchat/sessoes', {
  corpo: { nome: `Cliente IA ${EXECUCAO}`, email: `ia.${EXECUCAO}@exemplo.com`, aceiteLgpd: true },
});
const conversaId = sessao.dados.conversa?.id;
const sessaoToken = sessao.dados.sessaoToken;
checar(Boolean(conversaId), 'visitante abriu conversa no webchat');

await req('POST', '/webchat/mensagens', {
  corpo: { conteudo: 'quanto custa a instalacao?' },
  token: sessaoToken,
});

const entrega = await proxima(1);
checar(Boolean(entrega), 'webhook do motor de IA recebeu a mensagem');

if (entrega) {
  const esperada = `sha256=${createHmac('sha256', SEGREDO)
    .update(`${entrega.timestamp}.${entrega.bruto}`)
    .digest('hex')}`;
  checar(entrega.assinatura === esperada, 'assinatura confere sobre timestamp + corpo bruto');

  const idade = Math.abs(Math.floor(Date.now() / 1000) - Number(entrega.timestamp));
  checar(idade <= 300, 'timestamp dentro da tolerancia de 5 minutos', `${idade}s`);

  // Assinar so o corpo deixaria uma entrega capturada valer para sempre.
  const soCorpo = `sha256=${createHmac('sha256', SEGREDO).update(entrega.bruto).digest('hex')}`;
  checar(entrega.assinatura !== soCorpo, 'a assinatura NAO e apenas sobre o corpo');

  const c = entrega.corpo;
  checar(c.evento === 'mensagem', 'evento e mensagem');
  checar(c.canal === 'WEBCHAT', 'canal viaja no corpo');
  checar(c.autor === 'CONTATO', 'CLIENTE e traduzido para CONTATO');
  checar(c.acionarIa === true, 'mensagem do cliente aciona a IA');
  checar(Boolean(c.contato?.id), 'contato tem id — e o chat_id do outro lado');
  checar(c.texto === 'quanto custa a instalacao?', 'texto chega inteiro');
}

const contatoId = entrega?.corpo?.contato?.id;

/* ── 4. resposta do agente de IA volta para a conversa ─────────────────── */

const iaT = { token: TOKEN_IA };

const semToken = await req('POST', '/bots/ia/mensagens', {
  corpo: { canalId: 'WEBCHAT', contatoId, texto: 'oi' },
});
checar(semToken.status === 401, 'rota de IA recusa chamada sem token', `HTTP ${semToken.status}`);

const tokenErrado = await req('POST', '/bots/ia/mensagens', {
  corpo: { canalId: 'WEBCHAT', contatoId, texto: 'oi' },
  token: 'pi_naoexiste',
});
checar(tokenErrado.status === 401, 'rota de IA recusa token inventado', `HTTP ${tokenErrado.status}`);

// O ponto mais facil de errar: `botsRoutes` aplica requireAuth no router todo.
// Se `/bots/ia` caisse nele, o plugin levaria 401 com um token perfeitamente
// valido — e o token de usuario passaria numa rota que nao e para gente.
const comTokenDeUsuario = await req('POST', '/bots/ia/mensagens', {
  ...t,
  corpo: { canalId: 'WEBCHAT', contatoId, texto: 'oi' },
});
checar(
  comTokenDeUsuario.status === 401,
  'rota de IA NAO aceita token de sessao de usuario',
  `HTTP ${comTokenDeUsuario.status}`,
);

const resposta = await req('POST', '/bots/ia/mensagens', {
  ...iaT,
  corpo: {
    canalId: 'WEBCHAT',
    contatoId,
    texto: 'A instalacao sai por R$ 450 na regiao de Goiania.',
    respondendoA: entrega?.corpo?.mensagemId ?? null,
  },
});
checar(resposta.status === 201, 'resposta da IA aceita', `HTTP ${resposta.status} ${JSON.stringify(resposta.dados)}`);
checar(resposta.dados.mensagem?.autor === 'BOT', 'resposta entra como mensagem BOT');
checar(resposta.dados.conversaId === conversaId, 'entrou na conversa aberta do contato');
checar(
  resposta.dados.respondendoA === entrega?.corpo?.mensagemId,
  'respondendoA volta para o plugin correlacionar',
);

const historico = await req('GET', `/conversas/${conversaId}/mensagens`, t);
const mensagens = historico.dados.mensagens ?? historico.dados.itens ?? [];
checar(
  mensagens.some((m) => m.autor === 'BOT' && m.conteudo.includes('R$ 450')),
  'resposta da IA aparece no historico da conversa',
);

// A resposta da propria IA NAO volta para ela. O whatsbot ja sabe o que
// mandou — reentregar seria uma volta de rede para nada e duplicaria a fala do
// agente na memoria dele. O que precisa voltar como contexto e o que o *humano*
// escreveu, e isso e conferido mais abaixo.
await espera(400);
checar(recebidas.length === 1, 'a resposta da propria IA nao e reentregue a ela', `${recebidas.length} entrega(s)`);

/* ── 5. recusas com codigo proprio ─────────────────────────────────────── */

const semConversa = await req('POST', '/bots/ia/mensagens', {
  ...iaT,
  corpo: { canalId: 'WHATSAPP', contatoId, texto: 'oi' },
});
checar(
  semConversa.status === 409 && semConversa.dados.error?.code === 'SEM_CONVERSA_ABERTA',
  'sem conversa aberta no canal -> SEM_CONVERSA_ABERTA',
  `HTTP ${semConversa.status} ${semConversa.dados.error?.code ?? ''}`,
);

const canalInventado = await req('POST', '/bots/ia/mensagens', {
  ...iaT,
  corpo: { canalId: 'TELEPATIA', contatoId, texto: 'oi' },
});
checar(canalInventado.status === 404, 'canal inexistente -> 404', `HTTP ${canalInventado.status}`);

const semNada = await req('POST', '/bots/ia/mensagens', {
  ...iaT,
  corpo: { canalId: 'WEBCHAT', contatoId },
});
checar(semNada.status === 400, 'sem texto e sem anexo -> 400', `HTTP ${semNada.status}`);

// Atendente assume: a IA precisa calar. Este e o caso que, se falhar, faz o
// cliente receber duas respostas diferentes para a mesma pergunta.
const agente = await entrar('agente1@plataforma.local', 'Agente@123');
const assumida = await req('POST', `/conversas/${conversaId}/assumir`, { token: agente });
checar(assumida.status === 200, 'atendente assumiu a conversa', `HTTP ${assumida.status}`);

const emCimaDoHumano = await req('POST', '/bots/ia/mensagens', {
  ...iaT,
  corpo: { canalId: 'WEBCHAT', contatoId, texto: 'deixa que eu respondo' },
});
checar(
  emCimaDoHumano.status === 409 && emCimaDoHumano.dados.error?.code === 'ATENDIMENTO_HUMANO',
  'conversa com atendente -> ATENDIMENTO_HUMANO',
  `HTTP ${emCimaDoHumano.status} ${emCimaDoHumano.dados.error?.code ?? ''}`,
);

// E o que o humano escreve vai como contexto, sem acionar.
const antes = recebidas.length;
await req('POST', `/conversas/${conversaId}/mensagens`, {
  token: agente,
  corpo: { conteudo: 'Sou eu que vou te atender daqui.' },
});
const doHumano = await proxima(antes + 1);
checar(Boolean(doHumano), 'mensagem do atendente e entregue ao motor de IA');
checar(doHumano?.corpo?.autor === 'AGENTE', 'autor da mensagem do atendente e AGENTE');
checar(doHumano?.corpo?.acionarIa === false, 'mensagem do atendente NAO aciona a IA');

/* ── 6. token revogado ─────────────────────────────────────────────────── */

await req('DELETE', `/integracoes/tokens/${criado.dados.token.id}`, t);
const revogado = await req('POST', '/bots/ia/mensagens', {
  ...iaT,
  corpo: { canalId: 'WEBCHAT', contatoId, texto: 'oi' },
});
checar(revogado.status === 401, 'token revogado deixa de funcionar na hora', `HTTP ${revogado.status}`);

/* ── limpeza ───────────────────────────────────────────────────────────── */

// Desliga a ponte: deixar apontada para um webhook que morreu com o script
// faria toda mensagem seguinte esperar o timeout de 10s.
await req('PUT', '/canais/WEBCHAT/ia', { ...t, corpo: { iaAtiva: false } });
servidor.close();

console.log(`\n${falhas === 0 ? 'Tudo verde' : `${falhas} verificacao(oes) falharam`}`);
process.exit(falhas === 0 ? 0 : 1);
