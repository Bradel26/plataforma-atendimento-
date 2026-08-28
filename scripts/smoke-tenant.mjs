/**
 * Isolamento entre organizacoes: a suite que TENTA atravessar e passa quando nao consegue.
 *
 * Cria duas organizacoes de verdade, com usuario, contato, conversa, funil,
 * oportunidade, protocolo e canal proprios, e depois usa a credencial de uma para
 * pedir os dados da outra por todos os caminhos que existem: listagem, id direto,
 * escrita cruzada, arquivo assinado, token de integracao e Socket.IO.
 *
 * Duas escolhas de comportamento que a suite exige e vale explicar:
 *
 *  - Recurso de outra organizacao responde **404, nao 403**. "Proibido" confirma
 *    que o registro existe, e a existencia de um cliente ja e informacao que nao
 *    pertence a quem perguntou.
 *  - Ausencia de contexto **lanca**. O modo de falha classico de multi-tenancy e o
 *    filtro que, sem valor, vira "sem filtro" e devolve a base inteira.
 *
 * Pre-requisito: pilha de pe (npm run dev). Nao apaga nada: as organizacoes de
 * teste ficam no banco com slug `smoke-a-<execucao>`, e o censo continua batendo.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { io as socketCliente } from 'socket.io-client';

const API = process.env.SMOKE_API ?? 'http://localhost:3333/api';
const EXECUCAO = Date.now().toString(36);

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

async function req(metodo, rota, { corpo, token, base = API } = {}) {
  const res = await fetch(`${base}${rota}`, {
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

/* ── Montagem: duas organizacoes completas ─────────────────────────────────── */

const SENHA = 'Smoke@Tenant1';
// O hash e gerado aqui, e nao escrito como constante: hash de bcrypt colado a
// mao nao pode ser conferido por leitura, e um valor errado aparece como "o
// login falhou" — que manda quem le procurar defeito no isolamento.
const senhaHash = await bcrypt.hash(SENHA, 10);

async function montarOrganizacao(letra) {
  const slug = `smoke-${letra}-${EXECUCAO}`;
  const org = await prisma.organizacao.create({ data: { nome: `Smoke ${letra.toUpperCase()}`, slug } });
  const id = org.id;

  const usuario = await prisma.user.create({
    data: {
      organizacaoId: id,
      nome: `Admin ${letra.toUpperCase()}`,
      email: `admin@${slug}.local`,
      senhaHash,
      perfil: 'ADMIN',
      ativo: true,
    },
  });

  const fila = await prisma.queue.create({
    data: { organizacaoId: id, nome: `Fila ${letra.toUpperCase()} ${EXECUCAO}`, canalPadrao: 'WEBCHAT', ativa: true },
  });

  const contato = await prisma.contact.create({
    data: { organizacaoId: id, nome: `Contato ${letra.toUpperCase()}`, telefone: `+5562900${letra === 'a' ? '1' : '2'}0000`, canalOrigem: 'WEBCHAT' },
  });

  const conversa = await prisma.conversation.create({
    data: { organizacaoId: id, canal: 'WEBCHAT', status: 'EM_ESPERA', contatoId: contato.id, filaId: fila.id },
  });

  const conta = await prisma.account.create({
    data: { organizacaoId: id, nome: `Conta ${letra.toUpperCase()} ${EXECUCAO}` },
  });

  const funil = await prisma.funnel.create({
    data: { organizacaoId: id, nome: `Funil ${letra.toUpperCase()} ${EXECUCAO}` },
  });
  const estagio = await prisma.funnelStage.create({
    data: { funilId: funil.id, nome: 'Lead', ordem: 1, probabilidade: 10 },
  });
  const oportunidade = await prisma.opportunity.create({
    data: {
      organizacaoId: id,
      titulo: `Oportunidade ${letra.toUpperCase()}`,
      contaId: conta.id,
      funilId: funil.id,
      estagioId: estagio.id,
      valor: 1000,
    },
  });

  const protocolo = await prisma.ticket.create({
    data: {
      organizacaoId: id,
      titulo: `Protocolo ${letra.toUpperCase()}`,
      descricao: 'Criado pelo smoke de isolamento.',
      contatoId: contato.id,
      filaId: fila.id,
      status: 'ABERTO',
      prioridade: 'NORMAL',
      numero: letra === 'a' ? 900001 : 900002,
    },
  });

  // Numero explicito nao passa pelo contador da organizacao, entao ele fica
  // atras da numeracao em uso e o `censo:tenant` — com razao — acusa contador
  // atrasado. Alinhar aqui mantem o censo util como diagnostico: o que ele
  // aponta depois disso e problema de verdade, nao residuo de smoke.
  await prisma.$executeRawUnsafe(
    `UPDATE "organizacoes" SET "proximo_protocolo" = $2 WHERE "id" = $1`,
    id,
    protocolo.numero + 1,
  );

  return { id, slug, usuario, fila, contato, conversa, conta, funil, estagio, oportunidade, protocolo };
}

console.log(`\n== smoke:tenant (execucao ${EXECUCAO}) ==\n`);

const A = await montarOrganizacao('a');
const B = await montarOrganizacao('b');
console.log(`organizacao A: ${A.slug}\norganizacao B: ${B.slug}\n`);

/* ── 1. login: cada um entra na propria organizacao ────────────────────────── */

async function entrar(email) {
  const r = await req('POST', '/auth/login', { corpo: { email, senha: SENHA } });
  return r.status === 200 ? r.dados.accessToken : null;
}

const tokenA = await entrar(A.usuario.email);
const tokenB = await entrar(B.usuario.email);
checar(Boolean(tokenA), 'usuario da organizacao A entra');
checar(Boolean(tokenB), 'usuario da organizacao B entra');

if (!tokenA || !tokenB) {
  console.error('\nsem sessao nas duas organizacoes nao ha o que testar.');
  await prisma.$disconnect();
  process.exit(1);
}

/* ── 2. listagem: cada um ve so o proprio ──────────────────────────────────── */

const listas = [
  ['/contatos', 'contatos', (d) => d.contatos ?? d.itens ?? []],
  ['/conversas', 'conversas', (d) => d.conversas ?? d.itens ?? []],
  ['/contas', 'contas', (d) => d.contas ?? d.itens ?? []],
  ['/oportunidades', 'oportunidades', (d) => d.oportunidades ?? d.itens ?? []],
  ['/protocolos', 'protocolos', (d) => d.protocolos ?? d.itens ?? []],
  ['/filas', 'filas', (d) => d.filas ?? d.itens ?? []],
  ['/usuarios', 'usuarios', (d) => d.usuarios ?? d.itens ?? []],
  ['/funis', 'funis', (d) => d.funis ?? d.itens ?? []],
];

for (const [rota, nome, extrair] of listas) {
  const r = await req('GET', rota, { token: tokenB });
  const itens = r.status === 200 ? extrair(r.dados) : null;
  if (!Array.isArray(itens)) {
    checar(false, `listagem de ${nome} respondeu`, `HTTP ${r.status}`);
    continue;
  }
  // Conferencia por identificador, e nao por contagem: contagem igual por
  // coincidencia passaria por um filtro quebrado.
  const idsDeA = new Set(
    [A.contato.id, A.conversa.id, A.conta.id, A.oportunidade.id, A.protocolo.id, A.fila.id, A.usuario.id, A.funil.id],
  );
  const vazou = itens.filter((i) => idsDeA.has(i.id));
  checar(vazou.length === 0, `B nao ve ${nome} de A`, `${itens.length} item(ns) proprios`);
}

/* ── 3. acesso direto por id: 404, nunca 403 ───────────────────────────────── */

const diretos = [
  [`/contatos/${A.contato.id}`, 'contato'],
  [`/conversas/${A.conversa.id}`, 'conversa'],
  [`/contas/${A.conta.id}`, 'conta'],
  [`/oportunidades/${A.oportunidade.id}`, 'oportunidade'],
  [`/protocolos/${A.protocolo.id}`, 'protocolo'],
  [`/ficha/contato/${A.contato.id}`, 'ficha do contato'],
  // A ficha da conta entrou na lista quando `/clientes/:id` ganhou endereco
  // proprio: e a segunda chamada que a tela faz, e um 200 aqui abriria os
  // indicadores da empresa de outra organizacao mesmo com o restante fechado.
  [`/ficha/conta/${A.conta.id}`, 'ficha da conta'],
];

for (const [rota, nome] of diretos) {
  const r = await req('GET', rota, { token: tokenB });
  checar(r.status === 404, `id direto do ${nome} de A responde 404 para B`, `HTTP ${r.status}`);
  checar(r.status !== 403, `${nome}: nao revela existencia com 403`);
}

/* ── 4. escrita cruzada ────────────────────────────────────────────────────── */

const escritas = [
  ['PATCH', `/contatos/${A.contato.id}`, { nome: 'Invadido' }, 'renomear contato de A'],
  ['POST', `/conversas/${A.conversa.id}/mensagens`, { conteudo: 'invasao' }, 'mandar mensagem na conversa de A'],
  ['PATCH', `/oportunidades/${A.oportunidade.id}`, { valor: 1 }, 'mudar valor da oportunidade de A'],
  ['POST', '/atividades', { tipo: 'NOTA', titulo: 'cruzada', contatoId: A.contato.id }, 'criar atividade apontando para contato de A'],
];

for (const [metodo, rota, corpo, nome] of escritas) {
  const r = await req(metodo, rota, { corpo, token: tokenB });
  checar(r.status >= 400, `recusa ${nome}`, `HTTP ${r.status}`);
  checar(r.status !== 200 && r.status !== 201, `${nome}: nao gravou`);
}

// E o registro de A continua intacto depois das tentativas.
const contatoDepois = await prisma.contact.findUnique({ where: { id: A.contato.id } });
checar(contatoDepois?.nome === 'Contato A', 'contato de A intacto depois das tentativas', contatoDepois?.nome);

/* ── 5. token de integracao preso a organizacao ────────────────────────────── */

const criado = await req('POST', '/integracoes/tokens', {
  corpo: { nome: `smoke-tenant-${EXECUCAO}` },
  token: tokenA,
});
const tokenIaDeA = criado.status === 201 ? criado.dados.valor : null;
checar(Boolean(tokenIaDeA), 'token de integracao criado na organizacao A', `HTTP ${criado.status}`);

if (tokenIaDeA) {
  const ping = await req('GET', '/bots/ia/ping', { token: tokenIaDeA });
  checar(ping.status === 200, 'token de A funciona na organizacao A', `HTTP ${ping.status}`);

  // O token de A tentando falar com o contato de B: nao existe rota que aceite,
  // porque a organizacao vem do proprio token e nao de parametro.
  const cruzado = await req('POST', '/bots/ia/mensagens', {
    corpo: { canalId: 'WEBCHAT', contatoId: B.contato.id, texto: 'invasao' },
    token: tokenIaDeA,
  });
  checar(
    cruzado.status === 404 || cruzado.status === 409,
    'token de integracao de A nao entrega para contato de B',
    `HTTP ${cruzado.status} ${cruzado.dados?.error?.code ?? ''}`,
  );

  const listaB = await req('GET', '/integracoes/tokens', { token: tokenB });
  const viuTokenDeA =
    listaB.status === 200 && (listaB.dados.tokens ?? []).some((t) => t.nome === `smoke-tenant-${EXECUCAO}`);
  checar(!viuTokenDeA, 'B nao ve os tokens de integracao de A');
}

/* ── 6. unicidades por organizacao ─────────────────────────────────────────── */

// Mesmo nome de fila nas duas: com unicidade global isto era impossivel.
const nomeRepetido = `Comercial ${EXECUCAO}`;
const filaA = await prisma.queue.create({ data: { organizacaoId: A.id, nome: nomeRepetido, canalPadrao: 'WEBCHAT' } });
let filaBOk = false;
try {
  await prisma.queue.create({ data: { organizacaoId: B.id, nome: nomeRepetido, canalPadrao: 'WEBCHAT' } });
  filaBOk = true;
} catch (err) {
  filaBOk = false;
  console.error(`  (detalhe) ${err.message.split('\n').at(-1)}`);
}
checar(filaBOk, 'duas organizacoes podem ter fila com o mesmo nome');
checar(Boolean(filaA), 'fila de A criada');

// Mesmo e-mail nas duas: a mesma pessoa pode existir em duas organizacoes.
const emailRepetido = `pessoa-${EXECUCAO}@exemplo.com`;
await prisma.user.create({
  data: { organizacaoId: A.id, nome: 'Pessoa', email: emailRepetido, senhaHash, perfil: 'AGENTE' },
});
let emailBOk = false;
try {
  await prisma.user.create({
    data: { organizacaoId: B.id, nome: 'Pessoa', email: emailRepetido, senhaHash, perfil: 'AGENTE' },
  });
  emailBOk = true;
} catch {
  emailBOk = false;
}
checar(emailBOk, 'o mesmo e-mail pode existir em duas organizacoes');

// Canal: cada organizacao com o seu WhatsApp.
let canaisIndependentes = false;
try {
  await prisma.channelConfig.create({
    data: { organizacaoId: A.id, canal: 'WHATSAPP', ativo: false, phoneNumberId: `fone-a-${EXECUCAO}` },
  });
  await prisma.channelConfig.create({
    data: { organizacaoId: B.id, canal: 'WHATSAPP', ativo: false, phoneNumberId: `fone-b-${EXECUCAO}` },
  });
  canaisIndependentes = true;
} catch (err) {
  console.error(`  (detalhe) ${err.message.split('\n').at(-1)}`);
}
checar(canaisIndependentes, 'cada organizacao tem o proprio canal de WhatsApp');

// Protocolo: numeracao propria, e o numero de uma nao consome o da outra.
const numeroRepetido = 777001;
let numerosIndependentes = false;
try {
  await prisma.ticket.create({
    data: {
      organizacaoId: A.id,
      titulo: 'n',
      descricao: 'n',
      contatoId: A.contato.id,
      filaId: A.fila.id,
      numero: numeroRepetido,
    },
  });
  await prisma.ticket.create({
    data: {
      organizacaoId: B.id,
      titulo: 'n',
      descricao: 'n',
      contatoId: B.contato.id,
      filaId: B.fila.id,
      numero: numeroRepetido,
    },
  });
  numerosIndependentes = true;
} catch (err) {
  console.error(`  (detalhe) ${err.message.split('\n').at(-1)}`);
}
checar(numerosIndependentes, 'o mesmo numero de protocolo existe nas duas organizacoes');

/* ── 7. Socket.IO: evento de uma nao chega na outra ────────────────────────── */

const ORIGEM_WS = API.replace(/\/api$/, '');

function conectar(token) {
  return new Promise((resolve, reject) => {
    const s = socketCliente(ORIGEM_WS, { auth: { token }, transports: ['websocket'], reconnection: false });
    const prazo = setTimeout(() => reject(new Error('timeout na conexao')), 8000);
    s.on('connect', () => {
      clearTimeout(prazo);
      resolve(s);
    });
    s.on('connect_error', (e) => {
      clearTimeout(prazo);
      reject(e);
    });
  });
}

try {
  const socketA = await conectar(tokenA);
  const socketB = await conectar(tokenB);

  const recebidosB = [];
  socketB.onAny((evento, payload) => recebidosB.push({ evento, payload }));
  const recebidosA = [];
  socketA.onAny((evento, payload) => recebidosA.push({ evento, payload }));

  // A manda mensagem na propria conversa: A ouve, B nao pode ouvir.
  await req('POST', `/conversas/${A.conversa.id}/assumir`, { token: tokenA });
  await req('POST', `/conversas/${A.conversa.id}/mensagens`, {
    corpo: { conteudo: `evento-${EXECUCAO}` },
    token: tokenA,
  });
  await new Promise((r) => setTimeout(r, 1500));

  const vazouParaB = recebidosB.some((e) => JSON.stringify(e.payload ?? '').includes(A.conversa.id));
  checar(!vazouParaB, 'evento em tempo real de A NAO chega no supervisor de B', `${recebidosB.length} evento(s) em B`);
  checar(recebidosA.length > 0, 'o proprio A recebe o evento (a sala funciona)', `${recebidosA.length} evento(s)`);

  socketA.close();
  socketB.close();
} catch (err) {
  checar(false, 'conexao Socket.IO nas duas organizacoes', err.message);
}

/* ── 8. arquivo: link assinado de A nao serve com sessao de B ──────────────── */

// O anexo e criado pela API de A, e nao no banco: e o caminho real, e e ele que
// gera a chave com o prefixo da organizacao.
const anexado = await fetch(`${API}/protocolos/${A.protocolo.id}/anexos`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${tokenA}` },
  body: (() => {
    const fd = new FormData();
    fd.append('arquivo', new Blob(['conteudo do smoke de isolamento'], { type: 'text/plain' }), 'nota.txt');
    return fd;
  })(),
});
const corpoAnexo = await anexado.json().catch(() => null);
const urlAnexo = corpoAnexo?.protocolo?.anexos?.at(-1)?.url ?? null;
checar(Boolean(urlAnexo), 'anexo criado na organizacao A', `HTTP ${anexado.status}`);

if (urlAnexo) {
  const raiz = API.replace(/\/api$/, '');
  // A chave tem de comecar pela organizacao: e o prefixo que da fronteira ao
  // armazenamento. Sem ele, um link valido servia venha de onde viesse.
  checar(urlAnexo.includes(A.id), 'a chave do arquivo carrega a organizacao', urlAnexo.slice(0, 60));

  const comA = await fetch(`${raiz}${urlAnexo}`, { headers: { Authorization: `Bearer ${tokenA}` } });
  checar(comA.status === 200, 'A le o proprio arquivo', `HTTP ${comA.status}`);

  const comB = await fetch(`${raiz}${urlAnexo}`, { headers: { Authorization: `Bearer ${tokenB}` } });
  checar(comB.status === 404, 'link assinado de A responde 404 com sessao de B', `HTTP ${comB.status}`);

  // Trocar o prefixo para a organizacao de B quebra a assinatura, que cobre a
  // chave inteira: o link nao pode ser "reescrito" para virar link de outra.
  const forjado = urlAnexo.replace(A.id, B.id);
  const comForja = await fetch(`${raiz}${forjado}`, { headers: { Authorization: `Bearer ${tokenB}` } });
  checar(
    comForja.status === 401 || comForja.status === 404,
    'reescrever a organizacao na URL nao abre o arquivo',
    `HTTP ${comForja.status}`,
  );
}

/* ── 9. ausencia de contexto ───────────────────────────────────────────────── */

// Coberto por `apps/api/src/lib/tenant.contexto.test.ts`, no vitest: e
// comportamento de biblioteca, e provar que uma funcao lanca nao precisa de HTTP
// nem de banco — precisaria apenas de mais motivos para falhar por outra razao.
console.log('nota   "sem contexto lanca" e verificado no vitest (tenant.contexto.test.ts, 9 casos)');

/* ── Resumo ────────────────────────────────────────────────────────────────── */

await prisma.$disconnect();

console.log(`\n${ok} checagem(ns) ok, ${falhas} falha(s).`);
if (falhas > 0) {
  console.error('\nISOLAMENTO COM FURO. Nao seguir para a Fase 1 antes de fechar.');
  process.exit(1);
}
console.log('Isolamento verificado.');
