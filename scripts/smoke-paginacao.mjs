/**
 * Smoke test da paginacao por cursor.
 *
 * O que importa verificar nao e "vieram N itens", e sim que percorrer as paginas
 * **nao pula nem repete** registro — o defeito classico de paginacao por offset
 * numa lista que muda enquanto e lida.
 *
 * Uso: npm run smoke:paginacao  (com a API de pe e o seed aplicado)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  readFileSync(join(raiz, 'apps/api/.env'), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    }),
);
process.env.DATABASE_URL = env.DATABASE_URL;

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

const { dados: login } = await req('POST', '/auth/login', {
  corpo: { email: 'admin@plataforma.local', senha: 'Admin@123' },
});
const admin = login.accessToken;

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

/**
 * Percorre todas as paginas de uma listagem e devolve os ids na ordem.
 *
 * `truncado` existe para nao mentir: se o teto de paginas for atingido, a
 * comparacao de totais falharia por causa do teto e nao por defeito do cursor —
 * e a mensagem tem de deixar isso claro.
 */
async function percorrer(rota, chave, limite, tetoPaginas = 500) {
  const ids = [];
  let cursor = null;
  let paginas = 0;

  do {
    const sufixo = `${rota.includes('?') ? '&' : '?'}limite=${limite}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const { dados } = await req('GET', rota + sufixo, { token: admin });
    ids.push(...(dados[chave] ?? []).map((i) => i.id));
    cursor = dados.proximoCursor;
    paginas++;
  } while (cursor && paginas < tetoPaginas);

  return { ids, paginas, truncado: cursor !== null };
}

// 1. Conversa longa: 70 mensagens gravadas direto no banco (o limite por IP do
//    webchat existe justamente para impedir isto pela API).
const { dados: sessao } = await req('POST', '/webchat/sessoes', {
  corpo: { nome: `Paginacao ${EXECUCAO}`, aceiteLgpd: true },
});
const conversaId = sessao.conversa.id;

const base = Date.now() - 70 * 60 * 1000;
// O script grava direto no banco, sem passar pela API, e por isso nao tem o
// contexto de organizacao que a extensao do Prisma usa. Aqui a organizacao vem
// da conversa que a API acabou de criar — e nao de uma constante — para que o
// script continue certo se o webchat mudar de organizacao padrao.
const { organizacaoId } = await prisma.conversation.findUniqueOrThrow({
  where: { id: conversaId },
  select: { organizacaoId: true },
});

await prisma.message.createMany({
  data: Array.from({ length: 70 }, (_, i) => ({
    organizacaoId,
    conversaId,
    autor: i % 2 === 0 ? 'CLIENTE' : 'AGENTE',
    conteudo: `Mensagem ${String(i + 1).padStart(3, '0')}`,
    criadoEm: new Date(base + i * 60 * 1000),
  })),
});
const total = await prisma.message.count({ where: { conversaId } });
checar(total === 71, '1. conversa com historico longo preparada', `${total} mensagens`);

// 2. O detalhe traz apenas a ultima pagina
const { dados: detalhe } = await req('GET', `/conversas/${conversaId}`, { token: admin });
const doDetalhe = detalhe.conversa.mensagens;
checar(doDetalhe.length === 50, '2. detalhe da conversa traz 50 mensagens, nao as 71', String(doDetalhe.length));
checar(detalhe.conversa.temHistoricoAnterior === true, '   e avisa que existe historico anterior');
checar(Boolean(detalhe.conversa.cursorAnterior), '   com o cursor pronto para buscar o resto');
const cronologica = doDetalhe.every(
  (m, i) => i === 0 || new Date(doDetalhe[i - 1].criadoEm) <= new Date(m.criadoEm),
);
checar(cronologica, '   em ordem cronologica (data, nao texto)');

// 3. Historico anterior: nem pula nem repete
const idsVistos = new Set(doDetalhe.map((m) => m.id));
let cursor = detalhe.conversa.cursorAnterior;
let repetidas = 0;
let paginas = 0;
while (cursor && paginas < 10) {
  const { dados } = await req('GET', `/conversas/${conversaId}/mensagens?limite=10&cursor=${encodeURIComponent(cursor)}`, {
    token: admin,
  });
  for (const m of dados.mensagens) {
    if (idsVistos.has(m.id)) repetidas++;
    idsVistos.add(m.id);
  }
  cursor = dados.proximoCursor;
  paginas++;
}
checar(repetidas === 0, '3. paginas do historico nao repetem mensagem', `${repetidas} repetidas`);
checar(idsVistos.size === total, '   e nao pulam nenhuma', `${idsVistos.size} de ${total}`);
checar(paginas >= 2, '   historico veio em mais de uma pagina', `${paginas} paginas`);

// 4. Lista de conversas paginada de duas em duas
const { ids: idsConversas, paginas: paginasConversas, truncado } = await percorrer('/conversas', 'conversas', 2);
checar(!truncado, '4. varredura completou sem bater no teto de paginas', `${paginasConversas} paginas`);
checar(new Set(idsConversas).size === idsConversas.length, '   lista de conversas nao repete item', `${idsConversas.length} itens`);
const { ids: idsUmaPagina } = await percorrer('/conversas', 'conversas', 100);
checar(
  idsUmaPagina.length === idsConversas.length,
  '   e o total bate com a leitura em uma pagina so',
  `${idsConversas.length} vs ${idsUmaPagina.length}`,
);

// 5. Contatos e protocolos seguem a mesma regra
const { ids: idsContatos } = await percorrer('/contatos', 'contatos', 3);
const { ids: contatosDireto } = await percorrer('/contatos', 'contatos', 100);
checar(
  new Set(idsContatos).size === idsContatos.length && idsContatos.length === contatosDireto.length,
  '5. contatos paginam sem repetir nem pular',
  `${idsContatos.length} contatos`,
);

const { ids: idsProtocolos } = await percorrer('/protocolos', 'protocolos', 2);
const { ids: protocolosDireto } = await percorrer('/protocolos', 'protocolos', 200);
checar(
  new Set(idsProtocolos).size === idsProtocolos.length && idsProtocolos.length === protocolosDireto.length,
  '   protocolos tambem',
  `${idsProtocolos.length} protocolos`,
);

// 6. Cursor invalido nao passa em silencio
const { status: statusRuim } = await req('GET', '/conversas?cursor=isto-nao-e-cursor', { token: admin });
checar(statusRuim === 400, '6. cursor invalido recusado com 400', `status ${statusRuim}`);

await prisma.$disconnect();
console.log(`\n${falhas} FALHOU`);
process.exit(falhas === 0 ? 0 : 1);
