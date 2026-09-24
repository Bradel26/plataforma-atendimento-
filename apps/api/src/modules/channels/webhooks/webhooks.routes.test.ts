import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A rota generica `POST /api/webhooks/providers/:provider` como transporte:
 * provider, autenticacao, parse, resolucao de organizacao pela sessao e
 * entrega ao dominio. O dominio (`processarEventoDeCanal`) e mockado — tem
 * teste proprio em `waha.pipeline.test.ts`.
 */

const { organizacaoDaSessao, processarEventoDeCanal } = vi.hoisted(() => ({
  organizacaoDaSessao: vi.fn(),
  processarEventoDeCanal: vi.fn(),
}));
vi.mock('./eventos-de-canal', () => ({ organizacaoDaSessao, processarEventoDeCanal }));

import { providerWebhooksRoutes } from './webhooks.routes';

const SEGREDO = 'segredo-do-webhook-bem-longo';

const EVENTO = {
  event: 'message',
  session: 'vendedor-1a2b3c4d',
  payload: { id: 'false_5562999990000@c.us_ABC', from: '5562999990000@c.us', body: 'oi' },
};

type Camada = { route?: { path: string; stack: { handle: (req: Request, res: Response, next: (e?: unknown) => void) => void }[] } };

/** Roda o handler final, pulando o `raw()` real (que exige stream): o corpo ja chega como Buffer. */
async function chamar(opts: { provider?: string; corpo?: unknown; query?: Record<string, string> }) {
  const camada = (providerWebhooksRoutes.stack as Camada[]).find((l) => l.route?.path === '/:provider');
  const handler = camada!.route!.stack.at(-1)!.handle;

  let resolver: () => void = () => {};
  const respondeu = new Promise<void>((r) => (resolver = r));
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn(() => resolver()) } as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  const corpo = typeof opts.corpo === 'string' ? opts.corpo : JSON.stringify(opts.corpo ?? EVENTO);
  const req = {
    params: { provider: opts.provider ?? 'waha' },
    query: opts.query ?? { secret: SEGREDO },
    body: Buffer.from(corpo),
    header: () => undefined,
  } as unknown as Request;

  const falhou = new Promise<never>((_r, rejeitar) => handler(req, res, (e) => e && rejeitar(e)));
  await Promise.race([respondeu, falhou]);
  return { status: res.status.mock.calls[0]?.[0] ?? 200, corpo: res.json.mock.calls[0]?.[0] };
}

describe('POST /api/webhooks/providers/:provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.WAHA_WEBHOOK_SECRET = SEGREDO;
    organizacaoDaSessao.mockResolvedValue('org-1');
    processarEventoDeCanal.mockResolvedValue('processado');
  });

  afterEach(() => {
    delete process.env.WAHA_WEBHOOK_SECRET;
    vi.restoreAllMocks();
  });

  it('evento autenticado chega ao dominio com a organizacao da sessao', async () => {
    const r = await chamar({});

    expect(r).toEqual({ status: 200, corpo: { ok: true, processado: 1, duplicado: 0, ignorado: 0 } });
    expect(organizacaoDaSessao).toHaveBeenCalledWith('vendedor-1a2b3c4d');
    expect(processarEventoDeCanal).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'mensagem.recebida', sessaoExterna: 'vendedor-1a2b3c4d' }),
      { provider: 'waha', organizacaoId: 'org-1' },
    );
  });

  it('segredo errado: 401 e nada chega ao dominio', async () => {
    const r = await chamar({ query: { secret: 'errado' } });
    expect(r.status).toBe(401);
    expect(processarEventoDeCanal).not.toHaveBeenCalled();
  });

  it('provider desconhecido: 404', async () => {
    expect((await chamar({ provider: 'telegram' })).status).toBe(404);
  });

  it('corpo que nao e JSON: 400', async () => {
    expect((await chamar({ corpo: 'nao-e-json' })).status).toBe(400);
  });

  it('sessao que nenhuma linha conhece: 200 ignorado (reentregar nao adiantaria)', async () => {
    organizacaoDaSessao.mockResolvedValue(null);
    const r = await chamar({});
    expect(r).toEqual({ status: 200, corpo: { ok: true, processado: 0, duplicado: 0, ignorado: 1 } });
    expect(processarEventoDeCanal).not.toHaveBeenCalled();
  });

  it('evento que nao interessa (grupo) nem consulta a organizacao', async () => {
    await chamar({ corpo: { ...EVENTO, payload: { ...EVENTO.payload, from: '1203630@g.us' } } });
    expect(organizacaoDaSessao).not.toHaveBeenCalled();
  });

  it('falha ao gravar sobe como erro (5xx) para o WAHA reentregar', async () => {
    processarEventoDeCanal.mockRejectedValue(new Error('banco fora'));
    await expect(chamar({})).rejects.toThrow('banco fora');
  });
});
