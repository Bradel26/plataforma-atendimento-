/**
 * Smoke test da base instalada (item 5.1).
 *
 * Cobre: produto criado com componentes de garantia, calculo de status por
 * componente (vigente/vencida/sem data/requisito nao informado/nao aplicavel
 * da regra Philco), edicao de produto e componente, remocao de componente, e
 * a ficha da conta trazendo a base instalada junto de leads e oportunidades.
 *
 * Uso: npm run smoke:base-instalada  (com a API de pe e o seed aplicado)
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

/* ── cenario ───────────────────────────────────────────────────────────── */

const conta = (
  await req('POST', '/contas', { ...t, corpo: { nome: `Base instalada ${EXECUCAO}` } })
).dados.conta;
checar(Boolean(conta?.id), 'conta criada');

const semToken = await req('POST', '/produtos-instalados', {
  corpo: { contaId: conta.id, modelo: 'Split Hi-Wall 12000 BTU' },
});
checar(semToken.status === 401, 'criacao exige autenticacao', `status ${semToken.status}`);

const contaInexistente = await req('POST', '/produtos-instalados', {
  ...t,
  corpo: { contaId: '00000000-0000-0000-0000-000000000000', modelo: 'Split' },
});
checar(contaInexistente.status === 404, 'conta inexistente e recusada', `status ${contaInexistente.status}`);

const dataInstalacao = new Date(Date.now() - 100 * 86_400_000).toISOString();
const produto = (
  await req('POST', '/produtos-instalados', {
    ...t,
    corpo: {
      contaId: conta.id,
      modelo: 'Split Hi-Wall 12000 BTU Philco',
      numeroSerie: `SN-${EXECUCAO}`,
      dataInstalacao,
      // Sem instaladorCredenciado nem notaFiscalNumero de proposito: testa o
      // estado "requisito nao informado" da garantia contratual.
      componentes: [
        { tipo: 'LEGAL', prazoDias: 90 },
        { tipo: 'CONTRATUAL', prazoDias: 360 },
        { tipo: 'COMPRESSOR', prazoDias: 3650 },
      ],
    },
  })
).dados.produto;
checar(Boolean(produto?.id), 'produto criado com 3 componentes');
checar(produto?.componentes?.length === 3, 'produto trouxe os 3 componentes', `${produto?.componentes?.length}`);

const legal = produto.componentes.find((c) => c.tipo === 'LEGAL');
checar(legal?.status === 'VENCIDA', 'garantia legal de 90 dias, instalada ha 100, esta VENCIDA', legal?.status);

const compressor = produto.componentes.find((c) => c.tipo === 'COMPRESSOR');
checar(compressor?.status === 'VIGENTE', 'garantia de compressor (10 anos) continua VIGENTE', compressor?.status);

const contratual = produto.componentes.find((c) => c.tipo === 'CONTRATUAL');
checar(
  contratual?.status === 'REQUISITO_NAO_INFORMADO',
  'contratual sem instalador credenciado informado fica REQUISITO_NAO_INFORMADO',
  contratual?.status,
);

/* ── credenciar o instalador e conferir mudanca de estado ─────────────────── */

const semNF = await req('PATCH', `/produtos-instalados/${produto.id}`, {
  ...t,
  corpo: { instaladorCredenciado: true },
});
checar(
  semNF.dados.produto.componentes.find((c) => c.tipo === 'CONTRATUAL').status === 'NAO_APLICAVEL',
  'credenciado mas sem nota fiscal: contratual fica NAO_APLICAVEL, nao VIGENTE',
  semNF.dados.produto.componentes.find((c) => c.tipo === 'CONTRATUAL').status,
);

const comNF = await req('PATCH', `/produtos-instalados/${produto.id}`, {
  ...t,
  corpo: { notaFiscalNumero: `NF-${EXECUCAO}` },
});
const contratualAgora = comNF.dados.produto.componentes.find((c) => c.tipo === 'CONTRATUAL');
checar(
  contratualAgora.status === 'VIGENTE',
  'com credenciado e nota fiscal, contratual de 360 dias instalada ha 100 fica VIGENTE (ainda dentro do prazo)',
  contratualAgora.status,
);

const contratualVencida = (
  await req('POST', '/produtos-instalados', {
    ...t,
    corpo: {
      contaId: conta.id,
      modelo: 'Equipamento antigo',
      dataInstalacao: new Date(Date.now() - 400 * 86_400_000).toISOString(),
      instaladorCredenciado: true,
      notaFiscalNumero: `NF-antiga-${EXECUCAO}`,
      componentes: [{ tipo: 'CONTRATUAL', prazoDias: 360 }],
    },
  })
).dados.produto;
checar(
  contratualVencida.componentes[0].status === 'VENCIDA',
  'contratual instalada ha 400 dias, com requisitos cumpridos, fica VENCIDA',
  contratualVencida.componentes[0].status,
);

/* ── componente novo, edicao e remocao ────────────────────────────────────── */

const novoComponente = await req('POST', `/produtos-instalados/${produto.id}/componentes`, {
  ...t,
  corpo: { tipo: 'OUTRA', nome: 'Garantia estendida', prazoDias: 30 },
});
checar(novoComponente.status === 201, 'componente extra criado', `status ${novoComponente.status}`);
checar(novoComponente.dados.produto.componentes.length === 4, 'produto agora tem 4 componentes');

const semNome = await req('POST', `/produtos-instalados/${produto.id}/componentes`, {
  ...t,
  corpo: { tipo: 'OUTRA', prazoDias: 30 },
});
checar(semNome.status === 400, 'componente OUTRA sem nome e recusado', `status ${semNome.status}`);

const idExtra = novoComponente.dados.produto.componentes.find((c) => c.nome === 'Garantia estendida').id;
const editado = await req('PATCH', `/produtos-instalados/${produto.id}/componentes/${idExtra}`, {
  ...t,
  corpo: { prazoDias: 15 },
});
checar(
  editado.dados.produto.componentes.find((c) => c.id === idExtra).prazoDias === 15,
  'edicao do componente aplicada',
);

const removido = await req('DELETE', `/produtos-instalados/${produto.id}/componentes/${idExtra}`, t);
checar(removido.status === 200 && removido.dados.produto.componentes.length === 3, 'componente removido');

/* ── sem data de instalacao: nao pode virar "vencida" ─────────────────────── */

const semData = (
  await req('POST', '/produtos-instalados', {
    ...t,
    corpo: { contaId: conta.id, modelo: 'Equipamento sem data', componentes: [{ tipo: 'LEGAL', prazoDias: 90 }] },
  })
).dados.produto;
checar(
  semData.componentes[0].status === 'SEM_DATA_INICIO',
  'sem data de instalacao o componente fica SEM_DATA_INICIO, nunca vencida',
  semData.componentes[0].status,
);

/* ── ficha da conta traz a base instalada ─────────────────────────────────── */

const fichaConta = await req('GET', `/contas/${conta.id}`, t);
checar(
  fichaConta.dados.produtosInstalados?.some((p) => p.id === produto.id),
  'ficha da conta traz a base instalada',
);

/* ── escopo: produto some da lista de outra conta ─────────────────────────── */

const listaGeral = await req('GET', `/produtos-instalados?contaId=${conta.id}`, t);
checar(
  listaGeral.dados.produtos.some((p) => p.id === produto.id),
  'listagem filtrada por conta traz o produto',
);

/* ── limpeza ───────────────────────────────────────────────────────────── */

for (const id of [produto.id, semData.id, contratualVencida.id]) {
  const del = await req('DELETE', `/produtos-instalados/${id}`, t);
  checar(del.status === 204, `produto ${id.slice(0, 8)} removido`, `status ${del.status}`);
}
const delConta = await req('DELETE', `/contas/${conta.id}`, t);
checar(delConta.status === 204, 'conta de teste removida', `status ${delConta.status}`);

console.log(falhas === 0 ? '\nTodos os checks passaram.' : `\n${falhas} check(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
