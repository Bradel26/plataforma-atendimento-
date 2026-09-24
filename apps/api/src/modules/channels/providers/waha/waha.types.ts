/**
 * Formato do que o WAHA devolve e envia — tipado so no que o CRM le.
 *
 * Tudo opcional e `unknown`-tolerante de proposito: o payload real traz
 * campos que ninguem catalogou e muda entre engines (NOWEB, WEBJS, GOWS). Um
 * tipo apertado demais faria o mapper descartar mensagem legitima.
 *
 * Referencias: waha.devlike.pro/docs/how-to/sessions e /events, e o uso real
 * no Deskcomm (lib/waha/client.ts, envelope.ts) contra WAHA 2026.7 NOWEB.
 */

/** Vocabulario de status de sessao do WAHA — os cinco que a doc e o Deskcomm conhecem. */
export type StatusSessaoWaha = 'STARTING' | 'SCAN_QR_CODE' | 'WORKING' | 'STOPPED' | 'FAILED';

/** Quem esta conectado na sessao. `id` e `5511...@c.us`. */
export type MeWaha = { id?: string | null; pushName?: string | null };

/** `GET /api/sessions/{name}`. */
export type SessaoWaha = {
  name: string;
  status: string;
  me?: MeWaha | null;
  config?: {
    webhooks?: Array<{ url?: string; events?: string[] }> | null;
    [chave: string]: unknown;
  } | null;
  engine?: unknown;
};

/** Configuracao gravada na sessao ao cria-la: o webhook de volta e o que nao interessa. */
export type ConfigSessaoWaha = {
  webhooks: Array<{
    url: string;
    events: string[];
    hmac?: { key: string };
  }>;
  /**
   * Conversas que o CRM nao atende e por isso nem precisam chegar. O Deskcomm
   * mediu em producao: 376 de 395 MB de eventos eram estados, grupos e canais.
   */
  ignore: { status: boolean; groups: boolean; channels: boolean; broadcast: boolean };
};

/** Envelope de todo webhook. `me` vem na raiz, fora do `payload`. */
export type EventoWaha = {
  event?: unknown;
  session?: unknown;
  me?: MeWaha | null;
  payload?: unknown;
};

/** `payload` dos eventos `message` e `message.ack`. */
export type MensagemWaha = {
  id?: unknown;
  from?: unknown;
  to?: unknown;
  fromMe?: unknown;
  body?: unknown;
  hasMedia?: unknown;
  ack?: unknown;
  media?: { mimetype?: unknown } | null;
  _data?: {
    notifyName?: unknown;
    pushName?: unknown;
    /** Quando o chat chega como `@lid`, o telefone real costuma vir aqui (`55...@s.whatsapp.net`). */
    key?: { remoteJidAlt?: unknown } | null;
  } | null;
};

/** `payload` do evento `session.status`. */
export type StatusWaha = { status?: unknown; name?: unknown };

/** Arquivo em base64, o formato que `sendImage`/`sendFile`/`sendVoice`/`sendVideo` aceitam. */
export type ArquivoWaha = { mimetype: string; filename: string; data: string };

export type EndpointDeMidia = 'sendImage' | 'sendVideo' | 'sendVoice' | 'sendFile';
