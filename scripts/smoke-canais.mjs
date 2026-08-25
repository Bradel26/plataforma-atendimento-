/**
 * Smoke test dos canais externos da Meta (Fase 2).
 *
 * Nao depende de conta aprovada na Meta: monta payloads no formato real do
 * webhook e os assina com HMAC SHA-256 exatamente como a Meta faz, exercitando
 * verificacao de assinatura, idempotencia e roteamento para a fila.
 *
 * O envio de saida (resposta do agente) chama a Graph API de verdade com um
 * token falso e deve ser recusado — e assim que se verifica que a mensagem NAO
 * entra no historico quando o cliente nao a recebeu.
 *
 * Uso: npm run smoke:canais  (com a API de pe e o seed aplicado)
 */
import { createHmac } from 'node:crypto';

const API = 'http://localhost:3333/api';
const APP_SECRET = 'segredo-de-teste-do-app-meta';
const VERIFY_TOKEN = 'token-de-verificacao-123';
const TOKEN_FALSO = 'EAAG-token-falso-para-teste-de-erro';

/**
 * Sufixo por execucao. Os ids de mensagem precisam ser novos a cada rodada:
 * `Message.idExterno` e unico e a plataforma trata id repetido como reentrega
 * da Meta — com id fixo, a segunda execucao do teste veria "duplicada" e
 * acusaria falha onde o comportamento esta correto.
 */
const EXECUCAO = Date.now().toString(36);

const ok = (b) => (b ? 'ok' : 'FALHOU');

async function json(caminho, opcoes = {}) {
  const res = await fetch(`${API}${caminho}`, opcoes);
  const corpo = await res.json().catch(() => ({}));
  return { status: res.status, corpo };
}

const { corpo: login } = await json('/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@plataforma.local', senha: 'Admin@123' }),
});
const admin = { Authorization: `Bearer ${login.accessToken}`, 'Content-Type': 'application/json' };

const { corpo: filas } = await json('/filas', { headers: admin });
const filaId = filas.filas[0].id;

// 1. Configurar e ativar WhatsApp e Instagram
for (const canal of ['whatsapp', 'instagram']) {
  const { status } = await json(`/canais/${canal}`, {
    method: 'PUT',
    headers: admin,
    body: JSON.stringify({
      ativo: true,
      accessToken: TOKEN_FALSO,
      appSecret: APP_SECRET,
      verifyToken: VERIFY_TOKEN,
      filaId,
      ...(canal === 'whatsapp' ? { phoneNumberId: '111222333444' } : { pageId: '555666777', igUserId: '888999' }),
    }),
  });
  console.log(`1. canal ${canal} configurado:`, ok(status === 200));
}

// 2. Segredos nunca voltam em claro
const { corpo: lista } = await json('/canais', { headers: admin });
const wa = lista.canais.find((c) => c.canal === 'WHATSAPP');
console.log('2. token mascarado na leitura:', ok(!JSON.stringify(lista).includes(TOKEN_FALSO)),
  `(${wa.accessTokenMascarado})`);
console.log('   canal marcado como configurado:', ok(wa.configurado));

// 3. Ativar sem credenciais deve ser recusado.
// Limpa o Facebook antes: se outro teste tiver deixado credencial ali, ativar
// daria 200 com razao e a falha seria do teste, nao do sistema.
await json('/canais/facebook', {
  method: 'PUT',
  headers: admin,
  body: JSON.stringify({ ativo: false, accessToken: null, appSecret: null, verifyToken: null }),
});
const { status: statusSemCred } = await json('/canais/facebook', {
  method: 'PUT',
  headers: admin,
  body: JSON.stringify({ ativo: true }),
});
console.log('3. ativar canal sem credenciais recusado:', ok(statusSemCred === 400));

// 4. Verificacao do webhook (GET hub.challenge)
const desafio = 'desafio-aleatorio-42';
const certo = await fetch(
  `${API}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=${desafio}`,
);
console.log('4. GET com verify_token correto devolve o challenge:',
  ok(certo.status === 200 && (await certo.text()) === desafio));
const errado = await fetch(
  `${API}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=${desafio}`,
);
console.log('   GET com token errado recusado:', ok(errado.status === 403));

// 5. POST com assinatura valida
const payloadWhatsApp = (idMensagem, texto) => JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [{
    id: 'WABA-1',
    changes: [{
      field: 'messages',
      value: {
        metadata: { phone_number_id: '111222333444', display_phone_number: '+5511999998888' },
        contacts: [{ wa_id: '5511977776666', profile: { name: 'Carlos WhatsApp' } }],
        messages: [{ id: idMensagem, from: '5511977776666', timestamp: '1787577000', type: 'text', text: { body: texto } }],
      },
    }],
  }],
});

const enviarWebhook = async (canal, corpo, segredo = APP_SECRET) =>
  fetch(`${API}/webhooks/${canal}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Signature-256': `sha256=${createHmac('sha256', segredo).update(corpo).digest('hex')}`,
    },
    body: corpo,
  });

const corpo1 = payloadWhatsApp(`wamid.${EXECUCAO}-001`, 'Bom dia, preciso de ajuda com meu pedido');
const r1 = await enviarWebhook('whatsapp', corpo1);
const d1 = await r1.json();
console.log('5. mensagem do WhatsApp processada:', ok(r1.status === 200 && d1.processadas === 1), JSON.stringify(d1));

// 6. Reentrega do mesmo id e ignorada (idempotencia)
const r2 = await enviarWebhook('whatsapp', corpo1);
const d2 = await r2.json();
console.log('6. reentrega do mesmo id nao duplica:', ok(d2.duplicadas === 1 && d2.processadas === 0), JSON.stringify(d2));

// 7. Assinatura invalida
const r3 = await enviarWebhook('whatsapp', payloadWhatsApp(`wamid.${EXECUCAO}-002`, 'x'), 'segredo-errado');
console.log('7. assinatura invalida recusada:', ok(r3.status === 401));

// 8. Instagram Direct
const corpoIg = JSON.stringify({
  object: 'instagram',
  entry: [{
    id: 'IG-1',
    messaging: [{
      sender: { id: 'IGSID-99887766' },
      recipient: { id: '888999' },
      timestamp: 1787577100,
      message: { mid: `mid.IG-${EXECUCAO}-001`, text: 'Vi o anuncio, tem em estoque?' },
    }],
  }],
});
const r4 = await enviarWebhook('instagram', corpoIg);
const d4 = await r4.json();
console.log('8. mensagem do Instagram processada:', ok(r4.status === 200 && d4.processadas === 1));

// 9. As conversas caem na fila configurada, com o canal correto
const { corpo: espera } = await json('/conversas?status=EM_ESPERA&limite=50', { headers: admin });
const doWhats = espera.conversas.find((c) => c.canal === 'WHATSAPP');
const doInsta = espera.conversas.find((c) => c.canal === 'INSTAGRAM');
console.log('9. conversa de WhatsApp em espera:', ok(Boolean(doWhats)),
  doWhats ? `contato "${doWhats.contato.nome}" na fila "${doWhats.fila?.nome}" (${doWhats.naoLidas} nao lida)` : '');
console.log('   conversa de Instagram em espera:', ok(Boolean(doInsta)),
  doInsta ? `contato "${doInsta.contato.nome}"` : '');

// 10. Resposta do agente: a Graph API recusa o token falso e nada e gravado
const antes = (await json(`/conversas/${doWhats.id}`, { headers: admin })).corpo.conversa.mensagens.length;
const tentativa = await json(`/conversas/${doWhats.id}/mensagens`, {
  method: 'POST',
  headers: admin,
  body: JSON.stringify({ conteudo: 'Resposta de teste que a Meta vai recusar' }),
});
const depois = (await json(`/conversas/${doWhats.id}`, { headers: admin })).corpo.conversa.mensagens.length;
console.log('10. envio recusado pela Graph API:', ok(tentativa.status === 502),
  `HTTP ${tentativa.status} ${tentativa.corpo?.error?.code ?? ''}`);
console.log('    mensagem NAO entrou no historico:', ok(antes === depois), `(${antes} -> ${depois})`);

// 11. Canal desativado recusa o webhook
await json('/canais/whatsapp', { method: 'PUT', headers: admin, body: JSON.stringify({ ativo: false }) });
const r5 = await enviarWebhook('whatsapp', payloadWhatsApp(`wamid.${EXECUCAO}-003`, 'y'));
console.log('11. canal inativo recusa webhook:', ok(r5.status === 503));

// 12. Canal nao suportado
const r6 = await fetch(`${API}/webhooks/telegram?hub.mode=subscribe`);
console.log('12. canal nao suportado:', ok(r6.status === 404));

process.exit(0);
