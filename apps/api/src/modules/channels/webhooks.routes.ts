import { Router, raw, type Response } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { param } from '../../http/params';
import { notFound } from '../../lib/errors';
import { comOrganizacao } from '../../lib/tenant';
import {
  CANAIS_EXTERNOS,
  assinaturaValida,
  obterConfig,
  organizacaoDoWebhook,
  type CanalExterno,
} from './channels.service';
import { registrarMensagemEntrante } from './inbound.service';
import { normalizarWebhook } from './meta.parser';
import type { MetaWebhook } from './meta.types';

export const webhooksRoutes = Router();

const canalDaRota = (valor: string): CanalExterno => {
  const canal = valor.toUpperCase();
  if (!(CANAIS_EXTERNOS as readonly string[]).includes(canal)) {
    throw notFound(`Canal "${valor}" nao suportado. Disponiveis: ${CANAIS_EXTERNOS.join(', ').toLowerCase()}`);
  }
  return canal as CanalExterno;
};

/**
 * Verificacao do webhook (GET). A Meta chama uma vez ao cadastrar a URL e espera
 * o valor de hub.challenge de volta, em texto puro, se o hub.verify_token bater.
 */
webhooksRoutes.get(
  '/:canal',
  asyncHandler(async (req, res) => {
    const canal = canalDaRota(param(req, 'canal'));
    // Verificacao da Meta nao tem corpo, so query: resolve pelo unico canal
    // ativo daquele tipo.
    const org = await organizacaoDoWebhook(canal, null);
    const config = org ? await comOrganizacao(org, () => obterConfig(canal)) : null;

    const modo = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (modo === 'subscribe' && config?.verifyToken && token === config.verifyToken) {
      res.type('text/plain').send(String(challenge ?? ''));
      return;
    }
    res.status(403).json({ error: { code: 'VERIFICACAO_FALHOU', message: 'hub.verify_token invalido' } });
  }),
);

/**
 * Recebimento de mensagens (POST).
 *
 * Usa body cru (express.raw) porque a assinatura X-Hub-Signature-256 e calculada
 * sobre os bytes originais — reserializar o JSON quebraria a validacao.
 *
 * Responde 200 mesmo com payload que nao gera mensagem: a Meta reentrega o que
 * nao recebe 200, e reentrega infinita de um payload valido causaria loop.
 */
webhooksRoutes.post(
  '/:canal',
  raw({ type: '*/*', limit: '1mb' }),
  asyncHandler(async (req, res) => {
    const canal = canalDaRota(param(req, 'canal'));
    const corpoBruto = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');

    // A organizacao sai do id externo dentro do corpo. Isto acontece ANTES de
    // qualquer leitura de configuracao: sem saber de quem e a mensagem, nao ha
    // segredo com que validar a assinatura.
    const organizacaoId = await organizacaoDoWebhook(canal, identificadorExterno(corpoBruto));
    if (!organizacaoId) {
      res.status(503).json({ error: { code: 'CANAL_INDISPONIVEL', message: `Canal ${canal} inativo` } });
      return;
    }

    await comOrganizacao(organizacaoId, () => processarEntrada(canal, corpoBruto, req, res));
  }),
);

/**
 * Le o id externo do corpo bruto sem confiar nele para nada alem de rotear.
 *
 * A assinatura ainda nao foi validada neste ponto — nao poderia ter sido, porque
 * o segredo depende de saber a organizacao. Entao o id serve para escolher QUAL
 * segredo usar, e a assinatura e conferida depois, dentro do contexto. Um id
 * falso leva a mensagem a um segredo que nao vai bater.
 */
function identificadorExterno(corpoBruto: Buffer): string | null {
  try {
    const payload = JSON.parse(corpoBruto.toString('utf8')) as MetaWebhook;
    for (const entrada of payload.entry ?? []) {
      for (const mudanca of entrada.changes ?? []) {
        const id = mudanca.value?.metadata?.phone_number_id;
        if (id) return id;
      }
      if (entrada.id) return entrada.id;
    }
  } catch {
    // Corpo que nao e JSON nao tem id: o fluxo abaixo responde 400.
  }
  return null;
}

/** O corpo do POST, agora dentro do contexto da organizacao. */
async function processarEntrada(
  canal: CanalExterno,
  corpoBruto: Buffer,
  req: { header(nome: string): string | undefined },
  res: Response,
) {
    const config = await obterConfig(canal);

    if (!config?.ativo || !config.appSecret) {
      res.status(503).json({ error: { code: 'CANAL_INDISPONIVEL', message: `Canal ${canal} inativo` } });
      return;
    }

    const assinatura = req.header('x-hub-signature-256');

    if (!assinaturaValida(corpoBruto, assinatura, config.appSecret)) {
      res.status(401).json({ error: { code: 'ASSINATURA_INVALIDA', message: 'X-Hub-Signature-256 invalida' } });
      return;
    }

    let payload: MetaWebhook;
    try {
      payload = JSON.parse(corpoBruto.toString('utf8')) as MetaWebhook;
    } catch {
      res.status(400).json({ error: { code: 'JSON_INVALIDO', message: 'Corpo nao e JSON' } });
      return;
    }

    const mensagens = normalizarWebhook(payload);
    let processadas = 0;
    let duplicadas = 0;

    for (const mensagem of mensagens) {
      const resultado = await registrarMensagemEntrante(mensagem);
      if (resultado.duplicada) duplicadas += 1;
      else processadas += 1;
    }

    res.json({ recebidas: mensagens.length, processadas, duplicadas });
}
