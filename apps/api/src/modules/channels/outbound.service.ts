import type { Channel } from '@prisma/client';
import { AppError, badRequest } from '../../lib/errors';
import { obterConfig, obterConfigPorId } from './channels.service';
import { impedimentoDeEnvio, modoEfetivo } from './whatsapp.modo';
import { BaileysProvider } from './providers/baileys.provider';

const GRAPH = 'https://graph.facebook.com/v21.0';

/**
 * O modo nao oficial passa pelo `WhatsAppProvider` em vez de falar direto com
 * `whatsapp.ponte.ts` — mesma migracao ja feita em `channels.routes.ts` para
 * QR/estado/desconexao (ver whatsapp.provider.ts).
 */
const whatsAppProvider = new BaileysProvider();

/** Canais que exigem envio pela Graph API. WEBCHAT e entregue por WebSocket. */
const EXTERNOS: Channel[] = ['WHATSAPP', 'INSTAGRAM', 'FACEBOOK'];

export const exigeEnvioExterno = (canal: Channel) => EXTERNOS.includes(canal);

type Resultado = { idExterno: string | null };

/**
 * A config de onde a resposta sai.
 *
 * `canalConfigId` vem da conversa: e a linha que RECEBEU a mensagem, e a
 * resposta tem de sair pelo mesmo numero — sobretudo na linha pessoal do
 * vendedor, onde responder pelo numero compartilhado da empresa entregaria a
 * mensagem com o remetente errado. Conversa antiga (de antes desta coluna
 * existir) nao tem `canalConfigId`; cai na config compartilhada do canal, que
 * e o unico numero que existia naquela epoca.
 */
async function configParaEnvio(canal: Channel, canalConfigId: string | null) {
  if (canalConfigId) {
    const config = await obterConfigPorId(canalConfigId);
    if (config) return config;
  }
  return obterConfig(canal);
}

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
  canalConfigId: string | null = null,
): Promise<Resultado> {
  if (!exigeEnvioExterno(canal)) return { idExterno: null };
  if (!enderecoExterno) throw badRequest('Conversa sem endereco externo — nao e possivel responder');

  const config = await configParaEnvio(canal, canalConfigId);

  /*
   * WhatsApp tem DOIS caminhos de saida (item do WhatsApp nos dois modos).
   *
   * A escolha acontece aqui, e nao em quem chama: o atendente, o disparo de
   * campanha e o motor de IA mandam mensagem do mesmo jeito, e nenhum deles
   * precisa saber se a organizacao esta na Cloud API ou numa ponte. Espalhar essa
   * pergunta pelos chamadores garantiria que um deles ficaria para tras — e a
   * mensagem sairia pelo caminho errado exatamente no canal mais usado.
   */
  if (canal === 'WHATSAPP' && modoEfetivo(config?.modo) === 'NAO_OFICIAL') {
    const impedimento = impedimentoDeEnvio(config?.modo, {
      ativo: config?.ativo ?? false,
      accessToken: config?.accessToken ?? null,
      phoneNumberId: config?.phoneNumberId ?? null,
      ponteUrl: config?.ponteUrl ?? null,
      ponteToken: config?.ponteToken ?? null,
    });
    if (impedimento) throw new AppError(503, 'CANAL_INDISPONIVEL', impedimento);
    return whatsAppProvider.sendText(config!, enderecoExterno, texto);
  }

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

/** Tipo de midia aceito por canal, no vocabulario da Graph API. */
const TIPO_GRAPH: Record<string, 'image' | 'audio' | 'video' | 'document'> = {
  image: 'image',
  audio: 'audio',
  video: 'video',
};

const tipoGraph = (mime: string) => TIPO_GRAPH[mime.split('/')[0]!] ?? 'document';

/**
 * Envia arquivo do agente para o canal externo.
 *
 * Cada canal aceita de um jeito diferente, e a diferenca nao e cosmetica:
 *   - **WhatsApp**: sobe o binario em /media, recebe um id e manda a mensagem
 *     referenciando esse id. Duas chamadas, nenhuma URL publica envolvida.
 *   - **Messenger**: aceita o binario direto no /messages, em multipart.
 *   - **Instagram**: aceita **somente URL publica** — nao ha upload de binario.
 *     Como a URL assinada da plataforma pode estar num host privado, o envio e
 *     recusado com explicacao em vez de falhar com erro da Meta.
 */
export async function enviarArquivoParaCanal(
  canal: Channel,
  enderecoExterno: string | null,
  arquivo: { buffer: Buffer; nome: string; tipo: string; legenda?: string; urlPublica?: string },
  canalConfigId: string | null = null,
): Promise<Resultado> {
  if (!exigeEnvioExterno(canal)) return { idExterno: null };
  if (!enderecoExterno) throw badRequest('Conversa sem endereco externo — nao e possivel responder');

  const config = await configParaEnvio(canal, canalConfigId);

  // O mesmo desvio do texto. A ponte recebe o binario direto, sem as duas etapas
  // da Cloud API e sem a exigencia de URL publica do Instagram — e por isso este
  // modo funciona em instalacao sem dominio, que e onde ele costuma estar.
  if (canal === 'WHATSAPP' && modoEfetivo(config?.modo) === 'NAO_OFICIAL') {
    const impedimento = impedimentoDeEnvio(config?.modo, {
      ativo: config?.ativo ?? false,
      accessToken: config?.accessToken ?? null,
      phoneNumberId: config?.phoneNumberId ?? null,
      ponteUrl: config?.ponteUrl ?? null,
      ponteToken: config?.ponteToken ?? null,
    });
    if (impedimento) throw new AppError(503, 'CANAL_INDISPONIVEL', impedimento);
    return whatsAppProvider.sendMedia(config!, enderecoExterno, arquivo);
  }

  if (!config?.ativo || !config.accessToken) {
    throw new AppError(503, 'CANAL_INDISPONIVEL', `Canal ${canal} nao esta configurado ou esta inativo`);
  }

  const tipo = tipoGraph(arquivo.tipo);

  if (canal === 'WHATSAPP') {
    const mediaId = await subirMidiaWhatsApp(config.phoneNumberId, config.accessToken, arquivo);
    const corpo: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: enderecoExterno,
      type: tipo,
      [tipo]: {
        id: mediaId,
        ...(arquivo.legenda && tipo !== 'audio' ? { caption: arquivo.legenda } : {}),
        ...(tipo === 'document' ? { filename: arquivo.nome } : {}),
      },
    };
    return { idExterno: await postarMensagem(`${GRAPH}/${config.phoneNumberId}/messages`, config.accessToken, corpo) };
  }

  if (canal === 'FACEBOOK') {
    return { idExterno: await enviarMultipartMessenger(config, enderecoExterno, arquivo, tipo) };
  }

  throw new AppError(
    501,
    'ANEXO_NAO_SUPORTADO',
    'O Instagram Direct so aceita anexo por URL publica; publique a plataforma num dominio acessivel para habilitar',
  );
}

async function subirMidiaWhatsApp(
  phoneNumberId: string | null,
  token: string,
  arquivo: { buffer: Buffer; nome: string; tipo: string },
) {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', arquivo.tipo);
  form.append('file', new Blob([new Uint8Array(arquivo.buffer)], { type: arquivo.tipo }), arquivo.nome);

  const resposta = await fetch(`${GRAPH}/${phoneNumberId}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  }).catch((err: unknown) => {
    throw new AppError(
      502,
      'CANAL_INACESSIVEL',
      `Nao foi possivel falar com a Graph API: ${err instanceof Error ? err.message : 'erro de rede'}`,
    );
  });

  const dados = (await resposta.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!resposta.ok || !dados.id) {
    throw new AppError(
      502,
      'ENVIO_RECUSADO',
      `A Meta recusou o upload (${resposta.status}): ${dados.error?.message ?? 'sem detalhe'}`,
    );
  }
  return dados.id;
}

async function enviarMultipartMessenger(
  config: { pageId: string | null; accessToken: string | null },
  destino: string,
  arquivo: { buffer: Buffer; nome: string; tipo: string },
  tipo: string,
) {
  const form = new FormData();
  form.append('recipient', JSON.stringify({ id: destino }));
  form.append('message', JSON.stringify({ attachment: { type: tipo, payload: { is_reusable: true } } }));
  form.append('filedata', new Blob([new Uint8Array(arquivo.buffer)], { type: arquivo.tipo }), arquivo.nome);

  const resposta = await fetch(`${GRAPH}/${config.pageId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.accessToken}` },
    body: form,
  }).catch((err: unknown) => {
    throw new AppError(
      502,
      'CANAL_INACESSIVEL',
      `Nao foi possivel falar com a Graph API: ${err instanceof Error ? err.message : 'erro de rede'}`,
    );
  });

  const dados = (await resposta.json().catch(() => ({}))) as {
    message_id?: string;
    error?: { message?: string };
  };
  if (!resposta.ok) {
    throw new AppError(
      502,
      'ENVIO_RECUSADO',
      `A Meta recusou o envio (${resposta.status}): ${dados.error?.message ?? 'sem detalhe'}`,
    );
  }
  return dados.message_id ?? null;
}

async function postarMensagem(url: string, token: string, corpo: Record<string, unknown>) {
  const resposta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(corpo),
  });
  const dados = (await resposta.json().catch(() => ({}))) as {
    messages?: Array<{ id: string }>;
    message_id?: string;
    error?: { message?: string };
  };
  if (!resposta.ok) {
    throw new AppError(
      502,
      'ENVIO_RECUSADO',
      `A Meta recusou o envio (${resposta.status}): ${dados.error?.message ?? 'sem detalhe'}`,
    );
  }
  return dados.messages?.[0]?.id ?? dados.message_id ?? null;
}
