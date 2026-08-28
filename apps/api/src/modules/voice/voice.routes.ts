import express, { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody, validateQuery } from '../../http/middleware/validate';
import { prismaSemIsolamento } from '../../lib/prisma';
import { ORGANIZACAO_INICIAL, comOrganizacao, semOrganizacao } from '../../lib/tenant';
import { getBranding } from '../branding/branding.service';
import {
  aplicarEvento,
  configPublica,
  indicadoresVoz,
  listarChamadas,
  obterConfig,
  originarChamada,
  provedorAtual,
  salvarConfig,
  verificarAssinatura,
} from './voice.service';

export const vozRoutes = Router();
/** Rotas chamadas pelo provedor. Publicas, protegidas por assinatura. */
export const vozWebhookRoutes = Router();

const STATUS = [
  'INICIANDO',
  'CHAMANDO',
  'EM_ANDAMENTO',
  'COMPLETADA',
  'NAO_ATENDIDA',
  'OCUPADA',
  'FALHOU',
  'CANCELADA',
] as const;

const configSchema = z.object({
  ativo: z.boolean().optional(),
  provedor: z.string().trim().min(2).max(40).optional(),
  contaSid: z.string().trim().max(120).nullable().optional(),
  authToken: z.string().trim().max(200).nullable().optional(),
  numeroPadrao: z.string().trim().max(20).nullable().optional(),
  urlWebhook: z.string().trim().url().max(300).nullable().optional(),
  filaId: z.string().uuid().nullable().optional(),
  guardarGravacao: z.boolean().optional(),
});

const listarSchema = z.object({
  limite: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  status: z.enum(STATUS).optional(),
  direcao: z.enum(['ENTRANTE', 'SAINTE']).optional(),
  agenteId: z.string().uuid().optional(),
});

vozRoutes.get(
  '/config',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (_req, res) => {
    res.json({ config: await configPublica() });
  }),
);

vozRoutes.put(
  '/config',
  requireAuth,
  requireRole('ADMIN'),
  validateBody(configSchema),
  asyncHandler(async (req, res) => {
    res.json({ config: await salvarConfig(req.body) });
  }),
);

vozRoutes.get(
  '/chamadas',
  requireAuth,
  validateQuery(listarSchema),
  asyncHandler(async (_req, res) => {
    res.json(await listarChamadas(res.locals.query));
  }),
);

vozRoutes.post(
  '/chamadas',
  requireAuth,
  validateBody(z.object({ destino: z.string().trim().min(8, 'Informe o numero com DDD').max(20) })),
  asyncHandler(async (req, res) => {
    res.status(201).json({ chamada: await originarChamada(req.user!.sub, req.body.destino) });
  }),
);

vozRoutes.get(
  '/indicadores',
  requireAuth,
  requireRole('ADMIN', 'SUPERVISOR'),
  validateQuery(z.object({ desde: z.coerce.date().optional() })),
  asyncHandler(async (_req, res) => {
    const { desde } = res.locals.query as { desde?: Date };
    res.json({ indicadores: await indicadoresVoz(desde ?? new Date(Date.now() - 24 * 60 * 60 * 1000)) });
  }),
);

// ---------------------------------------------------------------------------
// Webhooks do provedor
// ---------------------------------------------------------------------------

/** O provedor envia formulario, nao JSON. */
vozWebhookRoutes.use(express.urlencoded({ extended: false }));

/**
 * Descobre a organizacao dona de um evento de voz.
 *
 * Mesmo problema do webhook de canal: a URL e compartilhada, entao a rota nao
 * identifica ninguem. Quem identifica e o **id da chamada** que o provedor manda
 * no corpo — a chamada ja existe no banco e tem a organizacao dela.
 *
 * Sem chamada conhecida (evento de teste, primeira ligacao de um tronco novo),
 * cai para a unica organizacao com voz configurada. Com mais de uma, recusa em
 * vez de escolher: aplicar o evento de uma empresa na chamada de outra e pior do
 * que perder o evento.
 */
async function organizacaoDoEventoDeVoz(corpo: unknown): Promise<string | null> {
  const dados = (corpo ?? {}) as Record<string, unknown>;
  const idExterno = [dados.CallSid, dados.ParentCallSid, dados.callSid]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .find(Boolean);

  return semOrganizacao('webhook de voz: o id da chamada e que revela a organizacao', async () => {
    if (idExterno) {
      const chamada = await prismaSemIsolamento.call.findFirst({
        where: { idExterno },
        select: { organizacaoId: true },
      });
      if (chamada) return chamada.organizacaoId;
    }

    const ativas = await prismaSemIsolamento.voiceConfig.findMany({
      where: { ativo: true },
      select: { organizacaoId: true },
      take: 2,
    });
    if (ativas.length === 1) return ativas[0]!.organizacaoId;

    // Nenhuma configurada e o caso do ambiente de desenvolvimento e do primeiro
    // teste: cai na organizacao inicial para que o webhook responda algo
    // diagnosticavel em vez de 500.
    if (ativas.length === 0) return ORGANIZACAO_INICIAL;

    console.warn('[voz] evento sem chamada conhecida e mais de uma organizacao com voz ativa — descartado');
    return null;
  });
}

/**
 * Abre o contexto da organizacao antes de qualquer leitura.
 *
 * Vale para as duas rotas de webhook: a assinatura e conferida contra a
 * configuracao da organizacao, e ler a configuracao ja exige saber qual e ela.
 */
vozWebhookRoutes.use(
  asyncHandler(async (req, _res, next) => {
    const organizacaoId = await organizacaoDoEventoDeVoz(req.body);
    if (!organizacaoId) {
      // 200 de proposito: o provedor reentrega o que nao recebe 200, e reentrega
      // infinita de um evento que nao da para rotear nao melhora nada.
      _res.status(200).json({ ignorado: true, motivo: 'evento sem organizacao identificavel' });
      return;
    }
    comOrganizacao(organizacaoId, () => next());
  }),
);

/**
 * Valida a assinatura do provedor.
 *
 * A URL usada na conferencia vem da **configuracao**, nao do request: atras de
 * proxy o host e o protocolo chegam reescritos e a assinatura nunca fecharia.
 */
async function autorizado(req: express.Request, rota: string) {
  const config = await obterConfig();
  const parametros = Object.fromEntries(
    Object.entries((req.body ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
  );

  const valida = await verificarAssinatura({
    url: `${config.urlWebhook ?? ''}${rota}`,
    parametros,
    assinatura: req.header('X-Twilio-Signature'),
  });

  return { valida, parametros };
}

vozWebhookRoutes.post(
  '/eventos',
  asyncHandler(async (req, res) => {
    const { valida, parametros } = await autorizado(req, '/eventos');
    if (!valida) {
      res.status(401).json({ error: { code: 'ASSINATURA_INVALIDA', message: 'Assinatura do provedor invalida' } });
      return;
    }

    const evento = (await provedorAtual()).normalizarEvento(parametros);
    if (!evento) {
      // Evento sem identificacao de chamada: 200 evita reentrega em loop.
      res.status(200).json({ ignorado: true, motivo: 'evento sem identificador de chamada' });
      return;
    }

    const { chamada, ignorado } = await aplicarEvento(evento);
    res.status(200).json({ chamadaId: chamada.id, status: chamada.status, ignorado });
  }),
);

/**
 * Instrucoes da chamada (TwiML).
 *
 * Este e o ponto onde entra a URA de verdade: menu, transferencia para ramal,
 * fila de espera com musica. Nada disso da para validar sem softphone e sem
 * tronco, entao aqui fica o comportamento minimo honesto — atende, avisa que a
 * ligacao e gravada (exigencia legal) e grava.
 */
vozWebhookRoutes.post(
  '/instrucoes',
  asyncHandler(async (req, res) => {
    const { valida } = await autorizado(req, '/instrucoes');
    if (!valida) {
      res.status(401).type('text/plain').send('assinatura invalida');
      return;
    }

    const branding = await getBranding();
    const aviso = `Voce ligou para ${branding.appName}. Esta chamada sera gravada para fins de qualidade e seguranca.`;

    res.status(200).type('text/xml').send(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Response>',
        `  <Say language="pt-BR">${aviso}</Say>`,
        '  <Record maxLength="600" playBeep="true" trim="trim-silence" />',
        '  <Say language="pt-BR">Nao recebemos sua mensagem. Ate logo.</Say>',
        '</Response>',
      ].join('\n'),
    );
  }),
);
