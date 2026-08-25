import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '../../lib/errors';
import type { Credenciais, EventoChamada, Provedor } from './voice.provider';

/**
 * Driver para provedores compativeis com a API do Twilio Programmable Voice.
 *
 * Escrito a partir do contrato documentado da API e **nunca exercitado contra a
 * conta real** — isso exige credencial e um tronco de voz. O que da para
 * verificar sem conta esta coberto: assinatura do webhook (assinada aqui com o
 * mesmo algoritmo), normalizacao dos eventos e o comportamento quando o
 * provedor recusa a originacao.
 *
 * Provedor nacional com API propria (Zenvia, TotalVoice) entra como outro
 * arquivo implementando `Provedor`; nada fora desta pasta muda.
 */
const BASE = 'https://api.twilio.com/2010-04-01';

/** Status do provedor -> vocabulario interno. */
const STATUS: Record<string, EventoChamada['status']> = {
  queued: 'INICIANDO',
  initiated: 'INICIANDO',
  ringing: 'CHAMANDO',
  'in-progress': 'EM_ANDAMENTO',
  answered: 'EM_ANDAMENTO',
  completed: 'COMPLETADA',
  'no-answer': 'NAO_ATENDIDA',
  busy: 'OCUPADA',
  failed: 'FALHOU',
  canceled: 'CANCELADA',
};

export const twilio: Provedor = {
  nome: 'twilio',

  /**
   * A assinatura e o HMAC-SHA1 da URL completa seguida dos parametros do POST
   * concatenados em ordem alfabetica (chave + valor), em base64.
   */
  assinaturaValida({ url, parametros, assinatura, authToken }) {
    if (!assinatura) return false;

    const dados =
      url +
      Object.keys(parametros)
        .sort()
        .map((chave) => chave + parametros[chave])
        .join('');

    const esperado = Buffer.from(createHmac('sha1', authToken).update(dados, 'utf8').digest('base64'));
    const recebido = Buffer.from(assinatura);
    return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
  },

  normalizarEvento(parametros) {
    const idExterno = parametros.CallSid;
    if (!idExterno) return null;

    const bruto = (parametros.CallStatus ?? '').toLowerCase();
    const duracao = Number(parametros.CallDuration ?? parametros.DialCallDuration ?? '');
    const gravacaoDuracao = Number(parametros.RecordingDuration ?? '');
    const custo = Number(parametros.Price ?? '');

    return {
      idExterno,
      status: STATUS[bruto] ?? 'INICIANDO',
      // O provedor descreve a direcao do ponto de vista dele: "inbound" e a
      // chamada que chegou ao numero da empresa.
      direcao: (parametros.Direction ?? '').startsWith('inbound') ? 'ENTRANTE' : 'SAINTE',
      numeroOrigem: parametros.From ?? 'desconhecido',
      numeroDestino: parametros.To ?? 'desconhecido',
      duracao: Number.isFinite(duracao) && duracao > 0 ? duracao : null,
      // A URL vem sem extensao; .mp3 e o formato que a API entrega.
      gravacaoUrl: parametros.RecordingUrl ? `${parametros.RecordingUrl}.mp3` : null,
      gravacaoDuracao: Number.isFinite(gravacaoDuracao) && gravacaoDuracao > 0 ? gravacaoDuracao : null,
      custo: Number.isFinite(custo) ? Math.abs(custo) : null,
      motivoFalha: parametros.ErrorMessage ?? (parametros.ErrorCode ? `codigo ${parametros.ErrorCode}` : null),
    };
  },

  async originar(credenciais, { de, para }) {
    if (!credenciais.urlWebhook) {
      throw new AppError(
        400,
        'VOZ_SEM_WEBHOOK',
        'Configure a URL publica de webhook antes de originar chamadas — o provedor precisa dela para conduzir a ligacao',
      );
    }

    const corpo = new URLSearchParams({
      To: para,
      From: de,
      // O provedor busca as instrucoes da chamada nesta URL e reporta o
      // andamento na mesma rota.
      Url: `${credenciais.urlWebhook}/instrucoes`,
      StatusCallback: `${credenciais.urlWebhook}/eventos`,
      StatusCallbackEvent: 'initiated ringing answered completed',
      Record: 'true',
    });

    const resposta = await fetch(`${BASE}/Accounts/${credenciais.contaSid}/Calls.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${credenciais.contaSid}:${credenciais.authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: corpo,
    }).catch((err: unknown) => {
      throw new AppError(
        502,
        'VOZ_INACESSIVEL',
        `Nao foi possivel falar com o provedor de voz: ${err instanceof Error ? err.message : 'erro de rede'}`,
      );
    });

    const dados = (await resposta.json().catch(() => ({}))) as {
      sid?: string;
      status?: string;
      message?: string;
    };

    if (!resposta.ok || !dados.sid) {
      throw new AppError(
        502,
        'VOZ_RECUSADA',
        `O provedor recusou a chamada (${resposta.status}): ${dados.message ?? 'sem detalhe'}`,
      );
    }

    return { idExterno: dados.sid, status: STATUS[(dados.status ?? '').toLowerCase()] ?? 'INICIANDO' };
  },

  headersDeDownload(credenciais) {
    return {
      Authorization: `Basic ${Buffer.from(`${credenciais.contaSid}:${credenciais.authToken}`).toString('base64')}`,
    };
  },
};
