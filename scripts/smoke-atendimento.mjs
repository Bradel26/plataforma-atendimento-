/**
 * Smoke test do fluxo de atendimento em tempo real (Fase 1).
 *
 * Exercita, contra a API rodando localmente:
 *   - handshake do WebSocket para agente, supervisor e visitante do webchat
 *   - recusa de conexao sem credencial
 *   - conversa:nova chegando para a fila do agente e para a supervisao
 *   - mensagem do cliente chegando ao agente e a resposta chegando ao visitante
 *   - agente:status visivel para a gestao e invisivel para o visitante
 *
 * Uso: npm run smoke  (com a API de pe e o seed aplicado)
 */
import { io } from 'socket.io-client';

const API = 'http://localhost:3333';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(caminho, corpo, token) {
  const res = await fetch(`${API}/api${caminho}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(corpo ?? {}),
  });
  const dados = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${caminho} -> ${res.status} ${JSON.stringify(dados)}`);
  return dados;
}

function conectar(rotulo, auth) {
  return new Promise((resolve, reject) => {
    const socket = io(API, { path: '/socket.io', transports: ['websocket'], auth });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (e) => reject(new Error(`${rotulo}: ${e.message}`)));
    setTimeout(() => reject(new Error(`${rotulo}: timeout de conexao`)), 10000);
  });
}

const recebidos = { agente: [], visitante: [], supervisor: [] };
const registrar = (socket, quem) => {
  for (const evento of ['conversa:nova', 'conversa:atualizada', 'mensagem:nova', 'agente:status']) {
    socket.on(evento, (payload) => recebidos[quem].push({ evento, payload }));
  }
};

const { accessToken: tokenAgente } = await post('/auth/login', {
  email: 'agente1@plataforma.local',
  senha: 'Agente@123',
});
const { accessToken: tokenSupervisor } = await post('/auth/login', {
  email: 'supervisor@plataforma.local',
  senha: 'Super@123',
});

const sockAgente = await conectar('agente', { token: tokenAgente });
const sockSuper = await conectar('supervisor', { token: tokenSupervisor });
registrar(sockAgente, 'agente');
registrar(sockSuper, 'supervisor');
console.log('1. agente e supervisor conectados ao WebSocket');

// Handshake sem credencial deve ser rejeitado.
try {
  await conectar('anonimo', {});
  console.log('   FALHA: conexao sem credencial foi aceita');
} catch (e) {
  console.log('2. conexao sem credencial rejeitada:', e.message.includes('Credencial') ? 'ok' : e.message);
}

// Visitante abre o webchat -> agente da fila deve receber conversa:nova
const sessao = await post('/webchat/sessoes', { nome: 'Ana Realtime', email: 'ana@cliente.com' });
const conversaId = sessao.conversa.id;
await espera(700);
const nova = recebidos.agente.find((e) => e.evento === 'conversa:nova' && e.payload.id === conversaId);
console.log('3. agente recebeu conversa:nova:', nova ? 'ok' : 'FALHOU');
console.log('   supervisor tambem recebeu:',
  recebidos.supervisor.some((e) => e.evento === 'conversa:nova' && e.payload.id === conversaId) ? 'ok' : 'FALHOU');

// Visitante conecta e o agente entra na sala da conversa
const sockVisitante = await conectar('visitante', { sessao: sessao.sessaoToken });
registrar(sockVisitante, 'visitante');
sockAgente.emit('conversa:entrar', conversaId);
await espera(400);

// Mensagem do cliente -> agente recebe em tempo real
await post('/webchat/mensagens', { conteudo: 'Oi, preciso de ajuda' }, sessao.sessaoToken);
await espera(700);
const msgCliente = recebidos.agente.find(
  (e) => e.evento === 'mensagem:nova' && e.payload.mensagem.conteudo === 'Oi, preciso de ajuda',
);
console.log('4. agente recebeu mensagem do cliente em tempo real:', msgCliente ? 'ok' : 'FALHOU');

// Resposta do agente -> visitante recebe em tempo real
await post(`/conversas/${conversaId}/assumir`, {}, tokenAgente);
await post(`/conversas/${conversaId}/mensagens`, { conteudo: 'Ola Ana, como posso ajudar?' }, tokenAgente);
await espera(700);
const msgAgente = recebidos.visitante.find(
  (e) => e.evento === 'mensagem:nova' && e.payload.mensagem.conteudo === 'Ola Ana, como posso ajudar?',
);
console.log('5. visitante recebeu resposta do agente em tempo real:', msgAgente ? 'ok' : 'FALHOU');
console.log('   visitante viu a mudanca de status:',
  recebidos.visitante.some((e) => e.evento === 'conversa:atualizada') ? 'ok' : 'FALHOU');

// Mudanca de status de presenca -> supervisao
await fetch(`${API}/api/usuarios/me/status`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAgente}` },
  body: JSON.stringify({ status: 'PAUSA' }),
});
await espera(600);
console.log('6. supervisor recebeu agente:status:',
  recebidos.supervisor.some((e) => e.evento === 'agente:status') ? 'ok' : 'FALHOU');
console.log('   visitante NAO recebeu evento interno:',
  recebidos.visitante.some((e) => e.evento === 'agente:status') ? 'FALHOU (vazou)' : 'ok');

console.log('\ntotais -> agente:', recebidos.agente.length, '| supervisor:', recebidos.supervisor.length, '| visitante:', recebidos.visitante.length);

for (const s of [sockAgente, sockSuper, sockVisitante]) s.disconnect();
process.exit(0);
