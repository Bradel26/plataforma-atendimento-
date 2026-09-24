import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GowaClient, GowaErro } from './gowa.client';

function json(status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('GowaClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const cliente = new GowaClient('http://gowa:3000', 50);

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  function chamada(i = 0) {
    const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit & { headers?: Record<string, string> }];
    return { url, init, corpo: init.body && typeof init.body === 'string' ? JSON.parse(init.body) : undefined };
  }

  it('lista devices sem X-Device-Id e sem confundir "id" com "device"', async () => {
    fetchMock.mockResolvedValue(json(200, { results: [{ id: 'vendedor-1' }, { device: 'vendedor-2' }] }));

    const devices = await cliente.listarDevices();

    expect(devices).toEqual(['vendedor-1', 'vendedor-2']);
    const { url, init } = chamada();
    expect(url).toBe('http://gowa:3000/devices');
    expect(init.headers?.['X-Device-Id']).toBeUndefined();
  });

  it('lista vazia quando o GOWA nao devolve "results"', async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    await expect(cliente.listarDevices()).resolves.toEqual([]);
  });

  it('cria device mandando device_id no corpo, sem X-Device-Id', async () => {
    fetchMock.mockResolvedValue(json(201, { results: { id: 'vendedor-1' } }));

    await cliente.criarDevice('vendedor-1');

    const { url, init, corpo } = chamada();
    expect(url).toBe('http://gowa:3000/devices');
    expect(init.method).toBe('POST');
    expect(corpo).toEqual({ device_id: 'vendedor-1' });
    expect(init.headers?.['X-Device-Id']).toBeUndefined();
  });

  it('status: separa conectado de logado (nao faz OU entre os dois)', async () => {
    fetchMock.mockResolvedValue(json(200, { results: { is_connected: false, is_logged_in: true } }));

    const status = await cliente.obterStatus('vendedor-1');

    expect(status).toEqual({ tipo: 'ok', conectado: false, logado: true });
    const { url, init } = chamada();
    expect(url).toBe('http://gowa:3000/app/status');
    expect(init.headers?.['X-Device-Id']).toBe('vendedor-1');
  });

  it('status: "inexistente" no 404 (device nao existe ainda, nao lanca)', async () => {
    fetchMock.mockResolvedValue(json(404, { message: 'device not found' }));
    await expect(cliente.obterStatus('vendedor-1')).resolves.toEqual({ tipo: 'inexistente' });
  });

  it('status: "falha" em qualquer outro HTTP de erro (nao lanca, e nao e "inexistente")', async () => {
    fetchMock.mockResolvedValue(json(500, { message: 'boom' }));
    await expect(cliente.obterStatus('vendedor-1')).resolves.toEqual({ tipo: 'falha' });
  });

  it('QR: baixa o qr_link e devolve data URL', async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { results: { qr_link: 'http://gowa:3000/statics/qrcode/abc.png' } }))
      .mockResolvedValueOnce(new Response(Buffer.from('PNGDATA'), { status: 200, headers: { 'Content-Type': 'image/png' } }));

    const qr = await cliente.obterQrCode('vendedor-1');

    expect(qr).toBe(`data:image/png;base64,${Buffer.from('PNGDATA').toString('base64')}`);
    expect(chamada(0).url).toBe('http://gowa:3000/app/login');
    expect(chamada(1).url).toBe('http://gowa:3000/statics/qrcode/abc.png');
  });

  it('QR: null quando a resposta nao tem qr_link', async () => {
    fetchMock.mockResolvedValue(json(200, { results: {} }));
    await expect(cliente.obterQrCode('vendedor-1')).resolves.toBeNull();
  });

  it('enviar texto manda phone e message, com X-Device-Id', async () => {
    fetchMock.mockResolvedValue(json(200, { results: { message_id: 'ABC123' } }));

    const resposta = await cliente.enviarTexto('vendedor-1', '5511999990000', 'oi');

    expect(resposta).toEqual({ results: { message_id: 'ABC123' } });
    const { url, init, corpo } = chamada();
    expect(url).toBe('http://gowa:3000/send/message');
    expect(corpo).toEqual({ phone: '5511999990000', message: 'oi' });
    expect(init.headers?.['X-Device-Id']).toBe('vendedor-1');
  });

  it('enviar texto: erro HTTP vira GowaErro com status e detalhe do corpo, sem vazar o corpo inteiro', async () => {
    fetchMock.mockResolvedValue(json(422, { message: 'reachout timelock', code: 'WA_REACHOUT_TIMELOCK' }));

    const erro = await cliente.enviarTexto('vendedor-1', '5511999990000', 'oi').catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(GowaErro);
    expect(erro).toMatchObject({ tipo: 'http', status: 422 });
    expect((erro as GowaErro).corpoErro).toBe('reachout timelock');
  });

  it('enviar arquivo: multipart com o campo certo por endpoint e legenda opcional', async () => {
    fetchMock.mockResolvedValue(json(200, { results: { message_id: 'IMG1' } }));

    await cliente.enviarArquivo('vendedor-1', 'image', '5511999990000', {
      buffer: Buffer.from('fake-png'),
      nome: 'foto.png',
      tipo: 'image/png',
    }, 'legenda aqui');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://gowa:3000/send/image');
    expect(init.method).toBe('POST');
    const form = init.body as FormData;
    expect(form.get('phone')).toBe('5511999990000');
    expect(form.get('caption')).toBe('legenda aqui');
    expect((form.get('image') as File).name).toBe('foto.png');
  });

  it('timeout vira GowaErro do tipo tempo', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'TimeoutError' }));
    await expect(cliente.obterStatus('vendedor-1')).resolves.toEqual({ tipo: 'falha' });
    await expect(cliente.enviarTexto('vendedor-1', '5511999990000', 'oi')).rejects.toMatchObject({ tipo: 'tempo' });
  });

  it('falha de rede traz o codigo da causa', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }));
    const erro = await cliente.enviarTexto('vendedor-1', '5511999990000', 'oi').catch((e: unknown) => e);
    expect(erro).toMatchObject({ tipo: 'rede' });
  });

  it('logout e reconectar chamam GET com X-Device-Id e nao lancam em sucesso', async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    await expect(cliente.logout('vendedor-1')).resolves.toBeUndefined();
    await expect(cliente.reconectar('vendedor-1')).resolves.toBeUndefined();
    expect(chamada(0).url).toBe('http://gowa:3000/app/logout');
    expect(chamada(1).url).toBe('http://gowa:3000/app/reconnect');
  });
});
