import { numeroNormalizado } from '../../whatsapp.modo';
import type { MensagemNormalizada } from '../../meta.types';
import type { EstadoSessao, EventoDeCanal, SituacaoSessao, StatusDeEntrega } from '../channel-provider';
import type { AckGowa, EventoGowa, EnvioGowa, MensagemGowa } from './gowa.types';

/**
 * Traducao pura GOWA -> CRM: estado de conexao, mensagem e recibo de
 * entrega. Sem banco e sem rede, testada com payload capturado — mesmo
 * papel do `waha.mapper.ts`.
 */

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * GOWA separa "conectado" (socket vivo) de "logado" (sessao pareada) — ao
 * contrario do WAHA, que tem um unico enum. `status: null` (GOWA fora do ar,
 * ou device que nunca respondeu) e sempre DESCONHECIDO: falha de diagnostico
 * nao prova desconexao.
 */
export function situacaoDaSessaoGowa(
  status: { conectado: boolean; logado: boolean } | null,
  numeroProprio: string | null,
): SituacaoSessao {
  let estado: EstadoSessao;
  if (!status) estado = 'DESCONHECIDO';
  else if (!status.logado) estado = 'AGUARDANDO_QR';
  else if (!status.conectado) estado = 'CONECTANDO'; // pareada, socket caiu: reconecta, nao pede QR novo
  else estado = 'CONECTADO';

  return {
    estado,
    detalhe: status ? `conectado=${status.conectado} logado=${status.logado}` : null,
    telefone: estado === 'CONECTADO' ? numeroProprio : null,
  };
}

/** Chats que o CRM nao atende: grupo. GOWA nao manda lista de difusao/canal nos eventos que assinamos. */
function chatForaDoAtendimento(chatId: string): boolean {
  return chatId.endsWith('@g.us');
}

function telefoneDoChatId(chatId: string | null): string | null {
  if (!chatId) return null;
  const semSufixo = chatId.includes('@') ? chatId.slice(0, chatId.indexOf('@')) : chatId;
  return numeroNormalizado(semSufixo.split(':')[0] ?? null);
}

function descricaoDoAnexo(p: MensagemGowa): string | null {
  if (p.image !== undefined) return '[Imagem recebida]';
  if (p.video !== undefined) return '[Video recebido]';
  if (p.audio !== undefined) return '[Audio recebido]';
  if (p.document !== undefined) return '[Arquivo recebido]';
  if (p.sticker !== undefined) return '[Figurinha recebida]';
  return null;
}

function mensagemRecebida(sessaoExterna: string, p: MensagemGowa): EventoDeCanal {
  const idExterno = texto(p.id);
  const chatId = texto(p.chat_id) ?? texto(p.from);
  if (!idExterno || !chatId) return { tipo: 'ignorado', motivo: 'mensagem sem id ou remetente' };
  if (chatForaDoAtendimento(chatId)) return { tipo: 'ignorado', motivo: 'chat fora do atendimento (grupo)' };

  const corpo = texto(p.body) ?? texto(p.content) ?? texto(p.text);
  const anexo = descricaoDoAnexo(p);
  if (!corpo && !anexo) return { tipo: 'ignorado', motivo: 'mensagem sem conteudo' };

  const mensagem: MensagemNormalizada = {
    canal: 'WHATSAPP',
    enderecoExterno: chatId,
    nomeExibicao: texto(p.from_name) ?? texto(p.pushName) ?? texto(p.notify),
    telefone: telefoneDoChatId(chatId),
    idExterno,
    conteudo: corpo ?? anexo ?? '',
    tipoAnexo: 'TEXTO',
    anexoUrl: null,
    anexoIdExterno: null,
    anexoNome: null,
    identificadorDestino: sessaoExterna,
  };
  return { tipo: 'mensagem.recebida', sessaoExterna, mensagem };
}

const STATUS_DO_RECIBO: Record<string, StatusDeEntrega> = {
  delivered: 'ENTREGUE',
  read: 'LIDA',
  'read-self': 'LIDA',
};

/**
 * Evento de webhook do GOWA -> eventos do CRM. So `message` e `message.ack`
 * sao assinados (o resto — reacao, edicao, chamada, presenca — nao vira
 * conversa; ver "Fora de escopo" no spec). `deviceId` e a sessao: o GOWA nao
 * manda a sessao no corpo do webhook, so no `X-Device-Id` da URL que a
 * chamou — resolvido fora, pela rota generica de webhook.
 */
export function interpretarEventoGowa(corpo: unknown, deviceId: string): EventoDeCanal[] {
  if (!corpo || typeof corpo !== 'object') return [{ tipo: 'ignorado', motivo: 'corpo nao e objeto' }];
  const envelope = corpo as EventoGowa;
  const evento = texto(envelope.event);
  if (!evento) return [{ tipo: 'ignorado', motivo: 'evento sem nome' }];

  const payload = (envelope.payload ?? envelope.data ?? {}) as MensagemGowa & AckGowa;

  if (evento === 'message.ack') {
    const status = typeof payload.receipt_type === 'string' ? STATUS_DO_RECIBO[payload.receipt_type] : undefined;
    const ids = Array.isArray(payload.ids) ? payload.ids.filter((id): id is string => typeof id === 'string') : [];
    if (!status || ids.length === 0) return [{ tipo: 'ignorado', motivo: 'recibo sem tipo reconhecido ou sem ids' }];
    return ids.map((idExterno) => ({ tipo: 'mensagem.status', sessaoExterna: deviceId, idExterno, status }));
  }

  if (evento === 'message') {
    if (payload.is_from_me === true) {
      const idExterno = texto(payload.id);
      return idExterno
        ? [{ tipo: 'mensagem.propria', sessaoExterna: deviceId, idExterno }]
        : [{ tipo: 'ignorado', motivo: 'mensagem propria sem id' }];
    }
    return [mensagemRecebida(deviceId, payload)];
  }

  return [{ tipo: 'ignorado', motivo: `evento ${evento} nao tratado` }];
}

/** Id da mensagem na resposta de envio — `extract_msg_id` do cliente de referencia. */
export function idDaMensagemEnviada(resposta: unknown): string | null {
  if (!resposta || typeof resposta !== 'object') return null;
  const r = resposta as EnvioGowa;
  const dosResultados = texto(r.results?.message_id) ?? texto(r.results?.id);
  if (dosResultados) return dosResultados;
  return texto(r.message_id) ?? texto(r.id);
}

/** Destino do CRM -> `phone` que o `/send/*` do GOWA aceita: so digitos, com DDI. `null` recusa o envio. */
export function numeroDoDestino(destino: string): string | null {
  return numeroNormalizado(destino);
}
