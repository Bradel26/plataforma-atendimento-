/**
 * Smoke test do canal de voz.
 *
 * Nao existe conta de provedor nem tronco aqui, entao o teste cobre exatamente
 * o que da para cobrir sem eles — e isso e mais do que parece:
 *   - assinatura do webhook, assinada com o mesmo algoritmo do provedor;
 *   - o ciclo de vida da chamada (chamando, atendida, encerrada) e a duracao;
 *   - idempotencia da reentrega de evento;
 *   - a originacao falhando contra a API real com credencial falsa, provando
 *     que nada e gravado quando o provedor recusa.
 *
 * Uso: npm run smoke:voz  (com a API de pe e o seed aplicado)
 */
import { createHmac } from 'node:crypto';
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
const CONTA_SID = 'AC00000000000000000000000000000000';
const AUTH_TOKEN = 'token-falso-de-voz-para-teste';
const WEBHOOK = 'https://atendimento.exemplo.com.br/api/webhooks/voz';
const CHAMADA_SID = `CA-${EXECUCAO}`;

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
const supervisor = await entrar('supervisor@plataforma.local', 'Super@123');

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

/** Assina como o provedor: HMAC-SHA1 de URL + parametros ordenados, em base64. */
const assinar = (url, parametros) =>
  createHmac('sha1', AUTH_TOKEN)
    .update(
      url +
        Object.keys(parametros)
          .sort()
          .map((k) => k + parametros[k])
          .join(''),
      'utf8',
    )
    .digest('base64');

const enviarEvento = async (parametros, rota = '/eventos', assinatura) => {
  const url = `${WEBHOOK}${rota}`;
  const resp = await fetch(`${API}/webhooks/voz${rota}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Twilio-Signature': assinatura ?? assinar(url, parametros),
    },
    body: new URLSearchParams(parametros),
  });
  const texto = await resp.text();
  return { status: resp.status, texto, tipo: resp.headers.get('content-type') };
};

/**
 * Zera a configuracao antes de comecar. Sem isto, a credencial deixada pela
 * execucao anterior faria o passo 2 ("ativar sem credencial") passar com razao —
 * e a falha seria do teste, nao do sistema.
 */
await req('PUT', '/voz/config', {
  token: admin,
  corpo: { ativo: false, contaSid: null, authToken: null, numeroPadrao: null, urlWebhook: null },
});

// 1. Area de voz e do administrador
const negado = await req('GET', '/voz/config', { token: supervisor });
checar(negado.status === 403, '1. supervisor nao acessa a configuracao de voz', `status ${negado.status}`);

// 2. Ativar sem credencial ou sem webhook publico e recusado
const semCred = await req('PUT', '/voz/config', { token: admin, corpo: { ativo: true } });
checar(semCred.status === 400, '2. ativar sem credencial recusado', `status ${semCred.status}`);

const semHttps = await req('PUT', '/voz/config', {
  token: admin,
  corpo: { ativo: true, contaSid: CONTA_SID, authToken: AUTH_TOKEN, numeroPadrao: '+551140028922', urlWebhook: 'http://sem-tls.local/api/webhooks/voz' },
});
checar(semHttps.status === 400, '   e sem webhook HTTPS tambem', `status ${semHttps.status}`);

// 3. Configuracao valida: token cifrado no banco, mascarado na API
const { dados: salva } = await req('PUT', '/voz/config', {
  token: admin,
  corpo: {
    ativo: true,
    provedor: 'twilio',
    contaSid: CONTA_SID,
    authToken: AUTH_TOKEN,
    numeroPadrao: '+551140028922',
    urlWebhook: WEBHOOK,
    guardarGravacao: true,
  },
});
checar(salva.config?.configurado === true, '3. voz configurada e ativa');
checar(
  Boolean(salva.config?.authTokenMascarado) && !JSON.stringify(salva).includes(AUTH_TOKEN),
  '   token nunca volta em claro pela API',
  salva.config?.authTokenMascarado,
);
const noBanco = await prisma.voiceConfig.findUnique({ where: { id: 'default' } });
checar(noBanco?.authToken?.startsWith('v1:'), '   e esta cifrado em repouso', noBanco?.authToken?.slice(0, 12));

// 4. Assinatura invalida nao cria chamada
const base = {
  CallSid: CHAMADA_SID,
  From: '+5511977776666',
  To: '+551140028922',
  Direction: 'inbound',
  CallStatus: 'ringing',
};
const forjado = await enviarEvento(base, '/eventos', 'assinatura-inventada');
checar(forjado.status === 401, '4. evento com assinatura invalida recusado', `status ${forjado.status}`);
checar(
  (await prisma.call.count({ where: { idExterno: CHAMADA_SID } })) === 0,
  '   e nenhuma chamada foi criada',
);

// 5. Ciclo de vida da chamada entrante
const chamando = await enviarEvento(base);
checar(chamando.status === 200, '5. evento "chamando" aceito', `status ${chamando.status}`);
let chamada = await prisma.call.findUnique({ where: { idExterno: CHAMADA_SID } });
checar(chamada?.status === 'CHAMANDO' && chamada?.direcao === 'ENTRANTE', '   chamada criada como entrante', String(chamada?.status));

await enviarEvento({ ...base, CallStatus: 'in-progress' });
chamada = await prisma.call.findUnique({ where: { idExterno: CHAMADA_SID } });
checar(chamada?.status === 'EM_ANDAMENTO' && Boolean(chamada?.atendidoEm), '   atendimento marca o horario');

await enviarEvento({ ...base, CallStatus: 'completed', CallDuration: '95', Price: '-0.0410' });
chamada = await prisma.call.findUnique({ where: { idExterno: CHAMADA_SID } });
checar(
  chamada?.status === 'COMPLETADA' && chamada?.duracao === 95 && Boolean(chamada?.encerradoEm),
  '   encerramento grava duracao e horario',
  `${chamada?.duracao}s`,
);
checar(Number(chamada?.custo) === 0.041, '   custo registrado sem sinal negativo', String(chamada?.custo));

// 6. Reentrega do mesmo evento nao duplica nem reabre
const reentrega = await enviarEvento({ ...base, CallStatus: 'in-progress' });
const corpoReentrega = JSON.parse(reentrega.texto);
checar(corpoReentrega.ignorado === true, '6. reentrega de evento em chamada encerrada e ignorada');
checar(
  (await prisma.call.count({ where: { idExterno: CHAMADA_SID } })) === 1,
  '   e continua existindo uma unica chamada',
);

// 7. Gravacao: a URL do provedor fica registrada e o download vai para a fila
await enviarEvento({
  ...base,
  CallStatus: 'completed',
  RecordingUrl: 'https://api.twilio.com/gravacao-de-teste',
  RecordingDuration: '95',
});
chamada = await prisma.call.findUnique({ where: { idExterno: CHAMADA_SID } });
checar(
  chamada?.gravacaoUrl === 'https://api.twilio.com/gravacao-de-teste.mp3',
  '7. URL da gravacao registrada de imediato',
  chamada?.gravacaoUrl,
);
checar(chamada?.gravacaoDuracao === 95, '   com a duracao da gravacao', String(chamada?.gravacaoDuracao));

// 8. Clique-para-ligar contra a API real com credencial falsa
const antes = await prisma.call.count();
const originar = await req('POST', '/voz/chamadas', { token: admin, corpo: { destino: '+5511988887777' } });
checar(originar.status === 502, '8. provedor recusa a originacao com credencial falsa', `status ${originar.status}`);
checar(originar.dados.error?.code === 'VOZ_RECUSADA', '   com codigo VOZ_RECUSADA', String(originar.dados.error?.code));
checar((await prisma.call.count()) === antes, '   e nenhuma chamada entra no relatorio');

// 9. TwiML das instrucoes
const instrucoes = await enviarEvento({ CallSid: CHAMADA_SID, From: base.From, To: base.To }, '/instrucoes');
checar(instrucoes.status === 200 && (instrucoes.tipo ?? '').includes('xml'), '9. instrucoes respondem TwiML', String(instrucoes.tipo));
checar(instrucoes.texto.includes('<Record'), '   com gravacao da chamada');
checar(instrucoes.texto.includes('sera gravada'), '   e o aviso legal de gravacao');
const semAssinatura = await enviarEvento({ CallSid: 'x' }, '/instrucoes', 'invalida');
checar(semAssinatura.status === 401, '   instrucoes tambem exigem assinatura', `status ${semAssinatura.status}`);

// 10. Indicadores de voz
const { dados: ind } = await req('GET', '/voz/indicadores', { token: admin });
checar(ind.indicadores?.total >= 1, '10. indicadores contam a chamada', `total ${ind.indicadores?.total}`);
checar(ind.indicadores?.atendidas >= 1, '    e as atendidas', `atendidas ${ind.indicadores?.atendidas}`);
checar(ind.indicadores?.tma !== null, '    com TMA de voz calculado', `${ind.indicadores?.tma}s`);

// 11. Listagem paginada
const { dados: lista } = await req('GET', '/voz/chamadas?limite=1', { token: admin });
checar(Array.isArray(lista.chamadas) && lista.chamadas.length === 1, '11. chamadas listadas com paginacao');
checar('proximoCursor' in lista, '    com cursor para a proxima pagina');

// Deixa a voz desligada e sem credencial falsa guardada.
await req('PUT', '/voz/config', {
  token: admin,
  corpo: { ativo: false, contaSid: null, authToken: null, numeroPadrao: null, urlWebhook: null },
});
await prisma.$disconnect();
console.log(`\n${falhas} FALHOU`);
process.exit(falhas === 0 ? 0 : 1);
