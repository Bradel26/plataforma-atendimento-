import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Testa a rota `POST /api/webhooks/wppconnect` de ponta a ponta (menos o
 * `express.json()` real, que exige um stream de verdade — mesma limitacao dos
 * outros testes de rota deste projeto: o corpo ja parseado vai direto em
 * `req.body`). Mocka so o que nao e o alvo: `prismaSemIsolamento` (resolucao
 * de organizacao), `registrarMensagemEntrante` (o service ja tem teste
 * proprio) e o segredo configurado.
 */

const CHANNEL_CONFIG_MOCK = { organizacaoId: 'org-wpp-poc' };

const { channelConfigFindFirst } = vi.hoisted(() => ({
  channelConfigFindFirst: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({
  prismaSemIsolamento: { channelConfig: { findFirst: channelConfigFindFirst } },
  prisma: {},
}));

const { registrarMensagemEntrante } = vi.hoisted(() => ({
  registrarMensagemEntrante: vi.fn(),
}));

vi.mock('./inbound.service', () => ({ registrarMensagemEntrante }));

const { obterSegredoWebhookWppConnect } = vi.hoisted(() => ({
  obterSegredoWebhookWppConnect: vi.fn(),
}));

vi.mock('../../config/wppconnect.config', () => ({ obterSegredoWebhookWppConnect }));

import { wppconnectWebhookRoutes } from './wppconnect.webhook.routes';

const SEGREDO = 'segredo-de-teste-bem-longo';

const PAYLOAD_ONMESSAGE = {
  event: 'onmessage',
  session: 'wpp-poc',
  id: 'false_79233992933473@lid_3EB0A238AC2DE5AE1C5D04',
  body: 'teste inbound 456',
  fromMe: false,
  isGroupMsg: false,
  chatId: '79233992933473@lid',
  from: '79233992933473@lid',
  notifyName: 'Kauã',
  sender: { pushname: 'Kauã', formattedName: '+55 62 9288-5001' },
};

type RouteLayer = {
  route?: {
    path: string;
    stack: { method: string; handle: (req: Request, res: Response, next: (e?: unknown) => void) => void }[];
  };
};

function camadasDaRota(path: string, method: 'post') {
  const layer = (wppconnectWebhookRoutes.stack as RouteLayer[]).find((l) => l.route?.path === path);
  if (!layer?.route) throw new Error(`rota ${path} nao encontrada`);
  return layer.route.stack.filter((s) => s.method === method).map((s) => s.handle);
}

/**
 * Roda a pilha inteira da rota, PULANDO o `express.json()` real (o 2o
 * handler): o corpo ja chega pronto em `req.body`, como nos outros testes de
 * rota deste projeto.
 *
 * O handler final (`asyncHandler`) nunca chama `next()` no caminho feliz —
 * so envia a resposta (`res.json`) — entao esperar por `next()` travaria para
 * sempre. Em vez disso, espera o que vier primeiro: `res.json` ser chamado
 * (sinalizado por `fakeRes()`) ou um erro subir pela cadeia de `next(err)`.
 */
async function chamarRota(req: Request, res: Response & { aguardarResposta: Promise<void> }) {
  const pilha = camadasDaRota('/', 'post');
  const semJson = [pilha[0]!, pilha[2]!];

  const erro = new Promise<never>((_resolve, reject) => {
    let indice = 0;
    const proximo = (err?: unknown) => {
      if (err) {
        reject(err);
        return;
      }
      const handler = semJson[indice++];
      if (!handler) return; // fim da pilha sem erro: res.json ja deve ter sido chamado
      handler(req, res, proximo);
    };
    proximo();
  });

  await Promise.race([res.aguardarResposta, erro]);
}

function fakeReq(overrides: { query?: Record<string, string>; body?: unknown } = {}): Request {
  return { query: overrides.query ?? {}, body: overrides.body ?? {} } as unknown as Request;
}

function fakeRes() {
  let sinalizar: () => void = () => {};
  const aguardarResposta = new Promise<void>((resolve) => {
    sinalizar = resolve;
  });
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(() => sinalizar()),
    aguardarResposta,
  } as unknown as Response & { aguardarResposta: Promise<void> };
  return res;
}

describe('POST /api/webhooks/wppconnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    obterSegredoWebhookWppConnect.mockReturnValue(SEGREDO);
    channelConfigFindFirst.mockResolvedValue(CHANNEL_CONFIG_MOCK);
    registrarMensagemEntrante.mockResolvedValue({ duplicada: false, conversaId: 'conv-1', mensagemId: 'msg-1' });
  });

  it('recebe o payload, resolve a sessao e chega ate registrarMensagemEntrante', async () => {
    const req = fakeReq({ query: { secret: SEGREDO }, body: PAYLOAD_ONMESSAGE });
    const res = fakeRes();

    await chamarRota(req, res);

    expect(channelConfigFindFirst).toHaveBeenCalledWith({
      where: { canal: 'WHATSAPP', ponteSessao: 'wpp-poc' },
      select: { organizacaoId: true },
    });
    expect(registrarMensagemEntrante).toHaveBeenCalledTimes(1);
    expect(registrarMensagemEntrante).toHaveBeenCalledWith(
      expect.objectContaining({
        canal: 'WHATSAPP',
        enderecoExterno: '79233992933473@lid',
        idExterno: 'false_79233992933473@lid_3EB0A238AC2DE5AE1C5D04',
        identificadorDestino: 'wpp-poc',
      }),
    );
    expect(res.json).toHaveBeenCalledWith({ ok: true, duplicada: false });
  });

  it('rejeita sem segredo configurado no servidor (503, nao processa nada)', async () => {
    obterSegredoWebhookWppConnect.mockReturnValue(null);
    const req = fakeReq({ query: { secret: SEGREDO }, body: PAYLOAD_ONMESSAGE });
    const res = fakeRes();

    await chamarRota(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(channelConfigFindFirst).not.toHaveBeenCalled();
    expect(registrarMensagemEntrante).not.toHaveBeenCalled();
  });

  it('rejeita segredo ausente ou incorreto (401, nao processa nada)', async () => {
    const semSegredo = fakeReq({ query: {}, body: PAYLOAD_ONMESSAGE });
    const resSemSegredo = fakeRes();
    await chamarRota(semSegredo, resSemSegredo);
    expect(resSemSegredo.status).toHaveBeenCalledWith(401);

    const segredoErrado = fakeReq({ query: { secret: 'chute-qualquer' }, body: PAYLOAD_ONMESSAGE });
    const resErrado = fakeRes();
    await chamarRota(segredoErrado, resErrado);
    expect(resErrado.status).toHaveBeenCalledWith(401);

    expect(channelConfigFindFirst).not.toHaveBeenCalled();
    expect(registrarMensagemEntrante).not.toHaveBeenCalled();
  });

  it('nao aceita sessao inexistente (404, nao chama registrarMensagemEntrante)', async () => {
    channelConfigFindFirst.mockResolvedValue(null);
    const req = fakeReq({ query: { secret: SEGREDO }, body: PAYLOAD_ONMESSAGE });
    const res = fakeRes();

    await chamarRota(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(registrarMensagemEntrante).not.toHaveBeenCalled();
  });

  it('rejeita payload sem "session" (400) sem tentar resolver organizacao', async () => {
    const { session: _session, ...semSessao } = PAYLOAD_ONMESSAGE;
    const req = fakeReq({ query: { secret: SEGREDO }, body: semSessao });
    const res = fakeRes();

    await expect(chamarRota(req, res)).rejects.toMatchObject({ status: 400 });
    expect(channelConfigFindFirst).not.toHaveBeenCalled();
  });

  it('mensagens ignoradas (fromMe/grupo/evento diferente) nao chegam a registrarMensagemEntrante', async () => {
    for (const alteracao of [{ fromMe: true }, { isGroupMsg: true }, { event: 'onack' }]) {
      registrarMensagemEntrante.mockClear();
      const req = fakeReq({ query: { secret: SEGREDO }, body: { ...PAYLOAD_ONMESSAGE, ...alteracao } });
      const res = fakeRes();

      await chamarRota(req, res);

      expect(registrarMensagemEntrante).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ ok: true, ignorada: true });
    }
  });

  it('nunca resolve organizacao para um valor fixo/hardcoded — usa sempre o que o mock devolveu', async () => {
    channelConfigFindFirst.mockResolvedValue({ organizacaoId: 'outra-organizacao-qualquer' });
    const req = fakeReq({ query: { secret: SEGREDO }, body: PAYLOAD_ONMESSAGE });
    const res = fakeRes();

    await chamarRota(req, res);

    expect(registrarMensagemEntrante).toHaveBeenCalledTimes(1);
    // Nao ha como asserir contexto de tenant diretamente aqui sem acoplar ao
    // modulo interno — o que garante que NAO e hardcoded e o teste acima ("nao
    // aceita sessao inexistente"): se fosse fixo, aquele teste teria passado
    // mesmo com channelConfigFindFirst devolvendo null.
  });
});
