import { Router, raw } from 'express';
import { asyncHandler } from '../../../http/async-handler';
import { param } from '../../../http/params';
import { log } from '../../../lib/log';
import { comOrganizacao } from '../../../lib/tenant';
import { obterProvider } from '../providers/registro';
import { organizacaoDaSessao, processarEventoDeCanal, type ResultadoDoEvento } from './eventos-de-canal';

/**
 * Entrada generica de provider: `POST /api/webhooks/providers/:provider`.
 *
 * So transporte, nesta ordem, e nenhuma regra de negocio:
 *   1. acha o provider pelo nome (404 se nao existe);
 *   2. `provider.webhook.autenticar` sobre o corpo CRU (401 se falha);
 *   3. `provider.webhook.interpretar` -> `EventoDeCanal[]` (o payload cru para aqui);
 *   4. para cada evento, descobre a organizacao pela sessao e entrega ao dominio
 *      (`processarEventoDeCanal`) dentro do contexto dela.
 *
 * 200 para evento que nao interessa ou de sessao desconhecida: a engine
 * reentrega o que nao recebe 200, e reentregar o que nunca vai ser aceito so
 * gera tempestade. 5xx so quando a gravacao falhou — ai a reentrega e o que
 * se quer, e e segura porque a entrada e idempotente por `idExterno`.
 */
export const providerWebhooksRoutes = Router();

providerWebhooksRoutes.post(
  '/:provider',
  // Corpo cru: a assinatura (quando a engine assina) e sobre os bytes originais.
  raw({ type: '*/*', limit: '2mb' }),
  asyncHandler(async (req, res) => {
    const nome = param(req, 'provider');
    const provider = obterProvider(nome);
    if (!provider) {
      res.status(404).json({ error: { code: 'PROVIDER_DESCONHECIDO', message: `Provider "${nome}" nao existe` } });
      return;
    }

    const corpoBruto = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (!provider.webhook.autenticar({ corpoBruto, header: (h) => req.header(h), query: req.query })) {
      log.warn('webhook', 'webhook recusado: autenticacao invalida', { provider: provider.nome });
      res.status(401).json({ error: { code: 'WEBHOOK_NAO_AUTENTICADO', message: 'Webhook sem autenticacao valida' } });
      return;
    }

    let corpo: unknown;
    try {
      corpo = JSON.parse(corpoBruto.toString('utf8'));
    } catch {
      res.status(400).json({ error: { code: 'JSON_INVALIDO', message: 'Corpo nao e JSON' } });
      return;
    }

    const contagem: Record<ResultadoDoEvento, number> = { processado: 0, duplicado: 0, ignorado: 0 };

    for (const evento of provider.webhook.interpretar(corpo)) {
      if (evento.tipo === 'ignorado') {
        contagem.ignorado += 1;
        continue;
      }

      const organizacaoId = await organizacaoDaSessao(evento.sessaoExterna);
      if (!organizacaoId) {
        log.warn('webhook', 'evento de sessao desconhecida descartado', {
          provider: provider.nome,
          sessaoExterna: evento.sessaoExterna,
          tipo: evento.tipo,
        });
        contagem.ignorado += 1;
        continue;
      }

      const resultado = await comOrganizacao(organizacaoId, () =>
        processarEventoDeCanal(evento, { provider: provider.nome, organizacaoId }),
      );
      contagem[resultado] += 1;
    }

    res.json({ ok: true, ...contagem });
  }),
);
