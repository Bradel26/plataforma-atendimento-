/**
 * Smoke test da exportacao/importacao CSV completada no item 6.3.
 *
 * Ja existia: exportar leads/contatos/oportunidades/protocolos/conversas, e
 * importar so leads. Este roteiro cobre o que foi acrescentado: exportar
 * contas, e importar contatos, contas e oportunidades — com dryRun, erro por
 * linha que nao aborta o resto, e deduplicacao.
 *
 * Uso: npm run smoke:dados  (com a API de pe e o seed aplicado)
 */
const API = 'http://localhost:3333/api';
const EXECUCAO = Date.now().toString(36);

let falhas = 0;
const checar = (cond, titulo, extra = '') => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok    ' : 'FALHOU'} ${titulo}${extra ? ` — ${extra}` : ''}`);
};

async function req(metodo, rota, { corpo, token, texto, bytes } = {}) {
  const resp = await fetch(API + rota, {
    method: metodo,
    headers: {
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  // `Response.text()` decodifica como UTF-8 e o TextDecoder da spec DESCARTA o
  // BOM ao decodificar — checar BOM exige o byte cru, nao a string.
  if (bytes) return { status: resp.status, bytes: Buffer.from(await resp.arrayBuffer()) };
  if (texto) return { status: resp.status, texto: await resp.text() };
  return { status: resp.status, dados: await resp.json().catch(() => ({})) };
}

const BOM_BYTES = Buffer.from([0xef, 0xbb, 0xbf]);

const entrar = async (email, senha) =>
  (await req('POST', '/auth/login', { corpo: { email, senha } })).dados.accessToken;

const admin = await entrar('admin@plataforma.local', 'Admin@123');
checar(Boolean(admin), 'login do admin');
if (!admin) process.exit(1);
const t = { token: admin };

/* ── exportacao de contas ─────────────────────────────────────────────── */

const contaBase = (
  await req('POST', '/contas', { ...t, corpo: { nome: `Exportar CSV ${EXECUCAO}` } })
).dados.conta;
checar(Boolean(contaBase?.id), 'conta de apoio criada');

const exportacao = await req('GET', '/dados/exportar/contas.csv', { ...t, bytes: true });
checar(exportacao.status === 200, 'exportacao de contas responde 200', `status ${exportacao.status}`);
checar(exportacao.bytes.subarray(0, 3).equals(BOM_BYTES), 'exportacao de contas vem com BOM (bytes crus)');
checar(exportacao.bytes.toString('utf8').includes(contaBase.nome), 'exportacao de contas traz a conta criada');

const exportacaoRuim = await req('GET', '/dados/exportar/naoexiste.csv', t);
checar(exportacaoRuim.status === 404, 'exportacao de recurso inexistente da 404', `status ${exportacaoRuim.status}`);

/* ── modelos de importacao ────────────────────────────────────────────── */

for (const recurso of ['contatos', 'contas', 'oportunidades']) {
  const modelo = await req('GET', `/dados/modelos/${recurso}.csv`, { ...t, bytes: true });
  checar(modelo.status === 200 && modelo.bytes.subarray(0, 3).equals(BOM_BYTES), `modelo de ${recurso} responde com BOM`);
}

/* ── importar contatos ─────────────────────────────────────────────────── */

const emailContato = `contato-${EXECUCAO}@exemplo.local`;
const csvContatos = `nome;email;telefone;conta;canal_origem;observacoes\n` +
  `Contato Valido ${EXECUCAO};${emailContato};;${contaBase.nome};WHATSAPP;Veio da planilha\n` +
  `;;;;;\n`; // linha invalida: sem nome

const dryContatos = await req('POST', '/dados/importar/contatos', { ...t, corpo: { csv: csvContatos, dryRun: true } });
checar(dryContatos.status === 200, 'dry run de contatos responde 200', `status ${dryContatos.status}`);
checar(dryContatos.dados.resultado.criados === 1, 'dry run: 1 linha valida', JSON.stringify(dryContatos.dados.resultado));
checar(dryContatos.dados.resultado.ignorados === 1, 'dry run: 1 linha invalida ignorada, sem abortar o resto');

const semCriar = await req('GET', `/contatos?busca=${encodeURIComponent(emailContato)}`, t);
checar(
  (semCriar.dados.contatos ?? semCriar.dados.itens ?? []).length === 0,
  'dry run nao grava nada de verdade',
);

const importarContatos = await req('POST', '/dados/importar/contatos', { ...t, corpo: { csv: csvContatos, dryRun: false } });
checar(importarContatos.dados.resultado.criados === 1, 'importacao real: 1 contato criado');
checar(importarContatos.dados.resultado.erros[0]?.linha === 3, 'erro reporta o numero da linha (3, com cabecalho)');

const reimportar = await req('POST', '/dados/importar/contatos', { ...t, corpo: { csv: csvContatos, dryRun: false } });
checar(
  reimportar.dados.resultado.ignorados >= 1 && reimportar.dados.resultado.erros.some((e) => /ja existe/i.test(e.motivo)),
  'reimportar o mesmo CSV nao duplica o contato',
  JSON.stringify(reimportar.dados.resultado.erros),
);

/* ── importar contas ──────────────────────────────────────────────────── */

const nomeContaNova = `Conta importada ${EXECUCAO}`;
const csvContas = `nome;cnpj;segmento\n${nomeContaNova};11222333000181;Industria\n` +
  `${contaBase.nome};;\n` + // duplicada por nome
  `X;abc;\n`; // cnpj invalido

const importarContasResp = await req('POST', '/dados/importar/contas', { ...t, corpo: { csv: csvContas, dryRun: false } });
checar(importarContasResp.dados.resultado.criados === 1, 'importacao de contas: so a linha nova entra', JSON.stringify(importarContasResp.dados.resultado));
checar(importarContasResp.dados.resultado.ignorados === 2, 'importacao de contas: duplicada e cnpj invalido ignorados');

// A importacao nao devolve o id de quem criou — busca pelo nome exato (nao por
// substring) so para achar o id e apagar no fim. Filtro em JS pelo nome exato,
// e nao confia so no `busca` da API (que e texto livre, nao chave unica).
const contaImportadaAchada = (await req('GET', `/contas?busca=${encodeURIComponent(nomeContaNova)}`, t)).dados.contas?.find(
  (c) => c.nome === nomeContaNova,
);
checar(Boolean(contaImportadaAchada?.id), 'acha a conta importada pelo nome exato, para limpar depois');

/*
 * Regressao (decisao 75): a conta importada acima tem CNPJ preenchido. Buscar
 * por um termo sem nenhum digito, que nao aparece no nome nem no segmento
 * dela, NAO pode devolve-la — antes da correcao, `cnpj: { contains: '' }`
 * fazia qualquer conta com CNPJ aparecer em QUALQUER busca textual.
 */
const buscaSemDigito = await req('GET', '/contas?busca=termoquenaoexisteemnadaaqui', t);
checar(
  !buscaSemDigito.dados.contas?.some((c) => c.id === contaImportadaAchada?.id),
  'busca por termo sem digito nao devolve conta so por ela ter CNPJ',
);

/* ── importar oportunidades ───────────────────────────────────────────── */

// Formato pt-BR (virgula decimal), igual ao aceito na importacao de leads.
const csvOportunidades = `titulo;conta;funil;estagio;valor\n` +
  `Venda CSV ${EXECUCAO};${contaBase.nome};;;12345,67\n` +
  `;;;;\n`; // sem titulo

const importarOport = await req('POST', '/dados/importar/oportunidades', { ...t, corpo: { csv: csvOportunidades, dryRun: false } });
checar(importarOport.dados.resultado.criados === 1, 'importacao de oportunidades: 1 criada', JSON.stringify(importarOport.dados.resultado));
checar(importarOport.dados.resultado.ignorados === 1, 'importacao de oportunidades: linha sem titulo ignorada');

const kanban = await req('GET', `/oportunidades?contaId=${contaBase.id}`, t);
checar(
  kanban.dados.oportunidades?.some((o) => o.titulo === `Venda CSV ${EXECUCAO}` && o.valor === 12345.67),
  'oportunidade importada aparece com o valor certo',
);

/* ── limpeza ───────────────────────────────────────────────────────────── */

// So os ids que este roteiro efetivamente criou — nunca por busca ampla. Foi
// uma limpeza por busca que apagou uma conta de outro teste na primeira
// versao deste script (a busca sem digito casava com QUALQUER conta com CNPJ,
// bug que a decisao 75 corrigiu em accounts.routes.ts).
for (const id of [contaBase.id, contaImportadaAchada?.id].filter(Boolean)) {
  const del = await req('DELETE', `/contas/${id}`, t);
  checar(del.status === 204, `conta ${id.slice(0, 8)} removida`, `status ${del.status}`);
}

console.log(falhas === 0 ? '\nTodos os checks passaram.' : `\n${falhas} check(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
