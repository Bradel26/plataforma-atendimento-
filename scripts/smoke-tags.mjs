/**
 * Etiquetas de ponta a ponta: normalizacao, filtro, catalogo e gestao.
 *
 * O que so a API prova, e que nem o vitest nem o navegador cobrem:
 *
 * - que a normalizacao vale na **escrita e no filtro** ao mesmo tempo — a
 *   funcao pura testada no vitest nao garante que as duas pontas a chamam;
 * - que o catalogo respeita o escopo do 1.2, e nao e um distinct na tabela;
 * - que renomear FUNDE sem duplicar, e que remover nao sobra em lugar nenhum;
 * - que PATCH sem `tags` nao apaga as etiquetas que ja existem — o defeito mais
 *   caro possivel aqui, porque apaga trabalho de outra pessoa em silencio;
 * - que conversa entrou no MESMO vocabulario: renomear em contato e nao em
 *   conversa deixaria a base com as duas grafias, e o relatorio por assunto
 *   contaria a mesma coisa duas vezes com nomes diferentes.
 *
 * Cria a propria organizacao, como as outras suites: assim ela nao depende do
 * seed nem estraga a base de quem esta desenvolvendo.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const API = process.env.SMOKE_API ?? 'http://localhost:3333/api';
const EXECUCAO = Date.now().toString(36);
const SENHA = 'Tags@1234';

const prisma = new PrismaClient();

let ok = 0;
let falhas = 0;

const checar = (cond, titulo, extra = '') => {
  if (cond) {
    ok += 1;
    console.log(`ok     ${titulo}${extra ? ` — ${extra}` : ''}`);
  } else {
    falhas += 1;
    console.error(`FALHOU ${titulo}${extra ? ` — ${extra}` : ''}`);
  }
};

async function req(metodo, rota, { corpo, token } = {}) {
  const res = await fetch(`${API}${rota}`, {
    method: metodo,
    headers: {
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await res.text();
  let dados = null;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    dados = texto;
  }
  return { status: res.status, dados };
}

const colecao = (dados) =>
  Array.isArray(dados) ? dados : (Object.values(dados ?? {}).find((v) => Array.isArray(v)) ?? []);
const contem = (dados, id) => colecao(dados).some((x) => x.id === id);

console.log(`\n== smoke:tags (execucao ${EXECUCAO}) ==\n`);

/* ── montagem ──────────────────────────────────────────────────────────────── */

const org = await prisma.organizacao.create({
  data: { nome: `Tags ${EXECUCAO}`, slug: `tags-${EXECUCAO}`, ativa: true },
});
const senhaHash = await bcrypt.hash(SENHA, 10);

const criarUsuario = (perfil, apelido = perfil.toLowerCase()) =>
  prisma.user.create({
    data: {
      organizacaoId: org.id,
      nome: `${apelido} ${EXECUCAO}`,
      email: `${apelido}-${EXECUCAO}@tags.local`,
      senhaHash,
      perfil,
    },
  });

const admin = await criarUsuario('ADMIN');
const comercial = await criarUsuario('COMERCIAL');
const agente = await criarUsuario('AGENTE');

async function entrar(usuario) {
  const r = await req('POST', '/auth/login', { corpo: { email: usuario.email, senha: SENHA } });
  if (r.status !== 200) throw new Error(`login de ${usuario.email} falhou: HTTP ${r.status}`);
  return r.dados.accessToken;
}

const tk = {
  admin: await entrar(admin),
  comercial: await entrar(comercial),
  agente: await entrar(agente),
};

// Carteira do comercial: e o que da a ele acesso, e ao agente nao.
const conta = await prisma.account.create({
  data: { organizacaoId: org.id, nome: `Cliente ${EXECUCAO}`, responsavelId: comercial.id },
});
const contato = await prisma.contact.create({
  data: {
    organizacaoId: org.id,
    nome: `Pessoa ${EXECUCAO}`,
    canalOrigem: 'WEBCHAT',
    contaId: conta.id,
    responsavelId: comercial.id,
  },
});
// Um segundo contato SEM etiqueta, para o filtro ter o que excluir. Sem ele,
// "o filtro devolveu 1" nao distingue filtro que funciona de base com um item.
const semEtiqueta = await prisma.contact.create({
  data: { organizacaoId: org.id, nome: `Sem etiqueta ${EXECUCAO}`, canalOrigem: 'WEBCHAT', responsavelId: comercial.id },
});

/* ── 1. normalizacao na escrita ────────────────────────────────────────────── */

const gravado = await req('PATCH', `/contatos/${contato.id}`, {
  token: tk.admin,
  // Tudo o que a normalizacao trata, de uma vez: caixa, espaco nas pontas,
  // espaco interno duplicado e duplicata que difere so na caixa.
  corpo: { tags: ['  Revenda ', 'REVENDA', 'Cliente   Ouro', 'Açougue'] },
});
checar(
  gravado.status === 200 &&
    JSON.stringify(gravado.dados?.contato?.tags) ===
      JSON.stringify(['revenda', 'cliente ouro', 'açougue']),
  'escrita normaliza caixa, espaco e duplicata',
  JSON.stringify(gravado.dados?.contato?.tags),
);

const naConta = await req('PATCH', `/contas/${conta.id}`, {
  token: tk.admin,
  corpo: { tags: ['REVENDA', 'Supermercado'] },
});
checar(
  naConta.status === 200 && naConta.dados?.conta?.tags?.includes('revenda'),
  'cliente tem etiquetas proprias, normalizadas',
  JSON.stringify(naConta.dados?.conta?.tags),
);

/* ── 2. PATCH sem `tags` nao apaga as existentes ───────────────────────────── */

const outroCampo = await req('PATCH', `/contatos/${contato.id}`, {
  token: tk.admin,
  corpo: { telefone: '+5562988887777' },
});
checar(
  outroCampo.status === 200 && outroCampo.dados?.contato?.tags?.length === 3,
  'PATCH de outro campo NAO apaga as etiquetas',
  `${outroCampo.dados?.contato?.tags?.length} etiqueta(s)`,
);

// E lista vazia apaga de proposito — as duas coisas tem de ser distinguiveis.
const zerar = await req('PATCH', `/contatos/${semEtiqueta.id}`, {
  token: tk.admin,
  corpo: { tags: ['temporaria'] },
});
const apagar = await req('PATCH', `/contatos/${semEtiqueta.id}`, {
  token: tk.admin,
  corpo: { tags: [] },
});
checar(
  zerar.dados?.contato?.tags?.length === 1 && apagar.dados?.contato?.tags?.length === 0,
  'lista vazia apaga as etiquetas, ausente nao',
);

/* ── 3. filtro: semantica E, e normalizado igual a escrita ─────────────────── */

const porTag = await req('GET', '/contatos?tags=revenda', { token: tk.admin });
checar(
  contem(porTag.dados, contato.id) && !contem(porTag.dados, semEtiqueta.id),
  'filtro por etiqueta traz quem tem e exclui quem nao tem',
  `${colecao(porTag.dados).length} contato(s)`,
);

const caixaAlta = await req('GET', '/contatos?tags=REVENDA', { token: tk.admin });
checar(
  contem(caixaAlta.dados, contato.id),
  'filtro normaliza a entrada — ?tags=REVENDA acha o registro salvo em minusculas',
);

const duas = await req('GET', '/contatos?tags=revenda&tags=cliente%20ouro', { token: tk.admin });
checar(contem(duas.dados, contato.id), 'duas etiquetas que o registro tem: continua aparecendo');

const eNaoOu = await req('GET', '/contatos?tags=revenda&tags=inexistente', { token: tk.admin });
checar(
  !contem(eNaoOu.dados, contato.id) && colecao(eNaoOu.dados).length === 0,
  'semantica E: uma etiqueta que ele nao tem tira o registro do resultado',
  `${colecao(eNaoOu.dados).length} resultado(s)`,
);

const contasPorTag = await req('GET', '/contas?tags=supermercado', { token: tk.admin });
checar(contem(contasPorTag.dados, conta.id), 'filtro por etiqueta tambem na listagem de clientes');

/* ── 4. catalogo: contagem separada e escopo do 1.2 ───────────────────────── */

const catalogo = await req('GET', '/tags', { token: tk.admin });
const revenda = colecao(catalogo.dados).find((t) => t.tag === 'revenda');
checar(
  revenda?.contatos === 1 && revenda?.contas === 1 && revenda?.total === 2,
  'catalogo conta contato e cliente separadamente',
  JSON.stringify(revenda),
);

const comBusca = await req('GET', '/tags?busca=Reven', { token: tk.admin });
checar(
  colecao(comBusca.dados).some((t) => t.tag === 'revenda') &&
    !colecao(comBusca.dados).some((t) => t.tag === 'supermercado'),
  'busca no catalogo filtra por prefixo normalizado',
);

const doComercial = await req('GET', '/tags', { token: tk.comercial });
checar(
  colecao(doComercial.dados).some((t) => t.tag === 'revenda'),
  'o dono da carteira ve as etiquetas dela',
);

/*
 * O ponto central desta suite.
 *
 * O agente nao tem vinculo operacional nenhum com esses registros — nenhuma
 * conversa, nenhum protocolo. Se o catalogo fosse um distinct na tabela, ele
 * receberia o vocabulario comercial inteiro (segmento, campanha, concorrente)
 * sem acessar um unico registro que o contenha.
 */
const doAgente = await req('GET', '/tags', { token: tk.agente });
checar(
  colecao(doAgente.dados).length === 0,
  'agente sem vinculo operacional NAO ve etiqueta nenhuma',
  `${colecao(doAgente.dados).length} etiqueta(s)`,
);

/* -- 4b. etiqueta em conversa ---------------------------------------------- */

/*
 * Conversa entrou no mesmo vocabulario, e por isso entra na mesma suite.
 *
 * A fila e criada aqui, e o agente NAO e vinculado a ela de proposito: a
 * checagem de escopo da secao 4 depende de o agente nao ter vinculo operacional
 * nenhum, e po-lo na fila tornaria a conversa (e o contato dela) visiveis para
 * ele, quebrando o teste que importa mais nesta suite.
 */
const fila = await prisma.queue.create({
  data: { organizacaoId: org.id, nome: `Fila ${EXECUCAO}`, canalPadrao: 'WEBCHAT' },
});

const conversa = await prisma.conversation.create({
  data: { organizacaoId: org.id, contatoId: contato.id, filaId: fila.id, canal: 'WEBCHAT' },
});
// Uma segunda, SEM etiqueta, para o filtro ter o que excluir e para o relatorio
// ter fatia nao classificada. Sem ela, "cobertura de 100%" nao distingue
// relatorio certo de relatorio que ignora quem nao tem etiqueta.
const conversaSemTag = await prisma.conversation.create({
  data: { organizacaoId: org.id, contatoId: semEtiqueta.id, filaId: fila.id, canal: 'WEBCHAT' },
});
// Uma terceira, finalizada com tempos conhecidos, para o TMA do relatorio ter
// valor conferivel: 10 minutos entre atribuir e encerrar.
const conversaFechada = await prisma.conversation.create({
  data: {
    organizacaoId: org.id,
    contatoId: contato.id,
    filaId: fila.id,
    canal: 'WEBCHAT',
    status: 'FINALIZADO',
    atribuidoEm: new Date(Date.now() - 40 * 60 * 1000),
    finalizadoEm: new Date(Date.now() - 30 * 60 * 1000),
  },
});

const naConversa = await req('PUT', `/conversas/${conversa.id}/etiquetas`, {
  token: tk.admin,
  corpo: { tags: ['  Boleto ', 'BOLETO', 'Segunda   Via', 'revenda'] },
});
checar(
  naConversa.status === 200 &&
    JSON.stringify(naConversa.dados?.conversa?.tags) ===
      JSON.stringify(['boleto', 'segunda via', 'revenda']),
  'conversa normaliza caixa, espaco e duplicata igual a contato',
  JSON.stringify(naConversa.dados?.conversa?.tags),
);

// A diferenca deliberada em relacao a enviar mensagem: conversa finalizada
// RECUSA mensagem e ACEITA etiqueta, porque classificar acontece ao encerrar.
const emFinalizada = await req('PUT', `/conversas/${conversaFechada.id}/etiquetas`, {
  token: tk.admin,
  corpo: { tags: ['boleto'] },
});
checar(
  emFinalizada.status === 200 && emFinalizada.dados?.conversa?.tags?.includes('boleto'),
  'conversa FINALIZADA aceita etiqueta',
  `HTTP ${emFinalizada.status}`,
);

const conversaPorTag = await req('GET', '/conversas?tags=boleto', { token: tk.admin });
checar(
  contem(conversaPorTag.dados, conversa.id) && !contem(conversaPorTag.dados, conversaSemTag.id),
  'filtro por etiqueta na listagem de conversas',
  `${colecao(conversaPorTag.dados).length} conversa(s)`,
);

const conversaCaixaAlta = await req('GET', '/conversas?tags=BOLETO', { token: tk.admin });
checar(contem(conversaCaixaAlta.dados, conversa.id), 'filtro de conversa normaliza a entrada');

const conversaE = await req('GET', '/conversas?tags=boleto&tags=inexistente', { token: tk.admin });
checar(
  colecao(conversaE.dados).length === 0,
  'semantica E tambem em conversa',
  `${colecao(conversaE.dados).length} resultado(s)`,
);

// PUT e substituicao: mandar a mesma lista duas vezes tem de deixar a conversa
// igual, sem duplicar nada e sem reordenar.
const repetido = await req('PUT', `/conversas/${conversa.id}/etiquetas`, {
  token: tk.admin,
  corpo: { tags: ['boleto', 'segunda via', 'revenda'] },
});
checar(
  JSON.stringify(repetido.dados?.conversa?.tags) ===
    JSON.stringify(['boleto', 'segunda via', 'revenda']),
  'PUT com a mesma lista e idempotente',
  JSON.stringify(repetido.dados?.conversa?.tags),
);

const catalogoComConversa = await req('GET', '/tags', { token: tk.admin });
const linhaBoleto = colecao(catalogoComConversa.dados).find((t) => t.tag === 'boleto');
checar(
  linhaBoleto?.conversas === 2 && linhaBoleto?.contatos === 0 && linhaBoleto?.contas === 0,
  'catalogo conta conversa em coluna propria',
  JSON.stringify(linhaBoleto),
);

const linhaRevenda = colecao(catalogoComConversa.dados).find((t) => t.tag === 'revenda');
checar(
  linhaRevenda?.total === 3,
  'a mesma etiqueta soma contato, cliente e conversa no total',
  JSON.stringify(linhaRevenda),
);

/* -- 4c. relatorio por assunto --------------------------------------------- */

const relatorio = await req('GET', '/metricas/assuntos', { token: tk.admin });
const assuntoBoleto = colecao(relatorio.dados?.assuntos).find((a) => a.tag === 'boleto');
checar(
  relatorio.status === 200 && assuntoBoleto?.conversas === 2 && assuntoBoleto?.finalizadas === 1,
  'relatorio conta atendimentos e finalizadas por assunto',
  JSON.stringify(assuntoBoleto),
);

checar(
  // 600s entre atribuir e encerrar; a conversa em aberto nao entra na media.
  assuntoBoleto?.tmaSegundos === 600,
  'TMA por assunto sai da atribuicao ao encerramento',
  `${assuntoBoleto?.tmaSegundos}s`,
);

checar(
  relatorio.dados?.semEtiqueta >= 1 && relatorio.dados?.total >= 3,
  'relatorio declara a fatia sem etiqueta e o total do periodo',
  `${relatorio.dados?.semEtiqueta} de ${relatorio.dados?.total}`,
);

const relatorioAgente = await req('GET', '/metricas/assuntos', { token: tk.agente });
checar(
  relatorioAgente.status === 403,
  'agente nao acessa o relatorio por assunto — 403',
  `HTTP ${relatorioAgente.status}`,
);

/* -- 4d. limites da etiqueta de conversa ----------------------------------- */

const longaConversa = await req('PUT', `/conversas/${conversa.id}/etiquetas`, {
  token: tk.admin,
  corpo: { tags: ['y'.repeat(31)] },
});
checar(
  longaConversa.status === 400,
  'etiqueta de conversa acima de 30 caracteres e recusada',
  `HTTP ${longaConversa.status}`,
);

/* ── 5. gestao: quem pode, e o que a fusao faz ─────────────────────────────── */

const semPermissao = await req('PATCH', '/tags', {
  token: tk.comercial,
  corpo: { de: 'revenda', para: 'revendas' },
});
checar(semPermissao.status === 403, 'comercial nao renomeia etiqueta — 403', `HTTP ${semPermissao.status}`);

const doAgenteTambem = await req('DELETE', '/tags/revenda', { token: tk.agente });
checar(doAgenteTambem.status === 403, 'agente nao remove etiqueta — 403', `HTTP ${doAgenteTambem.status}`);

const renomear = await req('PATCH', '/tags', {
  token: tk.admin,
  // Caixa alta na entrada de proposito: a gestao normaliza igual ao resto.
  corpo: { de: 'REVENDA', para: 'revendas' },
});
checar(
  renomear.status === 200 &&
    renomear.dados?.contatos === 1 &&
    renomear.dados?.contas === 1 &&
    renomear.dados?.conversas === 1,
  'renomear alcanca contato, cliente E conversa',
  JSON.stringify(renomear.dados),
);

// O vocabulario e um so: a conversa tem de responder pelo nome novo tambem.
// Renomear em contato e nao em conversa deixaria a base com as duas grafias, e
// o relatorio por assunto contaria a mesma coisa duas vezes com nomes
// diferentes.
const conversaRenomeada = await req('GET', '/conversas?tags=revendas', { token: tk.admin });
checar(
  contem(conversaRenomeada.dados, conversa.id),
  'a conversa tambem responde pelo nome novo',
  `${colecao(conversaRenomeada.dados).length} conversa(s)`,
);

const depoisDoRename = await req('GET', `/contatos?tags=revendas`, { token: tk.admin });
checar(contem(depoisDoRename.dados, contato.id), 'o registro responde pelo nome novo');
const nomeAntigo = await req('GET', `/contatos?tags=revenda`, { token: tk.admin });
checar(
  !contem(nomeAntigo.dados, contato.id),
  'e nao responde mais pelo nome antigo',
  `${colecao(nomeAntigo.dados).length} resultado(s)`,
);

// Fusao: o cliente tem `revendas` E `supermercado`. Renomear uma para a outra
// nao pode deixar a etiqueta repetida no array.
const fundir = await req('PATCH', '/tags', {
  token: tk.admin,
  corpo: { de: 'revendas', para: 'supermercado' },
});
const contaDepois = await prisma.account.findUnique({ where: { id: conta.id }, select: { tags: true } });
checar(
  fundir.status === 200 &&
    contaDepois.tags.filter((t) => t === 'supermercado').length === 1,
  'fundir duas etiquetas nao duplica no registro',
  JSON.stringify(contaDepois.tags),
);

const mesmoNome = await req('PATCH', '/tags', {
  token: tk.admin,
  corpo: { de: 'supermercado', para: 'Supermercado' },
});
checar(
  mesmoNome.status === 400,
  'renomear para a mesma etiqueta (so mudando a caixa) e recusado',
  `HTTP ${mesmoNome.status}`,
);

const remover = await req('DELETE', '/tags/supermercado', { token: tk.admin });
const sobrou = await req('GET', '/contas?tags=supermercado', { token: tk.admin });
checar(
  remover.status === 200 && colecao(sobrou.dados).length === 0,
  'remover a etiqueta nao deixa registro respondendo por ela',
  JSON.stringify(remover.dados),
);

/* ── 6. limites ────────────────────────────────────────────────────────────── */

const longa = await req('PATCH', `/contatos/${contato.id}`, {
  token: tk.admin,
  corpo: { tags: ['x'.repeat(31)] },
});
checar(longa.status === 400, 'etiqueta acima de 30 caracteres e recusada', `HTTP ${longa.status}`);

const demais = await req('PATCH', `/contatos/${contato.id}`, {
  token: tk.admin,
  corpo: { tags: Array.from({ length: 21 }, (_, i) => `tag ${i}`) },
});
checar(demais.status === 400, 'mais de 20 etiquetas por registro e recusado', `HTTP ${demais.status}`);

/* ── fim ───────────────────────────────────────────────────────────────────── */

console.log(`\n${ok} checagem(ns) ok, ${falhas} falha(s).`);
console.log(falhas ? 'Etiquetas COM FALHA.' : 'Etiquetas verificadas.');
await prisma.$disconnect();
if (falhas > 0) process.exit(1);
