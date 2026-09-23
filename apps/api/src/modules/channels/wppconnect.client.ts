import { AppError } from '../../lib/errors';
import {
  obterConfigWppConnect,
  obterUrlWebhookWppConnect,
  type ConfigWppConnect,
} from '../../config/wppconnect.config';
import { numeroNormalizado, type EstadoDaPonte } from './whatsapp.modo';
import type { ConfigDaPonte, QrDaPonte } from './whatsapp.ponte';

/**
 * O driver do WhatsApp via WPPConnect Server: fala HTTP diretamente com ele
 * (nao com a Ponte do Baileys — `whatsapp.ponte.ts` — que e um dialeto
 * proprio e nao o protocolo do WPPConnect Server).
 *
 * A conexao (URL, secret key, token) e global (`wppconnect.config.ts`); so a
 * sessao varia por canal, via `ChannelConfig.ponteSessao` — nunca assumir um
 * nome fixo de sessao aqui.
 *
 * Referencia da API usada (WPPConnect Server 2.10.27):
 * - `POST /api/{session}/{secretKey}/generate-token` -> `{ status, token, session, full }`
 * - `GET  /api/{session}/status-session`              -> `{ status, qrcode, urlcode, version }`
 * - `POST /api/{session}/start-session`  `{ webhook, waitQrCode }` -> `{ status: 'qrcode', qrcode, urlcode }`
 *   (sessao ja existente: o mesmo corpo do `status-session`; o webhook so e gravado se ela estava fechada)
 * - `POST /api/{session}/send-message`                -> `{ status: 'success', response }`
 * - `POST /api/{session}/send-file-base64`             -> `{ status: 'success', response }`
 * - `POST /api/{session}/logout-session`
 * Sessao nunca iniciada: `status-session` responde 200 `{ status: 'CLOSED', qrcode: null }`.
 * Nas rotas de envio/logout, sessao desconectada responde 404 `{ status: 'Disconnected', ... }`
 * (middleware `statusConnection` do WPPConnect Server).
 */

const TEMPO_LIMITE = 15_000;

type Resultado = { idExterno: string | null };
type CorpoWpp = Record<string, unknown>;

/** Token por sessao, gerado via secret key. Token fixo (env) nao usa este cache. */
const cacheToken = new Map<string, string>();

function obterConfigOuFalhar(): ConfigWppConnect {
  let cfg: ConfigWppConnect | null;
  try {
    cfg = obterConfigWppConnect();
  } catch (err) {
    throw new AppError(503, 'CANAL_INDISPONIVEL', err instanceof Error ? err.message : 'WPPConnect mal configurado');
  }
  if (!cfg) {
    throw new AppError(
      503,
      'CANAL_INDISPONIVEL',
      'O WPPConnect nao esta configurado (defina WPP_CONNECT_URL e WPP_CONNECT_SECRET_KEY ou WPP_CONNECT_TOKEN)',
    );
  }
  return cfg;
}

/** Versao que nao lanca, para os diagnosticos (`getQRCode`/`getStatus`) que nunca devem quebrar a tela. */
function configOuNulo(): ConfigWppConnect | null {
  try {
    return obterConfigWppConnect();
  } catch {
    return null;
  }
}

function sessaoObrigatoria(config: ConfigDaPonte): string {
  const sessao = config.ponteSessao?.trim();
  if (!sessao) {
    throw new AppError(503, 'CANAL_INDISPONIVEL', 'Falta a sessao do WPPConnect (ponteSessao) para este canal');
  }
  return sessao;
}

async function gerarToken(cfg: ConfigWppConnect, sessao: string): Promise<string> {
  if (!cfg.secretKey) {
    throw new AppError(
      503,
      'CANAL_INDISPONIVEL',
      'O WPPConnect nao tem WPP_CONNECT_SECRET_KEY nem WPP_CONNECT_TOKEN configurado',
    );
  }

  const raiz = cfg.url.replace(/\/+$/, '');
  const caminho = `${raiz}/api/${encodeURIComponent(sessao)}/${encodeURIComponent(cfg.secretKey)}/generate-token`;

  let resposta: Response;
  try {
    resposta = await fetch(caminho, { method: 'POST', signal: AbortSignal.timeout(TEMPO_LIMITE) });
  } catch (err) {
    throw new AppError(
      502,
      'WPPCONNECT_INACESSIVEL',
      `Nao foi possivel gerar o token do WPPConnect: ${err instanceof Error ? err.message : 'erro de rede'}`,
    );
  }

  const dados = await lerCorpo(resposta);
  const token = dados.token;
  if (!resposta.ok || typeof token !== 'string' || !token) {
    throw new AppError(
      502,
      'WPPCONNECT_TOKEN_RECUSADO',
      `O WPPConnect recusou gerar o token (${resposta.status}): ${
        typeof dados.message === 'string' ? dados.message : typeof dados.error === 'string' ? dados.error : 'sem detalhe'
      }`,
    );
  }
  return token;
}

async function tokenPara(cfg: ConfigWppConnect, sessao: string): Promise<string> {
  if (cfg.token) return cfg.token;

  const emCache = cacheToken.get(sessao);
  if (emCache) return emCache;

  const gerado = await gerarToken(cfg, sessao);
  cacheToken.set(sessao, gerado);
  return gerado;
}

async function lerCorpo(resposta: Response): Promise<CorpoWpp> {
  return (await resposta.json().catch(() => ({}))) as CorpoWpp;
}

/**
 * Chama uma rota autenticada do WPPConnect Server.
 *
 * Se o token veio de `WPP_CONNECT_SECRET_KEY` (gerado por nos, em cache) e a
 * resposta for 401, gera um novo token e tenta **uma unica vez** — o cache
 * pode estar com um token expirado ou invalidado do lado do servidor. Sem
 * retry alem desse (nao ha retry infinito) e sem retry nenhum quando o token
 * e fixo (`WPP_CONNECT_TOKEN`), porque nesse caso um 401 e erro de
 * configuracao, nao token vencido.
 */
async function chamarAutenticado(
  cfg: ConfigWppConnect,
  sessao: string,
  caminho: string,
  init: RequestInit,
): Promise<Response> {
  const raiz = cfg.url.replace(/\/+$/, '');
  const url = `${raiz}${caminho}`;

  const tentar = async (): Promise<Response> => {
    const token = await tokenPara(cfg, sessao);
    try {
      return await fetch(url, {
        ...init,
        headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(TEMPO_LIMITE),
      });
    } catch (err) {
      throw new AppError(
        502,
        'WPPCONNECT_INACESSIVEL',
        `Nao foi possivel falar com o WPPConnect: ${err instanceof Error ? err.message : 'erro de rede'}`,
      );
    }
  };

  let resposta = await tentar();
  if (resposta.status === 401 && !cfg.token) {
    cacheToken.delete(sessao);
    resposta = await tentar();
  }
  return resposta;
}

function ehSessaoDesconectada(dados: CorpoWpp): boolean {
  return typeof dados.status === 'string' && dados.status.trim().toLowerCase() === 'disconnected';
}

function idExternoDe(dados: CorpoWpp): string | null {
  const resposta = dados.response as Record<string, unknown> | Array<Record<string, unknown>> | undefined;
  const item = Array.isArray(resposta) ? resposta[0] : resposta;
  const id = item?.id as unknown;
  if (typeof id === 'string') return id;
  if (id && typeof id === 'object' && typeof (id as Record<string, unknown>)._serialized === 'string') {
    return (id as Record<string, unknown>)._serialized as string;
  }
  return null;
}

const STATUS_CONECTADO = new Set(['CONNECTED', 'INCHAT', 'ISLOGGED', 'QRREADSUCCESS', 'CHATSAVAILABLE']);
const STATUS_DESCONECTADO = new Set([
  'CLOSED',
  'DISCONNECTED',
  'NOTLOGGED',
  'BROWSERCLOSE',
  'SERVERCLOSE',
  'DEVICENOTCONNECTED',
  'DESCONNECTEDMOBILE',
  'DELETETOKEN',
  'QRREADFAIL',
  'AUTOCLOSECALLED',
]);

function situacaoDeStatus(status: unknown): EstadoDaPonte['situacao'] {
  if (typeof status !== 'string') return 'DESCONHECIDO';
  const chave = status.trim().toUpperCase();
  if (STATUS_CONECTADO.has(chave)) return 'CONECTADO';
  if (STATUS_DESCONECTADO.has(chave)) return 'DESCONECTADO';
  return 'DESCONHECIDO';
}

/**
 * Traduz `enderecoExterno` para o par `{ phone, isLid }` que o `send-message`/
 * `send-file-base64` do WPPConnect espera.
 *
 * Um contato endereçado por LID (`<opaco>@lid` — identidade de privacidade do
 * WhatsApp, ver ETAPA 6) nao tem telefone por tras: `numeroNormalizado` so
 * extrai digitos, e o WPPConnect recusa esses digitos como se fossem um
 * numero real ("O numero X nao existe" — confirmado empiricamente). O
 * proprio WPPConnect Server ja aceita o LID via `isLid: true`, mandando o
 * identificador **verbatim** (nunca convertido para `@c.us` nem para
 * telefone) — testado com o id puro e com o jid completo, os dois
 * funcionam; mantemos o jid completo por preservar o dado tal como chegou.
 *
 * Numero comum segue exatamente como antes: `numeroNormalizado`, sem `isLid`.
 */
function destinoParaWpp(destino: string): { phone: string; isLid: boolean } {
  if (destino.toLowerCase().endsWith('@lid')) {
    return { phone: destino, isLid: true };
  }

  const numero = numeroNormalizado(destino);
  if (!numero) {
    throw new AppError(
      400,
      'NUMERO_INVALIDO',
      `Numero "${destino}" nao parece um telefone com DDD — corrija o cadastro do contato`,
    );
  }
  return { phone: numero, isLid: false };
}

/** Manda texto pelo WPPConnect Server. */
export async function enviarTextoWpp(config: ConfigDaPonte, destino: string, texto: string): Promise<Resultado> {
  const cfg = obterConfigOuFalhar();
  const sessao = sessaoObrigatoria(config);

  const { phone, isLid } = destinoParaWpp(destino);

  // Diagnostico do teste real (ETAPA 3/6): confirma que a requisicao saiu, qual
  // sessao levou e se foi tratada como LID, sem nunca imprimir o token/Authorization.
  console.log(`[crm] wppconnect.client enviarTextoWpp sessao=${sessao} destino=${phone} isLid=${isLid}`);

  const resposta = await chamarAutenticado(cfg, sessao, `/api/${encodeURIComponent(sessao)}/send-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, isGroup: false, isNewsletter: false, isLid, message: texto }),
  });

  console.log(`[crm] wppconnect.client enviarTextoWpp resposta status=${resposta.status} ok=${resposta.ok}`);

  const dados = await lerCorpo(resposta);

  if (resposta.status === 404 && ehSessaoDesconectada(dados)) {
    throw new AppError(503, 'CANAL_INDISPONIVEL', 'A sessao do WPPConnect nao esta conectada');
  }
  if (!resposta.ok) {
    throw new AppError(
      502,
      'ENVIO_RECUSADO',
      `O WPPConnect recusou o envio (${resposta.status}): ${
        typeof dados.message === 'string' ? dados.message : 'sem detalhe'
      }`,
    );
  }

  return { idExterno: idExternoDe(dados) };
}

/** Manda arquivo pelo WPPConnect Server, em base64 (`send-file-base64`). */
export async function enviarArquivoWpp(
  config: ConfigDaPonte,
  destino: string,
  arquivo: { buffer: Buffer; nome: string; tipo: string; legenda?: string },
): Promise<Resultado> {
  const cfg = obterConfigOuFalhar();
  const sessao = sessaoObrigatoria(config);

  const { phone, isLid } = destinoParaWpp(destino);

  const base64 = `data:${arquivo.tipo};base64,${arquivo.buffer.toString('base64')}`;

  const resposta = await chamarAutenticado(cfg, sessao, `/api/${encodeURIComponent(sessao)}/send-file-base64`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone,
      isGroup: false,
      isNewsletter: false,
      isLid,
      base64,
      filename: arquivo.nome,
      caption: arquivo.legenda ?? '',
    }),
  });

  const dados = await lerCorpo(resposta);

  if (resposta.status === 404 && ehSessaoDesconectada(dados)) {
    throw new AppError(503, 'CANAL_INDISPONIVEL', 'A sessao do WPPConnect nao esta conectada');
  }
  if (!resposta.ok) {
    throw new AppError(
      502,
      'ENVIO_RECUSADO',
      `O WPPConnect recusou o envio (${resposta.status}): ${
        typeof dados.message === 'string' ? dados.message : 'sem detalhe'
      }`,
    );
  }

  return { idExterno: idExternoDe(dados) };
}

/**
 * O QR em data URL, venha de onde vier: `status-session` ja devolve
 * `data:image/png;base64,...`, mas o `start-session` com `waitQrCode`
 * devolve o base64 puro (`exportQR` no WPPConnect Server 2.10.27).
 */
function qrComoDataUrl(valor: unknown): string | null {
  if (typeof valor !== 'string' || !valor.trim()) return null;
  if (valor.startsWith('data:image/')) return valor;
  return `data:image/png;base64,${valor.trim()}`;
}

/**
 * Sessao que ainda nao existe no WPPConnect Server — nunca iniciada, ou
 * derrubada (QR nao escaneado a tempo, celular desconectou). O servidor 2.x
 * responde 200 `{ status: 'CLOSED', qrcode: null }` no `status-session`; o 404
 * `Disconnected` vem do middleware das rotas de envio, mas e tratado igual por
 * garantia — os dois significam "nao ha sessao de pe".
 */
function sessaoPrecisaIniciar(resposta: Response, dados: CorpoWpp): boolean {
  if (resposta.status === 404 && ehSessaoDesconectada(dados)) return true;
  return resposta.ok && typeof dados.status === 'string' && dados.status.trim().toUpperCase() === 'CLOSED';
}

/**
 * Inicio em andamento por sessao. A tela pede QR a cada poucos segundos, e o
 * Chromium do WPPConnect demora mais que isso para subir: sem isto, cada
 * pedido que chegasse durante a subida mandaria outro `start-session`. O
 * proprio servidor ignora o segundo (ele marca INITIALIZING na hora), mas
 * cada chamada ainda seguraria uma conexao aberta ate o QR sair.
 */
const iniciando = new Map<string, Promise<CorpoWpp | null>>();

/**
 * `POST /api/{session}/start-session` com o webhook desta API.
 *
 * `waitQrCode: true` faz o servidor responder so quando o QR sai (`{ status:
 * 'qrcode', qrcode, urlcode }`). Se a sessao restaurar pelo token salvo, sem
 * QR, ele pode nao responder nada ate o nosso timeout — por isso a falha aqui
 * e engolida (devolve `null`) e quem chama consulta o `status-session` de novo.
 */
function iniciarSessao(cfg: ConfigWppConnect, sessao: string, webhook: string): Promise<CorpoWpp | null> {
  const emAndamento = iniciando.get(sessao);
  if (emAndamento) return emAndamento;

  const promessa = (async () => {
    try {
      console.log(`[crm] wppconnect.client start-session sessao=${sessao}`);
      const resposta = await chamarAutenticado(cfg, sessao, `/api/${encodeURIComponent(sessao)}/start-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhook, waitQrCode: true }),
      });
      return resposta.ok ? await lerCorpo(resposta) : null;
    } catch {
      return null;
    } finally {
      iniciando.delete(sessao);
    }
  })();

  iniciando.set(sessao, promessa);
  return promessa;
}

async function statusDaSessao(cfg: ConfigWppConnect, sessao: string) {
  const resposta = await chamarAutenticado(cfg, sessao, `/api/${encodeURIComponent(sessao)}/status-session`, {
    method: 'GET',
  });
  return { resposta, dados: await lerCorpo(resposta) };
}

function qrDeStatus(dados: CorpoWpp): QrDaPonte {
  const conectado = situacaoDeStatus(dados.status) === 'CONECTADO';
  const qr = conectado ? null : qrComoDataUrl(dados.qrcode);
  return {
    qr,
    conectado,
    motivo: qr || conectado ? null : `a sessao esta ${typeof dados.status === 'string' ? dados.status : 'sem QR no momento'}`,
  };
}

/**
 * Busca o QR Code de pareamento no WPPConnect Server — e, se a sessao ainda
 * nao existir la, inicia (vale igual para linha pessoal e compartilhada: so
 * `ponteSessao` muda).
 *
 * Nunca lanca (mesmo motivo do gemeo em `whatsapp.ponte.ts`): e a tela que
 * existe para consertar a conexao. Usa `status-session`, que ja devolve o QR
 * como data URL (`qrcode`) quando ha um pendente — `qrcode-session` devolve a
 * imagem crua (PNG), sem JSON, e exigiria decodificar o binario aqui por
 * nenhum ganho.
 *
 * So `qrWpp` inicia sessao; `estadoWpp` nao. O estado e consultado pela tela
 * de Canais so para exibir, e subir um Chromium para quem so abriu a tela
 * seria efeito colateral de uma leitura.
 */
export async function qrWpp(config: ConfigDaPonte): Promise<QrDaPonte> {
  const sessao = config.ponteSessao?.trim();
  if (!sessao) return { qr: null, conectado: false, motivo: 'a sessao do WPPConnect ainda nao foi configurada' };

  const cfg = configOuNulo();
  if (!cfg) return { qr: null, conectado: false, motivo: 'o WPPConnect ainda nao foi configurado' };

  try {
    const { resposta, dados } = await statusDaSessao(cfg, sessao);

    if (sessaoPrecisaIniciar(resposta, dados)) {
      const webhook = obterUrlWebhookWppConnect();
      if (!webhook) {
        return {
          qr: null,
          conectado: false,
          motivo:
            'falta WPP_CONNECT_WEBHOOK_SECRET (ou PUBLIC_URL/WEB_ORIGIN) na API: sem webhook a sessao nao receberia mensagens',
        };
      }

      const iniciada = await iniciarSessao(cfg, sessao, webhook);
      const qrDoInicio = qrComoDataUrl(iniciada?.qrcode);
      if (qrDoInicio) return { qr: qrDoInicio, conectado: false, motivo: null };

      const depois = await statusDaSessao(cfg, sessao);
      if (!depois.resposta.ok) {
        return { qr: null, conectado: false, motivo: `o WPPConnect respondeu ${depois.resposta.status}` };
      }
      return qrDeStatus(depois.dados);
    }

    if (!resposta.ok) {
      return { qr: null, conectado: false, motivo: `o WPPConnect respondeu ${resposta.status}` };
    }

    return qrDeStatus(dados);
  } catch (err) {
    return {
      qr: null,
      conectado: false,
      motivo: err instanceof Error ? err.message : 'nao foi possivel falar com o WPPConnect',
    };
  }
}

/**
 * Pergunta ao WPPConnect Server se a sessao esta de pe.
 *
 * Nunca lanca — mesmo raciocinio de `estadoDaPonte`: diagnostico que falha
 * responde DESCONHECIDO, nao DESCONECTADO, porque o problema pode ser so a
 * rede entre nos e o servidor.
 */
export async function estadoWpp(config: ConfigDaPonte): Promise<EstadoDaPonte> {
  const sessao = config.ponteSessao?.trim();
  if (!sessao) return { situacao: 'DESCONHECIDO', detalhe: 'sessao do WPPConnect nao informada' };

  const cfg = configOuNulo();
  if (!cfg) return { situacao: 'DESCONHECIDO', detalhe: 'WPPConnect nao configurado' };

  try {
    const resposta = await chamarAutenticado(cfg, sessao, `/api/${encodeURIComponent(sessao)}/status-session`, {
      method: 'GET',
    });
    const dados = await lerCorpo(resposta);

    if (!resposta.ok) {
      return { situacao: 'DESCONHECIDO', detalhe: `o WPPConnect respondeu ${resposta.status}` };
    }

    return {
      situacao: situacaoDeStatus(dados.status),
      detalhe: typeof dados.status === 'string' ? dados.status : null,
    };
  } catch (err) {
    return {
      situacao: 'DESCONHECIDO',
      detalhe: err instanceof Error ? err.message : 'nao foi possivel falar com o WPPConnect',
    };
  }
}

/**
 * Desfaz o pareamento no WPPConnect Server — o "trocar de numero" da tela.
 *
 * Lanca, diferente dos diagnosticos acima: e uma acao que o usuario pediu.
 */
export async function desconectarWpp(config: ConfigDaPonte): Promise<void> {
  const cfg = obterConfigOuFalhar();
  const sessao = sessaoObrigatoria(config);

  const resposta = await chamarAutenticado(cfg, sessao, `/api/${encodeURIComponent(sessao)}/logout-session`, {
    method: 'POST',
  });

  if (!resposta.ok) {
    const dados = await lerCorpo(resposta);
    throw new AppError(
      502,
      'DESCONEXAO_RECUSADA',
      `O WPPConnect recusou a desconexao (${resposta.status}): ${
        typeof dados.message === 'string' ? dados.message : 'sem detalhe'
      }`,
    );
  }
}
