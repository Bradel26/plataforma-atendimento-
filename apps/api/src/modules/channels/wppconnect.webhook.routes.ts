import { timingSafeEqual } from 'node:crypto';
import { json, Router, type NextFunction, type Request, type Response } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { badRequest } from '../../lib/errors';
import { prismaSemIsolamento } from '../../lib/prisma';
import { comOrganizacao, semOrganizacao } from '../../lib/tenant';
import { obterSegredoWebhookWppConnect } from '../../config/wppconnect.config';
import { registrarMensagemEntrante } from './inbound.service';
import { normalizarEventoWpp } from './wppconnect.inbound';

/**
 * Entrada do WPPConnect Server: ele posta aqui todo evento (`onmessage`,
 * `onack`, `onpresencechanged`, ...) da sessao configurada.
 *
 * Diferente da Ponte Baileys (`ponte.routes.ts`), o WPPConnect Server nao
 * assina nada nem manda organizacaoId — so `session` no corpo. Por isso:
 *   - a autenticacao e um segredo simples por query string (ver
 *     `wppconnect.config.ts`), nao HMAC sobre o corpo;
 *   - a organizacao e descoberta a partir da `ChannelConfig` cuja
 *     `ponteSessao` bate com `session`, ANTES de abrir o contexto de tenant
 *     (mesmo padrao de `organizacaoExiste` em `ponte.routes.ts`).
 *
 * A mensagem entra por `registrarMensagemEntrante`, o MESMO caminho da Ponte
 * e do webhook oficial da Meta — nenhuma logica nova de contato/conversa
 * aqui, so o de-para do formato de evento (`wppconnect.inbound.ts`).
 */
export const wppconnectWebhookRoutes = Router();

function segredoValido(recebido: string | null, esperado: string): boolean {
  if (!recebido) return false;
  const a = Buffer.from(recebido, 'utf8');
  const b = Buffer.from(esperado, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Verifica o segredo ANTES de ler o corpo (a query string ja vem na URL,
 * sem custo de parse) — quem nao sabe o segredo nem chega a fazer a API
 * processar JSON nenhum.
 */
function verificarSegredo(req: Request, res: Response, next: NextFunction) {
  const segredo = obterSegredoWebhookWppConnect();
  if (!segredo) {
    res.status(503).json({
      error: {
        code: 'WEBHOOK_SEM_SEGREDO',
        message: 'Configure WPP_CONNECT_WEBHOOK_SECRET antes de receber eventos do WPPConnect',
      },
    });
    return;
  }

  const recebido = typeof req.query.secret === 'string' ? req.query.secret : null;
  if (!segredoValido(recebido, segredo)) {
    res.status(401).json({ error: { code: 'SEGREDO_INVALIDO', message: 'Segredo do webhook invalido' } });
    return;
  }

  next();
}

/**
 * Localiza a organizacao dona da sessao, fora de qualquer contexto de tenant
 * — o payload so traz `session`, nunca `organizacaoId`. `null` quando nenhuma
 * `ChannelConfig` de WhatsApp tem essa `ponteSessao` cadastrada: sessao
 * desconhecida e recusada, nunca cai numa organizacao "padrao".
 */
async function organizacaoDaSessao(sessao: string): Promise<string | null> {
  return semOrganizacao('webhook do wppconnect: resolver organizacao pela sessao', async () => {
    const config = await prismaSemIsolamento.channelConfig.findFirst({
      where: { canal: 'WHATSAPP', ponteSessao: sessao },
      select: { organizacaoId: true },
    });
    return config?.organizacaoId ?? null;
  });
}

wppconnectWebhookRoutes.post(
  '/',
  verificarSegredo,
  json({ limit: '1mb' }),
  asyncHandler(async (req, res) => {
    const corpo = req.body as unknown;

    const sessaoBruta =
      corpo && typeof corpo === 'object' && typeof (corpo as { session?: unknown }).session === 'string'
        ? (corpo as { session: string }).session.trim()
        : '';

    if (!sessaoBruta) {
      throw badRequest('Payload do WPPConnect sem "session"');
    }

    const organizacaoId = await organizacaoDaSessao(sessaoBruta);
    if (!organizacaoId) {
      res.status(404).json({
        error: {
          code: 'SESSAO_DESCONHECIDA',
          message: `Nenhum canal WhatsApp cadastrado para a sessao "${sessaoBruta}"`,
        },
      });
      return;
    }

    await comOrganizacao(organizacaoId, async () => {
      const normalizada = normalizarEventoWpp(corpo);
      if (!normalizada) {
        // Evento que nao interessa (onack, presence, eco, grupo, payload
        // incompleto) — 200 para o WPPConnect nao insistir achando que falhou.
        res.json({ ok: true, ignorada: true });
        return;
      }

      const resultado = await registrarMensagemEntrante(normalizada);
      res.json({ ok: true, duplicada: 'duplicada' in resultado ? resultado.duplicada : false });
    });
  }),
);
