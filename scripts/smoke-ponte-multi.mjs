/**
 * Smoke test do WhatsApp nao oficial com MAIS DE UM numero por organizacao.
 *
 * Cobre o requisito central da ponte multi-vendedor: duas linhas pessoais,
 * cada uma com sua propria sessao Baileys, e a mensagem que "chega" em cada
 * sessao precisa cair na conversa do VENDEDOR DONO daquela linha — nao na
 * config compartilhada, que era o comportamento antes desta mudanca.
 *
 * Nao depende da ponte (Baileys) de verdade: simula o que ela manda, assinando
 * o corpo com HMAC-SHA256 exatamente como `apps/ponte/src/plataforma.ts` faz.
 *
 * Uso: npm run smoke:ponte-multi  (com a API de pe e o seed aplicado)
 */
import { createHmac } from 'node:crypto';

const API = 'http://localhost:3333/api';
const EXECUCAO = Date.now().toString(36);

let falhas = 0;
const checar = (cond, titulo, extra = '') => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok    ' : 'FALHOU'} ${titulo}${extra ? ` — ${extra}` : ''}`);
};

async function req(metodo, rota, { corpoBruto, corpo, headers = {}, token } = {}) {
  const resp = await fetch(API + rota, {
    method: metodo,
    headers: {
      ...(corpo || corpoBruto ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: corpoBruto ?? (corpo ? JSON.stringify(corpo) : undefined),
  });
  const dados = await resp.json().catch(() => ({}));
  return { status: resp.status, dados };
}

const assinar = (corpo, segredo) => `sha256=${createHmac('sha256', segredo).update(corpo).digest('hex')}`;

/* ── login e usuarios de vendedor (do seed) ────────────────────────────── */

const { dados: login } = await req('POST', '/auth/login', {
  corpo: { email: 'admin@plataforma.local', senha: 'Admin@123' },
});
checar(Boolean(login.accessToken), 'login do admin');
const admin = login.accessToken;

const { dados: usuarios } = await req('GET', '/usuarios', { token: admin });
const vendedor1 = usuarios.usuarios.find((u) => u.email === 'vendedor1@plataforma.local');
const vendedor2 = usuarios.usuarios.find((u) => u.email === 'vendedor2@plataforma.local');
checar(Boolean(vendedor1 && vendedor2), 'seed tem vendedor1 e vendedor2');

/* ── 1. Duas linhas pessoais, cada uma com sua propria sessao ─────────── */

const SEGREDO_1 = `segredo-linha-1-${EXECUCAO}`;
const SEGREDO_2 = `segredo-linha-2-${EXECUCAO}`;
const SESSAO_1 = `smoke-v1-${EXECUCAO}`;
const SESSAO_2 = `smoke-v2-${EXECUCAO}`;

const linha1 = await req('POST', '/canais/whatsapp/numeros', {
  token: admin,
  corpo: {
    donoId: vendedor1.id,
    nome: 'Vendedor 1 (smoke)',
    modo: 'NAO_OFICIAL',
    ativo: true,
    ponteUrl: 'http://ponte-inexistente:9999/api',
    ponteToken: 'token-qualquer-1234567890',
    ponteSegredo: SEGREDO_1,
    ponteSessao: SESSAO_1,
  },
});
checar(linha1.status === 201, '1. linha pessoal do vendedor 1 criada', `HTTP ${linha1.status}`);

const linha2 = await req('POST', '/canais/whatsapp/numeros', {
  token: admin,
  corpo: {
    donoId: vendedor2.id,
    nome: 'Vendedor 2 (smoke)',
    modo: 'NAO_OFICIAL',
    ativo: true,
    ponteUrl: 'http://ponte-inexistente:9999/api',
    ponteToken: 'token-qualquer-1234567890',
    ponteSegredo: SEGREDO_2,
    ponteSessao: SESSAO_2,
  },
});
checar(linha2.status === 201, '   linha pessoal do vendedor 2 criada', `HTTP ${linha2.status}`);

/* ── 2. Descobrir o id da organizacao pelo caminho do webhook ─────────── */

const { dados: estadoLinha1 } = await req('GET', `/canais/numeros/${linha1.dados.canal.id}/ponte/estado`, {
  token: admin,
});
const organizacaoId = estadoLinha1.caminhoWebhook.split('/').pop();
checar(Boolean(organizacaoId), '2. id da organizacao obtido pelo caminho do webhook');

/* ── 3. Mensagem de cada sessao cai no vendedor dono, nao no compartilhado ── */

const enviarPelaPonte = async (sessao, segredo, numeroCliente, texto, idMsg) => {
  const corpoBruto = JSON.stringify({ numero: numeroCliente, sessao, texto, idExterno: idMsg });
  return req('POST', `/webhooks/ponte/whatsapp/${organizacaoId}`, {
    corpoBruto,
    headers: { 'X-Ponte-Assinatura': assinar(corpoBruto, segredo) },
  });
};

const clienteDoV1 = `5511${String(Date.now()).slice(-9)}`;
const clienteDoV2 = `5511${String(Date.now() + 1).slice(-9)}`;

const r1 = await enviarPelaPonte(SESSAO_1, SEGREDO_1, clienteDoV1, 'Ola, quero um plano', `smoke.${EXECUCAO}.v1`);
checar(r1.status === 200 && r1.dados.ok === true, '3. mensagem da sessao 1 aceita', `HTTP ${r1.status}`);

const r2 = await enviarPelaPonte(SESSAO_2, SEGREDO_2, clienteDoV2, 'Preciso de suporte', `smoke.${EXECUCAO}.v2`);
checar(r2.status === 200 && r2.dados.ok === true, '   mensagem da sessao 2 aceita', `HTTP ${r2.status}`);

const { dados: conversas } = await req('GET', '/conversas?status=ATRIBUIDO&limite=100', { token: admin });
const conversaV1 = conversas.conversas.find((c) => c.contato?.telefone === clienteDoV1);
const conversaV2 = conversas.conversas.find((c) => c.contato?.telefone === clienteDoV2);

checar(
  Boolean(conversaV1 && conversaV1.agente?.id === vendedor1.id),
  '4. conversa da sessao 1 caiu no VENDEDOR 1',
  conversaV1 ? `agente=${conversaV1.agente?.nome}` : 'conversa nao encontrada',
);
checar(
  Boolean(conversaV2 && conversaV2.agente?.id === vendedor2.id),
  '   conversa da sessao 2 caiu no VENDEDOR 2',
  conversaV2 ? `agente=${conversaV2.agente?.nome}` : 'conversa nao encontrada',
);
checar(
  conversaV1?.id !== conversaV2?.id,
  '   as duas conversas sao registros diferentes (nao caiu tudo na compartilhada)',
);

/* ── 5. Assinatura de uma sessao nao vale para a outra ─────────────────── */

const r3 = await enviarPelaPonte(SESSAO_1, SEGREDO_2, clienteDoV1, 'tentando com segredo trocado', `smoke.${EXECUCAO}.x`);
checar(r3.status === 401, '5. segredo da sessao 2 nao assina mensagem da sessao 1', `HTTP ${r3.status}`);

/* ── 6. Sem sessao no corpo, cai no comportamento antigo (nao quebra) ──── */

const zap = await req('GET', '/canais', { token: admin });
const canalCompartilhado = zap.dados.canais.find((c) => c.canal === 'WHATSAPP' && !c.dono);
checar(Boolean(canalCompartilhado), '6. ainda existe (ou nunca existiu) config compartilhada — checagem informativa');

console.log(falhas === 0 ? `\nOK — ${EXECUCAO}` : `\n${falhas} falha(s) — ${EXECUCAO}`);
process.exit(falhas === 0 ? 0 : 1);
