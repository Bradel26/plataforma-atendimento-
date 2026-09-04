/**
 * Smoke test da matriz de produtividade (item 3.3).
 *
 * Cobre: "agendada" exige prazo (nota/registro sem prazo nao aparece na
 * matriz), celula sem nenhuma atividade agendada nao existe no JSON (nula, e
 * nao 0%), feitas/agendadas contam certo, e o corte de perfil (AGENTE nao
 * pode ver a matriz).
 *
 * Uso: npm run smoke:produtividade  (com a API de pe e o seed aplicado)
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

const agente = await entrar('agente1@plataforma.local', 'Agente@123');
checar(Boolean(agente), 'login do agente');

/* ── cenario: um mes bem no futuro, para nao misturar com dado real ──────── */

const mes = '2031-05'; // mes arbitrario, longe de qualquer seed existente
const inicioMes = `${mes}-10T12:00:00.000Z`;

const conta = (await req('POST', '/contas', { ...t, corpo: { nome: `Produtividade ${EXECUCAO}` } })).dados.conta;
checar(Boolean(conta?.id), 'conta de apoio criada');

const meResp = await req('GET', '/auth/me', t);
const usuarioId = meResp.dados.usuario?.id ?? meResp.dados.id;
checar(Boolean(usuarioId), 'id do admin logado obtido', JSON.stringify(meResp.dados));

const criarAtividade = (corpo) => req('POST', '/atividades', { ...t, corpo: { contaId: conta.id, ...corpo } });

// Duas ligacoes agendadas para o admin: uma feita, uma nao.
const ligacaoFeita = await criarAtividade({
  tipo: 'LIGACAO',
  titulo: `Ligacao feita ${EXECUCAO}`,
  prazo: inicioMes,
  responsavelId: usuarioId,
});
const ligacaoAberta = await criarAtividade({
  tipo: 'LIGACAO',
  titulo: `Ligacao aberta ${EXECUCAO}`,
  prazo: inicioMes,
  responsavelId: usuarioId,
});
checar(ligacaoFeita.status === 201 && ligacaoAberta.status === 201, 'duas ligacoes agendadas criadas');

await req('POST', `/atividades/${ligacaoFeita.dados.atividade.id}/concluir`, t);

// Uma nota SEM prazo: registro do que ja aconteceu, nao deve contar como agendada.
const nota = await criarAtividade({ tipo: 'NOTA', titulo: `Nota sem prazo ${EXECUCAO}`, responsavelId: usuarioId });
checar(nota.status === 201, 'nota sem prazo criada');

const matriz = await req('GET', `/produtividade?mes=${mes}`, t);
checar(matriz.status === 200, 'matriz responde 200', `status ${matriz.status}`);
checar(matriz.dados.mes === mes, 'matriz devolve o mes pedido', matriz.dados.mes);

const minhaLinha = matriz.dados.linhas.find((l) => l.usuarioId === usuarioId);
checar(Boolean(minhaLinha), 'admin aparece como linha da matriz');

const celulaLigacao = minhaLinha?.porTipo?.LIGACAO;
checar(Boolean(celulaLigacao), 'celula de LIGACAO existe (tem agendada)');
checar(celulaLigacao?.agendadas === 2, '2 ligacoes agendadas', `${celulaLigacao?.agendadas}`);
checar(celulaLigacao?.feitas === 1, '1 das duas foi concluida', `${celulaLigacao?.feitas}`);
checar(celulaLigacao?.percentual === 50, 'percentual calculado certo (50%)', `${celulaLigacao?.percentual}`);

const celulaNota = minhaLinha?.porTipo?.NOTA;
checar(
  celulaNota === null || celulaNota === undefined,
  'nota sem prazo NAO cria celula (nula, e nao 0%)',
  JSON.stringify(celulaNota),
);

const celulaReuniao = minhaLinha?.porTipo?.REUNIAO;
checar(
  celulaReuniao === null || celulaReuniao === undefined,
  'tipo sem nenhuma atividade agendada e nulo, nao 0%',
  JSON.stringify(celulaReuniao),
);

checar(
  Array.isArray(celulaLigacao?.atividades) && celulaLigacao.atividades.length === 2,
  'drill-down traz as duas atividades de LIGACAO',
  JSON.stringify(celulaLigacao?.atividades?.map((a) => a.titulo)),
);

const mesSemNada = await req('GET', '/produtividade?mes=2031-06', t);
checar(
  !mesSemNada.dados.linhas?.some((l) => l.usuarioId === usuarioId),
  'mes sem nenhuma atividade agendada nao gera linha para o usuario',
);

const mesInvalido = await req('GET', '/produtividade?mes=2031-13', t);
checar(mesInvalido.status === 400, 'mes invalido e recusado', `status ${mesInvalido.status}`);

/* ── corte de perfil ───────────────────────────────────────────────────── */

const comoAgente = await req('GET', `/produtividade?mes=${mes}`, { token: agente });
checar(comoAgente.status === 403, 'AGENTE nao acessa a matriz', `status ${comoAgente.status}`);

/* ── limpeza ───────────────────────────────────────────────────────────── */

for (const id of [ligacaoFeita.dados.atividade?.id, ligacaoAberta.dados.atividade?.id, nota.dados.atividade?.id]) {
  if (!id) continue;
  const del = await req('DELETE', `/atividades/${id}`, t);
  checar(del.status === 204, `atividade ${id.slice(0, 8)} removida`, `status ${del.status}`);
}
const delConta = await req('DELETE', `/contas/${conta.id}`, t);
checar(delConta.status === 204, 'conta de teste removida', `status ${delConta.status}`);

console.log(falhas === 0 ? '\nTodos os checks passaram.' : `\n${falhas} check(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
