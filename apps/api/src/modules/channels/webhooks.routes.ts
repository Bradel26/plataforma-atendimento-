import { Router, raw } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { param } from '../../http/params';
import { notFound } from '../../lib/errors';
import { CANAIS_EXTERNOS, assinaturaValida, obterConfig, type CanalExterno } from './channels.service';
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
    const config = await obterConfig(canal);

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
    const config = await obterConfig(canal);

    if (!config?.ativo || !config.appSecret) {
      res.status(503).json({ error: { code: 'CANAL_INDISPONIVEL', message: `Canal ${canal} inativo` } });
      return;
    }

    const corpoBruto = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
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
  }),
);
