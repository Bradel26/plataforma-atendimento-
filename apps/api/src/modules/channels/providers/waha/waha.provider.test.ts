import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessaoResolvida } from '../channel-provider';

/**
 * O provider contra um WAHA falso em memoria: responde pelos mesmos
 * endpoints e status HTTP que o real, e guarda as sessoes. Prova o ciclo
 * inteiro (criar -> QR -> conectado -> enviar -> desconectar) sem rede.
 */

const ENV = {
  WAHA_BASE_URL: 'http://waha:3000',
  WAHA_API_KEY: 'chave',
  WAHA_WEBHOOK_SECRET: 'segredo-do-webhook-bem-longo',
  PUBLIC_URL: 'https://atendimento.exemplo.com.br',
} as const;
const WEBHOOK = 'https://atendimento.exemplo.com.br/api/webhooks/providers/waha?secret=segredo-do-webhook-bem-longo';

type SessaoFalsa = { name: string; status: string; me: { id: string } | null; config: { webhooks: Array<{ url: string }> } };

function wahaFalso() {
  const sessoes = new Map<string, SessaoFalsa>();
  const chamadas: Array<{ metodo: string; caminho: string; corpo: unknown }> = [];
  const json = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

  const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
    const metodo = init.method ?? 'GET';
    const caminho = url.replace(ENV.WAHA_BASE_URL, '');
    const corpo = init.body ? JSON.parse(String(init.body)) : undefined;
    chamadas.push({ metodo, caminho, corpo });

    if (metodo === 'POST' && caminho === '/api/sessions') {
      if (sessoes.has(corpo.name)) return json(422, { message: 'already exists' });
      sessoes.set(corpo.name, { name: corpo.name, status: 'SCAN_QR_CODE', me: null, config: corpo.config });
      return json(201, sessoes.get(corpo.name));
    }
    const sessao = caminho.match(/^\/api\/sessions\/([^/]+)(\/\w+)?$/);
    if (sessao) {
      const s = sessoes.get(decodeURIComponent(sessao[1]!));
      if (!s) return json(404, { message: 'Session not found' });
      const acao = sessao[2];
      if (!acao && metodo === 'GET') return json(200, s);
      if (!acao && metodo === 'PUT') {
        s.config = corpo.config;
        return json(200, s);
      }
      if (acao === '/start' || acao === '/restart') s.status = s.me ? 'WORKING' : 'SCAN_QR_CODE';
      if (acao === '/logout') Object.assign(s, { status: 'SCAN_QR_CODE', me: null });
      return json(201, s);
    }
    if (caminho.endsWith('/auth/qr?format=image')) return json(200, { mimetype: 'image/png', data: 'UVJDT0RF' });
    if (caminho === '/api/sendText') {
      const s = sessoes.get(corpo.session);
      if (!s || s.status !== 'WORKING') return json(422, { message: 'Session status is not as expected' });
      return json(201, { id: `true_${corpo.chatId}_3EB0ENVIADA` });
    }
    if (caminho === '/api/sendImage' || caminho === '/api/sendFile' || caminho === '/api/sendVoice') {
      return json(201, { id: { _serialized: `true_${corpo.chatId}_3EB0ARQ` } });
    }
    return json(404, {});
  });

  return { sessoes, chamadas, fetch };
}

const LINHA: SessaoResolvida = { canalConfigId: 'linha-1', sessaoExterna: 'vendedor-1a2b3c4d' };

describe('WahaProvider', () => {
  let waha: ReturnType<typeof wahaFalso>;
  const originais: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const [k, v] of Object.entries(ENV)) {
      originais[k] = process.env[k];
      process.env[k] = v;
    }
    delete process.env.WAHA_WEBHOOK_BASE_URL;
    waha = wahaFalso();
    vi.stubGlobal('fetch', waha.fetch);
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

  async function novoProvider() {
    const { WahaProvider } = await import('./waha.provider');
    return new WahaProvider();
  }

  it('primeiro QR cria a sessao com o webhook de volta e devolve a imagem', async () => {
    const provider = await novoProvider();

    const qr = await provider.sessao.qr(LINHA);

    expect(qr).toEqual({ qr: 'data:image/png;base64,UVJDT0RF', conectado: false, motivo: null });
    const criacao = waha.chamadas.find((c) => c.metodo === 'POST' && c.caminho === '/api/sessions');
    expect(criacao?.corpo).toMatchObject({
      name: 'vendedor-1a2b3c4d',
      start: true,
      config: {
        webhooks: [{ url: WEBHOOK, events: ['message', 'message.ack', 'session.status'], hmac: { key: ENV.WAHA_WEBHOOK_SECRET } }],
        ignore: { groups: true, status: true },
      },
    });
  });

  it('sessao ja conectada: QR responde conectado, sem criar nada', async () => {
    waha.sessoes.set('vendedor-1a2b3c4d', {
      name: 'vendedor-1a2b3c4d', status: 'WORKING', me: { id: '5562988887777@c.us' }, config: { webhooks: [{ url: WEBHOOK }] },
    });
    const provider = await novoProvider();

    expect(await provider.sessao.qr(LINHA)).toEqual({ qr: null, conectado: true, motivo: null });
    expect(waha.chamadas.some((c) => c.metodo !== 'GET')).toBe(false);
  });

  it('sessao parada (STOPPED) e iniciada sem pedir novo pareamento', async () => {
    waha.sessoes.set('vendedor-1a2b3c4d', {
      name: 'vendedor-1a2b3c4d', status: 'STOPPED', me: { id: '5562988887777@c.us' }, config: { webhooks: [{ url: WEBHOOK }] },
    });
    const provider = await novoProvider();

    expect(await provider.sessao.qr(LINHA)).toMatchObject({ conectado: true });
    expect(waha.chamadas.some((c) => c.caminho.endsWith('/start'))).toBe(true);
    expect(waha.chamadas.some((c) => c.caminho.endsWith('/logout'))).toBe(false);
  });

  it('webhook diferente e corrigido UMA vez por processo (o PUT reinicia a sessao)', async () => {
    waha.sessoes.set('vendedor-1a2b3c4d', {
      name: 'vendedor-1a2b3c4d', status: 'SCAN_QR_CODE', me: null, config: { webhooks: [{ url: 'https://antigo' }] },
    });
    const provider = await novoProvider();

    await provider.sessao.qr(LINHA);
    await provider.sessao.qr(LINHA);
    await provider.sessao.qr(LINHA);

    expect(waha.chamadas.filter((c) => c.metodo === 'PUT')).toHaveLength(1);
    expect(waha.sessoes.get('vendedor-1a2b3c4d')?.config.webhooks[0]?.url).toBe(WEBHOOK);
  });

  it('estado: conectado com o numero, e nunca cria sessao', async () => {
    const provider = await novoProvider();
    expect(await provider.sessao.estado(LINHA)).toEqual({ estado: 'DESCONECTADO', detalhe: 'sessao ainda nao criada', telefone: null });
    expect(waha.sessoes.size).toBe(0);

    waha.sessoes.set('vendedor-1a2b3c4d', {
      name: 'vendedor-1a2b3c4d', status: 'WORKING', me: { id: '5562988887777@c.us' }, config: { webhooks: [] },
    });
    expect(await provider.sessao.estado(LINHA)).toEqual({ estado: 'CONECTADO', detalhe: 'WORKING', telefone: '5562988887777' });
  });

  it('estado com o WAHA fora do ar e DESCONHECIDO, nao erro', async () => {
    waha.fetch.mockRejectedValue(new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }));
    const provider = await novoProvider();
    expect(await provider.sessao.estado(LINHA)).toMatchObject({ estado: 'DESCONHECIDO' });
    expect(await provider.sessao.qr(LINHA)).toMatchObject({ qr: null, conectado: false });
  });

  it('envia texto pela sessao da linha e devolve o id externo', async () => {
    waha.sessoes.set('vendedor-1a2b3c4d', {
      name: 'vendedor-1a2b3c4d', status: 'WORKING', me: { id: '5562988887777@c.us' }, config: { webhooks: [] },
    });
    const provider = await novoProvider();

    const r = await provider.enviarTexto(LINHA, '5562999990000@c.us', 'Ola!');

    expect(r).toEqual({ idExterno: 'true_5562999990000@c.us_3EB0ENVIADA' });
    expect(waha.chamadas.at(-1)?.corpo).toEqual({ session: 'vendedor-1a2b3c4d', chatId: '5562999990000@c.us', text: 'Ola!' });
  });

  it('enviar com a sessao desconectada vira 503 com frase para o atendente', async () => {
    const provider = await novoProvider();
    await expect(provider.enviarTexto(LINHA, '5562999990000@c.us', 'Ola')).rejects.toMatchObject({
      status: 503,
      code: 'CANAL_INDISPONIVEL',
      message: 'O WhatsApp desta linha nao esta conectado',
    });
  });

  it('linha sem sessao e destino invalido sao recusados antes de chamar o WAHA', async () => {
    const provider = await novoProvider();
    await expect(provider.enviarTexto({ canalConfigId: 'x', sessaoExterna: null }, '5562999990000', 'oi')).rejects.toMatchObject({ status: 503 });
    await expect(provider.enviarTexto(LINHA, '12', 'oi')).rejects.toMatchObject({ status: 400 });
    expect(waha.fetch).not.toHaveBeenCalled();
  });

  it('midia: imagem vai por sendImage com legenda, em base64', async () => {
    const provider = await novoProvider();

    const r = await provider.enviarMidia(LINHA, '5562999990000@c.us', {
      buffer: Buffer.from('PNG'), nome: 'foto.png', tipo: 'image/png', legenda: 'segue',
    });

    expect(r).toEqual({ idExterno: 'true_5562999990000@c.us_3EB0ARQ' });
    expect(waha.chamadas.at(-1)).toMatchObject({
      caminho: '/api/sendImage',
      corpo: { session: 'vendedor-1a2b3c4d', file: { mimetype: 'image/png', filename: 'foto.png', data: 'UE5H' }, caption: 'segue' },
    });
  });

  it('desconectar faz logout; o proximo QR pareia de novo', async () => {
    waha.sessoes.set('vendedor-1a2b3c4d', {
      name: 'vendedor-1a2b3c4d', status: 'WORKING', me: { id: '5562988887777@c.us' }, config: { webhooks: [{ url: WEBHOOK }] },
    });
    const provider = await novoProvider();

    await provider.sessao.desconectar(LINHA);
    expect(await provider.sessao.qr(LINHA)).toMatchObject({ qr: 'data:image/png;base64,UVJDT0RF', conectado: false });
  });

  it('sem WAHA_WEBHOOK_SECRET a sessao nao e criada (ela nunca receberia mensagens)', async () => {
    delete process.env.WAHA_WEBHOOK_SECRET;
    const provider = await novoProvider();

    const qr = await provider.sessao.qr(LINHA);

    expect(qr.motivo).toContain('WAHA_WEBHOOK_SECRET');
    expect(waha.sessoes.size).toBe(0);
  });
});
