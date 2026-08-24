/**
 * Smoke test da entrega da pesquisa de satisfacao (Fase 3).
 *
 * Criar a pesquisa nao basta: se o link nao chega ao cliente, ninguem responde.
 * Este teste cobre os dois caminhos:
 *   - WEBCHAT: o convite entra no historico e o link publico aceita a resposta.
 *   - WHATSAPP com token falso: a Graph API recusa, a finalizacao do
 *     atendimento continua valendo e a falha fica registrada no historico.
 *
 * Uso: npm run smoke:pesquisa  (com a API de pe e o seed aplicado)
 */
import { createHmac } from 'node:crypto';

const API = 'http://localhost:3333/api';
const APP_SECRET = 'segredo-de-teste-do-app-meta';
const TOKEN_FALSO = 'EAAG-token-falso-para-teste-de-erro';
/** Ids de mensagem precisam ser novos: `idExterno` e unico (idempotencia). */
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
checar(Boolean(admin), 'login do administrador');

const ultimaMensagem = async (id) => {
  const { dados } = await req('GET', `/conversas/${id}`, { token: admin });
  return (dados.conversa?.mensagens ?? []).at(-1);
};

// ---- Caminho 1: webchat, onde a plataforma entrega pelo proprio socket -------
const { status: statusSessao, dados: sessao } = await req('POST', '/webchat/sessoes', {
  corpo: { nome: `Cliente Pesquisa ${EXECUCAO}`, assunto: 'Smoke da pesquisa' },
});
checar(statusSessao === 201, '1. visitante abre o webchat', `status ${statusSessao}`);
const conversaId = sessao.conversa?.id ?? sessao.conversaId;
await req('POST', '/webchat/mensagens', {
  corpo: { conteudo: 'Preciso de ajuda com meu pedido' },
  token: sessao.sessaoToken ?? sessao.token,
});

await req('POST', `/conversas/${conversaId}/assumir`, { token: admin });
const { status: statusFim } = await req('POST', `/conversas/${conversaId}/finalizar`, { token: admin });
checar(statusFim === 200, '2. agente finaliza o atendimento', `status ${statusFim}`);

const convite = await ultimaMensagem(conversaId);
const link = convite?.conteudo?.match(/\/avaliacao\/([a-f0-9]{32})/);
checar(Boolean(link), '3. convite da pesquisa e a ultima mensagem da conversa');
checar(convite?.autor === 'SISTEMA', '   convite gravado como SISTEMA', String(convite?.autor));

const token = link?.[1];
const publica = await req('GET', `/avaliacao/${token}`);
checar(
  publica.status === 200 && publica.dados.pesquisa?.respondida === false,
  '4. link do convite abre a pesquisa em aberto',
  `status ${publica.status}`,
);

const resposta = await req('POST', `/avaliacao/${token}`, {
  corpo: { nota: 5, comentario: 'Atendimento rapido' },
});
checar(resposta.status === 200, '5. cliente responde pelo link recebido', `status ${resposta.status}`);
const repetida = await req('POST', `/avaliacao/${token}`, { corpo: { nota: 1 } });
checar(repetida.status === 400, '   segunda resposta no mesmo link recusada', `status ${repetida.status}`);

// ---- Caminho 2: canal externo que recusa o envio ----------------------------
const { dados: filas } = await req('GET', '/filas', { token: admin });
await req('PUT', '/canais/whatsapp', {
  token: admin,
  corpo: {
    ativo: true,
    accessToken: TOKEN_FALSO,
    appSecret: APP_SECRET,
    verifyToken: 'token-de-verificacao-123',
    filaId: filas.filas[0].id,
    phoneNumberId: '111222333444',
  },
});

const corpo = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [{
    id: 'WABA-1',
    changes: [{
      field: 'messages',
      value: {
        metadata: { phone_number_id: '111222333444', display_phone_number: '+5511999998888' },
        contacts: [{ wa_id: '5511977776666', profile: { name: 'Carlos WhatsApp' } }],
        messages: [{
          id: `wamid.pesquisa-${EXECUCAO}`,
          from: '5511977776666',
          timestamp: '1787577000',
          type: 'text',
          text: { body: 'Quero saber do meu pedido' },
        }],
      },
    }],
  }],
});
const entrada = await fetch(`${API}/webhooks/whatsapp`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Hub-Signature-256': `sha256=${createHmac('sha256', APP_SECRET).update(corpo).digest('hex')}`,
  },
  body: corpo,
});
const entradaDados = await entrada.json().catch(() => ({}));
checar(entradaDados.processadas === 1, '6. mensagem de WhatsApp cria a conversa', JSON.stringify(entradaDados));

const { dados: abertas } = await req('GET', '/conversas?limite=100', { token: admin });
const zap = (abertas.conversas ?? []).find((c) => c.canal === 'WHATSAPP' && c.status !== 'FINALIZADO');
checar(Boolean(zap), '   conversa de WhatsApp localizada');

const fimZap = await req('POST', `/conversas/${zap.id}/finalizar`, { token: admin });
checar(
  fimZap.status === 200,
  '7. finalizar continua valendo com a Meta recusando o convite',
  `status ${fimZap.status}`,
);

const nota = await ultimaMensagem(zap.id);
checar(
  nota?.conteudo?.startsWith('Pesquisa de satisfacao nao enviada'),
  '8. falha de envio registrada no historico',
  nota?.conteudo?.slice(0, 60),
);

const { dados: res } = await req('GET', '/pesquisas/resultados', { token: admin });
const r = res.resultados;
checar(r?.entregues >= 1, '9. gestao contabiliza a entrega', `entregues ${r?.entregues}`);
checar(r?.naoEntregues >= 1, '   e separa a que nao foi entregue', `nao entregues ${r?.naoEntregues}`);
checar(r?.respondidas >= 1, '   e a resposta do cliente', `respondidas ${r?.respondidas}`);
checar(
  r?.taxaResposta !== null && r?.taxaResposta <= 100,
  '10. taxa de resposta sobre as entregues',
  `${r?.taxaResposta}%`,
);

console.log(`\n${falhas} FALHOU`);
process.exit(falhas === 0 ? 0 : 1);
