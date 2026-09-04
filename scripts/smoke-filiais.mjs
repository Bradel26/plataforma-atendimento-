/**
 * Smoke test de filiais (item 6.5).
 *
 * Cobre: CRUD restrito a ADMIN, nome duplicado recusado, UF normalizada para
 * maiuscula, classificacao de conta e usuario por filialId (com validacao de
 * existencia), e o SetNull ao remover a filial — conta e usuario ficam SEM
 * filial, nao apagados.
 *
 * So classificacao: nao testa nada de visibilidade, porque filial
 * deliberadamente nao entra em `politicas.ts` (ver comentario no schema).
 *
 * Uso: npm run smoke:filiais  (com a API de pe e o seed aplicado)
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

/* ── CRUD restrito a ADMIN ────────────────────────────────────────────── */

const semToken = await req('POST', '/filiais', { corpo: { nome: 'X' } });
checar(semToken.status === 401, 'criacao exige autenticacao', `status ${semToken.status}`);

const porComercial = await req('POST', '/filiais', { ...c, corpo: { nome: `Nao deveria ${EXECUCAO}` } });
checar(porComercial.status === 403, 'so ADMIN cria filial', `status ${porComercial.status}`);

const nomeCurto = await req('POST', '/filiais', { ...t, corpo: { nome: 'A' } });
checar(nomeCurto.status === 400, 'nome muito curto e recusado', `status ${nomeCurto.status}`);

const filial = (
  await req('POST', '/filiais', { ...t, corpo: { nome: `Anapolis Centro ${EXECUCAO}`, cidade: 'Anapolis', uf: 'go' } })
).dados.filial;
checar(Boolean(filial?.id), 'filial criada');
checar(filial?.uf === 'GO', 'UF normalizada para maiuscula', filial?.uf);
checar(filial?.ativa === true, 'filial nasce ativa por padrao');

const duplicada = await req('POST', '/filiais', { ...t, corpo: { nome: `Anapolis Centro ${EXECUCAO}` } });
checar(duplicada.status === 409, 'nome duplicado e recusado', `status ${duplicada.status}`);

const listaComercial = await req('GET', '/filiais', c);
checar(
  listaComercial.status === 200 && listaComercial.dados.filiais?.some((f) => f.id === filial.id),
  'qualquer autenticado le a lista (para preencher seletores)',
  `status ${listaComercial.status}`,
);

const editarPorComercial = await req('PATCH', `/filiais/${filial.id}`, { ...c, corpo: { ativa: false } });
checar(editarPorComercial.status === 403, 'so ADMIN edita filial', `status ${editarPorComercial.status}`);

const editada = await req('PATCH', `/filiais/${filial.id}`, { ...t, corpo: { ativa: false } });
checar(editada.status === 200 && editada.dados.filial.ativa === false, 'edicao aplicada', `status ${editada.status}`);

/* ── classificacao de conta e usuario ─────────────────────────────────── */

const filialInexistente = '11111111-1111-1111-1111-111111111111';

const contaComFilialInvalida = await req('POST', '/contas', {
  ...t,
  corpo: { nome: `Conta filial invalida ${EXECUCAO}`, filialId: filialInexistente },
});
checar(
  contaComFilialInvalida.status === 404,
  'criar conta com filialId inexistente e recusado com 404, nao 500',
  `status ${contaComFilialInvalida.status}`,
);

const conta = (
  await req('POST', '/contas', { ...t, corpo: { nome: `Conta com filial ${EXECUCAO}`, filialId: filial.id } })
).dados.conta;
checar(conta?.filialId === filial.id, 'conta criada ja classificada na filial');

const listaPorFilial = await req('GET', `/contas?filialId=${filial.id}`, t);
checar(
  listaPorFilial.dados.contas?.some((x) => x.id === conta.id),
  'filtro de contas por filialId devolve a conta classificada',
);

const usuarioComFilialInvalida = await req('PATCH', '/usuarios/00000000-0000-0000-0000-000000000000', {
  ...t,
  corpo: { filialId: filialInexistente },
});
// 404 do usuario inexistente OU da filial: aqui o usuario e que nao existe, e o service confere o usuario primeiro.
checar(usuarioComFilialInvalida.status === 404, 'usuario inexistente continua 404', `status ${usuarioComFilialInvalida.status}`);

const usuariosResp = await req('GET', '/usuarios', t);
const outroUsuario = usuariosResp.dados.usuarios?.find((u) => u.email !== 'admin@plataforma.local');
checar(Boolean(outroUsuario), 'achou um usuario para testar classificacao');

if (outroUsuario) {
  const filialInvalidaNoUsuario = await req('PATCH', `/usuarios/${outroUsuario.id}`, {
    ...t,
    corpo: { filialId: filialInexistente },
  });
  checar(
    filialInvalidaNoUsuario.status === 404,
    'classificar usuario com filialId inexistente e recusado com 404',
    `status ${filialInvalidaNoUsuario.status}`,
  );

  const usuarioClassificado = await req('PATCH', `/usuarios/${outroUsuario.id}`, {
    ...t,
    corpo: { filialId: filial.id },
  });
  checar(
    usuarioClassificado.status === 200 && usuarioClassificado.dados.usuario.filialId === filial.id,
    'usuario classificado na filial',
    `status ${usuarioClassificado.status}`,
  );
}

/* ── remover a filial faz SetNull, nao apaga conta/usuario ───────────────── */

const remocao = await req('DELETE', `/filiais/${filial.id}`, t);
checar(remocao.status === 204, 'filial removida', `status ${remocao.status}`);

const contaDepois = await req('GET', `/contas/${conta.id}`, t);
checar(
  contaDepois.dados.conta?.filialId === null,
  'conta continua existindo, so perdeu a classificacao (SetNull)',
  JSON.stringify(contaDepois.dados.conta?.filialId),
);

if (outroUsuario) {
  const usuarioDepois = await req('GET', '/usuarios', t);
  const achado = usuarioDepois.dados.usuarios?.find((u) => u.id === outroUsuario.id);
  checar(achado?.filialId === null, 'usuario continua existindo, so perdeu a classificacao (SetNull)');

  // Limpa a classificacao do usuario de teste (nao ha o que fazer: ja foi para null pelo SetNull).
}

/* ── limpeza ───────────────────────────────────────────────────────────── */

const delConta = await req('DELETE', `/contas/${conta.id}`, t);
checar(delConta.status === 204, 'conta de teste removida', `status ${delConta.status}`);

console.log(falhas === 0 ? '\nTodos os checks passaram.' : `\n${falhas} check(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
