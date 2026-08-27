/**
 * Smoke test da ficha 360 do cliente.
 *
 * A linha do tempo e a unica consulta da API escrita em SQL bruto (UNION ALL de
 * oito fontes) — o typecheck nao ve nada dela. Sem este smoke, um nome de coluna
 * errado so apareceria em producao, na tela que o vendedor abre o dia inteiro.
 *
 * Cobre: ordenacao decrescente do conjunto, paginacao por cursor sem pular nem
 * repetir evento, filtro por tipo, recorte por periodo, escopo contato/conta,
 * contadores do cabecalho e o ciclo de vida da atividade.
 *
 * Uso: npm run smoke:ficha  (com a API de pe e o seed aplicado)
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
  await req('POST', '/contas', {
    ...t,
    corpo: { nome: `Ficha ${EXECUCAO}`, segmento: 'Testes' },
  })
).dados.conta;
checar(Boolean(conta?.id), 'conta criada');

const contato = (
  await req('POST', '/contatos', {
    ...t,
    corpo: { nome: `Contato ${EXECUCAO}`, email: `ficha-${EXECUCAO}@exemplo.local` },
  })
).dados.contato;
checar(Boolean(contato?.id), 'contato criado');

const vinculo = await req('POST', `/contas/${conta.id}/contatos`, {
  ...t,
  corpo: { contatoId: contato.id },
});
checar(vinculo.status < 300, 'contato vinculado a conta', `status ${vinculo.status}`);

// Oportunidade na conta: gera dois eventos (OPORTUNIDADE e a ETAPA de entrada).
const oportunidade = (
  await req('POST', '/oportunidades', {
    ...t,
    corpo: { titulo: `Venda ${EXECUCAO}`, contaId: conta.id, valor: 1234.56 },
  })
).dados.oportunidade;
checar(Boolean(oportunidade?.id), 'oportunidade criada');
checar(oportunidade?.diasNoEstagio === 0, 'oportunidade nova tem 0 dias no estagio', `${oportunidade?.diasNoEstagio}`);
checar(typeof oportunidade?.diasAberta === 'number', 'oportunidade expoe diasAberta');

/* ── atividades ────────────────────────────────────────────────────────── */

const semVinculo = await req('POST', '/atividades', {
  ...t,
  corpo: { tipo: 'LIGACAO', titulo: 'Sem vinculo nenhum' },
});
checar(semVinculo.status === 400, 'atividade sem vinculo e recusada', `status ${semVinculo.status}`);

const tipoInvalido = await req('POST', '/atividades', {
  ...t,
  corpo: { tipo: 'TELEPATIA', titulo: 'Tipo que nao existe', contatoId: contato.id },
});
checar(tipoInvalido.status === 400, 'tipo de atividade invalido e recusado', `status ${tipoInvalido.status}`);

const registro = (
  await req('POST', '/atividades', {
    ...t,
    corpo: { tipo: 'VISITA', titulo: `Visita ${EXECUCAO}`, contatoId: contato.id },
  })
).dados.atividade;
checar(Boolean(registro?.id), 'atividade de registro criada (sem prazo)');
checar(Boolean(registro?.responsavel?.id), 'sem responsavel informado, assume quem registrou');

const amanha = new Date(Date.now() + 86_400_000).toISOString();
const tarefa = (
  await req('POST', '/atividades', {
    ...t,
    corpo: { tipo: 'LIGACAO', titulo: `Ligar ${EXECUCAO}`, prazo: amanha, contaId: conta.id },
  })
).dados.atividade;
checar(Boolean(tarefa?.id), 'tarefa com prazo criada');

const ontem = new Date(Date.now() - 86_400_000).toISOString();
const atrasada = (
  await req('POST', '/atividades', {
    ...t,
    corpo: { tipo: 'REUNIAO', titulo: `Atrasada ${EXECUCAO}`, prazo: ontem, contatoId: contato.id },
  })
).dados.atividade;
checar(Boolean(atrasada?.id), 'tarefa atrasada criada');

const abertas = (await req('GET', `/atividades?contatoId=${contato.id}&situacao=abertas`, t)).dados
  .atividades;
checar(
  abertas.some((a) => a.id === atrasada.id) && !abertas.some((a) => a.id === registro.id),
  'situacao=abertas traz tarefa com prazo e nao traz registro sem prazo',
);

const listaAtrasadas = (await req('GET', `/atividades?contatoId=${contato.id}&situacao=atrasadas`, t))
  .dados.atividades;
checar(
  listaAtrasadas.some((a) => a.id === atrasada.id) && !listaAtrasadas.some((a) => a.id === tarefa.id),
  'situacao=atrasadas traz so a vencida',
);

const concluir = await req('POST', `/atividades/${atrasada.id}/concluir`, t);
checar(concluir.status === 200 && concluir.dados.atividade.concluidoEm, 'atividade concluida');

const reconcluir = await req('POST', `/atividades/${atrasada.id}/concluir`, t);
checar(reconcluir.status === 400, 'concluir duas vezes e recusado', `status ${reconcluir.status}`);

const reabrir = await req('POST', `/atividades/${atrasada.id}/reabrir`, t);
checar(reabrir.status === 200 && reabrir.dados.atividade.concluidoEm === null, 'atividade reaberta');

/* ── ficha ─────────────────────────────────────────────────────────────── */

const ficha = await req('GET', `/ficha/contato/${contato.id}`, t);
checar(ficha.status === 200, 'ficha do contato responde');
checar(ficha.dados.contato?.conta?.id === conta.id, 'ficha traz a conta do contato');
checar(
  ficha.dados.indicadores?.oportunidadesAbertas === 1,
  'contador de oportunidades abertas',
  `${ficha.dados.indicadores?.oportunidadesAbertas}`,
);
checar(
  ficha.dados.indicadores?.atividadesAbertas >= 2,
  'contador de atividades abertas (contato + conta)',
  `${ficha.dados.indicadores?.atividadesAbertas}`,
);

const inexistente = await req('GET', '/ficha/contato/00000000-0000-0000-0000-000000000000', t);
checar(inexistente.status === 404, 'ficha de contato inexistente da 404', `status ${inexistente.status}`);

const semToken = await req('GET', `/ficha/contato/${contato.id}`);
checar(semToken.status === 401, 'ficha exige autenticacao', `status ${semToken.status}`);

/* ── linha do tempo ────────────────────────────────────────────────────── */

const tl = await req('GET', `/ficha/contato/${contato.id}/timeline?limite=50`, t);
checar(tl.status === 200, 'timeline responde');

const eventos = tl.dados.eventos ?? [];
const tipos = new Set(eventos.map((e) => e.tipo));
checar(tipos.has('OPORTUNIDADE'), 'timeline traz a oportunidade da conta');
checar(tipos.has('ETAPA'), 'timeline traz a entrada no primeiro estagio');
checar(tipos.has('ATIVIDADE'), 'timeline traz atividades');

const datas = eventos.map((e) => new Date(e.ocorridoEm).getTime());
checar(
  // O `length >= 3` importa: sem ele o teste de ordenacao passaria com a lista
  // vazia, que era exatamente o estado quando o SQL estava quebrado.
  datas.length >= 3 && datas.every((d, i) => i === 0 || datas[i - 1] >= d),
  'timeline vem em ordem decrescente no conjunto',
  `${datas.length} eventos`,
);

const escopos = new Set(eventos.map((e) => e.escopo));
checar(escopos.has('CONTATO') && escopos.has('CONTA'), 'timeline marca escopo contato e conta');

const soAtividade = (
  await req('GET', `/ficha/contato/${contato.id}/timeline?tipos=ATIVIDADE&limite=50`, t)
).dados.eventos;
checar(
  soAtividade.length > 0 && soAtividade.every((e) => e.tipo === 'ATIVIDADE'),
  'filtro por tipo respeitado',
);

const tipoRuim = await req('GET', `/ficha/contato/${contato.id}/timeline?tipos=NAOEXISTE`, t);
checar(tipoRuim.status === 400, 'tipo de evento invalido e recusado', `status ${tipoRuim.status}`);

// Paginacao: duas paginas de 1 nao podem repetir nem pular evento.
const p1 = (await req('GET', `/ficha/contato/${contato.id}/timeline?limite=1`, t)).dados;
checar(p1.eventos.length === 1 && p1.proximoCursor, 'primeira pagina de 1 traz cursor');
const p2 = (
  await req(
    'GET',
    `/ficha/contato/${contato.id}/timeline?limite=1&cursor=${encodeURIComponent(p1.proximoCursor)}`,
    t,
  )
).dados;
checar(p2.eventos.length === 1, 'segunda pagina traz um evento');
checar(p2.eventos[0].id !== p1.eventos[0].id, 'cursor nao repete o evento da pagina anterior');

const completa = (await req('GET', `/ficha/contato/${contato.id}/timeline?limite=50`, t)).dados
  .eventos;
checar(completa[0].id === p1.eventos[0].id, 'pagina 1 comeca no mesmo evento da lista completa');
checar(completa[1].id === p2.eventos[0].id, 'pagina 2 continua exatamente onde a 1 parou');

const cursorRuim = await req('GET', `/ficha/contato/${contato.id}/timeline?cursor=%%%`, t);
checar(cursorRuim.status === 400, 'cursor invalido e recusado', `status ${cursorRuim.status}`);

const futuro = new Date(Date.now() + 30 * 86_400_000).toISOString();
const vazia = (
  await req('GET', `/ficha/contato/${contato.id}/timeline?desde=${futuro}`, t)
).dados.eventos;
checar(vazia.length === 0, 'recorte por periodo no futuro vem vazio', `${vazia.length} eventos`);

/* ── ficha da conta ────────────────────────────────────────────────────── */

const fichaConta = await req('GET', `/ficha/conta/${conta.id}`, t);
checar(fichaConta.status === 200, 'ficha da conta responde');
checar(
  fichaConta.dados.conta?.contatos?.some((c) => c.id === contato.id),
  'ficha da conta lista os contatos',
);

const tlConta = (await req('GET', `/ficha/conta/${conta.id}/timeline?limite=50`, t)).dados.eventos;
checar(
  tlConta.every((e) => e.escopo === 'CONTA'),
  'timeline da conta nao traz evento so do contato',
);

/* ── historico de estagio ──────────────────────────────────────────────── */

const kanban = (await req('GET', '/oportunidades/kanban', t)).dados;
const segundoEstagio = kanban.colunas[1]?.estagio?.id;
if (segundoEstagio) {
  const movida = await req('PATCH', `/oportunidades/${oportunidade.id}`, {
    ...t,
    corpo: { estagioId: segundoEstagio },
  });
  checar(movida.status === 200, 'oportunidade movida de estagio');

  const depois = (
    await req('GET', `/ficha/conta/${conta.id}/timeline?tipos=ETAPA&limite=10`, t)
  ).dados.eventos;
  checar(depois.length === 2, 'mudanca de estagio gerou segundo evento de etapa', `${depois.length}`);
  checar(
    depois[0].detalhe?.includes('->'),
    'evento de etapa descreve a transicao',
    depois[0].detalhe ?? '',
  );
} else {
  checar(false, 'funil de teste precisa de ao menos dois estagios');
}

/* ── limpeza ───────────────────────────────────────────────────────────── */

for (const id of [registro.id, tarefa.id, atrasada.id]) {
  const del = await req('DELETE', `/atividades/${id}`, t);
  checar(del.status === 204, `atividade ${id.slice(0, 8)} removida`, `status ${del.status}`);
}

console.log(falhas === 0 ? '\nTodos os checks passaram.' : `\n${falhas} check(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
