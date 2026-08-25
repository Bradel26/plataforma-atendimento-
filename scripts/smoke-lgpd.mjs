/**
 * Smoke test da politica de retencao e dos direitos do titular (LGPD).
 *
 * Verifica o que fica gravado, nao so o que a API responde: usa o Prisma direto
 * para envelhecer uma conversa (senao nada estaria fora do prazo de retencao) e
 * para conferir que mensagem, arquivo e identidade sairam mesmo.
 *
 * Uso: npm run smoke:lgpd  (com a API de pe e o seed aplicado)
 */
import { readFileSync, existsSync } from 'node:fs';
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
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

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

const entrar = async (email, senha) => (await req('POST', '/auth/login', { corpo: { email, senha } })).dados.accessToken;
const admin = await entrar('admin@plataforma.local', 'Admin@123');
const supervisor = await entrar('supervisor@plataforma.local', 'Super@123');
checar(Boolean(admin && supervisor), '0. login de admin e supervisor');

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

// 1. Somente admin mexe em dado pessoal
const negado = await req('GET', '/lgpd/politica', { token: supervisor });
checar(negado.status === 403, '1. supervisor nao acessa a area de LGPD', `status ${negado.status}`);

// 2. Politica com padrao conservador: expurgo automatico desligado
const { dados: inicial } = await req('GET', '/lgpd/politica', { token: admin });
checar(inicial.politica?.ativa === false, '2. expurgo automatico vem desligado');
checar(inicial.politica?.diasConversas === 90, '   prazo padrao de conversas e 90 dias', String(inicial.politica?.diasConversas));

const { status: statusPolitica } = await req('PUT', '/lgpd/politica', {
  token: admin,
  corpo: { diasConversas: 30, diasProtocolos: 180, diasPresenca: 180 },
});
checar(statusPolitica === 200, '   politica editavel', `status ${statusPolitica}`);

// 3. Aceite do aviso de privacidade e obrigatorio no webchat
const semAceite = await req('POST', '/webchat/sessoes', { corpo: { nome: `Sem aceite ${EXECUCAO}` } });
checar(semAceite.status === 400, '3. webchat recusa sessao sem aceite do aviso', `status ${semAceite.status}`);

const { dados: sessao } = await req('POST', '/webchat/sessoes', {
  corpo: { nome: `Titular LGPD ${EXECUCAO}`, email: `titular-${EXECUCAO}@teste.local`, aceiteLgpd: true },
});
const conversaId = sessao.conversa.id;
const contatoId = sessao.conversa.contato.id;
await req('POST', '/webchat/mensagens', {
  corpo: { conteudo: 'Meu CPF e 000.000.000-00 e moro na rua tal' },
  token: sessao.sessaoToken,
});

const contato = await prisma.contact.findUnique({ where: { id: contatoId } });
checar(Boolean(contato?.consentimentoEm), '   aceite gravado no contato', String(contato?.consentimentoEm));

// 4. Protocolo com anexo real, para conferir que o arquivo tambem sai
const { dados: novo } = await req('POST', '/protocolos', {
  token: admin,
  corpo: { titulo: `Chamado do titular ${EXECUCAO}`, descricao: 'Contem dado pessoal', contatoId },
});
const form = new FormData();
form.append('arquivo', new Blob([PNG], { type: 'image/png' }), 'documento.png');
const upload = await fetch(`${API}/protocolos/${novo.protocolo.id}/anexos`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${admin}` },
  body: form,
});
const anexo = (await upload.json()).protocolo.anexos.at(-1);
const caminhoArquivo = join(raiz, 'apps/api/storage', anexo.url.split('?')[0].replace('/api/arquivos/', ''));
checar(existsSync(caminhoArquivo), '4. anexo do titular esta no disco');

// 5. Portabilidade: a exportacao traz o conteudo e entra na auditoria
const exportado = await req('GET', `/lgpd/titulares/${contatoId}/exportar`, { token: admin });
const mensagensExportadas = exportado.dados.dados?.conversas?.[0]?.mensagens ?? [];
checar(
  mensagensExportadas.some((m) => m.conteudo.includes('CPF')),
  '5. exportacao traz as mensagens do titular',
  `${mensagensExportadas.length} mensagens`,
);
checar(
  exportado.dados.dados?.protocolos?.length === 1,
  '   e os protocolos',
  String(exportado.dados.dados?.protocolos?.length),
);

// 6. Eliminacao a pedido do titular
const anonimizado = await req('POST', `/lgpd/titulares/${contatoId}/anonimizar`, {
  token: admin,
  corpo: { confirmacao: 'ANONIMIZAR' },
});
checar(anonimizado.status === 200, '6. anonimizacao executada', `status ${anonimizado.status}`);

const depois = await prisma.contact.findUnique({ where: { id: contatoId } });
checar(depois?.nome?.startsWith('Titular anonimizado'), '   nome substituido', depois?.nome);
checar(depois?.email === null && depois?.telefone === null, '   email e telefone removidos');
checar(Boolean(depois?.anonimizadoEm), '   data da anonimizacao registrada');

const mensagensRestantes = await prisma.message.count({ where: { conversaId } });
checar(mensagensRestantes === 0, '   mensagens apagadas', `${mensagensRestantes} restantes`);
checar(!existsSync(caminhoArquivo), '   arquivo apagado do disco tambem');

const conversaViva = await prisma.conversation.findUnique({ where: { id: conversaId } });
checar(
  Boolean(conversaViva) && conversaViva.enderecoExterno === null,
  '   conversa continua existindo para a metrica, sem identificar ninguem',
);

// 7. Confirmacao errada nao apaga nada
const conversaAntiga = await prisma.conversation.findFirst({
  where: { status: 'FINALIZADO', mensagens: { some: {} } },
  select: { id: true, contatoId: true },
});
const diasAtras = (d) => new Date(Date.now() - d * 24 * 60 * 60 * 1000);
await prisma.conversation.update({
  where: { id: conversaAntiga.id },
  data: { finalizadoEm: diasAtras(200), ultimaMensagemEm: diasAtras(200) },
});
const antesDoExpurgo = await prisma.message.count({ where: { conversaId: conversaAntiga.id } });

const semConfirmacao = await req('POST', '/lgpd/expurgo', {
  token: admin,
  corpo: { simulacao: false },
});
checar(
  semConfirmacao.dados.resumo?.simulacao === true,
  '7. expurgo sem a palavra de confirmacao cai para simulacao',
);
checar(
  (await prisma.message.count({ where: { conversaId: conversaAntiga.id } })) === antesDoExpurgo,
  '   nada foi apagado na simulacao',
  `${antesDoExpurgo} mensagens`,
);
checar(
  semConfirmacao.dados.resumo?.conversas >= 1 && semConfirmacao.dados.resumo?.mensagens >= 1,
  '   simulacao conta o que seria apagado',
  `${semConfirmacao.dados.resumo?.conversas} conversas / ${semConfirmacao.dados.resumo?.mensagens} mensagens`,
);

// 8. Expurgo de verdade
const real = await req('POST', '/lgpd/expurgo', {
  token: admin,
  corpo: { simulacao: false, confirmacao: 'EXPURGAR' },
});
checar(real.dados.resumo?.simulacao === false, '8. expurgo executado de verdade');
checar(
  (await prisma.message.count({ where: { conversaId: conversaAntiga.id } })) === 0,
  '   mensagens da conversa vencida apagadas',
);
checar(
  Boolean(await prisma.conversation.findUnique({ where: { id: conversaAntiga.id } })),
  '   a conversa em si continua na base (metrica preservada)',
);
const politicaFinal = await prisma.retentionPolicy.findUnique({ where: { id: 'default' } });
checar(Boolean(politicaFinal?.ultimoExpurgoEm), '   data do ultimo expurgo registrada');

// 9. Trilha de auditoria
const { dados: auditoria } = await req('GET', '/lgpd/registros', { token: admin });
const acoes = new Set((auditoria.registros ?? []).map((r) => r.acao));
checar(
  ['EXPORTACAO', 'ANONIMIZACAO', 'EXPURGO'].every((a) => acoes.has(a)),
  '9. auditoria registra exportacao, anonimizacao e expurgo',
  [...acoes].join(','),
);

// Devolve a politica ao padrao para nao deixar prazo curto configurado.
await req('PUT', '/lgpd/politica', {
  token: admin,
  corpo: { diasConversas: 90, diasProtocolos: 365, diasPresenca: 365 },
});

await prisma.$disconnect();
console.log(`\n${falhas} FALHOU`);
process.exit(falhas === 0 ? 0 : 1);
