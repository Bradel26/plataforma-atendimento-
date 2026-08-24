import type { Channel } from '@prisma/client';
import { AppError, badRequest } from '../../lib/errors';
import { obterConfig } from './channels.service';

const GRAPH = 'https://graph.facebook.com/v21.0';

/** Canais que exigem envio pela Graph API. WEBCHAT e entregue por WebSocket. */
const EXTERNOS: Channel[] = ['WHATSAPP', 'INSTAGRAM', 'FACEBOOK'];

export const exigeEnvioExterno = (canal: Channel) => EXTERNOS.includes(canal);

type Resultado = { idExterno: string | null };

/**
 * Envia a resposta do agente para o canal externo.
 *
 * Lanca em caso de falha, de proposito: se a mensagem nao chegou ao cliente,
 * ela nao deve aparecer no historico como se tivesse chegado. O agente recebe
 * o erro e pode tentar de novo.
 */
export async function enviarParaCanal(
  canal: Channel,
  enderecoExterno: string | null,
  texto: string,
): Promise<Resultado> {
  if (!exigeEnvioExterno(canal)) return { idExterno: null };
  if (!enderecoExterno) throw badRequest('Conversa sem endereco externo — nao e possivel responder');

  const config = await obterConfig(canal);
  if (!config?.ativo || !config.accessToken) {
    throw new AppError(503, 'CANAL_INDISPONIVEL', `Canal ${canal} nao esta configurado ou esta inativo`);
  }

  const { url, corpo } =
    canal === 'WHATSAPP'
      ? {
          url: `${GRAPH}/${config.phoneNumberId}/messages`,
          corpo: {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: enderecoExterno,
            type: 'text',
            text: { preview_url: false, body: texto },
          },
        }
      : {
          // Messenger e Instagram Direct compartilham o endpoint /messages da pagina.
          url: `${GRAPH}/${config.pageId}/messages`,
          corpo: {
            recipient: { id: enderecoExterno },
            message: { text: texto },
            messaging_type: 'RESPONSE',
          },
        };

  let resposta: Response;
  try {
    resposta = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.accessToken}`,
      },
      body: JSON.stringify(corpo),
    });
  } catch (err) {
    throw new AppError(
      502,
      'CANAL_INACESSIVEL',
      `Nao foi possivel falar com a Graph API: ${err instanceof Error ? err.message : 'erro de rede'}`,
    );
  }

  const dados = (await resposta.json().catch(() => ({}))) as {
    messages?: Array<{ id: string }>;
    message_id?: string;
    error?: { message?: string; code?: number };
  };

  if (!resposta.ok) {
    throw new AppError(
      502,
      'ENVIO_RECUSADO',
      `A Meta recusou o envio (${resposta.status}): ${dados.error?.message ?? 'sem detalhe'}`,
    );
  }

  return { idExterno: dados.messages?.[0]?.id ?? dados.message_id ?? null };
}
