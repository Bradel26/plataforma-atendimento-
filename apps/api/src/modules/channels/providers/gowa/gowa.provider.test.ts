import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessaoResolvida } from '../channel-provider';

/**
 * O provider contra um GOWA falso em memoria: responde pelos mesmos
 * endpoints e envelope `{ results: ... }` do real, guarda devices em memoria.
 * Prova o ciclo inteiro (criar device -> QR -> conectado -> enviar) sem rede.
 * Mesmo desenho do `waha.provider.test.ts`.
 */

const ENV = {
  GOWA_BASE_URL: 'http://gowa:3000',
  GOWA_WEBHOOK_SECRET: 'segredo-do-webhook-bem-longo',
  GOWA_SESSAO: 'vendedor-1a2b3c4d',
} as const;

type DeviceFalso = { id: string; conectado: boolean; logado: boolean; numero: string | null };

function gowaFalso() {
  const devices = new Map<string, DeviceFalso>();
  const json = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

  const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
    const metodo = init.method ?? 'GET';
    const caminho = url.replace(ENV.GOWA_BASE_URL, '');
    const deviceId = (init.headers as Record<string, string> | undefined)?.['X-Device-Id'];
    const corpo = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : undefined;

    if (metodo === 'GET' && caminho === '/devices') {
      return json(200, { results: [...devices.values()].map((d) => ({ id: d.id })) });
    }
    if (metodo === 'POST' && caminho === '/devices') {
      devices.set(corpo.device_id, { id: corpo.device_id, conectado: false, logado: false, numero: null });
      return json(201, { results: { id: corpo.device_id } });
    }
    if (metodo === 'GET' && caminho === '/app/status') {
      const d = deviceId ? devices.get(deviceId) : undefined;
      if (!d) return json(404, { message: 'device not found' });
      return json(200, { results: { is_connected: d.conectado, is_logged_in: d.logado } });
    }
    if (metodo === 'GET' && caminho === '/app/login') {
      return json(200, { results: { qr_link: `${ENV.GOWA_BASE_URL}/statics/qrcode/${deviceId}.png` } });
    }
    if (metodo === 'GET' && caminho === `/statics/qrcode/${deviceId}.png`) {
      return new Response(Buffer.from('QRCODE'), { status: 200, headers: { 'Content-Type': 'image/png' } });
    }
    if (metodo === 'GET' && caminho === '/app/logout') {
      const d = deviceId ? devices.get(deviceId) : undefined;
      if (d) Object.assign(d, { conectado: false, logado: false, numero: null });
      return json(200, {});
    }
    if (metodo === 'POST' && caminho === '/send/message') {
      const d = deviceId ? devices.get(deviceId) : undefined;
      if (!d || !d.conectado) return json(422, { message: 'not connected' });
      return json(200, { results: { message_id: `GOWA_${corpo.phone}_1` } });
    }
    return json(404, {});
  });

  return { devices, fetch };
}

const LINHA: SessaoResolvida = { canalConfigId: 'linha-1', sessaoExterna: 'vendedor-1a2b3c4d' };

describe('GowaProvider', () => {
  let gowa: ReturnType<typeof gowaFalso>;
  const originais: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const [k, v] of Object.entries(ENV)) {
      originais[k] = process.env[k];
      process.env[k] = v;
    }
    gowa = gowaFalso();
    vi.stubGlobal('fetch', gowa.fetch);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    for (const k of Object.keys(ENV)) {
      if (originais[k] === undefined) delete process.env[k];
      else process.env[k] = originais[k];
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('configurado() e false sem GOWA_BASE_URL', async () => {
    delete process.env.GOWA_BASE_URL;
    const { GowaProvider } = await import('./gowa.provider');
    expect(new GowaProvider().configurado()).toBe(false);
  });

  it('sessao.qr cria o device e devolve QR quando ainda nao logado', async () => {
    const { GowaProvider } = await import('./gowa.provider');
    const provider = new GowaProvider();

    const resultado = await provider.sessao.qr(LINHA);

    expect(resultado.conectado).toBe(false);
    expect(resultado.qr).toMatch(/^data:image\/png;base64,/);
    expect(gowa.devices.has('vendedor-1a2b3c4d')).toBe(true);
  });

  it('sessao.qr devolve conectado=true sem QR quando ja conectado', async () => {
    gowa.devices.set('vendedor-1a2b3c4d', { id: 'vendedor-1a2b3c4d', conectado: true, logado: true, numero: '5511999990000' });
    const { GowaProvider } = await import('./gowa.provider');

    const resultado = await new GowaProvider().sessao.qr(LINHA);

    expect(resultado).toEqual({ qr: null, conectado: true, motivo: null });
  });

  it('sessao.qr nunca lanca quando o GOWA esta fora do ar', async () => {
    gowa.fetch.mockImplementation(() => Promise.reject(new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } })));
    const { GowaProvider } = await import('./gowa.provider');

    const resultado = await new GowaProvider().sessao.qr(LINHA);

    expect(resultado.qr).toBeNull();
    expect(resultado.conectado).toBe(false);
    expect(resultado.motivo).toBeTruthy();
  });

  it('sessao.estado: device pareado com socket caido vira CONECTANDO, nao AGUARDANDO_QR', async () => {
    gowa.devices.set('vendedor-1a2b3c4d', { id: 'vendedor-1a2b3c4d', conectado: false, logado: true, numero: '5511999990000' });
    const { GowaProvider } = await import('./gowa.provider');

    const situacao = await new GowaProvider().sessao.estado(LINHA);

    expect(situacao.estado).toBe('CONECTANDO');
  });

  it('sessao.estado: device que nunca existiu vira DESCONECTADO', async () => {
    const { GowaProvider } = await import('./gowa.provider');
    const situacao = await new GowaProvider().sessao.estado(LINHA);
    expect(situacao.estado).toBe('DESCONECTADO');
  });

  it('enviarTexto: linha nao conectada recusa com AppError 503', async () => {
    const { GowaProvider } = await import('./gowa.provider');
    await expect(new GowaProvider().enviarTexto(LINHA, '5511999990000', 'oi')).rejects.toMatchObject({ status: 503 });
  });

  it('enviarTexto: linha conectada envia e devolve idExterno', async () => {
    gowa.devices.set('vendedor-1a2b3c4d', { id: 'vendedor-1a2b3c4d', conectado: true, logado: true, numero: '5511999990000' });
    const { GowaProvider } = await import('./gowa.provider');

    const resultado = await new GowaProvider().enviarTexto(LINHA, '(11) 99999-0000', 'oi');

    expect(resultado.idExterno).toBe('GOWA_5511999990000_1');
  });

  it('enviarTexto: destino sem numero valido recusa com DESTINO_INVALIDO', async () => {
    const { GowaProvider } = await import('./gowa.provider');
    await expect(new GowaProvider().enviarTexto(LINHA, 'abc', 'oi')).rejects.toMatchObject({ code: 'DESTINO_INVALIDO' });
  });

  it('webhook.autenticar delega para webhookGowaAutentico', async () => {
    const { GowaProvider } = await import('./gowa.provider');
    const provider = new GowaProvider();
    const reqOk = { corpoBruto: Buffer.from('{}'), header: () => undefined, query: { secret: ENV.GOWA_WEBHOOK_SECRET } };
    const reqRuim = { corpoBruto: Buffer.from('{}'), header: () => undefined, query: {} };
    expect(provider.webhook.autenticar(reqOk)).toBe(true);
    expect(provider.webhook.autenticar(reqRuim)).toBe(false);
  });

  it('webhook.interpretar usa GOWA_SESSAO como sessaoExterna (o GOWA nao manda a sessao no corpo)', async () => {
    const { GowaProvider } = await import('./gowa.provider');
    const eventos = new GowaProvider().webhook.interpretar({ event: 'message', payload: { id: 'M1', chat_id: '5511999990000@s.whatsapp.net', body: 'oi' } });
    expect(eventos[0]).toMatchObject({ tipo: 'mensagem.recebida', sessaoExterna: 'vendedor-1a2b3c4d' });
  });

  it('webhook.interpretar sem GOWA_SESSAO configurada: evento ignorado, nunca atribuido a sessao errada', async () => {
    delete process.env.GOWA_SESSAO;
    const { GowaProvider } = await import('./gowa.provider');
    const eventos = new GowaProvider().webhook.interpretar({ event: 'message', payload: { id: 'M1', chat_id: '5511999990000@s.whatsapp.net', body: 'oi' } });
    expect(eventos).toEqual([expect.objectContaining({ tipo: 'ignorado' })]);
  });
});
