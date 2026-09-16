import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { comOrganizacao } from '../../lib/tenant';
import { channelsRoutes } from './channels.routes';

/*
 * Confirma que QR/estado/desconectar passam pelo `WhatsAppProvider` (Fase 2),
 * e nao mais direto por `whatsapp.ponte.ts`. Mocka tudo que nao e o alvo do
 * teste (persistencia de canal, IA, e o proprio provider) para isolar so o
 * encadeamento rota -> provider.
 */

const configFalsa = {
  id: 'canal-1',
  canal: 'WHATSAPP' as const,
  modo: 'NAO_OFICIAL' as const,
  donoId: null as string | null,
  ponteSessao: null as string | null,
  ponteUrl: 'http://ponte:3000/api',
  ponteToken: 'token',
};

vi.mock('./channels.service', () => ({
  CANAIS_EXTERNOS: ['WHATSAPP', 'INSTAGRAM', 'FACEBOOK'],
  atualizarNumero: vi.fn(),
  criarNumero: vi.fn(),
  excluirNumero: vi.fn(),
  listarCanais: vi.fn(),
  minhaLinhaWhatsapp: vi.fn(),
  conectarMinhaLinhaWhatsapp: vi.fn(),
  obterConfig: vi.fn(async () => configFalsa),
  obterConfigPorId: vi.fn(async () => configFalsa),
  salvarCanal: vi.fn(),
}));

vi.mock('../bots/ia.service', () => ({
  estadoDaIa: vi.fn(),
  estadoDaIaDoNumero: vi.fn(),
  salvarIa: vi.fn(),
  salvarIaDoNumero: vi.fn(),
}));

const { channelConfigUpdate, notificarStatusCanal } = vi.hoisted(() => ({
  channelConfigUpdate: vi.fn(),
  notificarStatusCanal: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({
  prisma: { channelConfig: { update: channelConfigUpdate } },
}));

vi.mock('../../realtime/hub', () => ({
  notificarStatusCanal,
}));

const { getQRCode, getStatus, disconnect } = vi.hoisted(() => ({
  getQRCode: vi.fn(),
  getStatus: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock('./providers/baileys.provider', () => ({
  BaileysProvider: class {
    getQRCode = getQRCode;
    getStatus = getStatus;
    disconnect = disconnect;
    sendText = vi.fn();
    sendMedia = vi.fn();
  },
}));

type RouteLayer = {
  route?: { path: string; stack: { method: string; handle: (req: Request, res: Response, next: (e?: unknown) => void) => void }[] };
};

function handlerDe(path: string, method: 'get' | 'post') {
  const layer = (channelsRoutes.stack as RouteLayer[]).find((l) => l.route?.path === path);
  if (!layer?.route) throw new Error(`rota ${path} nao encontrada`);
  const camadas = layer.route.stack.filter((s) => s.method === method);
  const ultima = camadas.at(-1);
  if (!ultima) throw new Error(`metodo ${method} nao encontrado em ${path}`);
  // A rota pode ter middlewares antes (ex.: requireRole) — o handler de fato e
  // sempre o ultimo da pilha daquele metodo.
  return ultima.handle;
}

function fakeRes() {
  const res = {
    json: vi.fn(),
    status: vi.fn().mockReturnThis(),
    end: vi.fn(),
  } as unknown as Response;
  return res;
}

function fakeReq(params: Record<string, string> = {}): Request {
  return {
    user: { sub: 'admin-1', perfil: 'ADMIN', nome: 'Admin', email: 'a@x.com', org: 'org-1' },
    params,
  } as unknown as Request;
}

async function rodar(handler: (req: Request, res: Response, next: (e?: unknown) => void) => void, req: Request, res: Response) {
  await comOrganizacao('org-1', () => {
    return new Promise<void>((resolve, reject) => {
      handler(req, res, (err?: unknown) => (err ? reject(err) : resolve()));
      // asyncHandler resolve via res.json/res.end, nao via next() no caminho feliz
      resolve();
    });
  });
}

describe('channels.routes — QR/estado/desconectar passam pelo WhatsAppProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /whatsapp/ponte/qr chama whatsAppProvider.getQRCode, nao a ponte direto', async () => {
    getQRCode.mockResolvedValue({ qr: 'data:image/png;base64,abc', conectado: false, motivo: null });
    const handler = handlerDe('/whatsapp/ponte/qr', 'get');
    const res = fakeRes();

    await rodar(handler, fakeReq(), res);
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());

    expect(getQRCode).toHaveBeenCalledWith(configFalsa);
    expect(res.json).toHaveBeenCalledWith({ qr: 'data:image/png;base64,abc', conectado: false, motivo: null });
  });

  it('GET /whatsapp/ponte/estado chama whatsAppProvider.getStatus', async () => {
    getStatus.mockResolvedValue({ situacao: 'CONECTADO', detalhe: null });
    const handler = handlerDe('/whatsapp/ponte/estado', 'get');
    const res = fakeRes();

    await rodar(handler, fakeReq(), res);
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());

    expect(getStatus).toHaveBeenCalledWith(configFalsa);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ estado: { situacao: 'CONECTADO', detalhe: null } }),
    );
  });

  it('POST /whatsapp/ponte/desconectar chama whatsAppProvider.disconnect', async () => {
    disconnect.mockResolvedValue(undefined);
    const handler = handlerDe('/whatsapp/ponte/desconectar', 'post');
    const res = fakeRes();

    await rodar(handler, fakeReq(), res);
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());

    expect(disconnect).toHaveBeenCalledWith(configFalsa);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('POST /whatsapp/ponte/desconectar: sucesso atualiza o estado local e emite canal:status', async () => {
    disconnect.mockResolvedValue(undefined);
    const handler = handlerDe('/whatsapp/ponte/desconectar', 'post');
    const res = fakeRes();

    await rodar(handler, fakeReq(), res);
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());

    expect(channelConfigUpdate).toHaveBeenCalledWith({
      where: { id: configFalsa.id },
      data: { ponteStatus: 'DESCONECTADO', ponteStatusEm: expect.any(Date) },
    });
    expect(notificarStatusCanal).toHaveBeenCalledWith(
      expect.objectContaining({
        id: configFalsa.id,
        ponteSessao: configFalsa.ponteSessao,
        status: 'DESCONECTADO',
        detalhe: null,
      }),
      { agenteId: configFalsa.donoId },
    );
  });

  it('POST /whatsapp/ponte/desconectar: se o provider falhar, nao atualiza estado nem emite evento', async () => {
    disconnect.mockRejectedValue(new Error('ponte fora do ar'));
    const handler = handlerDe('/whatsapp/ponte/desconectar', 'post');
    const res = fakeRes();

    await expect(
      comOrganizacao('org-1', () => new Promise<void>((resolve, reject) => handler(fakeReq(), res, (e) => (e ? reject(e) : resolve())))),
    ).rejects.toThrow('ponte fora do ar');

    expect(channelConfigUpdate).not.toHaveBeenCalled();
    expect(notificarStatusCanal).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('POST /numeros/:id/ponte/desconectar (linha pessoal): sucesso tambem atualiza o estado local', async () => {
    disconnect.mockResolvedValue(undefined);
    const handler = handlerDe('/numeros/:id/ponte/desconectar', 'post');
    const res = fakeRes();

    await rodar(handler, fakeReq({ id: 'canal-1' }), res);
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());

    expect(channelConfigUpdate).toHaveBeenCalledWith({
      where: { id: configFalsa.id },
      data: { ponteStatus: 'DESCONECTADO', ponteStatusEm: expect.any(Date) },
    });
    expect(notificarStatusCanal).toHaveBeenCalledTimes(1);
  });

  it('POST /numeros/:id/ponte/desconectar (linha pessoal): erro do provider preserva o comportamento existente', async () => {
    disconnect.mockRejectedValue(new Error('ponte fora do ar'));
    const handler = handlerDe('/numeros/:id/ponte/desconectar', 'post');
    const res = fakeRes();

    await expect(
      comOrganizacao('org-1', () =>
        new Promise<void>((resolve, reject) => handler(fakeReq({ id: 'canal-1' }), res, (e) => (e ? reject(e) : resolve()))),
      ),
    ).rejects.toThrow('ponte fora do ar');

    expect(channelConfigUpdate).not.toHaveBeenCalled();
    expect(notificarStatusCanal).not.toHaveBeenCalled();
  });

  it('GET /numeros/:id/ponte/qr (linha pessoal) tambem passa pelo provider', async () => {
    getQRCode.mockResolvedValue({ qr: null, conectado: true, motivo: null });
    const handler = handlerDe('/numeros/:id/ponte/qr', 'get');
    const res = fakeRes();

    await rodar(handler, fakeReq({ id: 'canal-1' }), res);
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());

    expect(getQRCode).toHaveBeenCalledWith(configFalsa);
  });
});

describe('POST /whatsapp/pessoal/conectar — self-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cria/recupera a linha do usuario autenticado e devolve so o essencial', async () => {
    const { conectarMinhaLinhaWhatsapp } = await import('./channels.service');
    vi.mocked(conectarMinhaLinhaWhatsapp).mockResolvedValue({
      id: 'linha-1',
      ponteSessao: 'vendedor-user-1',
      modo: 'NAO_OFICIAL',
      ativo: true,
    });

    const handler = handlerDe('/whatsapp/pessoal/conectar', 'post');
    const res = fakeRes();
    const req = fakeReq();
    req.user!.sub = 'user-1';

    await rodar(handler, req, res);
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());

    expect(conectarMinhaLinhaWhatsapp).toHaveBeenCalledWith('user-1');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      numero: { id: 'linha-1', ponteSessao: 'vendedor-user-1', modo: 'NAO_OFICIAL', ativo: true },
    });
    const corpo = vi.mocked(res.json).mock.calls[0]?.[0];
    expect(corpo.numero).not.toHaveProperty('ponteUrl');
    expect(corpo.numero).not.toHaveProperty('ponteToken');
    expect(corpo.numero).not.toHaveProperty('ponteSegredo');
  });

  it('erro amigavel do service (ex.: WhatsApp da empresa nao configurado) sobe sem alteracao', async () => {
    const { conectarMinhaLinhaWhatsapp } = await import('./channels.service');
    const erroAmigavel = Object.assign(new Error('A conexao direta do WhatsApp ainda nao foi habilitada pelo administrador da sua organizacao.'), {
      status: 400,
      code: 'BAD_REQUEST',
    });
    vi.mocked(conectarMinhaLinhaWhatsapp).mockRejectedValue(erroAmigavel);

    const handler = handlerDe('/whatsapp/pessoal/conectar', 'post');
    const res = fakeRes();

    await expect(
      comOrganizacao('org-1', () => new Promise<void>((resolve, reject) => handler(fakeReq(), res, (e) => (e ? reject(e) : resolve())))),
    ).rejects.toMatchObject({ status: 400 });

    expect(res.json).not.toHaveBeenCalled();
  });
});
