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
const vendedor3 = usuarios.usuarios.find((u) => u.email === 'vendedor3@plataforma.local');
const agente1 = usuarios.usuarios.find((u) => u.email === 'agente1@plataforma.local');
checar(Boolean(vendedor1 && vendedor2 && vendedor3 && agente1), 'seed tem vendedor1, vendedor2, vendedor3 e agente1');

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

/* ── 7. Aviso de status (conectou/caiu) da sessao 1 ─────────────────────── */

const avisarStatusPelaPonte = async (sessao, segredo, status, detalhe) => {
  const corpoBruto = JSON.stringify({ sessao, status, detalhe });
  return req('POST', `/webhooks/ponte/status/${organizacaoId}`, {
    corpoBruto,
    headers: { 'X-Ponte-Assinatura': assinar(corpoBruto, segredo) },
  });
};

const avisoConectado = await avisarStatusPelaPonte(SESSAO_1, SEGREDO_1, 'CONECTADO', null);
checar(
  avisoConectado.status === 200 && avisoConectado.dados.ok === true,
  '7. aviso de status CONECTADO da sessao 1 aceito',
  `HTTP ${avisoConectado.status}`,
);

const avisoDesconectado = await avisarStatusPelaPonte(
  SESSAO_1,
  SEGREDO_1,
  'DESCONECTADO',
  'conexao caiu (428); tentando voltar',
);
checar(
  avisoDesconectado.status === 200 && avisoDesconectado.dados.ok === true,
  '   aviso de status DESCONECTADO da sessao 1 aceito',
  `HTTP ${avisoDesconectado.status}`,
);

const { dados: canaisDepois } = await req('GET', '/canais', { token: admin });
const linha1Depois = canaisDepois.canais.find((c) => c.id === linha1.dados.canal.id);
checar(
  linha1Depois?.ponteStatus === 'DESCONECTADO',
  '   GET /canais reflete o ultimo status avisado (DESCONECTADO)',
  `ponteStatus=${linha1Depois?.ponteStatus}`,
);

const avisoSegredoErrado = await avisarStatusPelaPonte(SESSAO_1, SEGREDO_2, 'CONECTADO', null);
checar(
  avisoSegredoErrado.status === 401,
  '   segredo da sessao 2 nao assina aviso de status da sessao 1',
  `HTTP ${avisoSegredoErrado.status}`,
);

/* ── 8. Linha pessoal herda a config compartilhada e a rota self-service ── */

/*
 * Config compartilhada com as 3 credenciais da ponte preenchidas — a linha
 * pessoal do vendedor 3, criada logo abaixo SEM nenhuma delas, precisa
 * herdar as 3 e ganhar um nome de sessao gerado automaticamente.
 */
const SEGREDO_COMPARTILHADA = `segredo-compartilhada-${EXECUCAO}`;
const compartilhada = await req('PUT', '/canais/whatsapp', {
  token: admin,
  corpo: {
    modo: 'NAO_OFICIAL',
    ativo: false,
    ponteUrl: 'http://ponte-compartilhada:9999/api',
    ponteToken: 'token-compartilhado-1234567890',
    ponteSegredo: SEGREDO_COMPARTILHADA,
  },
});
checar(compartilhada.status === 200, '8. config compartilhada da ponte configurada', `HTTP ${compartilhada.status}`);

/*
 * Limpa uma linha pessoal do vendedor 3 de uma execucao anterior: o nome de
 * sessao gerado e deterministico (mesmo donoId sempre gera o mesmo nome), e
 * sem esta limpeza a segunda rodada do smoke test bateria de frente com a
 * checagem de conflito de sessao (secao 166-174 de channels.service.ts).
 */
const { dados: canaisAntes } = await req('GET', '/canais', { token: admin });
const linha3Antiga = canaisAntes.canais.find((c) => c.canal === 'WHATSAPP' && c.dono?.id === vendedor3.id);
if (linha3Antiga) await req('DELETE', `/canais/numeros/${linha3Antiga.id}`, { token: admin });

const linha3 = await req('POST', '/canais/whatsapp/numeros', {
  token: admin,
  corpo: {
    donoId: vendedor3.id,
    nome: 'Vendedor 3 (smoke)',
    modo: 'NAO_OFICIAL',
    ativo: true,
  },
});
checar(linha3.status === 201, '   linha pessoal do vendedor 3 criada sem informar credenciais da ponte', `HTTP ${linha3.status}`);
checar(
  linha3.dados.canal?.ponteUrl === 'http://ponte-compartilhada:9999/api',
  '   herdou ponteUrl da config compartilhada',
  `ponteUrl=${linha3.dados.canal?.ponteUrl}`,
);
checar(
  Boolean(linha3.dados.canal?.ponteTokenMascarado && linha3.dados.canal?.ponteSegredoMascarado),
  '   herdou ponteToken/ponteSegredo da config compartilhada (mascarados na leitura)',
);
const sessaoGerada = linha3.dados.canal?.ponteSessao;
checar(
  sessaoGerada === `vendedor-${vendedor3.id.slice(0, 8)}`,
  '   gerou nome de sessao automatico a partir do donoId',
  `ponteSessao=${sessaoGerada}`,
);

const { dados: loginV3 } = await req('POST', '/auth/login', {
  corpo: { email: 'vendedor3@plataforma.local', senha: 'Vendedor@123' },
});
const { dados: minhaLinhaV3 } = await req('GET', '/canais/numeros/meu', { token: loginV3.accessToken });
checar(
  minhaLinhaV3.numero?.id === linha3.dados.canal?.id && minhaLinhaV3.numero?.ponteSessao === sessaoGerada,
  '9. GET /canais/numeros/meu devolve a propria linha do vendedor 3',
  JSON.stringify(minhaLinhaV3),
);

const { dados: loginAgente1 } = await req('POST', '/auth/login', {
  corpo: { email: 'agente1@plataforma.local', senha: 'Agente@123' },
});
const { dados: minhaLinhaAgente1 } = await req('GET', '/canais/numeros/meu', { token: loginAgente1.accessToken });
checar(
  minhaLinhaAgente1.numero === null,
  '   GET /canais/numeros/meu devolve null para quem nao tem linha pessoal',
  JSON.stringify(minhaLinhaAgente1),
);

/* ── 10. Importacao de contatos do celular (agenda -> cadastro de Contato) ── */

/*
 * Simula o que a ponte manda ao conectar (`entregarContatos` em
 * apps/ponte/src/plataforma.ts): so cria o que ainda nao existe, e repetir a
 * mesma chamada nao pode duplicar.
 */
const enviarContatosPelaPonte = async (sessao, segredo, contatos) => {
  const corpoBruto = JSON.stringify({ sessao, contatos });
  return req('POST', `/webhooks/ponte/contatos/${organizacaoId}`, {
    corpoBruto,
    headers: { 'X-Ponte-Assinatura': assinar(corpoBruto, segredo) },
  });
};

const contatoA = { numero: `5511${String(Date.now() + 2).slice(-9)}`, nome: 'Contato Agenda A' };
const contatoB = { numero: `5511${String(Date.now() + 3).slice(-9)}`, nome: 'Contato Agenda B' };

const importacao1 = await enviarContatosPelaPonte(SESSAO_1, SEGREDO_1, [contatoA, contatoB]);
checar(
  importacao1.status === 200 && importacao1.dados.criados === 2,
  '10. importacao de 2 contatos novos da sessao 1 cria 2 Contatos',
  `HTTP ${importacao1.status} criados=${importacao1.dados.criados}`,
);

const { dados: achadosA } = await req('GET', `/contatos?busca=${contatoA.numero}`, { token: admin });
const { dados: achadosB } = await req('GET', `/contatos?busca=${contatoB.numero}`, { token: admin });
const contatoCriadoA = achadosA.contatos?.find((c) => c.telefone === contatoA.numero);
const contatoCriadoB = achadosB.contatos?.find((c) => c.telefone === contatoB.numero);

checar(
  Boolean(contatoCriadoA && contatoCriadoA.nome === contatoA.nome),
  '   contato A aparece em /contatos com o nome da agenda',
  JSON.stringify(contatoCriadoA),
);
checar(
  Boolean(contatoCriadoB && contatoCriadoB.responsavelId === vendedor1.id),
  '   contato B ficou associado ao vendedor 1 (dono da linha)',
  JSON.stringify(contatoCriadoB),
);

/* Repete a MESMA importacao: nao pode duplicar nem sobrescrever. */
const importacao2 = await enviarContatosPelaPonte(SESSAO_1, SEGREDO_1, [contatoA, contatoB]);
checar(
  importacao2.status === 200 && importacao2.dados.criados === 0,
  '11. repetir a mesma importacao nao cria nada de novo (idempotente)',
  `HTTP ${importacao2.status} criados=${importacao2.dados.criados}`,
);

const { dados: achadosDepois } = await req('GET', `/contatos?busca=${contatoA.numero}`, { token: admin });
checar(
  achadosDepois.contatos?.filter((c) => c.telefone === contatoA.numero).length === 1,
  '   continua existindo exatamente 1 Contato com aquele telefone',
);

console.log(falhas === 0 ? `\nOK — ${EXECUCAO}` : `\n${falhas} falha(s) — ${EXECUCAO}`);
process.exit(falhas === 0 ? 0 : 1);
