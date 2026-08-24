import type { MensagemNormalizada, MetaWebhook } from './meta.types';

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
  AUDIO: '[audio recebido]',
  VIDEO: '[video recebido]',
  ARQUIVO: '[arquivo recebido]',
};

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
        const tipoAnexo = TIPO_ANEXO[mensagem.type] ?? 'TEXTO';
        const legenda =
          mensagem.text?.body ?? mensagem.image?.caption ?? mensagem.video?.caption ?? null;

        mensagens.push({
          canal: 'WHATSAPP',
          enderecoExterno: mensagem.from,
          nomeExibicao: perfil?.profile?.name ?? null,
          telefone: mensagem.from,
          idExterno: mensagem.id,
          conteudo: legenda ?? RESUMO_ANEXO[tipoAnexo] ?? '[mensagem sem texto]',
          tipoAnexo,
          // A Cloud API entrega apenas o media id; baixar o binario exige uma
          // segunda chamada autenticada, que fica para o storage de midia.
          anexoUrl: null,
        });
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
        anexoUrl: anexo?.payload?.url ?? null,
      });
    }
  }

  return mensagens;
}
