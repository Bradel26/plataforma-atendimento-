import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WahaClient, WahaErro } from './waha.client';

function json(status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
}

const CONFIG_SESSAO = {
  webhooks: [{ url: 'https://crm/api/webhooks/providers/waha?secret=s', events: ['message'] }],
  ignore: { status: true, groups: true, channels: true, broadcast: true },
};

describe('WahaClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const cliente = new WahaClient('http://waha:3000', 'chave-da-api', 50);

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  function chamada(i = 0) {
    const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit & { headers: Record<string, string> }];
    return { url, init, corpo: init.body ? JSON.parse(String(init.body)) : undefined };
  }

  it('autentica toda chamada com X-Api-Key e le a sessao', async () => {
    fetchMock.mockResolvedValue(json(200, { name: 'vendedor-1', status: 'WORKING', me: { id: '5562999990000@c.us' } }));

    const sessao = await cliente.obterSessao('vendedor-1');

    expect(sessao?.status).toBe('WORKING');
    const { url, init } = chamada();
    expect(url).toBe('http://waha:3000/api/sessions/vendedor-1');
    expect(init.headers['X-Api-Key']).toBe('chave-da-api');
  });

  it('sessao inexistente (404) e null, nao erro', async () => {
    fetchMock.mockResolvedValue(json(404, { statusCode: 404, message: 'Session not found' }));
    await expect(cliente.obterSessao('nao-existe')).resolves.toBeNull();
  });

  it('erro HTTP vira WahaErro com status e sem o corpo da resposta', async () => {
    fetchMock.mockResolvedValue(json(500, { message: 'conteudo sensivel do cliente' }));

    const erro = await cliente.obterSessao('x').catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(WahaErro);
    expect(erro).toMatchObject({ tipo: 'http', status: 500 });
    expect((erro as Error).message).not.toContain('sensivel');
  });

  it('chave recusada (401) sobe como erro HTTP 401', async () => {
    fetchMock.mockResolvedValue(json(401, { message: 'Unauthorized' }));
    await expect(cliente.enviarTexto('s', '5562999990000@c.us', 'oi')).rejects.toMatchObject({ tipo: 'http', status: 401 });
  });

  it('timeout vira WahaErro do tipo tempo', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }));
    await expect(cliente.obterSessao('x')).rejects.toMatchObject({ tipo: 'tempo', status: null });
  });

  it('falha de rede traz o codigo da causa (ECONNREFUSED)', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }));
    const erro = await cliente.obterSessao('x').catch((e: unknown) => e);
    expect(erro).toMatchObject({ tipo: 'rede' });
    expect((erro as Error).message).toContain('ECONNREFUSED');
  });

  it('criar sessao manda start e a config; 422 (ja existe) nao e erro', async () => {
    fetchMock.mockResolvedValue(json(422, { message: "Session 'x' already exists" }));

    await cliente.criarSessao('vendedor-1', CONFIG_SESSAO);

    const { url, init, corpo } = chamada();
    expect(url).toBe('http://waha:3000/api/sessions');
    expect(init.method).toBe('POST');
    expect(corpo).toEqual({ name: 'vendedor-1', start: true, config: CONFIG_SESSAO });
  });

  it('QR: aceita a resposta JSON { mimetype, data } e devolve data URL', async () => {
    fetchMock.mockResolvedValue(json(200, { mimetype: 'image/png', data: 'QUJD' }));
    await expect(cliente.obterQr('vendedor-1')).resolves.toBe('data:image/png;base64,QUJD');
    expect(chamada().url).toBe('http://waha:3000/api/vendedor-1/auth/qr?format=image');
  });

  it('QR: aceita a imagem crua tambem', async () => {
    fetchMock.mockResolvedValue(new Response(Buffer.from('ABC'), { status: 200, headers: { 'Content-Type': 'image/png' } }));
    await expect(cliente.obterQr('vendedor-1')).resolves.toBe('data:image/png;base64,QUJD');
  });

  it('envia texto com session, chatId e text', async () => {
    fetchMock.mockResolvedValue(json(201, { id: 'true_5562999990000@c.us_3EB0AA' }));

    const resposta = await cliente.enviarTexto('vendedor-1', '5562999990000@c.us', 'Ola');

    expect(resposta).toEqual({ id: 'true_5562999990000@c.us_3EB0AA' });
    expect(chamada().corpo).toEqual({ session: 'vendedor-1', chatId: '5562999990000@c.us', text: 'Ola' });
  });

  it('logout de sessao inexistente (404) e considerado feito', async () => {
    fetchMock.mockResolvedValue(json(404, {}));
    await expect(cliente.deslogarSessao('x')).resolves.toBeUndefined();
    expect(chamada().url).toBe('http://waha:3000/api/sessions/x/logout');
  });
});
