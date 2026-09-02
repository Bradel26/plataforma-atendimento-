#!/usr/bin/env node
/**
 * Verificacao das credenciais reais da Meta (pendencia 2.1 e 2.2).
 *
 * O `smoke:canais` prova que a plataforma trata bem um webhook da Meta: monta o
 * payload, assina com HMAC e confere o roteamento. O que ele nao pode provar e
 * que a CONTA existe, que o token e valido, que o app esta inscrito nos eventos
 * e que a URL do webhook passa a verificacao da Meta — porque nada disso e
 * decidido aqui. Este script cobre exatamente essa metade.
 *
 * Read-only por padrao. Nao cria conversa, nao envia mensagem, nao altera
 * inscricao. As duas verificacoes que tocam a plataforma foram escolhidas para
 * nao escrever nada:
 *
 *   - a verificacao (GET) e o mesmo handshake que a Meta faz ao cadastrar a URL;
 *   - o POST leva um payload de STATUS, que o parser normaliza para zero
 *     mensagens. Ele exercita a validacao de assinatura de ponta a ponta com o
 *     appSecret real e mesmo assim nao registra mensagem nenhuma.
 *
 * Enviar mensagem de verdade e opt-in, com `--enviar <numero>`, porque isso
 * gasta janela de atendimento e aparece no telefone de alguem.
 *
 * Uso:
 *   node scripts/verificar-meta.mjs <arquivo .env> [url-da-plataforma]
 *   node scripts/verificar-meta.mjs <arquivo .env> <url> --enviar 5551999999999
 *
 * O arquivo .env precisa das chaves abaixo (as de canal que voce nao usa podem
 * ficar de fora — o que faltar e reportado como pulado, nao como falha):
 *
 *   META_ACCESS_TOKEN=      token do usuario de sistema (permanente, de preferencia)
 *   META_APP_SECRET=        App Secret, o MESMO gravado no canal da plataforma
 *   META_VERIFY_TOKEN=      hub.verify_token, o MESMO gravado no canal
 *   META_PHONE_NUMBER_ID=   WhatsApp: id do numero
 *   META_WABA_ID=           WhatsApp: id da conta business (para templates)
 *   META_PAGE_ID=           Messenger/Instagram: id da pagina
 *
 * `.env.*` esta no .gitignore — nenhuma dessas chaves e impressa em nenhum
 * momento, nem mascarada.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHmac } from 'node:crypto';

const GRAPH = 'https://graph.facebook.com/v21.0';

const argumentos = process.argv.slice(2);
const posicionais = argumentos.filter((a) => !a.startsWith('--'));
const [arquivoEnv, urlBase = 'https://zios6of26x7kizkh57fxw62t.187.127.32.153.sslip.io'] = posicionais;
const indiceEnviar = argumentos.indexOf('--enviar');
const destinoTeste = indiceEnviar >= 0 ? argumentos[indiceEnviar + 1] : null;

if (!arquivoEnv) {
  console.error('uso: node scripts/verificar-meta.mjs <arquivo .env> [url] [--enviar <numero>]');
  process.exit(2);
}

function env(chave) {
  const texto = readFileSync(resolve(arquivoEnv), 'utf8');
  const m = new RegExp(`^\\s*${chave}\\s*=\\s*"?([^"\r\n]*)"?\\s*$`, 'm').exec(texto);
  const valor = m ? m[1].trim() : '';
  return valor || null;
}

const TOKEN = env('META_ACCESS_TOKEN');
const APP_SECRET = env('META_APP_SECRET');
const VERIFY_TOKEN = env('META_VERIFY_TOKEN');
const PHONE_ID = env('META_PHONE_NUMBER_ID');
const WABA_ID = env('META_WABA_ID');
const PAGE_ID = env('META_PAGE_ID');

let ok = 0;
let falhas = 0;
let pulados = 0;

const passou = (rotulo, detalhe = '') => {
  ok += 1;
  console.log(`  ok      ${rotulo}${detalhe ? ` — ${detalhe}` : ''}`);
};
const falhou = (rotulo, detalhe = '') => {
  falhas += 1;
  console.log(`  FALHOU  ${rotulo}${detalhe ? ` — ${detalhe}` : ''}`);
};
const pulou = (rotulo, motivo) => {
  pulados += 1;
  console.log(`  --      ${rotulo} — ${motivo}`);
};
const secao = (titulo) => console.log(`\n${titulo}:`);

/** Chamada a Graph. Devolve o corpo e o erro da Meta ja destrinchado. */
async function graph(caminho) {
  const juncao = caminho.includes('?') ? '&' : '?';
  try {
    const res = await fetch(`${GRAPH}${caminho}${juncao}access_token=${encodeURIComponent(TOKEN)}`);
    const corpo = await res.json().catch(() => ({}));
    return { status: res.status, corpo, erro: corpo?.error?.message ?? null };
  } catch (e) {
    return { status: 0, corpo: {}, erro: e.message };
  }
}

console.log(`verificando credenciais da Meta contra ${GRAPH}`);
console.log(`plataforma: ${urlBase}`);

// ---------------------------------------------------------------- 1. o token
secao('token');

if (!TOKEN) {
  falhou('META_ACCESS_TOKEN ausente', 'sem token nao ha o que verificar na Graph');
} else {
  // debug_token e a unica rota que responde "este token e valido ate quando e
  // com quais permissoes". Um GET /me devolve 200 para token de app tambem, o
  // que daria falso positivo.
  const { corpo, erro } = await graph(`/debug_token?input_token=${encodeURIComponent(TOKEN)}`);
  const dados = corpo?.data;

  if (erro) {
    falhou('token recusado pela Meta', erro);
  } else if (!dados?.is_valid) {
    falhou('token invalido', dados?.error?.message ?? 'is_valid = false');
  } else {
    passou('token valido', `app_id=${dados.app_id} tipo=${dados.type ?? 'n/d'}`);

    if (!dados.expires_at) {
      passou('token sem expiracao', 'usuario de sistema, permanente');
    } else {
      const dias = Math.round((dados.expires_at * 1000 - Date.now()) / 86400000);
      if (dias <= 7) {
        falhou('token expira em breve', `${dias} dia(s) — troque por token de usuario de sistema`);
      } else {
        passou('token com validade folgada', `${dias} dia(s)`);
      }
    }

    const escopos = dados.scopes ?? [];
    const necessarios = ['whatsapp_business_messaging', 'pages_messaging'];
    const presentes = necessarios.filter((e) => escopos.includes(e));
    if (presentes.length === 0) {
      falhou('nenhum escopo de mensageria no token', `escopos: ${escopos.join(', ') || 'nenhum'}`);
    } else {
      passou('escopos de mensageria presentes', presentes.join(', '));
    }
  }
}

// ------------------------------------------------------------ 2. WhatsApp
secao('WhatsApp Business');

if (!TOKEN || !PHONE_ID) {
  pulou('numero do WhatsApp', 'META_PHONE_NUMBER_ID nao informado');
} else {
  const { corpo, erro } = await graph(
    `/${PHONE_ID}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status`,
  );
  if (erro) {
    falhou('numero nao encontrado', erro);
  } else {
    passou('numero existe e o token o alcanca', `${corpo.display_phone_number} (${corpo.verified_name})`);

    if (corpo.code_verification_status === 'VERIFIED') {
      passou('numero verificado na Meta');
    } else {
      falhou('numero nao verificado', `code_verification_status=${corpo.code_verification_status ?? 'n/d'}`);
    }

    // Qualidade RED significa entrega restrita: a plataforma funciona e as
    // mensagens somem. Vale falhar aqui em vez de descobrir em producao.
    const qualidade = corpo.quality_rating ?? 'UNKNOWN';
    if (qualidade === 'RED') {
      falhou('qualidade do numero em RED', 'a Meta esta limitando a entrega deste numero');
    } else {
      passou('qualidade do numero', qualidade);
    }
  }
}

if (!TOKEN || !WABA_ID) {
  pulou('inscricao e templates do WhatsApp', 'META_WABA_ID nao informado');
} else {
  const inscricao = await graph(`/${WABA_ID}/subscribed_apps`);
  if (inscricao.erro) {
    falhou('inscricao do app na conta business', inscricao.erro);
  } else {
    const apps = inscricao.corpo?.data ?? [];
    if (apps.length === 0) {
      falhou(
        'app NAO inscrito na conta business',
        'sem isto a Meta nunca chama o webhook — inscreva em Configuracao > Webhooks',
      );
    } else {
      passou('app inscrito na conta business', apps.map((a) => a.whatsapp_business_api_data?.name ?? a.id).join(', '));
    }
  }

  // Pendencia 2.2: campanha fora da janela de 24h exige template aprovado.
  const templates = await graph(`/${WABA_ID}/message_templates?fields=name,status,language,category&limit=100`);
  if (templates.erro) {
    falhou('templates de mensagem', templates.erro);
  } else {
    const lista = templates.corpo?.data ?? [];
    const aprovados = lista.filter((t) => t.status === 'APPROVED');
    const pendentes = lista.filter((t) => t.status === 'PENDING');
    const recusados = lista.filter((t) => t.status === 'REJECTED');

    if (aprovados.length === 0) {
      falhou(
        'nenhum template aprovado',
        `${lista.length} template(s) cadastrado(s) — campanha fora da janela de 24h vai ser recusada`,
      );
    } else {
      passou(
        'templates aprovados',
        aprovados.map((t) => `${t.name} (${t.language})`).join(', '),
      );
    }
    if (pendentes.length) pulou('templates em analise', pendentes.map((t) => t.name).join(', '));
    if (recusados.length) falhou('templates recusados pela Meta', recusados.map((t) => t.name).join(', '));
  }
}

// ------------------------------------------- 3. Messenger e Instagram Direct
secao('Messenger e Instagram Direct');

if (!TOKEN || !PAGE_ID) {
  pulou('pagina do Facebook', 'META_PAGE_ID nao informado');
} else {
  const { corpo, erro } = await graph(`/${PAGE_ID}?fields=id,name,instagram_business_account`);
  if (erro) {
    falhou('pagina nao encontrada', erro);
  } else {
    passou('pagina existe e o token a alcanca', corpo.name);

    if (corpo.instagram_business_account?.id) {
      passou('Instagram Business ligado a pagina', `ig=${corpo.instagram_business_account.id}`);
    } else {
      pulou('Instagram Business', 'nenhuma conta profissional ligada a esta pagina');
    }
  }

  const inscricao = await graph(`/${PAGE_ID}/subscribed_apps`);
  if (inscricao.erro) {
    falhou('inscricao do app na pagina', inscricao.erro);
  } else {
    const apps = inscricao.corpo?.data ?? [];
    const campos = apps.flatMap((a) => a.subscribed_fields ?? []);
    if (apps.length === 0) {
      falhou('app NAO inscrito na pagina', 'sem isto a Meta nunca chama o webhook');
    } else if (!campos.includes('messages')) {
      falhou('app inscrito sem o campo `messages`', `campos: ${campos.join(', ') || 'nenhum'}`);
    } else {
      passou('app inscrito na pagina com o campo `messages`', campos.join(', '));
    }
  }
}

// ---------------------------------------------- 4. a plataforma, sem escrever
secao('webhook da plataforma (nao escreve nada)');

for (const canal of ['whatsapp', 'instagram', 'facebook']) {
  if (!VERIFY_TOKEN) {
    pulou(`handshake de ${canal}`, 'META_VERIFY_TOKEN nao informado');
    continue;
  }

  // O mesmo GET que a Meta faz ao salvar a URL do webhook. Se isto nao devolver
  // o challenge, o cadastro na Meta falha — nao ha como o canal funcionar.
  const desafio = `desafio-${canal}-${Math.floor(Math.random() * 1e9)}`;
  const url =
    `${urlBase}/api/webhooks/${canal}?hub.mode=subscribe` +
    `&hub.verify_token=${encodeURIComponent(VERIFY_TOKEN)}&hub.challenge=${desafio}`;

  try {
    const res = await fetch(url);
    const texto = (await res.text()).trim();
    if (res.status === 200 && texto === desafio) {
      passou(`handshake de ${canal}`, 'challenge devolvido em texto puro');
    } else if (res.status === 403) {
      falhou(
        `handshake de ${canal}`,
        'verify_token nao bate com o gravado no canal (ou o canal nao esta ativo)',
      );
    } else {
      falhou(`handshake de ${canal}`, `status ${res.status}, corpo ${texto.slice(0, 80)}`);
    }
  } catch (e) {
    falhou(`handshake de ${canal}`, e.message);
  }
}

if (!APP_SECRET || !PHONE_ID) {
  pulou('assinatura real do WhatsApp', 'exige META_APP_SECRET e META_PHONE_NUMBER_ID');
} else {
  // Payload de STATUS: entrega de recibo, nao mensagem. O parser normaliza para
  // zero mensagens, entao o caminho da assinatura e exercitado inteiro sem que
  // uma conversa apareca na producao.
  const corpo = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: WABA_ID ?? PHONE_ID,
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '0', phone_number_id: PHONE_ID },
              statuses: [
                {
                  id: 'wamid.verificacao-de-assinatura',
                  status: 'delivered',
                  recipient_id: '0',
                },
              ],
            },
          },
        ],
      },
    ],
  });

  const enviarWebhook = async (assinatura) => {
    const res = await fetch(`${urlBase}/api/webhooks/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': assinatura },
      body: corpo,
    });
    return { status: res.status, corpo: await res.json().catch(() => ({})) };
  };

  const errada = await enviarWebhook('sha256=' + '0'.repeat(64));
  if (errada.status === 401) {
    passou('assinatura errada recusada', 'status 401');
  } else if (errada.status === 503) {
    // A rota resolve a organizacao pelo phone_number_id ANTES de olhar
    // assinatura: sem canal WHATSAPP ativo com este numero, ela responde 503 e
    // o caminho da assinatura nem e alcancado. Isso nao e o webhook aceitando
    // corpo qualquer — e o canal ainda nao existir.
    pulou(
      'assinatura errada',
      'canal WHATSAPP inativo ou com outro phone_number_id — a assinatura nem foi consultada',
    );
  } else {
    falhou('assinatura errada NAO recusada', `status ${errada.status} — o webhook aceita qualquer corpo`);
  }

  const certa = await enviarWebhook(`sha256=${createHmac('sha256', APP_SECRET).update(corpo).digest('hex')}`);
  if (certa.status === 200 && certa.corpo?.recebidas === 0) {
    passou('assinatura real aceita', 'o appSecret do arquivo bate com o gravado no canal, e nada foi registrado');
  } else if (certa.status === 401) {
    falhou(
      'assinatura real recusada',
      'o META_APP_SECRET deste arquivo e diferente do gravado no canal da plataforma',
    );
  } else if (certa.status === 503) {
    falhou('canal WHATSAPP inativo na plataforma', 'ative em Configuracoes > Canais com as tres credenciais');
  } else {
    falhou('assinatura real', `status ${certa.status}, corpo ${JSON.stringify(certa.corpo).slice(0, 120)}`);
  }
}

// ------------------------------------------------- 5. envio real (opt-in)
if (destinoTeste) {
  secao(`envio real para ${destinoTeste} (--enviar)`);

  if (!TOKEN || !PHONE_ID) {
    falhou('envio', 'exige META_ACCESS_TOKEN e META_PHONE_NUMBER_ID');
  } else {
    const res = await fetch(`${GRAPH}/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: destinoTeste,
        type: 'text',
        text: { preview_url: false, body: 'Teste de integracao da plataforma de atendimento.' },
      }),
    });
    const corpo = await res.json().catch(() => ({}));

    if (res.status === 200 && corpo.messages?.[0]?.id) {
      passou('mensagem aceita pela Graph', `wamid=${corpo.messages[0].id}`);
      console.log('\n  Confira o aparelho. Se ela chegou, o canal de saida esta provado de verdade.');
    } else if (corpo?.error?.code === 131047 || /24 hours|24 horas/i.test(corpo?.error?.message ?? '')) {
      pulou(
        'mensagem de texto recusada',
        'fora da janela de 24h — esperado. Peca ao destinatario que escreva primeiro, ou use template aprovado',
      );
    } else {
      falhou('envio recusado', corpo?.error?.message ?? `status ${res.status}`);
    }
  }
} else {
  secao('envio real');
  pulou('envio de mensagem', 'nao pedido — use `--enviar <numero>` para provar o canal de saida');
}

console.log(`\n${ok} ok, ${falhas} falha(s), ${pulados} pulado(s)`);
if (falhas > 0) {
  console.log('\nEnquanto houver falha acima, o canal nao esta pronto para mensagem real.');
}
process.exit(falhas > 0 ? 1 : 0);
