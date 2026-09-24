/**
 * Formato do que o GOWA (go-whatsapp-web-multidevice) devolve e aceita —
 * tipado so no que o CRM le. Referencia: gowa/client.py do whatsbot-pro-main
 * (go-whatsapp-web-multidevice v8.11.0).
 *
 * A API do GOWA envelopa a maioria das respostas em `{ results: ... }` (as
 * vezes `{ data: ... }`); os tipos abaixo descrevem o CONTEUDO de dentro do
 * envelope — quem desembrulha e o `gowa.client.ts`.
 */

/** `GET /app/status` (com `X-Device-Id`), de dentro do envelope. */
export type StatusGowa = {
  is_connected?: unknown;
  is_logged_in?: unknown;
  /** Um destes traz o JID de quem esta logado — o cliente tenta todos. */
  jid?: unknown;
  device?: unknown;
  phone?: unknown;
  id?: unknown;
  user?: unknown;
};

/** Item de `GET /devices` (lista global, sem `X-Device-Id`). */
export type DeviceGowa = { id?: unknown; device?: unknown };

/** `GET /app/login`, de dentro do envelope. */
export type LoginGowa = { qr_link?: unknown };

/** Resposta de `POST /send/*`, de dentro (ou nao) do envelope. */
export type EnvioGowa = {
  results?: { message_id?: unknown; id?: unknown } | null;
  message_id?: unknown;
  id?: unknown;
};

/** Envelope de todo webhook do GOWA: `event` + `payload` (algumas versoes usam `data`). */
export type EventoGowa = { event?: unknown; payload?: unknown; data?: unknown };

/** `payload` do evento `message`. */
export type MensagemGowa = {
  id?: unknown;
  chat_id?: unknown;
  from?: unknown;
  sender?: unknown;
  from_name?: unknown;
  pushName?: unknown;
  notify?: unknown;
  is_from_me?: unknown;
  body?: unknown;
  content?: unknown;
  text?: unknown;
  timestamp?: unknown;
  /** Presenca de qualquer uma destas chaves == mensagem com anexo (sem baixar o binario). */
  image?: unknown;
  video?: unknown;
  audio?: unknown;
  document?: unknown;
  sticker?: unknown;
};

/** `payload` do evento `message.ack`. */
export type AckGowa = {
  receipt_type?: unknown; // "delivered" | "read" | "read-self"
  ids?: unknown;
  chat_id?: unknown;
  from?: unknown;
};

export type EndpointDeMidiaGowa = 'image' | 'video' | 'audio' | 'file';

export type ArquivoGowa = { buffer: Buffer; nome: string; tipo: string };
