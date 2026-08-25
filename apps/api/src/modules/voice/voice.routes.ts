import express, { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody, validateQuery } from '../../http/middleware/validate';
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
