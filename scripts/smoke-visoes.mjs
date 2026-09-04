/**
 * Smoke test das visoes salvas (item 6.1).
 *
 * Cobre: criar/listar/editar/remover, filtro validado por entidade (nao
 * inventa vocabulario novo), nome duplicado recusado por entidade, cor
 * invalida recusada, e a trava de edicao (so quem criou, ou ADMIN/SUPERVISOR).
 *
 * Uso: npm run smoke:visoes  (com a API de pe e o seed aplicado)
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
  return { status: resp.status, dados: await resp.json().catch(() => ({})) };
}

const entrar = async (email, senha) =>
  (await req('POST', '/auth/login', { corpo: { email, senha } })).dados.accessToken;

const admin = await entrar('admin@plataforma.local', 'Admin@123');
checar(Boolean(admin), 'login do admin');
if (!admin) process.exit(1);
const t = { token: admin };

const comercial = await entrar('comercial@plataforma.local', 'Comer@123');
checar(Boolean(comercial), 'login do comercial');
const c = { token: comercial };

/* ── criacao e vocabulario por entidade ───────────────────────────────────── */

const semToken = await req('POST', '/visoes-salvas', { corpo: { entidade: 'CONTA', nome: 'X', filtro: {} } });
checar(semToken.status === 401, 'criacao exige autenticacao', `status ${semToken.status}`);

const vocabularioErrado = await req('POST', '/visoes-salvas', {
  ...t,
  corpo: { entidade: 'CONTA', nome: `Vocabulario errado ${EXECUCAO}`, filtro: { responsavelId: '11111111-1111-1111-1111-111111111111' } },
});
checar(
  vocabularioErrado.status === 400,
  'filtro de CONTA com campo que a tela nao tem (responsavelId) e recusado',
  `status ${vocabularioErrado.status}`,
);

const corInvalida = await req('POST', '/visoes-salvas', {
  ...t,
  corpo: { entidade: 'CONTA', nome: `Cor invalida ${EXECUCAO}`, cor: 'azul', filtro: {} },
});
checar(corInvalida.status === 400, 'cor fora do hexadecimal e recusada', `status ${corInvalida.status}`);

const visaoConta = (
  await req('POST', '/visoes-salvas', {
    ...t,
    corpo: { entidade: 'CONTA', nome: `Clientes VIP ${EXECUCAO}`, cor: '#16a34a', filtro: { tags: ['vip'] } },
  })
).dados.visao;
checar(Boolean(visaoConta?.id), 'visao de CONTA criada');
checar(visaoConta?.cor === '#16a34a', 'cor gravada como informada');

const visaoLead = (
  await req('POST', '/visoes-salvas', {
    ...t,
    corpo: { entidade: 'LEAD', nome: `Atrasados ${EXECUCAO}`, filtro: { atrasados: true } },
  })
).dados.visao;
checar(Boolean(visaoLead?.id), 'visao de LEAD criada');
checar(visaoLead?.cor === '#64748b', 'sem cor informada, usa o padrao do banco', visaoLead?.cor);

const visaoOportunidade = (
  await req('POST', '/visoes-salvas', {
    ...t,
    corpo: { entidade: 'OPORTUNIDADE', nome: `Funil padrao ${EXECUCAO}`, filtro: {} },
  })
).dados.visao;
checar(Boolean(visaoOportunidade?.id), 'visao de OPORTUNIDADE criada (filtro vazio e valido)');

const duplicada = await req('POST', '/visoes-salvas', {
  ...t,
  corpo: { entidade: 'CONTA', nome: `Clientes VIP ${EXECUCAO}`, filtro: {} },
});
checar(duplicada.status === 409, 'nome duplicado na mesma entidade e recusado', `status ${duplicada.status}`);

const mesmoNomeOutraEntidade = await req('POST', '/visoes-salvas', {
  ...t,
  corpo: { entidade: 'LEAD', nome: `Clientes VIP ${EXECUCAO}`, filtro: {} },
});
checar(
  mesmoNomeOutraEntidade.status === 201,
  'o mesmo nome em entidade diferente e permitido',
  `status ${mesmoNomeOutraEntidade.status}`,
);
const idParaLimpar2 = mesmoNomeOutraEntidade.dados.visao?.id;

/* ── listagem ──────────────────────────────────────────────────────────── */

const listaContas = await req('GET', '/visoes-salvas?entidade=CONTA', t);
checar(
  listaContas.dados.visoes?.some((v) => v.id === visaoConta.id) &&
    !listaContas.dados.visoes?.some((v) => v.id === visaoLead.id),
  'listar por entidade traz so as daquela entidade',
);

/* ── edicao ────────────────────────────────────────────────────────────── */

const filtroErradoNoPatch = await req('PATCH', `/visoes-salvas/${visaoConta.id}`, {
  ...t,
  corpo: { filtro: { funilId: '11111111-1111-1111-1111-111111111111' } },
});
checar(
  filtroErradoNoPatch.status === 400,
  'PATCH tambem valida o filtro contra o vocabulario da entidade gravada',
  `status ${filtroErradoNoPatch.status}`,
);

const editada = await req('PATCH', `/visoes-salvas/${visaoConta.id}`, {
  ...t,
  corpo: { cor: '#dc2626', filtro: { busca: 'vip' } },
});
checar(editada.status === 200 && editada.dados.visao.cor === '#dc2626', 'edicao aplicada', `status ${editada.status}`);

/* ── trava de edicao: so o dono, ou ADMIN/SUPERVISOR ──────────────────────── */

const editarPorOutro = await req('PATCH', `/visoes-salvas/${visaoConta.id}`, {
  ...c,
  corpo: { nome: `Roubada ${EXECUCAO}` },
});
checar(
  editarPorOutro.status === 403,
  'quem nao criou (e nao e ADMIN/SUPERVISOR) nao edita a visao de outro',
  `status ${editarPorOutro.status}`,
);

/* ── limpeza ───────────────────────────────────────────────────────────── */

for (const id of [visaoConta.id, visaoLead.id, visaoOportunidade.id, idParaLimpar2]) {
  if (!id) continue;
  const del = await req('DELETE', `/visoes-salvas/${id}`, t);
  checar(del.status === 204, `visao ${id.slice(0, 8)} removida`, `status ${del.status}`);
}

console.log(falhas === 0 ? '\nTodos os checks passaram.' : `\n${falhas} check(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
