/**
 * Smoke test de campos customizados (item 6.4).
 *
 * Cobre: CRUD de definicao restrito a ADMIN, tipos (TEXTO/NUMERO/SELECAO),
 * obrigatorio bloqueando criacao sem o valor, valorUnico recusando duplicata
 * (e permitindo repetir o mesmo valor no mesmo registro), campo desconhecido
 * recusado, `null` limpando o valor, e o CASCADE ao apagar o registro dono e
 * ao apagar a definicao.
 *
 * Uso: npm run smoke:campos-customizados (com a API de pe e o seed aplicado)
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
const c = { token: comercial };

/* ── CRUD de definicao restrito a ADMIN ───────────────────────────────────── */

const porComercial = await req('POST', '/campos-customizados', {
  ...c,
  corpo: { entidade: 'CONTA', nome: `Nao deveria ${EXECUCAO}`, tipo: 'TEXTO' },
});
checar(porComercial.status === 403, 'so ADMIN cria campo customizado', `status ${porComercial.status}`);

const semOpcoes = await req('POST', '/campos-customizados', {
  ...t,
  corpo: { entidade: 'CONTA', nome: `Porte ${EXECUCAO}`, tipo: 'SELECAO', opcoes: ['P'] },
});
checar(semOpcoes.status === 400, 'SELECAO com menos de 2 opcoes e recusado', `status ${semOpcoes.status}`);

const campoTexto = (
  await req('POST', '/campos-customizados', {
    ...t,
    corpo: { entidade: 'CONTA', nome: `Cor favorita ${EXECUCAO}`, tipo: 'TEXTO', obrigatorio: true },
  })
).dados.campo;
checar(Boolean(campoTexto?.id), 'campo TEXTO obrigatorio criado em CONTA');
checar(campoTexto?.chave === gerarChaveEsperada(`Cor favorita ${EXECUCAO}`), 'chave gerada do nome', campoTexto?.chave);

const campoCodigo = (
  await req('POST', '/campos-customizados', {
    ...t,
    corpo: { entidade: 'CONTA', nome: `Codigo do cliente ${EXECUCAO}`, tipo: 'NUMERO', valorUnico: true },
  })
).dados.campo;
checar(Boolean(campoCodigo?.id), 'campo NUMERO com valorUnico criado em CONTA');

const campoLead = (
  await req('POST', '/campos-customizados', {
    ...t,
    corpo: { entidade: 'LEAD', nome: `Origem detalhada ${EXECUCAO}`, tipo: 'TEXTO' },
  })
).dados.campo;
checar(Boolean(campoLead?.id), 'campo de LEAD criado — mesmo nome de um campo de CONTA nao colide');

function gerarChaveEsperada(nome) {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/* ── obrigatorio bloqueia CRIACAO sem o valor ─────────────────────────────── */

const contaSemObrigatorio = await req('POST', '/contas', { ...t, corpo: { nome: `Sem cor ${EXECUCAO}` } });
checar(
  contaSemObrigatorio.status === 400,
  'criar conta sem o campo obrigatorio e recusado, e a conta nao chega a existir',
  `status ${contaSemObrigatorio.status}`,
);

const campoDesconhecido = await req('POST', '/contas', {
  ...t,
  corpo: { nome: `Campo fantasma ${EXECUCAO}`, camposCustomizados: { [campoTexto.chave]: 'Azul', inventado: '1' } },
});
checar(campoDesconhecido.status === 400, 'campo customizado desconhecido e recusado', `status ${campoDesconhecido.status}`);

const conta1 = (
  await req('POST', '/contas', {
    ...t,
    corpo: { nome: `Conta 1 ${EXECUCAO}`, camposCustomizados: { [campoTexto.chave]: 'Azul', [campoCodigo.chave]: 100 } },
  })
).dados;
checar(Boolean(conta1?.conta?.id), 'conta criada com os campos customizados preenchidos');
const valorCor = conta1.camposCustomizados?.find((v) => v.chave === campoTexto.chave);
checar(valorCor?.valor === 'Azul', 'valor TEXTO volta como string', JSON.stringify(valorCor));
const valorCodigo = conta1.camposCustomizados?.find((v) => v.chave === campoCodigo.chave);
checar(valorCodigo?.valor === 100, 'valor NUMERO volta como number, nao string', JSON.stringify(valorCodigo));

/* ── valorUnico recusa duplicata, mas nao a si mesmo ──────────────────────── */

const conta2SemCor = await req('POST', '/contas', {
  ...t,
  corpo: { nome: `Conta 2 ${EXECUCAO}`, camposCustomizados: { [campoTexto.chave]: 'Verde', [campoCodigo.chave]: 100 } },
});
checar(conta2SemCor.status === 409, 'codigo duplicado entre contas diferentes e recusado', `status ${conta2SemCor.status}`);

const conta2 = (
  await req('POST', '/contas', {
    ...t,
    corpo: { nome: `Conta 2 ${EXECUCAO}`, camposCustomizados: { [campoTexto.chave]: 'Verde', [campoCodigo.chave]: 200 } },
  })
).dados.conta;
checar(Boolean(conta2?.id), 'segunda conta criada com codigo diferente');

const regravaMesmoValor = await req('PATCH', `/contas/${conta1.conta.id}`, {
  ...t,
  corpo: { camposCustomizados: { [campoCodigo.chave]: 100 } },
});
checar(
  regravaMesmoValor.status === 200,
  'regravar o MESMO valor unico no MESMO registro nao se acusa como duplicata dele mesmo',
  `status ${regravaMesmoValor.status}`,
);

/* ── tipo errado e recusado, PATCH ausente nao mexe em nada ───────────────── */

const tipoErrado = await req('PATCH', `/contas/${conta1.conta.id}`, {
  ...t,
  corpo: { camposCustomizados: { [campoCodigo.chave]: 'nao e numero' } },
});
checar(tipoErrado.status === 400, 'gravar texto num campo NUMERO e recusado', `status ${tipoErrado.status}`);

const patchSemTocar = await req('PATCH', `/contas/${conta1.conta.id}`, { ...t, corpo: { segmento: 'Industria' } });
checar(
  patchSemTocar.dados.camposCustomizados?.find((v) => v.chave === campoTexto.chave)?.valor === 'Azul',
  'PATCH de outro campo nao mexe nos campos customizados que nao vieram no corpo',
);

/* ── null limpa o valor (campo nao-obrigatorio) ───────────────────────────── */

const limpaCodigo = await req('PATCH', `/contas/${conta1.conta.id}`, {
  ...t,
  corpo: { camposCustomizados: { [campoCodigo.chave]: null } },
});
checar(
  limpaCodigo.status === 200 &&
    limpaCodigo.dados.camposCustomizados?.find((v) => v.chave === campoCodigo.chave)?.valor === null,
  'null limpa o valor de um campo nao-obrigatorio',
  `status ${limpaCodigo.status}`,
);

const limpaObrigatorio = await req('PATCH', `/contas/${conta1.conta.id}`, {
  ...t,
  corpo: { camposCustomizados: { [campoTexto.chave]: null } },
});
checar(limpaObrigatorio.status === 400, 'null num campo obrigatorio e recusado', `status ${limpaObrigatorio.status}`);

/* ── desativar o campo: para de aceitar valor novo, mas nao apaga o historico ── */

const desativado = await req('PATCH', `/campos-customizados/${campoCodigo.id}`, { ...t, corpo: { ativo: false } });
checar(desativado.status === 200 && desativado.dados.campo.ativo === false, 'campo desativado');

const gravarEmDesativado = await req('PATCH', `/contas/${conta2.id}`, {
  ...t,
  corpo: { camposCustomizados: { [campoCodigo.chave]: 999 } },
});
checar(
  gravarEmDesativado.status === 400,
  'campo desativado nao aceita valor novo (tratado como desconhecido)',
  `status ${gravarEmDesativado.status}`,
);

/* ── CASCADE: apagar a conta apaga os valores; apagar a definicao tambem ─── */

const fichaAntesDeApagar = await req('GET', `/contas/${conta2.id}`, t);
checar(
  fichaAntesDeApagar.dados.camposCustomizados?.some((v) => v.chave === campoCodigo.chave),
  'campo desativado continua aparecendo na ficha (so nao aceita valor novo)',
);

const delConta2 = await req('DELETE', `/contas/${conta2.id}`, t);
checar(delConta2.status === 204, 'conta 2 removida (CASCADE deve levar os valores dela)');

const delCampoTexto = await req('DELETE', `/campos-customizados/${campoTexto.id}`, t);
checar(delCampoTexto.status === 204, 'definicao removida (CASCADE deve levar os valores gravados nela)');

const fichaConta1DepoisDoCascade = await req('GET', `/contas/${conta1.conta.id}`, t);
checar(
  !fichaConta1DepoisDoCascade.dados.camposCustomizados?.some((v) => v.id === campoTexto.id),
  'apos apagar a definicao, ela some da ficha (nao fica valor orfao)',
);

/* ── limpeza ───────────────────────────────────────────────────────────── */

for (const id of [conta1.conta.id]) {
  const del = await req('DELETE', `/contas/${id}`, t);
  checar(del.status === 204, `conta ${id.slice(0, 8)} removida`, `status ${del.status}`);
}
for (const id of [campoCodigo.id, campoLead.id]) {
  const del = await req('DELETE', `/campos-customizados/${id}`, t);
  checar(del.status === 204, `definicao ${id.slice(0, 8)} removida`, `status ${del.status}`);
}

console.log(falhas === 0 ? '\nTodos os checks passaram.' : `\n${falhas} check(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
