import { downloadMediaMessage, type WAMessage } from '@whiskeysockets/baileys';
import { config } from './config.js';
import { guardar } from './midia.js';
import { lembrarJid, numeroDoJid, type Sessao } from './sessao.js';
import { entregar, type MensagemRecebida } from './plataforma.js';

/**
 * Traduz a mensagem do WhatsApp para o contrato que a plataforma entende.
 *
 * O formato do Baileys e uma uniao de dezenas de tipos de mensagem; a plataforma
 * so conhece cinco (`TEXTO`, `IMAGEM`, `AUDIO`, `VIDEO`, `ARQUIVO`). Este arquivo
 * e a fronteira entre os dois — e o unico lugar que precisa mudar quando o
 * WhatsApp inventa mais um tipo.
 */

type Tipo = NonNullable<MensagemRecebida['tipoAnexo']>;

type Extraido = {
  texto: string;
  tipo: Tipo;
  /** Presente quando ha binario a baixar. */
  midia: { nome: string; mime: string } | null;
};

/** O que a plataforma mostra quando a midia veio sem legenda. */
const RESUMO: Record<Tipo, string> = {
  TEXTO: '',
  IMAGEM: '[imagem recebida]',
  AUDIO: '[audio recebido]',
  VIDEO: '[video recebido]',
  ARQUIVO: '[arquivo recebido]',
};

function extrair(msg: WAMessage): Extraido | null {
  const m = msg.message;
  if (!m) return null;

  // Mensagem efemera e "ver uma vez" embrulham a real numa casca.
  const interno = m.ephemeralMessage?.message ?? m.viewOnceMessage?.message ?? m.viewOnceMessageV2?.message ?? m;

  if (interno.conversation) return { texto: interno.conversation, tipo: 'TEXTO', midia: null };
  if (interno.extendedTextMessage?.text) {
    return { texto: interno.extendedTextMessage.text, tipo: 'TEXTO', midia: null };
  }

  if (interno.imageMessage) {
    return {
      texto: interno.imageMessage.caption ?? '',
      tipo: 'IMAGEM',
      midia: { nome: 'imagem.jpg', mime: interno.imageMessage.mimetype ?? 'image/jpeg' },
    };
  }

  if (interno.videoMessage) {
    return {
      texto: interno.videoMessage.caption ?? '',
      tipo: 'VIDEO',
      midia: { nome: 'video.mp4', mime: interno.videoMessage.mimetype ?? 'video/mp4' },
    };
  }

  if (interno.audioMessage) {
    /*
     * Audio de WhatsApp e quase sempre `audio/ogg; codecs=opus`. O nome importa
     * porque a plataforma valida extensao antes de guardar, e um audio sem
     * extensao seria recusado como tipo desconhecido.
     */
    return { texto: '', tipo: 'AUDIO', midia: { nome: 'audio.ogg', mime: interno.audioMessage.mimetype ?? 'audio/ogg' } };
  }

  if (interno.documentMessage) {
    return {
      texto: interno.documentMessage.caption ?? '',
      tipo: 'ARQUIVO',
      midia: {
        nome: interno.documentMessage.fileName ?? 'arquivo',
        mime: interno.documentMessage.mimetype ?? 'application/octet-stream',
      },
    };
  }

  if (interno.stickerMessage) {
    return { texto: '', tipo: 'IMAGEM', midia: { nome: 'figurinha.webp', mime: 'image/webp' } };
  }

  if (interno.locationMessage) {
    const { degreesLatitude: lat, degreesLongitude: lon } = interno.locationMessage;
    return { texto: 'Localizacao recebida: ' + lat + ', ' + lon, tipo: 'TEXTO', midia: null };
  }

  if (interno.contactMessage?.displayName) {
    return { texto: 'Contato compartilhado: ' + interno.contactMessage.displayName, tipo: 'TEXTO', midia: null };
  }

  /*
   * Reacao, edicao, enquete, chamada perdida, recibo de leitura. Ignorar em
   * silencio e deliberado: virariam mensagem "[desconhecido]" na conversa do
   * cliente, poluindo o historico que o atendente le.
   */
  return null;
}

/** Baixa o binario. Nunca lanca: midia que falhou vira mensagem sem anexo. */
async function baixar(sessao: Sessao, msg: WAMessage, midia: { nome: string; mime: string }) {
  try {
    const buffer = (await downloadMediaMessage(
      msg,
      'buffer',
      {},
      {
        logger: console as never,
        // Pede o reenvio quando a midia expirou no servidor do WhatsApp.
        reuploadRequest: sessao.sock!.updateMediaMessage,
      },
    )) as Buffer;

    const token = guardar(buffer, midia.mime, midia.nome);
    return { url: config.urlPublica + '/midia/' + token, nome: midia.nome };
  } catch (err) {
    console.warn('[ponte] nao consegui baixar a midia:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * O caminho de uma mensagem recebida, do socket ate a plataforma.
 *
 * Nunca lanca: um defeito tratando UMA mensagem nao pode derrubar a sessao, que
 * e o numero da empresa inteiro.
 */
export async function receber(sessao: Sessao, msg: WAMessage) {
  try {
    const remetente = msg.key?.remoteJid ?? '';

    // Eco do que a propria plataforma mandou. Registrar de novo duplicaria a
    // mensagem na conversa, como se o cliente tivesse escrito.
    if (msg.key?.fromMe) return;

    /*
     * Grupo e lista de transmissao ficam de fora.
     *
     * A plataforma modela conversa como UM contato de um lado: um grupo viraria
     * um "contato" com o id do grupo, misturando dezenas de pessoas numa ficha
     * so. Atender grupo exige modelagem propria, e entregar errado agora seria
     * pior que nao entregar.
     */
    if (remetente.endsWith('@g.us') || remetente === 'status@broadcast' || remetente.endsWith('@broadcast')) {
      return;
    }

    const numero = numeroDoJid(remetente);
    if (!numero) return;

    // Guarda o jid exato de onde isto chegou (pode ser "@lid", nao so
    // "@s.whatsapp.net") para a resposta sair pelo mesmo endereco.
    lembrarJid(numero, remetente);

    const idExterno = msg.key?.id;
    if (!idExterno) return;

    const extraido = extrair(msg);
    if (!extraido) return;

    const anexo = extraido.midia ? await baixar(sessao, msg, extraido.midia) : null;

    // Sem texto e sem anexo a plataforma recusa (400). O resumo garante que a
    // conversa mostre que ALGO chegou, mesmo com a midia perdida.
    const texto = extraido.texto.trim() || RESUMO[extraido.tipo] || '[mensagem recebida]';

    await entregar({
      numero,
      sessao: sessao.nome,
      nome: msg.pushName ?? null,
      texto,
      idExterno,
      tipoAnexo: anexo ? extraido.tipo : 'TEXTO',
      anexoUrl: anexo?.url ?? null,
      anexoNome: anexo?.nome ?? null,
    });
  } catch (err) {
    console.error('[ponte] falhei ao tratar uma mensagem recebida:', err);
  }
}
