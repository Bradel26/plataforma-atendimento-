import type { MensagemNormalizada, MetaTextoWhatsApp, MetaWebhook } from './meta.types';
import type { StatusDeEntrega } from './providers/channel-provider';

const TIPO_ANEXO: Record<string, MensagemNormalizada['tipoAnexo']> = {
  image: 'IMAGEM',
  audio: 'AUDIO',
  video: 'VIDEO',
  document: 'ARQUIVO',
  sticker: 'IMAGEM',
};

/** Texto legivel para tipos sem corpo textual (usado no painel do agente). */
const RESUMO_ANEXO: Record<string, string> = {
  IMAGEM: '[imagem recebida]',
  AUDIO: '[áudio recebido]',
  VIDEO: '[vídeo recebido]',
  ARQUIVO: '[arquivo recebido]',
};

function mensagemWhatsApp(
  mensagem: MetaTextoWhatsApp,
  enderecoExterno: string,
  nomeExibicao: string | null,
  identificadorDestino: string | null,
): MensagemNormalizada {
  const tipoAnexo = TIPO_ANEXO[mensagem.type] ?? 'TEXTO';
  const legenda = mensagem.text?.body ?? mensagem.image?.caption ?? mensagem.video?.caption ?? null;
  const midia = mensagem.image ?? mensagem.audio ?? mensagem.video ?? mensagem.document ?? mensagem.sticker;
  return {
    canal: 'WHATSAPP',
    enderecoExterno,
    nomeExibicao,
    telefone: enderecoExterno,
    idExterno: mensagem.id,
    conteudo: legenda ?? RESUMO_ANEXO[tipoAnexo] ?? '[mensagem sem texto]',
    tipoAnexo,
    // A Cloud API entrega apenas o media id; quem troca o id pelo binario
    // e o media.service, no inbound.
    anexoUrl: null,
    anexoIdExterno: midia?.id ?? null,
    anexoNome: mensagem.document?.filename ?? null,
    identificadorDestino,
  };
}

const STATUS_META: Record<string, StatusDeEntrega> = {
  sent: 'ENVIADA',
  delivered: 'ENTREGUE',
  read: 'LIDA',
  failed: 'FALHOU',
};

/** Status de entrega (sent/delivered/read/failed) das mensagens enviadas pela plataforma. */
export function normalizarStatusMeta(corpo: MetaWebhook): Array<{ idExterno: string; status: StatusDeEntrega }> {
  const eventos: Array<{ idExterno: string; status: StatusDeEntrega }> = [];
  for (const entry of corpo.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const item of change.value?.statuses ?? []) {
        const status = STATUS_META[item.status];
        if (status && item.id) eventos.push({ idExterno: item.id, status });
      }
    }
  }
  return eventos;
}

/** Coexistence: mensagens que o dono digitou no app WhatsApp Business do celular. */
export function normalizarEcosMeta(corpo: MetaWebhook): MensagemNormalizada[] {
  const ecos: MensagemNormalizada[] = [];
  for (const entry of corpo.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const valor = change.value;
      for (const eco of valor?.message_echoes ?? []) {
        if (!eco.to) continue;
        ecos.push(mensagemWhatsApp(eco, eco.to, null, valor.metadata?.phone_number_id ?? null));
      }
    }
  }
  return ecos;
}

/**
 * Converte o webhook da Meta em mensagens normalizadas.
 * Nunca lanca: payload desconhecido resulta em lista vazia — a Meta reentrega
 * webhooks que nao respondem 200, e recusar um payload valido causaria loop.
 */
export function normalizarWebhook(corpo: MetaWebhook): MensagemNormalizada[] {
  const mensagens: MensagemNormalizada[] = [];

  for (const entry of corpo.entry ?? []) {
    // ----- WhatsApp Cloud API -----
    for (const change of entry.changes ?? []) {
      const valor = change.value ?? {};
      const perfil = valor.contacts?.[0];

      for (const mensagem of valor.messages ?? []) {
        mensagens.push(mensagemWhatsApp(mensagem, mensagem.from, perfil?.profile?.name ?? null, valor.metadata?.phone_number_id ?? null));
      }
    }

    // ----- Messenger (Facebook) e Instagram Direct -----
    for (const evento of entry.messaging ?? []) {
      const mensagem = evento.message;
      if (!mensagem) continue;

      const anexo = mensagem.attachments?.[0];
      const tipoAnexo = anexo ? (TIPO_ANEXO[anexo.type] ?? 'ARQUIVO') : 'TEXTO';

      mensagens.push({
        canal: corpo.object === 'instagram' ? 'INSTAGRAM' : 'FACEBOOK',
        enderecoExterno: evento.sender.id,
        nomeExibicao: null,
        telefone: null,
        idExterno: mensagem.mid,
        conteudo: mensagem.text ?? RESUMO_ANEXO[tipoAnexo] ?? '[mensagem sem texto]',
        tipoAnexo,
        // Messenger e Instagram entregam URL pronta, porem temporaria: o
        // inbound baixa e guarda o arquivo antes de o link expirar.
        anexoUrl: anexo?.payload?.url ?? null,
        anexoIdExterno: null,
        anexoNome: null,
        identificadorDestino: evento.recipient?.id ?? null,
      });
    }
  }

  return mensagens;
}
