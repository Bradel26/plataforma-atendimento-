/**
 * Smoke test do painel individual do vendedor (item §16 do modelo de CRM auditado).
 *
 * Cria uma oportunidade ganha e uma perdida para o vendedor1, gera uma proposta em
 * PDF, e confere que /vendedores/:id/resumo reflete os numeros certos — e que um
 * GESTOR de fora da equipe do vendedor recebe 403.
 *
 * Uso: npm run smoke:resumo-vendedor  (com a API de pe e o seed aplicado)
 */
const API = 'http://localhost:3333/api';
const EXECUCAO = Date.now().toString(36);

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
  const dados = await resp.json().catch(() => ({}));
  return { status: resp.status, dados };
}

/* ── login e usuarios do seed ──────────────────────────────────────────── */

const { dados: login } = await req('POST', '/auth/login', {
  corpo: { email: 'admin@plataforma.local', senha: 'Admin@123' },
});
checar(Boolean(login.accessToken), 'login do admin');
const admin = login.accessToken;

const { dados: usuarios } = await req('GET', '/usuarios', { token: admin });
const vendedor1 = usuarios.usuarios.find((u) => u.email === 'vendedor1@plataforma.local');
const gestor = usuarios.usuarios.find((u) => u.email === 'gestor@plataforma.local');
const comercial = usuarios.usuarios.find((u) => u.email === 'comercial@plataforma.local');
checar(Boolean(vendedor1 && gestor && comercial), 'seed tem vendedor1, gestor e comercial');

const { dados: loginGestor } = await req('POST', '/auth/login', {
  corpo: { email: 'gestor@plataforma.local', senha: 'Gestor@123' },
});
const tokenGestor = loginGestor.accessToken;

/* ── 1. vendedor1 NAO esta na equipe do gestor (so comercial esta, pelo seed) ── */

const semAcesso = await req('GET', `/vendedores/${vendedor1.id}/resumo`, { token: tokenGestor });
checar(semAcesso.status === 403, '1. gestor sem vendedor1 na equipe recebe 403', `HTTP ${semAcesso.status}`);

/* ── 2. Coloca vendedor1 na equipe do gestor e confirma acesso ────────── */

await req('PATCH', `/usuarios/${vendedor1.id}`, { token: admin, corpo: { gestorId: gestor.id } });
const comAcesso = await req('GET', `/vendedores/${vendedor1.id}/resumo`, { token: tokenGestor });
checar(comAcesso.status === 200, '2. gestor com vendedor1 na equipe recebe 200', `HTTP ${comAcesso.status}`);

const listaDoGestor = await req('GET', '/vendedores', { token: tokenGestor });
checar(
  listaDoGestor.dados.vendedores.some((v) => v.id === vendedor1.id),
  '   vendedor1 aparece na lista de vendedores do gestor',
);

/* ── 3. Duas oportunidades do vendedor1: uma ganha, uma perdida, no mes corrente ── */

const mesCorrente = new Date().toISOString().slice(0, 7);
const { dados: funis } = await req('GET', '/funis', { token: admin });
const funilId = funis.funis[0].id;

// Conta propria do teste, e nao uma existente: um banco de dev recem-semeado nao tem
// nenhuma conta, e depender de uma que ja exista faria o smoke passar ou falhar
// conforme o que mais alguem cadastrou antes, sem relacao com este teste.
const { dados: novaConta } = await req('POST', '/contas', {
  token: admin,
  corpo: { nome: `Conta smoke ${EXECUCAO}` },
});
const contaId = novaConta.conta.id;
checar(Boolean(contaId), '3. conta de teste criada');

// A oportunidade "ganha" precisa de itens: dadosDaProposta exige itens.length > 0
// para gerar o PDF (e assim faz a UI real, guiada pelo catalogo de precos).
const { dados: produtosResp } = await req('GET', '/produtos', { token: admin });
const produto = produtosResp.produtos?.[0];
checar(Boolean(produto?.id), '   seed tem ao menos um produto para compor a proposta');

const criarOportunidade = async (titulo, extra) => {
  const { dados } = await req('POST', '/oportunidades', {
    token: admin,
    corpo: { titulo, contaId, funilId, responsavelId: vendedor1.id, ...extra },
  });
  return dados.oportunidade;
};

const ganha = await criarOportunidade(`Smoke ganha ${EXECUCAO}`, {
  itens: [{ produtoId: produto.id, quantidade: 1, precoUnitario: 1000 }],
});
const perdida = await criarOportunidade(`Smoke perdida ${EXECUCAO}`, { valor: 500 });
checar(Boolean(ganha?.id && perdida?.id), '   duas oportunidades criadas para vendedor1');

await req('POST', `/oportunidades/${ganha.id}/fechar`, { token: admin, corpo: { status: 'GANHA' } });
await req('POST', `/oportunidades/${perdida.id}/fechar`, {
  token: admin,
  corpo: { status: 'PERDIDA', motivoPerda: 'OUTRO' },
});

/* ── 4. Gera uma proposta para a oportunidade ganha ────────────────────── */

const pdf = await fetch(`${API}/oportunidades/${ganha.id}/proposta.pdf`, {
  headers: { Authorization: `Bearer ${admin}` },
});
checar(pdf.status === 200, '4. proposta em PDF gerada', `HTTP ${pdf.status}`);

/* ── 5. O resumo do vendedor reflete os numeros ────────────────────────── */

const { dados: resumo } = await req('GET', `/vendedores/${vendedor1.id}/resumo?mes=${mesCorrente}`, {
  token: admin,
});
checar(resumo.oportunidades?.ganhas >= 1, '5. oportunidades ganhas contabilizadas', `ganhas=${resumo.oportunidades?.ganhas}`);
checar(resumo.oportunidades?.perdidas >= 1, '   oportunidades perdidas contabilizadas', `perdidas=${resumo.oportunidades?.perdidas}`);
checar(resumo.propostas >= 1, '   proposta gerada contabilizada', `propostas=${resumo.propostas}`);
checar(resumo.vendas?.valor >= 1000, '   valor de venda contabilizado', `valor=${resumo.vendas?.valor}`);
checar(resumo.conversao !== null, '   conversao calculada (nao nula, ha fechamento no periodo)');
checar(Array.isArray(resumo.whatsapp), '   status de whatsapp presente (lista, mesmo que vazia)');

console.log(falhas === 0 ? `\nOK — ${EXECUCAO}` : `\n${falhas} falha(s) — ${EXECUCAO}`);
process.exit(falhas === 0 ? 0 : 1);
