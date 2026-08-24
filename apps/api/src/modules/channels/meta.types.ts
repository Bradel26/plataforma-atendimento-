/**
 * Formato dos webhooks da Meta (WhatsApp Cloud API e Messenger/Instagram).
 * Tipado apenas no que a plataforma consome — o payload real tem muito mais campos.
 * Referencia: developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 */

export type MetaTextoWhatsApp = {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type?: string; caption?: string };
  audio?: { id: string; mime_type?: string };
  video?: { id: string; mime_type?: string; caption?: string };
  document?: { id: string; filename?: string; mime_type?: string };
};

export type MetaWebhook = {
  object: string;
  entry?: Array<{
    id: string;
    /** WhatsApp */
    changes?: Array<{
      field: string;
      value: {
        metadata?: { phone_number_id?: string; display_phone_number?: string };
        contacts?: Array<{ wa_id: string; profile?: { name?: string } }>;
        messages?: MetaTextoWhatsApp[];
        statuses?: Array<{ id: string; status: string }>;
      };
    }>;
    /** Messenger e Instagram Direct */
    messaging?: Array<{
      sender: { id: string };
      recipient: { id: string };
      timestamp?: number;
      message?: {
        mid: string;
        text?: string;
        attachments?: Array<{ type: string; payload?: { url?: string } }>;
      };
    }>;
  }>;
};

/** Mensagem normalizada, independente do canal de origem. */
export type MensagemNormalizada = {
  canal: 'WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK';
  /** Identificador do interlocutor no canal (wa_id, PSID, IGSID). */
  enderecoExterno: string;
  nomeExibicao: string | null;
  telefone: string | null;
  idExterno: string;
  conteudo: string;
  tipoAnexo: 'TEXTO' | 'IMAGEM' | 'AUDIO' | 'VIDEO' | 'ARQUIVO';
  anexoUrl: string | null;
};
