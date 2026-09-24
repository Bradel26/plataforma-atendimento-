import { numeroNormalizado } from '../../whatsapp.modo';
import type { MensagemNormalizada } from '../../meta.types';
import type { EstadoSessao, EventoDeCanal, SituacaoSessao, StatusDeEntrega } from '../channel-provider';
import type { EventoWaha, MensagemWaha, MeWaha, StatusWaha } from './waha.types';

/**
 * Traducao pura WAHA -> CRM: status de sessao, ack e evento de webhook.
 * Sem banco e sem rede, para ser testada com payload capturado.
 */

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Status da sessao no WAHA -> estado interno.
 *
 * STOPPED e "parada, mas pareada": sobe de novo sem QR. FAILED e a sessao que
 * a engine nao conseguiu manter (credencial recusada, bloqueio) — fica
 * separada de DESCONECTADO porque pede um humano olhando, nao religar sozinho.
 */
export function estadoDoStatusWaha(status: unknown): EstadoSessao {
  switch (typeof status === 'string' ? status.trim().toUpperCase() : '') {
    case 'STARTING':
      return 'CONECTANDO';
    case 'SCAN_QR_CODE':
      return 'AGUARDANDO_QR';
    case 'WORKING':
      return 'CONECTADO';
    case 'STOPPED':
      return 'DESCONECTADO';
    case 'FAILED':
      return 'FALHOU';
    default:
      return 'DESCONHECIDO';
  }
}

/** `5511999999999@c.us` -> `5511999999999`. So quando for telefone de verdade. */
export function telefoneDoChatId(chatId: string | null): string | null {
  if (!chatId) return null;
  if (!chatId.endsWith('@c.us') && !chatId.endsWith('@s.whatsapp.net')) return null;
  return numeroNormalizado(chatId.slice(0, chatId.indexOf('@')));
}

export function telefoneDoMe(me: MeWaha | null | undefined): string | null {
  return telefoneDoChatId(texto(me?.id));
}

export function situacaoDaSessaoWaha(status: unknown, me?: MeWaha | null): SituacaoSessao {
  const estado = estadoDoStatusWaha(status);
  return {
    estado,
    detalhe: texto(status),
    telefone: estado === 'CONECTADO' ? telefoneDoMe(me) : null,
  };
}

/**
 * Ack do WAHA -> status de entrega. Numeros da doc do WAHA:
 * -1 ERROR, 0 PENDING, 1 SERVER, 2 DEVICE, 3 READ, 4 PLAYED.
 */
export function statusDoAck(ack: unknown): StatusDeEntrega | null {
  if (typeof ack !== 'number') return null;
  if (ack < 0) return 'FALHOU';
  if (ack === 0) return 'PENDENTE';
  if (ack === 1) return 'ENVIADA';
  if (ack === 2) return 'ENTREGUE';
  return 'LIDA';
}

/** Chats que o CRM nao atende: grupo, lista de difusao/estado, canal. */
function chatForaDoAtendimento(chatId: string): boolean {
  return chatId.endsWith('@g.us') || chatId.endsWith('@broadcast') || chatId.endsWith('@newsletter');
}

/**
 * Telefone de quem escreveu. Chat `@c.us` ja e o numero. Chat `@lid` e uma
 * identidade opaca, mas o WhatsApp manda o numero em `_data.key.remoteJidAlt`
 * (o Deskcomm mediu 76 de 76 payloads @lid trazendo o campo). Na duvida,
 * nulo: telefone errado e chave de contato errada.
 */
function telefoneDoRemetente(chatId: string, p: MensagemWaha): string | null {
  const direto = telefoneDoChatId(chatId);
  if (direto) return direto;
  const alternativo = texto(p._data?.key?.remoteJidAlt);
  if (!alternativo || alternativo.length > 128) return null;
  return telefoneDoChatId(alternativo);
}

/** Texto para mensagem sem legenda cujo anexo ainda nao e trazido (ver abaixo). */
function descricaoDoAnexo(mime: string | null): string {
  if (mime?.startsWith('image/')) return '[Imagem recebida]';
  if (mime?.startsWith('audio/')) return '[Audio recebido]';
  if (mime?.startsWith('video/')) return '[Video recebido]';
  return '[Arquivo recebido]';
}

function mensagemRecebida(sessao: string, p: MensagemWaha): EventoDeCanal {
  const idExterno = texto(p.id);
  const chatId = texto(p.from);
  if (!idExterno || !chatId) return { tipo: 'ignorado', motivo: 'mensagem sem id ou remetente' };
  if (chatForaDoAtendimento(chatId)) return { tipo: 'ignorado', motivo: 'chat fora do atendimento (grupo/estado/canal)' };

  /*
   * Anexo recebido entra como TEXTO descritivo, sem o binario: a URL de midia
   * do WAHA aponta para o proprio WAHA e exige a chave dele, e o download
   * seguro (host reconstruido, contra SSRF) e uma etapa propria. Assim a
   * mensagem do cliente nunca some — o atendente ve que chegou algo.
   */
  const corpo = texto(p.body);
  const temAnexo = p.hasMedia === true;
  if (!corpo && !temAnexo) return { tipo: 'ignorado', motivo: 'mensagem sem conteudo' };
  const conteudo = corpo ?? descricaoDoAnexo(texto(p.media?.mimetype));

  const mensagem: MensagemNormalizada = {
    canal: 'WHATSAPP',
    // O chatId inteiro (`@c.us` ou `@lid`) e o endereco: e com ele que a
    // resposta volta. Nunca reconstruido a partir do telefone.
    enderecoExterno: chatId,
    nomeExibicao: texto(p._data?.notifyName) ?? texto(p._data?.pushName),
    telefone: telefoneDoRemetente(chatId, p),
    idExterno,
    conteudo,
    tipoAnexo: 'TEXTO',
    anexoUrl: null,
    anexoIdExterno: null,
    anexoNome: null,
    // A sessao e o que diz qual linha recebeu (`configDoDestino` casa com `ponteSessao`).
    identificadorDestino: sessao,
  };
  return { tipo: 'mensagem.recebida', sessaoExterna: sessao, mensagem };
}

/**
 * Evento de webhook do WAHA -> eventos do CRM.
 *
 * Assina so `message`, `message.ack` e `session.status` (ver
 * `waha.provider.ts`). `message.any` ficaria de fora de proposito: ele repete
 * a mensagem que o proprio CRM enviou, e nao ha o que fazer com o eco ainda.
 */
export function interpretarEventoWaha(corpo: unknown): EventoDeCanal[] {
  if (!corpo || typeof corpo !== 'object') return [{ tipo: 'ignorado', motivo: 'corpo nao e objeto' }];
  const envelope = corpo as EventoWaha;
  const evento = texto(envelope.event);
  const sessao = texto(envelope.session);
  if (!evento || !sessao) return [{ tipo: 'ignorado', motivo: 'evento sem nome ou sessao' }];

  const payload = (envelope.payload && typeof envelope.payload === 'object' ? envelope.payload : {}) as
    MensagemWaha & StatusWaha;

  if (evento === 'session.status') {
    const situacao = situacaoDaSessaoWaha(payload.status, envelope.me);
    if (situacao.estado === 'DESCONHECIDO') return [{ tipo: 'ignorado', motivo: 'status de sessao desconhecido' }];
    return [{ tipo: 'sessao.estado', sessaoExterna: sessao, situacao }];
  }

  if (evento === 'message') {
    if (payload.fromMe === true) {
      const idExterno = texto(payload.id);
      return idExterno
        ? [{ tipo: 'mensagem.propria', sessaoExterna: sessao, idExterno }]
        : [{ tipo: 'ignorado', motivo: 'mensagem propria sem id' }];
    }
    return [mensagemRecebida(sessao, payload)];
  }

  if (evento === 'message.ack') {
    const idExterno = texto(payload.id);
    const status = statusDoAck(payload.ack);
    if (!idExterno || !status) return [{ tipo: 'ignorado', motivo: 'ack sem id ou status' }];
    return [{ tipo: 'mensagem.status', sessaoExterna: sessao, idExterno, status }];
  }

  return [{ tipo: 'ignorado', motivo: `evento ${evento} nao tratado` }];
}

/**
 * Id da mensagem na resposta de envio. O formato varia por engine: string
 * plana, `{ id: { _serialized } }` (WEBJS), `{ id: { id } }` ou `{ key: { id } }`
 * (NOWEB) — o mesmo levantamento do `parseWahaMessageId` do Deskcomm.
 */
export function idDaMensagemEnviada(resposta: unknown): string | null {
  if (!resposta || typeof resposta !== 'object') return null;
  const r = resposta as { id?: unknown; key?: { id?: unknown } | null };
  if (typeof r.id === 'string' && r.id) return r.id;
  if (r.id && typeof r.id === 'object') {
    const interno = r.id as { _serialized?: unknown; id?: unknown };
    if (typeof interno._serialized === 'string' && interno._serialized) return interno._serialized;
    if (typeof interno.id === 'string' && interno.id) return interno.id;
  }
  if (r.key && typeof r.key.id === 'string' && r.key.id) return r.key.id;
  return null;
}

/**
 * Destino do CRM -> chatId do WAHA. Endereco que ja e chatId (`@c.us`, `@lid`,
 * vindo de uma mensagem recebida) vai como esta; numero cru (conversa aberta
 * pelo CRM a partir do cadastro) vira `<digitos>@c.us`. `null` quando nao da
 * para afirmar que e um destino: vira recusa, nunca envio improvisado.
 */
export function chatIdDoDestino(destino: string): string | null {
  const limpo = destino.trim();
  if (limpo.includes('@')) return limpo;
  const numero = numeroNormalizado(limpo);
  return numero ? `${numero}@c.us` : null;
}
