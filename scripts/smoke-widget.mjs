/**
 * Smoke test do widget embutivel.
 *
 * O comportamento no navegador (bolha, iframe) nao da para verificar sem
 * navegador; o que da, e importa, e que o script servido esteja completo,
 * aponte para a origem certa e reflita o White Label na hora.
 *
 * Uso: npm run smoke:widget  (com a API de pe)
 */
const API = 'http://localhost:3333/api';

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
const { dados: brandingAtual } = await req('GET', '/branding');
const corOriginal = brandingAtual.branding.corPrimaria;

// 1. Uma tag <script> tem de ser suficiente: rota publica, sem autenticacao
const resposta = await fetch(`${API}/widget.js`);
const script = await resposta.text();
checar(resposta.status === 200, '1. widget.js servido sem autenticacao', `status ${resposta.status}`);
checar(
  (resposta.headers.get('content-type') ?? '').includes('javascript'),
  '   com Content-Type de JavaScript',
  String(resposta.headers.get('content-type')),
);

// 2. Conteudo completo e coerente
checar(script.includes("createElement('iframe')"), '2. o widget monta um iframe, nao injeta a interface');
checar(script.includes('/webchat?embed=1'), '   apontando para o Webchat em modo embutido');
checar(script.includes(corOriginal), '   com a cor do White Label aplicada', corOriginal);
checar(!script.includes('undefined'), '   sem nenhum "undefined" no codigo gerado');
checar(script.includes('evento.origin !=='), '   e valida a origem das mensagens recebidas');

// 3. Trocar a cor da marca reflete no widget (o script e gerado, nao estatico)
const corTeste = '#7c3aed';
await req('PUT', '/branding', { token: admin, corpo: { corPrimaria: corTeste } });
const novo = await (await fetch(`${API}/widget.js`)).text();
checar(novo.includes(corTeste), '3. trocar a cor no White Label muda o widget', corTeste);
await req('PUT', '/branding', { token: admin, corpo: { corPrimaria: corOriginal } });

const restaurado = await (await fetch(`${API}/widget.js`)).text();
checar(restaurado.includes(corOriginal), '   cor original restaurada ao fim do teste', corOriginal);

console.log(`\n${falhas} FALHOU`);
process.exit(falhas === 0 ? 0 : 1);
