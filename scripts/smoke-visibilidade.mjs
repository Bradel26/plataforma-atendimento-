/**
 * Escopo de visibilidade dentro de UMA organizacao.
 *
 * A suite irma do `smoke:tenant`, e a diferenca entre as duas e o ponto todo do
 * passo 1.2:
 *
 *   - `smoke:tenant` pergunta "a empresa A alcanca o dado da empresa B?" — e
 *     **fronteira**, aplicada pela extensao do Prisma;
 *   - esta pergunta "dentro da MESMA empresa, o vendedor alcanca a carteira do
 *     colega?" — e **escopo**, aplicado por politica de dominio.
 *
 * Uma organizacao propria, cinco usuarios (um por perfil), e registros com dono
 * conhecido. Depois: listagem, acesso por id, tentativa fora do escopo, equipe,
 * e registro sem responsavel.
 *
 * Tres comportamentos que a suite exige:
 *
 *  - registro fora do escopo responde **404** no acesso por id, nunca 403 —
 *    "proibido" contaria que o registro existe e de quem ele e;
 *  - rota de outro **processo** responde **403** — lead e oportunidade nao sao
 *    do AGENTE, e devolver lista vazia diria "nao ha leads", que e mentira;
 *  - `responsavelId = null` NAO abre nada para o AGENTE, mas abre para os perfis
 *    comerciais e de gestao. E a regra que impede uma base sem responsaveis
 *    atribuidos de ficar toda visivel para todo mundo.
 *
 * Pre-requisito: pilha de pe (npm run dev). Nao apaga nada.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const API = process.env.SMOKE_API ?? 'http://localhost:3333/api';
const EXECUCAO = Date.now().toString(36);
const SENHA = 'Visib@123';

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

/** Itens de uma listagem, seja qual for o nome que a rota da a colecao. */
const colecao = (dados) =>
  Array.isArray(dados) ? dados : (Object.values(dados ?? {}).find((v) => Array.isArray(v)) ?? []);

const contem = (dados, id) => colecao(dados).some((x) => x.id === id);

console.log(`\n== smoke:visibilidade (execucao ${EXECUCAO}) ==\n`);

/* ── montagem ──────────────────────────────────────────────────────────────── */

const org = await prisma.organizacao.create({
  data: { nome: `Visib ${EXECUCAO}`, slug: `visib-${EXECUCAO}`, ativa: true },
});

const senhaHash = await bcrypt.hash(SENHA, 10);

// A senha e cifrada aqui, e nao colada pronta: um hash escrito a mao no script
// nao da para verificar lendo, e a falha aparece como "login falhou".
const criarUsuario = (perfil, apelido = perfil.toLowerCase(), gestorId = null) =>
  prisma.user.create({
    data: {
      organizacaoId: org.id,
      nome: `${apelido} ${EXECUCAO}`,
      // O apelido entra no e-mail porque ha DOIS comerciais nesta suite (um da
      // equipe do gestor, um de fora), e o e-mail e unico por organizacao.
      email: `${apelido}-${EXECUCAO}@visib.local`,
      senhaHash,
      perfil,
      gestorId,
    },
  });

const admin = await criarUsuario('ADMIN');
const supervisor = await criarUsuario('SUPERVISOR');
const gestor = await criarUsuario('GESTOR');
// Subordinado direto do gestor: e o que faz "registro da equipe" existir.
const comercialDaEquipe = await criarUsuario('COMERCIAL', 'comercial-equipe', gestor.id);
// Comercial de fora da equipe: o contraponto que prova que gestor nao ve todos.
const comercialDeFora = await criarUsuario('COMERCIAL', 'comercial-fora');
const agente = await criarUsuario('AGENTE');

const fila = await prisma.queue.create({
  data: { organizacaoId: org.id, nome: `Fila ${EXECUCAO}`, canalPadrao: 'WEBCHAT', ativa: true },
});
// O agente atua na fila; o comercial nao. E o que separa "escopo operacional"
// de "carteira comercial".
await prisma.queueAgent.create({ data: { filaId: fila.id, usuarioId: agente.id } });

async function entrar(usuario) {
  const r = await req('POST', '/auth/login', {
    corpo: { email: usuario.email, senha: SENHA },
  });
  if (r.status !== 200) throw new Error(`login de ${usuario.perfil} falhou: HTTP ${r.status}`);
  return r.dados.accessToken;
}

const tk = {
  admin: await entrar(admin),
  supervisor: await entrar(supervisor),
  gestor: await entrar(gestor),
  equipe: await entrar(comercialDaEquipe),
  fora: await entrar(comercialDeFora),
  agente: await entrar(agente),
};

/* ── registros com dono conhecido ──────────────────────────────────────────── */

const conta = (nome, responsavelId) =>
  prisma.account.create({ data: { organizacaoId: org.id, nome: `${nome} ${EXECUCAO}`, responsavelId } });

const contaDaEquipe = await conta('Conta da equipe', comercialDaEquipe.id);
const contaDeFora = await conta('Conta de fora', comercialDeFora.id);
const contaSemDono = await conta('Conta sem dono', null);

const contato = (nome, responsavelId, contaId = null) =>
  prisma.contact.create({
    data: { organizacaoId: org.id, nome: `${nome} ${EXECUCAO}`, responsavelId, contaId },
  });

const contatoDaEquipe = await contato('Contato da equipe', comercialDaEquipe.id, contaDaEquipe.id);
const contatoDeFora = await contato('Contato de fora', comercialDeFora.id, contaDeFora.id);
const contatoSemDono = await contato('Contato sem dono', null);
// Contato sem dono COM conversa na fila do agente: o vinculo operacional.
const contatoDaConversa = await contato('Contato da conversa', null);

await prisma.conversation.create({
  data: {
    organizacaoId: org.id,
    contatoId: contatoDaConversa.id,
    filaId: fila.id,
    canal: 'WEBCHAT',
    status: 'EM_ESPERA',
  },
});

const funil = await prisma.funnel.create({
  data: {
    organizacaoId: org.id,
    nome: `Funil ${EXECUCAO}`,
    ativo: true,
    estagios: { create: [{ nome: 'Novo', ordem: 1, probabilidade: 10 }] },
  },
  include: { estagios: true },
});
const estagio = funil.estagios[0];

const oportunidade = (titulo, responsavelId, contaId) =>
  prisma.opportunity.create({
    data: {
      organizacaoId: org.id,
      titulo: `${titulo} ${EXECUCAO}`,
      contaId,
      funilId: funil.id,
      estagioId: estagio.id,
      valor: 1000,
      responsavelId,
    },
  });

const oportunidadeDaEquipe = await oportunidade('Op da equipe', comercialDaEquipe.id, contaDaEquipe.id);
const oportunidadeDeFora = await oportunidade('Op de fora', comercialDeFora.id, contaDeFora.id);

const protocoloDeFora = await prisma.ticket.create({
  data: {
    organizacaoId: org.id,
    titulo: `Protocolo de fora ${EXECUCAO}`,
    descricao: 'x',
    contatoId: contatoDeFora.id,
    responsavelId: comercialDeFora.id,
    numero: await proximoNumero(),
  },
});
const protocoloNaFila = await prisma.ticket.create({
  data: {
    organizacaoId: org.id,
    titulo: `Protocolo na fila ${EXECUCAO}`,
    descricao: 'x',
    contatoId: contatoSemDono.id,
    filaId: fila.id,
    responsavelId: null,
    numero: await proximoNumero(),
  },
});

async function proximoNumero() {
  const [linha] = await prisma.$queryRaw`
    UPDATE organizacoes SET proximo_protocolo = proximo_protocolo + 1
     WHERE id = ${org.id} RETURNING proximo_protocolo - 1 AS numero`;
  return Number(linha.numero);
}

const atividadeDeFora = await prisma.activity.create({
  data: {
    organizacaoId: org.id,
    tipo: 'NOTA',
    titulo: `Atividade de fora ${EXECUCAO}`,
    contatoId: contatoDeFora.id,
    responsavelId: comercialDeFora.id,
  },
});

console.log(`organizacao ${org.slug}, 6 usuarios, registros montados\n`);

/* ── 1. quem ve tudo ───────────────────────────────────────────────────────── */

for (const [nome, token] of [
  ['admin', tk.admin],
  ['supervisor', tk.supervisor],
]) {
  const contas = await req('GET', '/contas', { token });
  checar(
    contem(contas.dados, contaDaEquipe.id) && contem(contas.dados, contaDeFora.id),
    `${nome} ve as contas de todos`,
  );
  const ops = await req('GET', '/oportunidades', { token });
  checar(
    contem(ops.dados, oportunidadeDaEquipe.id) && contem(ops.dados, oportunidadeDeFora.id),
    `${nome} ve as oportunidades de todos`,
  );
}

/* ── 2. carteira: comercial ve a propria e a sem dono, nao a do colega ─────── */

const contasFora = await req('GET', '/contas', { token: tk.fora });
checar(contem(contasFora.dados, contaDeFora.id), 'comercial ve a propria conta');
checar(contem(contasFora.dados, contaSemDono.id), 'comercial ve conta sem responsavel (carteira aberta)');
checar(!contem(contasFora.dados, contaDaEquipe.id), 'comercial NAO ve a conta do colega');

const idDireto = await req('GET', `/contas/${contaDaEquipe.id}`, { token: tk.fora });
checar(idDireto.status === 404, 'conta do colega por id direto responde 404', `HTTP ${idDireto.status}`);
checar(idDireto.status !== 403, 'nao revela existencia com 403');

const opsFora = await req('GET', '/oportunidades', { token: tk.fora });
checar(contem(opsFora.dados, oportunidadeDeFora.id), 'comercial ve a propria oportunidade');
checar(!contem(opsFora.dados, oportunidadeDaEquipe.id), 'comercial NAO ve a oportunidade do colega');

const opDireta = await req('GET', `/oportunidades/${oportunidadeDaEquipe.id}`, { token: tk.fora });
checar(opDireta.status === 404, 'oportunidade do colega por id responde 404', `HTTP ${opDireta.status}`);

const patchCruzado = await req('PATCH', `/oportunidades/${oportunidadeDaEquipe.id}`, {
  token: tk.fora,
  corpo: { valor: 999 },
});
checar(patchCruzado.status === 404, 'escrita na oportunidade do colega responde 404', `HTTP ${patchCruzado.status}`);

/* ── 3. equipe: gestor ve a propria equipe, e so ela ───────────────────────── */

const contasGestor = await req('GET', '/contas', { token: tk.gestor });
checar(contem(contasGestor.dados, contaDaEquipe.id), 'gestor ve a conta da equipe direta');
checar(!contem(contasGestor.dados, contaDeFora.id), 'gestor NAO ve a conta de quem nao e da equipe');
checar(contem(contasGestor.dados, contaSemDono.id), 'gestor ve conta sem responsavel');

const opsGestor = await req('GET', '/oportunidades', { token: tk.gestor });
checar(contem(opsGestor.dados, oportunidadeDaEquipe.id), 'gestor ve a oportunidade da equipe');
checar(!contem(opsGestor.dados, oportunidadeDeFora.id), 'gestor NAO ve a oportunidade de fora da equipe');

const contaForaDoGestor = await req('GET', `/contas/${contaDeFora.id}`, { token: tk.gestor });
checar(contaForaDoGestor.status === 404, 'gestor: conta de fora da equipe responde 404', `HTTP ${contaForaDoGestor.status}`);

// RBAC, nao escopo: o GESTOR precisa dos indicadores para gerir, e antes do 1.2
// essas rotas eram ADMIN/SUPERVISOR.
const dashboardGestor = await req('GET', '/metricas/indicadores', { token: tk.gestor });
checar(dashboardGestor.status === 200, 'gestor acessa os indicadores', `HTTP ${dashboardGestor.status}`);

const monitoramentoGestor = await req('GET', '/metricas/agentes', { token: tk.gestor });
checar(monitoramentoGestor.status === 200, 'gestor acessa o monitoramento', `HTTP ${monitoramentoGestor.status}`);

// E o comercial nao: a matriz da a ele o CRM, nao os indicadores da operacao.
const indicadoresComercial = await req('GET', '/metricas/indicadores', { token: tk.fora });
checar(indicadoresComercial.status === 403, 'comercial NAO acessa os indicadores', `HTTP ${indicadoresComercial.status}`);

/* ── 4. agente: escopo operacional, nao carteira ───────────────────────────── */

const contatosAgente = await req('GET', '/contatos', { token: tk.agente });
checar(
  contem(contatosAgente.dados, contatoDaConversa.id),
  'agente ve contato sem dono COM conversa na fila dele',
);
checar(
  contem(contatosAgente.dados, contatoSemDono.id),
  'agente ve contato sem dono COM protocolo na fila dele',
);
checar(
  !contem(contatosAgente.dados, contatoDeFora.id),
  'agente NAO ve o contato da carteira do comercial',
);

// O caso central da decisao de produto: sem responsavel nao e "de todos".
const semVinculo = await contato('Contato solto', null);
const contatosDepois = await req('GET', '/contatos', { token: tk.agente });
checar(
  !contem(contatosDepois.dados, semVinculo.id),
  'agente NAO ve contato sem responsavel e sem vinculo operacional',
);
const soltoPorId = await req('GET', `/contatos/${semVinculo.id}`, { token: tk.agente });
checar(soltoPorId.status === 404, 'contato solto por id direto responde 404 para o agente', `HTTP ${soltoPorId.status}`);
// E o mesmo registro aparece para quem tem carteira aberta.
const soltoParaComercial = await req('GET', `/contatos/${semVinculo.id}`, { token: tk.fora });
checar(soltoParaComercial.status === 200, 'o mesmo contato solto aparece para o comercial', `HTTP ${soltoParaComercial.status}`);

const contasAgente = await req('GET', '/contas', { token: tk.agente });
checar(
  !contem(contasAgente.dados, contaSemDono.id),
  'agente NAO ganha conta sem dono por carteira aberta',
);
checar(
  contem(contasAgente.dados, contaDeFora.id) === false,
  'agente NAO ve a conta da carteira do comercial',
);

/* ── 5. processo comercial: 403 por perfil, nao lista vazia ────────────────── */

const leadsAgente = await req('GET', '/leads', { token: tk.agente });
checar(leadsAgente.status === 403, 'agente recebe 403 em leads (nao lista vazia)', `HTTP ${leadsAgente.status}`);

const opsAgente = await req('GET', '/oportunidades', { token: tk.agente });
checar(opsAgente.status === 403, 'agente recebe 403 na lista de oportunidades', `HTTP ${opsAgente.status}`);

const kanbanAgente = await req('GET', '/oportunidades/kanban', { token: tk.agente });
checar(kanbanAgente.status === 403, 'agente recebe 403 no kanban', `HTTP ${kanbanAgente.status}`);

const opPorIdAgente = await req('GET', `/oportunidades/${oportunidadeDaEquipe.id}`, { token: tk.agente });
checar(opPorIdAgente.status === 403, 'agente recebe 403 no detalhe da oportunidade', `HTTP ${opPorIdAgente.status}`);

/* ── 6. protocolos: sem responsavel segue a fila ───────────────────────────── */

const protocolosAgente = await req('GET', '/protocolos', { token: tk.agente });
checar(
  contem(protocolosAgente.dados, protocoloNaFila.id),
  'agente ve protocolo sem responsavel na fila dele',
);
checar(
  !contem(protocolosAgente.dados, protocoloDeFora.id),
  'agente NAO ve protocolo de responsavel alheio',
);
const protoDireto = await req('GET', `/protocolos/${protocoloDeFora.id}`, { token: tk.agente });
checar(protoDireto.status === 404, 'protocolo alheio por id responde 404', `HTTP ${protoDireto.status}`);

const protocolosComercial = await req('GET', '/protocolos', { token: tk.fora });
checar(
  !contem(protocolosComercial.dados, protocoloNaFila.id),
  'comercial NAO ganha protocolo sem dono por carteira (a regra e fila)',
);

/* ── 7. atividades: visibilidade derivada ──────────────────────────────────── */

const atividadesFora = await req('GET', '/atividades', { token: tk.fora });
checar(contem(atividadesFora.dados, atividadeDeFora.id), 'comercial ve a propria atividade');

const atividadesEquipe = await req('GET', '/atividades', { token: tk.equipe });
checar(
  !contem(atividadesEquipe.dados, atividadeDeFora.id),
  'comercial NAO ve atividade do colega',
);

const atividadesGestor = await req('GET', '/atividades', { token: tk.gestor });
checar(
  !contem(atividadesGestor.dados, atividadeDeFora.id),
  'gestor NAO ve atividade de fora da equipe',
);

const atividadeDireta = await req('POST', `/atividades/${atividadeDeFora.id}/concluir`, {
  token: tk.equipe,
  corpo: {},
});
checar(atividadeDireta.status === 404, 'concluir atividade do colega responde 404', `HTTP ${atividadeDireta.status}`);

/* ── 8. ficha: a porta de entrada tambem filtra ────────────────────────────── */

const fichaAlheia = await req('GET', `/ficha/contato/${contatoDeFora.id}`, { token: tk.agente });
checar(fichaAlheia.status === 404, 'ficha de contato fora do escopo responde 404', `HTTP ${fichaAlheia.status}`);

const fichaContaAlheia = await req('GET', `/ficha/conta/${contaDeFora.id}`, { token: tk.equipe });
checar(fichaContaAlheia.status === 404, 'ficha de conta do colega responde 404', `HTTP ${fichaContaAlheia.status}`);

/* ── 9. heranca do responsavel na criacao do contato ──────────────────────── */

const criado = await req('POST', '/contatos', {
  token: tk.fora,
  corpo: { nome: `Herdeiro ${EXECUCAO}`, contaId: contaDeFora.id },
});
checar(
  criado.status === 201 && criado.dados?.contato?.responsavelId === comercialDeFora.id,
  'contato criado numa conta herda o responsavel dela',
  `responsavelId=${criado.dados?.contato?.responsavelId}`,
);

const explicito = await req('POST', '/contatos', {
  token: tk.fora,
  corpo: { nome: `Sem dono ${EXECUCAO}`, contaId: contaDeFora.id, responsavelId: null },
});
checar(
  explicito.status === 201 && explicito.dados?.contato?.responsavelId === null,
  'responsavelId nulo explicito manda: nao herda',
  `responsavelId=${explicito.dados?.contato?.responsavelId}`,
);

// Trocar o responsavel da conta NAO propaga para os contatos existentes.
const trocado = await req('PATCH', `/contas/${contaDeFora.id}`, {
  token: tk.admin,
  corpo: { responsavelId: comercialDaEquipe.id },
});
const depoisDaTroca = await prisma.contact.findFirst({
  where: { id: criado.dados?.contato?.id },
  select: { responsavelId: true },
});
checar(
  trocado.status === 200 && depoisDaTroca?.responsavelId === comercialDeFora.id,
  'trocar o responsavel da conta NAO reatribui os contatos existentes',
  `contato segue com ${depoisDaTroca?.responsavelId === comercialDeFora.id ? 'o dono antigo' : 'outro dono'}`,
);

/* ── 10. escrita que referencia registro fora do escopo ────────────────────── */

/*
 * O furo classico, e o mesmo padrao que o smoke:tenant achou na atividade
 * durante a fundacao de organizacao: a listagem esconde, mas uma escrita que
 * **referencia** o registro por id o alcanca por outro caminho.
 *
 * Todos estes usam a credencial do comercial da equipe contra registros do
 * comercial de fora.
 *
 * Registros NOVOS, e nao os do inicio: a secao 9 troca o responsavel da
 * `contaDeFora` para o comercial da equipe, e a partir dali aquela conta e
 * legitimamente dele. A primeira versao desta secao reusava os registros
 * antigos e acusava dois falsos positivos — o teste estava errado, nao o codigo.
 */
const contaAlheia = await conta('Conta alheia', comercialDeFora.id);
const contatoAlheio = await contato('Contato alheio', comercialDeFora.id, contaAlheia.id);
const contatoProprio = await contato('Contato proprio', comercialDaEquipe.id, contaDaEquipe.id);

const vinculoCruzado = await req('POST', `/contas/${contaDaEquipe.id}/contatos`, {
  token: tk.equipe,
  corpo: { contatoId: contatoAlheio.id },
});
checar(
  vinculoCruzado.status === 404,
  'vincular contato de outra carteira ao proprio cliente responde 404',
  `HTTP ${vinculoCruzado.status}`,
);

const vinculoNaContaAlheia = await req('POST', `/contas/${contaAlheia.id}/contatos`, {
  token: tk.equipe,
  corpo: { contatoId: contatoProprio.id },
});
checar(
  vinculoNaContaAlheia.status === 404,
  'vincular o proprio contato ao cliente de outra carteira responde 404',
  `HTTP ${vinculoNaContaAlheia.status}`,
);

const leadCruzado = await req('POST', '/leads', {
  token: tk.equipe,
  corpo: { contatoId: contatoAlheio.id, tipo: 'INBOUND' },
});
checar(
  leadCruzado.status === 404,
  'abrir lead no contato de outra carteira responde 404',
  `HTTP ${leadCruzado.status}`,
);

const oportunidadeCruzada = await req('POST', '/oportunidades', {
  token: tk.equipe,
  corpo: { titulo: `Cruzada ${EXECUCAO}`, contaId: contaAlheia.id, valor: 100 },
});
checar(
  oportunidadeCruzada.status === 404,
  'abrir oportunidade no cliente de outra carteira responde 404',
  `HTTP ${oportunidadeCruzada.status}`,
);

const atividadeCruzada = await req('POST', '/atividades', {
  token: tk.equipe,
  corpo: { tipo: 'NOTA', titulo: `Cruzada ${EXECUCAO}`, contatoId: contatoAlheio.id },
});
checar(
  atividadeCruzada.status === 404,
  'pendurar atividade no contato de outra carteira responde 404',
  `HTTP ${atividadeCruzada.status}`,
);

const timelineAlheia = await req('GET', `/ficha/contato/${contatoAlheio.id}/timeline`, { token: tk.equipe });
checar(
  timelineAlheia.status === 404,
  'linha do tempo do contato de outra carteira responde 404',
  `HTTP ${timelineAlheia.status}`,
);

// E o contraponto: a mesma escrita no proprio registro funciona. Sem isto, um
// bug que recusasse TUDO passaria por "isolamento perfeito".
const atividadePropria = await req('POST', '/atividades', {
  token: tk.equipe,
  corpo: { tipo: 'NOTA', titulo: `Propria ${EXECUCAO}`, contatoId: contatoProprio.id },
});
checar(
  atividadePropria.status === 201,
  'a mesma escrita no proprio contato funciona',
  `HTTP ${atividadePropria.status}`,
);

/* ── 11. o escopo tem de ser CONFIGURAVEL ──────────────────────────────────── */

/*
 * A varredura de escrita por id expos duas lacunas de usabilidade, e nao de
 * seguranca: o PATCH de contato nao aceitava `responsavelId` (o campo nascia na
 * criacao e nunca mudava) e nada aceitava `gestorId` (a equipe do gestor so
 * existiria mexendo no banco). Escopo que nao da para configurar e escopo que
 * ninguem usa.
 */

const trocaResponsavel = await req('PATCH', `/contatos/${contatoSemDono.id}`, {
  token: tk.admin,
  corpo: { responsavelId: comercialDeFora.id },
});
checar(
  trocaResponsavel.status === 200 && trocaResponsavel.dados?.contato?.responsavelId === comercialDeFora.id,
  'da para trocar o responsavel do contato',
  `HTTP ${trocaResponsavel.status}`,
);

// E o contato passa a aparecer para o novo dono, e a sair da carteira aberta do
// agente — o efeito do campo, nao apenas a gravacao dele.
const paraNovoDono = await req('GET', `/contatos/${contatoSemDono.id}`, { token: tk.fora });
checar(paraNovoDono.status === 200, 'o contato aparece para o novo responsavel', `HTTP ${paraNovoDono.status}`);

const devolver = await req('PATCH', `/contatos/${contatoSemDono.id}`, {
  token: tk.admin,
  corpo: { responsavelId: null },
});
checar(
  devolver.status === 200 && devolver.dados?.contato?.responsavelId === null,
  'nulo devolve o contato para a carteira aberta',
);

const definirGestor = await req('PATCH', `/usuarios/${comercialDeFora.id}`, {
  token: tk.admin,
  corpo: { gestorId: gestor.id },
});
checar(definirGestor.status === 200, 'da para definir o gestor de um usuario', `HTTP ${definirGestor.status}`);

// Agora ele e da equipe: o gestor passa a ver a carteira dele.
const opsGestorDepois = await req('GET', '/oportunidades', { token: tk.gestor });
checar(
  contem(opsGestorDepois.dados, oportunidadeDeFora.id),
  'o gestor passa a ver a carteira de quem entrou na equipe dele',
);

const gestorDeSiMesmo = await req('PATCH', `/usuarios/${comercialDeFora.id}`, {
  token: tk.admin,
  corpo: { gestorId: comercialDeFora.id },
});
checar(
  gestorDeSiMesmo.status === 409,
  'usuario nao pode ser gestor de si mesmo',
  `HTTP ${gestorDeSiMesmo.status}`,
);

/* ── fim ───────────────────────────────────────────────────────────────────── */

console.log(`\n${ok} checagem(ns) ok, ${falhas} falha(s).`);
console.log(falhas ? 'Escopo COM FALHA.' : 'Escopo de visibilidade verificado.');
await prisma.$disconnect();
process.exit(falhas ? 1 : 0);
