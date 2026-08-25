/**
 * Smoke test do armazenamento de midia.
 *
 * Cobre o upload de anexo de protocolo, o acesso ao arquivo por URL assinada
 * (com as recusas que a assinatura tem de produzir) e o download da midia que
 * chega pelos canais da Meta.
 *
 * O truque do passo 7: o webhook do Instagram entrega uma URL de imagem, e a URL
 * usada e a do proprio arquivo enviado no passo 1. Assim o caminho
 * "baixar do canal e guardar no storage" e exercitado de verdade, sem depender
 * de conta aprovada na Meta.
 *
 * Uso: npm run smoke:midia  (com a API de pe e o seed aplicado)
 */
import { createHmac } from 'node:crypto';

const API = 'http://localhost:3333/api';
const APP_SECRET = 'segredo-de-teste-do-app-meta';
const TOKEN_FALSO = 'EAAG-token-falso-para-teste-de-erro';
const EXECUCAO = Date.now().toString(36);

/** PNG 1x1 valido, o menor arquivo real possivel para o teste. */
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

const { dados: login } = await req('POST', '/auth/login', {
  corpo: { email: 'admin@plataforma.local', senha: 'Admin@123' },
});
const admin = login.accessToken;

// 1. Upload de arquivo real num protocolo
const { dados: novo } = await req('POST', '/protocolos', {
  token: admin,
  corpo: { titulo: `Anexo de midia ${EXECUCAO}`, descricao: 'Protocolo criado pelo smoke de midia' },
});
const protocoloId = novo.protocolo.id;

const enviar = async (nome, tipo, buffer) => {
  const form = new FormData();
  form.append('arquivo', new Blob([buffer], { type: tipo }), nome);
  const resp = await fetch(`${API}/protocolos/${protocoloId}/anexos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${admin}` },
    body: form,
  });
  return { status: resp.status, dados: await resp.json().catch(() => ({})) };
};

const up = await enviar('print-do-cliente.png', 'image/png', PNG);
const anexo = up.dados.protocolo?.anexos?.at(-1);
checar(up.status === 201, '1. upload de anexo aceito', `status ${up.status}`);
checar(anexo?.url?.startsWith('/api/arquivos/'), '   arquivo guardado no storage', anexo?.url?.slice(0, 34));
checar(anexo?.tamanho === PNG.length, '   tamanho registrado', `${anexo?.tamanho} bytes`);
checar(anexo?.tipo === 'image/png', '   tipo registrado', String(anexo?.tipo));

// 2. A URL assinada entrega o arquivo, byte a byte
// A API ja devolve a URL assinada; o navegador so precisa seguir o link.
const baixado = await fetch(`http://localhost:3333${anexo.url}`);
const bytes = Buffer.from(await baixado.arrayBuffer());
checar(baixado.status === 200, '2. URL assinada entrega o arquivo', `status ${baixado.status}`);
checar(bytes.equals(PNG), '   conteudo identico ao enviado', `${bytes.length} bytes`);
checar(
  baixado.headers.get('content-type') === 'image/png',
  '   servido com o tipo declarado',
  String(baixado.headers.get('content-type')),
);
checar(
  baixado.headers.get('x-content-type-options') === 'nosniff',
  '   com nosniff, para o navegador nao reinterpretar',
);

// 3. Sem assinatura, com assinatura adulterada e fora do storage: nao entrega
const caminho = anexo.url.split('?')[0];
const semToken = await fetch(`http://localhost:3333${caminho}`);
checar(semToken.status === 401, '3. sem assinatura o arquivo nao abre', `status ${semToken.status}`);

const adulterada = anexo.url.replace(/t=(\d+)\.(\w)/, (_m, exp, c) => `t=${exp}.${c === 'a' ? 'b' : 'a'}`);
const comLixo = await fetch(`http://localhost:3333${adulterada}`);
checar(comLixo.status === 401, '   assinatura adulterada recusada', `status ${comLixo.status}`);

const travessia = await fetch('http://localhost:3333/api/arquivos/2026/08/..%2f..%2fpackage.json?t=1.2');
checar(travessia.status === 401, '   travessia de diretorio recusada', `status ${travessia.status}`);

// 4. Tipo fora da lista (SVG executa script no dominio da aplicacao)
const svg = await enviar('planilha.svg', 'image/svg+xml', Buffer.from('<svg onload="alert(1)"/>'));
checar(svg.status === 400, '4. tipo fora da lista recusado', `status ${svg.status}`);

// 5. Anexo por link externo continua valendo
const externo = await req('POST', `/protocolos/${protocoloId}/anexos`, {
  token: admin,
  corpo: { nome: 'Contrato no Drive', url: 'https://exemplo.com/contrato.pdf' },
});
checar(externo.status === 201, '5. anexo por URL externa aceito', `status ${externo.status}`);
const externoSalvo = externo.dados.protocolo?.anexos?.find((a) => a.nome === 'Contrato no Drive');
checar(externoSalvo?.url === 'https://exemplo.com/contrato.pdf', '   URL externa nao e assinada');

// 6. Canais configurados para o teste de webhook
const { dados: filas } = await req('GET', '/filas', { token: admin });
for (const [canal, extra] of [
  ['whatsapp', { phoneNumberId: '111222333444' }],
  ['instagram', { pageId: '555666777', igUserId: '888999' }],
]) {
  await req('PUT', `/canais/${canal}`, {
    token: admin,
    corpo: {
      ativo: true,
      accessToken: TOKEN_FALSO,
      appSecret: APP_SECRET,
      verifyToken: 'token-de-verificacao-123',
      filaId: filas.filas[0].id,
      ...extra,
    },
  });
}

const enviarWebhook = async (canal, corpo) =>
  fetch(`${API}/webhooks/${canal}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Signature-256': `sha256=${createHmac('sha256', APP_SECRET).update(corpo).digest('hex')}`,
    },
    body: corpo,
  });

/** Ultima mensagem da conversa mais recente do canal — a que o webhook criou. */
const ultimaMensagemDo = async (canal) => {
  const { dados } = await req('GET', '/conversas?limite=100', { token: admin });
  const conversa = (dados.conversas ?? []).find((c) => c.canal === canal);
  if (!conversa) return null;
  const { dados: det } = await req('GET', `/conversas/${conversa.id}`, { token: admin });
  return (det.conversa?.mensagens ?? []).at(-1) ?? null;
};

// 7. Imagem que chega pelo Instagram e baixada e guardada
const igCorpo = JSON.stringify({
  object: 'instagram',
  entry: [{
    id: 'IG-1',
    messaging: [{
      sender: { id: 'IGSID-midia' },
      recipient: { id: '888999' },
      timestamp: 1787577200,
      message: {
        mid: `mid.midia-${EXECUCAO}`,
        attachments: [{ type: 'image', payload: { url: `http://localhost:3333${anexo.url}` } }],
      },
    }],
  }],
});
const ig = await enviarWebhook('instagram', igCorpo);
const igDados = await ig.json().catch(() => ({}));
checar(igDados.processadas === 1, '6. imagem do Instagram processada', JSON.stringify(igDados));

const igMensagem = await ultimaMensagemDo('INSTAGRAM');
checar(igMensagem?.tipoAnexo === 'IMAGEM', '7. mensagem marcada como imagem', String(igMensagem?.tipoAnexo));
checar(
  igMensagem?.anexoUrl?.startsWith('/api/arquivos/'),
  '   arquivo copiado para o storage da plataforma',
  igMensagem?.anexoUrl?.slice(0, 34),
);

// 8. WhatsApp manda media id; com token falso o download falha e a mensagem
//    tem de existir de qualquer forma — o texto do cliente e o que importa.
const waCorpo = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [{
    id: 'WABA-1',
    changes: [{
      field: 'messages',
      value: {
        metadata: { phone_number_id: '111222333444', display_phone_number: '+5511999998888' },
        contacts: [{ wa_id: '5511955554444', profile: { name: 'Cliente Midia' } }],
        messages: [{
          id: `wamid.midia-${EXECUCAO}`,
          from: '5511955554444',
          timestamp: '1787577300',
          type: 'image',
          image: { id: '9999999999', mime_type: 'image/jpeg' },
        }],
      },
    }],
  }],
});
const wa = await enviarWebhook('whatsapp', waCorpo);
const waDados = await wa.json().catch(() => ({}));
checar(waDados.processadas === 1, '8. imagem do WhatsApp processada mesmo sem baixar', JSON.stringify(waDados));

const waMensagem = await ultimaMensagemDo('WHATSAPP');
checar(waMensagem?.tipoAnexo === 'IMAGEM', '   mensagem preservada com o tipo do anexo', String(waMensagem?.tipoAnexo));
checar(waMensagem?.anexoUrl === null, '   sem anexo baixado, anexoUrl fica nulo', String(waMensagem?.anexoUrl));
checar(waMensagem?.conteudo === '[imagem recebida]', '   agente ve o marcador no lugar', waMensagem?.conteudo);

console.log(`\n${falhas} FALHOU`);
process.exit(falhas === 0 ? 0 : 1);
