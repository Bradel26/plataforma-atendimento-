/**
 * Smoke das esteiras TIM e Starlink (`/api/esteiras/:operacao`), contra a API local.
 *
 * Opt-in e travado: grava na base de dev REAL (não existe banco descartável
 * neste projeto), então só roda com `SMOKE_ESTEIRAS=1` E com
 * `SMOKE_DB_HOST_PERMITIDO` igual ao host do `DATABASE_URL` (allowlist
 * explícita; ausente ou diferente → aborta). Também confere que a API grava no
 * mesmo banco que o script lê (senão a limpeza não alcançaria o que foi criado).
 *
 * Tudo o que cria leva a marca da execução (`[TESTE] Smoke <execução>`). A
 * limpeza do `finally` apaga SÓ o que esta execução criou: os ids anotados,
 * sempre filtrando também pela organização e pela marca — nunca por prefixo
 * solto. Ordem: usuário de teste primeiro, depois contatos (vínculos e filhos
 * caem em cascata), contas e os `registros_esteira` do usuário de teste (por id).
 *
 * Com `SMOKE_LIMPAR_E2E=1`, apaga também o parceiro que o E2E
 * `tests/e2e/esteira.spec.ts` deixa (`[TESTE] Parceiro E2E <número>`, nome
 * exato por regex, na mesma organização).
 *
 * Roteiro: login admin; o mesmo CNPJ na TIM (201) e na Starlink (201); repetir
 * na TIM (409); mover TIM pulando etapa sem justificativa (409
 * EXIGE_JUSTIFICATIVA) e com justificativa (200, histórico EXCECAO); Starlink
 * marcar treinamento sem VSM (409); usuário de teste só-TIM não enxerga a
 * Starlink (404 no vínculo e na exportação); exportar CSV TIM filtrado; importar
 * a mesma planilha duas vezes (a 2ª só atualiza). De quebra, as consultas que
 * só tinham passado no typecheck: Kanban, coluna, Lista, Funil, ficha (linha
 * do tempo), preferências, painel/gestão/desempenho/acompanhamentos.
 *
 * Uso (API de pé em :3333):
 *   SMOKE_ESTEIRAS=1 SMOKE_DB_HOST_PERMITIDO=<host do banco de dev> npm run smoke:esteiras
 * Variáveis: SMOKE_API (padrão http://localhost:3333/api), SMOKE_ADMIN_EMAIL,
 * SMOKE_ADMIN_SENHA (padrão: SEED_ADMIN_* do apps/api/.env, senão o do seed),
 * SMOKE_LIMPAR_E2E=1.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

if (process.env.SMOKE_ESTEIRAS !== '1') {
  console.log('smoke:esteiras pulado: defina SMOKE_ESTEIRAS=1 (grava e apaga dados [TESTE] na base de dev).');
  process.exit(0);
}

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Lê o apps/api/.env sem sobrescrever o que já veio do ambiente. */
function carregarEnvDaApi() {
  try {
    const texto = readFileSync(path.join(raiz, 'apps/api/.env'), 'utf8');
    for (const linha of texto.split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(linha.trim());
      if (!m || process.env[m[1]] !== undefined) continue;
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
    }
  } catch {
    /* sem .env: usa só o ambiente */
  }
}
carregarEnvDaApi();

const abortar = (mensagem) => {
  console.error(`smoke:esteiras abortado: ${mensagem}`);
  process.exit(1);
};

const API = process.env.SMOKE_API ?? 'http://localhost:3333/api';
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(API)) abortar(`só roda contra a API local (SMOKE_API=${API}).`);

/** Host do banco sem o sufixo `-pooler` do Neon (a mesma base pela conexão direta ou pelo pool). */
function hostDoBanco(url) {
  try {
    return new URL(url).hostname.replace('-pooler.', '.').toLowerCase();
  } catch {
    return null;
  }
}
const permitido = (process.env.SMOKE_DB_HOST_PERMITIDO ?? '').trim().toLowerCase().replace('-pooler.', '.');
if (!permitido) abortar('defina SMOKE_DB_HOST_PERMITIDO com o host do banco de dev (allowlist explícita).');
for (const nome of ['DATABASE_URL', 'DIRECT_URL']) {
  const valor = process.env[nome];
  if (nome === 'DIRECT_URL' && !valor) continue;
  const host = hostDoBanco(valor ?? '');
  if (host !== permitido) abortar(`${nome} aponta para "${host ?? '(inválido)'}", fora da allowlist (SMOKE_DB_HOST_PERMITIDO).`);
}
// Produção nunca, mesmo que alguém a coloque na allowlist.
if (/ep-empty-lake/.test(permitido)) abortar('o host permitido é o banco de produção.');

const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL ?? process.env.SEED_ADMIN_EMAIL ?? 'admin@plataforma.local';
const ADMIN_SENHA = process.env.SMOKE_ADMIN_SENHA ?? process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123';
const EXECUCAO = `${Date.now().toString(36)}${randomUUID().slice(0, 4)}`;
/** Marca única desta execução: todo nome criado começa com ela, e a limpeza filtra por ela. */
const MARCA = `[TESTE] Smoke ${EXECUCAO}`;
const EMAIL_TESTE = `smoke-esteiras-${EXECUCAO}@teste.local`;
const SENHA_TEMPORARIA = `Tmp-${randomUUID()}`;
const SENHA_NOVA = `Nova-${randomUUID()}`;
const CHAVE_PREFERENCIA = `esteira:TIM:smoke-${EXECUCAO}`;
const NOME_E2E = /^\[TESTE\] Parceiro E2E \d+$/;

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

let ok = 0;
let falhas = 0;
const checar = (cond, titulo, extra = '') => {
  if (cond) ok += 1;
  else falhas += 1;
  const linha = `${cond ? 'ok    ' : 'FALHOU'} ${titulo}${extra ? ` — ${extra}` : ''}`;
  if (cond) console.log(linha);
  else console.error(linha);
  return cond;
};

async function req(metodo, rota, { corpo, token, form, texto } = {}) {
  const resp = await fetch(API + rota, {
    method: metodo,
    headers: {
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form ?? (corpo ? JSON.stringify(corpo) : undefined),
  });
  if (texto) return { status: resp.status, texto: await resp.text() };
  const bruto = await resp.text();
  let dados = {};
  try {
    dados = bruto ? JSON.parse(bruto) : {};
  } catch {
    dados = { bruto };
  }
  return { status: resp.status, dados };
}

const resumo = (r) => `status ${r.status}${r.dados?.error ? ` ${r.dados.error.code}: ${r.dados.error.message}` : ''}`;

/** `sub` do JWT de acesso (só para achar a organização do admin no banco). */
const subDoToken = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).sub;

/** CNPJ válido (dígitos verificadores) a partir de 12 dígitos aleatórios. */
function gerarCnpj() {
  const dv = (base) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const resto = base.split('').reduce((s, d, i) => s + Number(d) * pesos[i], 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const base = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join('') + '0001';
  const com13 = base + dv(base);
  return com13 + dv(com13);
}

/** Celular de Goiânia com final aleatório (11 dígitos). */
const gerarTelefone = () => `629${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

// ---------------------------------------------------------------------------
// O que esta execução criou (a limpeza só toca isto)
// ---------------------------------------------------------------------------

let organizacaoId = null;
const criados = { usuarios: new Set(), contatos: new Set(), contas: new Set() };

/** Anota contato e conta de um vínculo devolvido pela API. */
const anotarVinculo = (v) => {
  if (!v) return;
  criados.contatos.add(v.parceiro.contatoId);
  if (v.parceiro.contaId) criados.contas.add(v.parceiro.contaId);
};

async function limpar(admin) {
  if (!organizacaoId) return { aviso: 'organização desconhecida: nada apagado' };
  const daMarca = { organizacaoId, nome: { startsWith: MARCA } };

  // Registros de exportação/importação: só os do usuário de teste (ele fez as duas), por id,
  // lidos ANTES de apagar o usuário (a FK vira nula depois).
  const usuarios = [...criados.usuarios];
  const registros = usuarios.length
    ? (await prisma.registroEsteira.findMany({ where: { organizacaoId, usuarioId: { in: usuarios } }, select: { id: true } })).map((r) => r.id)
    : [];

  // 1. Usuário de teste primeiro: pela API (mesmo caminho da tela); se falhar, direto no banco.
  let usuariosApagados = 0;
  for (const id of usuarios) {
    const r = admin ? await req('DELETE', `/usuarios/${id}/permanente`, { token: admin }) : { status: 0 };
    if (r.status !== 200) await prisma.user.deleteMany({ where: { id, organizacaoId, email: EMAIL_TESTE } });
    usuariosApagados += 1;
  }

  // 2. Contatos: os anotados + os da marca (pega o que nasceu antes de ser anotado). Os vínculos
  //    (histórico, campos, notas, auditoria, vendedores, ciclo) caem em cascata.
  const contatos = [
    ...new Set([...criados.contatos, ...(await prisma.contact.findMany({ where: daMarca, select: { id: true } })).map((c) => c.id)]),
  ];
  const vinculos = contatos.length ? await prisma.credenciamento.count({ where: { organizacaoId, contatoId: { in: contatos } } }) : 0;
  const c = contatos.length ? await prisma.contact.deleteMany({ where: { ...daMarca, id: { in: contatos } } }) : { count: 0 };

  // 3. Contas, com o mesmo critério.
  const contas = [
    ...new Set([...criados.contas, ...(await prisma.account.findMany({ where: daMarca, select: { id: true } })).map((a) => a.id)]),
  ];
  const a = contas.length ? await prisma.account.deleteMany({ where: { ...daMarca, id: { in: contas } } }) : { count: 0 };

  // 4. Registros da esteira do usuário de teste, por id.
  const r = registros.length ? await prisma.registroEsteira.deleteMany({ where: { organizacaoId, id: { in: registros } } }) : { count: 0 };

  // 5. Opcional: o parceiro do E2E (nome exato, mesma organização; vínculos em cascata).
  let e2e = 0;
  if (process.env.SMOKE_LIMPAR_E2E === '1') {
    const candidatos = await prisma.contact.findMany({
      where: { organizacaoId, nome: { startsWith: '[TESTE] Parceiro E2E ' } },
      select: { id: true, nome: true },
    });
    const ids = candidatos.filter((x) => NOME_E2E.test(x.nome)).map((x) => x.id);
    if (ids.length) e2e = (await prisma.contact.deleteMany({ where: { organizacaoId, id: { in: ids } } })).count;
  }

  return { usuarios: usuariosApagados, contatos: c.count, vinculos, contas: a.count, registros: r.count, e2e };
}

// ---------------------------------------------------------------------------
// Roteiro
// ---------------------------------------------------------------------------

let admin = null;
let etapaAlterada = null;

try {
  const login = await req('POST', '/auth/login', { corpo: { email: ADMIN_EMAIL, senha: ADMIN_SENHA } });
  admin = login.dados.accessToken ?? null;
  if (!checar(Boolean(admin), 'login do admin', resumo(login))) throw new Error('sem login do admin');
  const t = { token: admin };
  organizacaoId = (await prisma.user.findUnique({ where: { id: subDoToken(admin) }, select: { organizacaoId: true } }))?.organizacaoId ?? null;
  if (!organizacaoId) throw new Error('o admin da API não existe neste banco: API e smoke em bancos diferentes');

  // --- Usuário de teste só-TIM (responsável pelos parceiros; faz exportação e importação) ---
  const novo = await req('POST', '/usuarios', {
    ...t,
    corpo: { nome: `${MARCA} Só TIM`, email: EMAIL_TESTE, senha: SENHA_TEMPORARIA, perfil: 'SUPERVISOR' },
  });
  checar(novo.status === 201, 'cria usuário de teste (SUPERVISOR)', resumo(novo));
  const usuarioId = novo.dados.usuario?.id;
  if (!usuarioId) throw new Error('sem usuário de teste');
  criados.usuarios.add(usuarioId);
  const ops = await req('PUT', `/usuarios/${usuarioId}/operacoes`, { ...t, corpo: { TIM: 'EDICAO', STARLINK: 'SEM_ACESSO' } });
  checar(ops.status === 200, 'Starlink SEM_ACESSO para o usuário de teste', resumo(ops));
  const lidasOps = await req('GET', `/usuarios/${usuarioId}/operacoes`, t);
  // A API devolve o nível efetivo e omite SEM_ACESSO (a tela mostra "Sem acesso" para o que falta).
  checar(
    lidasOps.dados.operacoes?.TIM === 'EDICAO' && !('STARLINK' in (lidasOps.dados.operacoes ?? {})),
    'operações do usuário lidas de volta (Starlink omitida)',
    JSON.stringify(lidasOps.dados.operacoes),
  );
  // Usuário criado pelo ADMIN nasce com senha temporária: troca antes do login.
  const troca = await req('POST', '/auth/alterar-senha-inicial', { corpo: { email: EMAIL_TESTE, senhaAtual: SENHA_TEMPORARIA, novaSenha: SENHA_NOVA } });
  checar(troca.status === 204, 'usuário de teste troca a senha temporária', resumo(troca));
  const loginTeste = await req('POST', '/auth/login', { corpo: { email: EMAIL_TESTE, senha: SENHA_NOVA } });
  const tk = { token: loginTeste.dados.accessToken };
  if (!checar(Boolean(tk.token), 'login do usuário só-TIM', resumo(loginTeste))) throw new Error('sem login do usuário de teste');

  // --- Estrutura ------------------------------------------------------------
  const estTim = await req('GET', '/esteiras/tim/estrutura', t);
  const estSl = await req('GET', '/esteiras/starlink/estrutura', t);
  checar(estTim.status === 200 && estTim.dados.etapas?.length === 9, 'estrutura TIM com 9 etapas', resumo(estTim));
  checar(estSl.status === 200 && estSl.dados.etapas?.length === 11, 'estrutura Starlink com 11 etapas', resumo(estSl));
  checar(estTim.dados.podeForcar === true && estTim.dados.nivel === 'EDICAO', 'admin pode forçar e edita a TIM');

  // --- Mesmo CNPJ nas duas operações ----------------------------------------
  const cnpj = gerarCnpj();
  const parceiro = { nome: `${MARCA} Contato`, empresa: `${MARCA} Empresa`, cnpj, cidade: 'Goiânia', uf: 'GO', responsavelId: usuarioId };
  const cTim = await req('POST', '/esteiras/tim/vinculos', { ...t, corpo: parceiro });
  const vTim = cTim.dados.vinculo;
  anotarVinculo(vTim);
  checar(cTim.status === 201 && vTim?.etapa?.chave === 'TIM_NEGOCIACAO', 'cria parceiro na TIM (201, 1ª etapa)', resumo(cTim));
  if (vTim && !(await prisma.credenciamento.findFirst({ where: { id: vTim.id, organizacaoId }, select: { id: true } }))) {
    throw new Error('o vínculo criado pela API não está neste banco: API e smoke em bancos diferentes');
  }

  const cSl = await req('POST', '/esteiras/starlink/vinculos', { ...t, corpo: parceiro });
  const vSl = cSl.dados.vinculo;
  anotarVinculo(vSl);
  checar(cSl.status === 201, 'mesmo CNPJ na Starlink (201)', resumo(cSl));
  checar(
    Boolean(vTim && vSl && vSl.parceiro.contaId === vTim.parceiro.contaId),
    'Starlink reaproveita a mesma conta da TIM',
    `${vTim?.parceiro?.contaId} x ${vSl?.parceiro?.contaId}`,
  );

  const dup = await req('POST', '/esteiras/tim/vinculos', { ...t, corpo: parceiro });
  checar(dup.status === 409, 'repetir na TIM (409)', resumo(dup));
  if (!vTim || !vSl) throw new Error('sem os vínculos de base');

  // --- Movimento TIM: pulo de etapa -----------------------------------------
  const pulo = await req('POST', `/esteiras/tim/vinculos/${vTim.id}/mover`, { ...t, corpo: { paraChave: 'TIM_CRED_ANDAMENTO' } });
  checar(pulo.status === 409 && pulo.dados.error?.code === 'EXIGE_JUSTIFICATIVA', 'pular etapa sem justificativa (409 EXIGE_JUSTIFICATIVA)', resumo(pulo));
  const forcado = await req('POST', `/esteiras/tim/vinculos/${vTim.id}/mover`, {
    ...t,
    corpo: { paraChave: 'TIM_CRED_ANDAMENTO', justificativa: `${MARCA}: pulo autorizado` },
  });
  checar(forcado.status === 200 && forcado.dados.vinculo?.etapa?.chave === 'TIM_CRED_ANDAMENTO', 'pular etapa com justificativa como ADMIN (200)', resumo(forcado));
  const ultimo = forcado.dados.vinculo?.historico?.find((h) => h.para?.chave === 'TIM_CRED_ANDAMENTO');
  checar(ultimo?.tipo === 'EXCECAO', 'histórico do pulo é EXCECAO', `tipo ${ultimo?.tipo}`);

  // Voltar uma etapa: correção com justificativa (só confere que pede).
  const volta = await req('POST', `/esteiras/tim/vinculos/${vTim.id}/mover`, { ...t, corpo: { paraChave: 'TIM_DOCUMENTACAO' } });
  checar(volta.status === 409, 'voltar uma etapa pede justificativa (409)', resumo(volta));

  // --- Edição, nota, vendedor PDV -------------------------------------------
  const nota = await req('POST', `/esteiras/tim/vinculos/${vTim.id}/notas`, { ...t, corpo: { texto: `${MARCA} nota` } });
  checar(nota.status === 201 && nota.dados.vinculo?.notas?.length === 1, 'nota no vínculo TIM (201)', resumo(nota));
  const edicao = await req('PATCH', `/esteiras/tim/vinculos/${vTim.id}`, { ...t, corpo: { campos: { dep: 'BRADEL', flagTrafegoPago: true } } });
  checar(edicao.status === 200 && edicao.dados.vinculo?.campos?.dep === 'BRADEL', 'edita campos TIM (DEP)', resumo(edicao));
  checar((edicao.dados.vinculo?.auditoria?.length ?? 0) >= 2, 'auditoria campo a campo', `${edicao.dados.vinculo?.auditoria?.length} linha(s)`);
  const vendedor = await req('PUT', `/esteiras/tim/vinculos/${vTim.id}/vendedores`, { ...t, corpo: { nome: `${MARCA} Vendedor PDV` } });
  checar(vendedor.status === 200 && vendedor.dados.vinculo?.vendedores?.length === 1, 'vendedor PDV na TIM', resumo(vendedor));
  const vendSl = await req('PUT', `/esteiras/starlink/vinculos/${vSl.id}/vendedores`, { ...t, corpo: { nome: `${MARCA} Vendedor` } });
  checar(vendSl.status === 404, 'vendedor PDV não existe na Starlink (404)', resumo(vendSl));

  // --- Starlink: treinamento sem VSM ----------------------------------------
  const semVsm = await req('PATCH', `/esteiras/starlink/vinculos/${vSl.id}`, { ...t, corpo: { campos: { treinamento: true } } });
  checar(semVsm.status === 409 && semVsm.dados.error?.code === 'EXIGE_JUSTIFICATIVA', 'Starlink treinamento sem VSM (409)', resumo(semVsm));
  const contato = await req('PATCH', `/esteiras/starlink/vinculos/${vSl.id}`, { ...t, corpo: { campos: { primeiroContatoEm: new Date().toISOString() } } });
  checar(contato.status === 200 && contato.dados.vinculo?.etapa?.chave === 'SL_EM_ATENDIMENTO', 'Starlink: primeiro contato deriva Em atendimento', `${resumo(contato)} ${contato.dados.vinculo?.etapa?.chave}`);
  const moverForaDoFluxo = await req('POST', `/esteiras/starlink/vinculos/${vSl.id}/mover`, { ...t, corpo: { paraChave: 'TIM_DOCUMENTACAO' } });
  checar(moverForaDoFluxo.status === 400, 'mover Starlink para etapa da TIM (400)', resumo(moverForaDoFluxo));

  // --- Consultas (Kanban, coluna, Lista, Funil) ------------------------------
  const busca = `busca=${encodeURIComponent(MARCA)}`;
  const kanban = await req('GET', `/esteiras/tim/kanban?${busca}&porColuna=10`, t);
  const colAndamento = kanban.dados.colunas?.find((c) => c.chave === 'TIM_CRED_ANDAMENTO');
  checar(kanban.status === 200 && colAndamento?.total === 1 && colAndamento.itens[0]?.id === vTim.id, 'Kanban TIM: card na coluna certa', resumo(kanban));
  const coluna = await req('GET', `/esteiras/tim/kanban/coluna/TIM_CRED_ANDAMENTO?${busca}&porColuna=10`, t);
  checar(coluna.status === 200 && coluna.dados.itens?.length === 1, 'Kanban: página da coluna', resumo(coluna));
  const kanbanSl = await req('GET', `/esteiras/starlink/kanban?${busca}`, t);
  checar(kanbanSl.status === 200 && kanbanSl.dados.colunas?.find((c) => c.chave === 'SL_EM_ATENDIMENTO')?.total === 1, 'Kanban Starlink: card na etapa derivada', resumo(kanbanSl));

  const listaTim = await req('GET', `/esteiras/tim/lista?${busca}&ordenarPor=parceiro&direcao=desc&tamanho=25`, t);
  checar(listaTim.status === 200 && listaTim.dados.total === 1, 'Lista TIM filtrada e ordenada', resumo(listaTim));
  const filtrada = await req('GET', `/esteiras/tim/lista?${busca}&etapas=TIM_CRED_ANDAMENTO&dep=BRADEL&trafegoPago=true`, t);
  checar(filtrada.status === 200 && filtrada.dados.total === 1, 'Lista TIM com filtros específicos (etapa, DEP, tráfego)', resumo(filtrada));
  const porContato = await req('GET', `/esteiras/tim/lista?contatoId=${vTim.parceiro.contatoId}`, t);
  checar(porContato.status === 200 && porContato.dados.total === 1, 'Lista por contatoId (ficha do contato)', resumo(porContato));
  const porConta = await req('GET', `/esteiras/starlink/lista?contaId=${vTim.parceiro.contaId}`, t);
  checar(porConta.status === 200 && porConta.dados.total === 1, 'Lista por contaId (ficha da empresa)', resumo(porConta));

  const funil = await req('GET', `/esteiras/tim/funil?${busca}`, t);
  checar(funil.status === 200 && funil.dados.atual?.total === 1, 'Funil TIM', resumo(funil));
  const hoje = new Date().toISOString().slice(0, 10);
  const comparado = await req('GET', `/esteiras/tim/funil?${busca}&desde=2026-01-01&ate=${hoje}&compararDesde=2025-01-01&compararAte=2025-12-31`, t);
  checar(comparado.status === 200 && Boolean(comparado.dados.comparado), 'Funil TIM com comparação', resumo(comparado));
  const funilSl = await req('GET', `/esteiras/starlink/funil?${busca}`, t);
  checar(funilSl.status === 200, 'Funil Starlink', resumo(funilSl));

  // --- Ficha do contato/empresa: linha do tempo com a operação ---------------
  const linhaTempo = await req('GET', `/ficha/contato/${vTim.parceiro.contatoId}/timeline?tipos=CREDENCIAMENTO`, t);
  const eventos = linhaTempo.dados.eventos ?? [];
  checar(linhaTempo.status === 200 && eventos.length >= 3, 'linha do tempo da ficha traz a esteira', `${resumo(linhaTempo)}, ${eventos.length} evento(s)`);
  checar(
    eventos.some((e) => e.operacao === 'TIM') && eventos.some((e) => e.operacao === 'STARLINK'),
    'linha do tempo rotula TIM e Starlink',
    JSON.stringify(eventos.map((e) => e.operacao)),
  );
  const fichaConta = await req('GET', `/ficha/conta/${vTim.parceiro.contaId}/timeline?tipos=CREDENCIAMENTO`, t);
  checar(fichaConta.status === 200 && (fichaConta.dados.eventos?.length ?? 0) >= 3, 'linha do tempo da empresa', resumo(fichaConta));

  // --- Telas dependentes (API antiga mantida) --------------------------------
  for (const rota of ['/credenciamentos/funis', '/credenciamentos/painel', '/credenciamentos/gestao', '/credenciamentos/desempenho', '/credenciamentos/acompanhamentos']) {
    const r = await req('GET', rota, t);
    checar(r.status === 200, `GET ${rota}`, resumo(r));
  }

  // --- Preferências ---------------------------------------------------------
  const pref = await req('PUT', `/preferencias/${CHAVE_PREFERENCIA}`, { ...t, corpo: { valor: { visao: 'lista', colunas: ['parceiro'] } } });
  const lidas = await req('GET', `/preferencias?prefixo=${encodeURIComponent(CHAVE_PREFERENCIA)}`, t);
  checar(pref.status === 204 && lidas.dados.preferencias?.[CHAVE_PREFERENCIA]?.visao === 'lista', 'preferência gravada e lida', resumo(lidas));
  const prefRuim = await req('PUT', '/preferencias/esteira:VIVO:x', { ...t, corpo: { valor: 1 } });
  checar(prefRuim.status === 400, 'preferência com operação inválida (400)', resumo(prefRuim));
  const prefApagada = await req('DELETE', `/preferencias/${CHAVE_PREFERENCIA}`, t);
  checar(prefApagada.status === 204, 'preferência de teste apagada', resumo(prefApagada));

  // --- Configuração de etapa (restaurada no finally) -------------------------
  const etapaNeg = estTim.dados.etapas.find((e) => e.chave === 'TIM_NEGOCIACAO');
  etapaAlterada = { chave: 'TIM_NEGOCIACAO', diasParado: etapaNeg?.diasParado ?? null };
  const conf = await req('PATCH', '/esteiras/tim/etapas/TIM_NEGOCIACAO', { ...t, corpo: { diasParado: 12 } });
  checar(conf.status === 200, 'ADMIN configura dias parado da etapa', resumo(conf));
  const confSaida = await req('PATCH', '/esteiras/tim/etapas/TIM_DESISTENCIA', { ...t, corpo: { diasParado: 5 } });
  checar(confSaida.status === 400, 'etapa de saída não aceita dias parado (400)', resumo(confSaida));

  // --- Usuário só-TIM não enxerga a Starlink ---------------------------------
  const vSlOutro = await req('GET', `/esteiras/starlink/vinculos/${vSl.id}`, tk);
  checar(vSlOutro.status === 404, 'só-TIM: GET vínculo Starlink → 404', resumo(vSlOutro));
  const expSl = await req('GET', '/esteiras/starlink/exportar?formato=csv', tk);
  checar(expSl.status === 404, 'só-TIM: exportar Starlink → 404', resumo(expSl));
  const estSlOutro = await req('GET', '/esteiras/starlink/estrutura', tk);
  checar(estSlOutro.status === 404, 'só-TIM: estrutura Starlink → 404', resumo(estSlOutro));
  const vTimOutro = await req('GET', `/esteiras/tim/vinculos/${vTim.id}`, tk);
  checar(vTimOutro.status === 200, 'só-TIM: vínculo TIM da carteira → 200', resumo(vTimOutro));
  const timeline = await req('GET', `/ficha/contato/${vTim.parceiro.contatoId}/timeline?tipos=CREDENCIAMENTO`, tk);
  checar(
    timeline.status === 200 && !(timeline.dados.eventos ?? []).some((e) => e.operacao === 'STARLINK'),
    'só-TIM: a ficha não mostra eventos da Starlink',
    `${resumo(timeline)} ${JSON.stringify((timeline.dados.eventos ?? []).map((e) => e.operacao))}`,
  );

  // --- Exportação TIM filtrada (pelo usuário de teste) ------------------------
  const exp = await req('GET', `/esteiras/tim/exportar?formato=csv&${busca}&colunas=parceiro,cnpj,etapa,dep`, { ...tk, texto: true });
  const linhasCsv = (exp.texto ?? '').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  checar(exp.status === 200 && linhasCsv.length === 2, 'exportar TIM CSV filtrado: cabeçalho + 1 linha', `status ${exp.status}, ${linhasCsv.length} linha(s)`);
  checar(linhasCsv[0] === 'Parceiro;CNPJ;Etapa;DEP', 'cabeçalho da exportação', linhasCsv[0]);
  checar((linhasCsv[1] ?? '').includes(cnpj) && (linhasCsv[1] ?? '').includes(MARCA), 'linha exportada é o parceiro desta execução', linhasCsv[1]);
  const expXlsx = await req('GET', `/esteiras/tim/exportar?formato=xlsx&${busca}`, { ...tk, texto: true });
  checar(expXlsx.status === 200, 'exportar TIM XLSX filtrado', `status ${expXlsx.status}`);

  // --- Importação: a mesma planilha duas vezes (pelo usuário de teste) --------
  const cnpjA = gerarCnpj();
  const telB = gerarTelefone();
  const csv =
    '﻿Parceiro;CNPJ;Telefone;Cidade;UF;Etapa;DEP;Responsável\n' +
    `${MARCA} Import A;${cnpjA};;Anápolis;GO;Documentação;Bradel;${EMAIL_TESTE}\n` +
    `${MARCA} Import B;;${telB};Goiânia;GO;;;${EMAIL_TESTE}\n`;
  const enviar = (previa) => {
    const form = new FormData();
    form.append('arquivo', new Blob([csv], { type: 'text/csv' }), `smoke-esteiras-${EXECUCAO}.csv`);
    form.append('previa', previa ? 'true' : 'false');
    return req('POST', '/esteiras/tim/importar', { ...tk, form });
  };
  const resumoImp = (r) => `${resumo(r)} ${JSON.stringify({ c: r.dados.criadas, a: r.dados.atualizadas, e: r.dados.erros, av: r.dados.avisos })}`;
  const previa = await enviar(true);
  checar(previa.status === 200 && previa.dados.criadas === 2 && previa.dados.erros?.length === 0, 'prévia da importação: 2 a criar, sem erros', resumoImp(previa));
  const buscaImport = `busca=${encodeURIComponent(`${MARCA} Import`)}`;
  const naoGravou = await req('GET', `/esteiras/tim/lista?${buscaImport}`, t);
  checar(naoGravou.dados.total === 0, 'a prévia não grava nada', `total ${naoGravou.dados.total}`);

  const imp1 = await enviar(false);
  const importados1 = await req('GET', `/esteiras/tim/lista?${buscaImport}`, t);
  for (const l of importados1.dados.linhas ?? []) anotarVinculo(l);
  checar(imp1.status === 200 && imp1.dados.criadas === 2 && imp1.dados.atualizadas === 0, 'importação 1: cria 2', resumoImp(imp1));
  const imp2 = await enviar(false);
  checar(imp2.status === 200 && imp2.dados.criadas === 0 && imp2.dados.atualizadas === 2, 'importação 2: só atualiza', resumoImp(imp2));
  const importados = await req('GET', `/esteiras/tim/lista?${buscaImport}`, t);
  for (const l of importados.dados.linhas ?? []) anotarVinculo(l);
  checar(importados.dados.total === 2, 'sem duplicata depois das duas importações', `total ${importados.dados.total}`);
  const linhaA = importados.dados.linhas?.find((l) => l.parceiro.nome.endsWith('Import A'));
  checar(linhaA?.etapa?.chave === 'TIM_DOCUMENTACAO', 'importação aplicou a etapa da planilha', linhaA?.etapa?.chave);
  checar(linhaA?.responsavel?.id === usuarioId, 'importação aplicou o responsável pelo e-mail', JSON.stringify(linhaA?.responsavel));
  const detalheA = linhaA ? await req('GET', `/esteiras/tim/vinculos/${linhaA.id}`, t) : null;
  checar(
    detalheA?.dados.vinculo?.historico?.filter((h) => h.tipo === 'IMPORTACAO').length >= 1,
    'histórico da importação (IMPORTACAO)',
    JSON.stringify(detalheA?.dados.vinculo?.historico?.map((h) => h.tipo)),
  );
  const registros = await prisma.registroEsteira.count({ where: { organizacaoId, usuarioId } });
  checar(registros === 4, 'registros da esteira: 2 exportações + 2 importações (a prévia não registra)', `${registros}`);
} catch (erro) {
  falhas += 1;
  console.error('FALHOU roteiro interrompido:', erro instanceof Error ? erro.message : erro);
} finally {
  try {
    if (admin && etapaAlterada) {
      const r = await req('PATCH', `/esteiras/tim/etapas/${etapaAlterada.chave}`, { token: admin, corpo: { diasParado: etapaAlterada.diasParado } });
      checar(r.status === 200, 'configuração da etapa restaurada', resumo(r));
    }
    const removidos = await limpar(admin);
    console.log(`  (limpeza: ${JSON.stringify(removidos)})`);
    if (organizacaoId) {
      const daMarca = { organizacaoId, nome: { startsWith: MARCA } };
      const [contatos, contas, vinculos] = await Promise.all([
        prisma.contact.count({ where: daMarca }),
        prisma.account.count({ where: daMarca }),
        prisma.credenciamento.count({ where: { organizacaoId, contato: { nome: { startsWith: MARCA } } } }),
      ]);
      checar(contatos + contas + vinculos === 0, 'nada desta execução sobrou', `${contatos} contato(s), ${contas} conta(s), ${vinculos} vínculo(s)`);
    }
    // Nenhum usuário de smoke (desta ou de outra execução) pode sobrar.
    const usuariosSmoke = await prisma.user.count({ where: { email: { startsWith: 'smoke-esteiras-', endsWith: '@teste.local' } } });
    checar(usuariosSmoke === 0, 'nenhum usuário smoke-esteiras-*@teste.local sobrou', `${usuariosSmoke}`);
  } catch (erro) {
    falhas += 1;
    console.error('FALHOU limpeza:', erro instanceof Error ? erro.message : erro);
  }
  await prisma.$disconnect();
  console.log(`\n${ok} ok, ${falhas} falha(s)`);
  process.exitCode = falhas ? 1 : 0;
}
