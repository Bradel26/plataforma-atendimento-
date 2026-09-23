import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigDaPonte } from './whatsapp.ponte';

const ENV_VARS = ['WPP_CONNECT_URL', 'WPP_CONNECT_SECRET_KEY', 'WPP_CONNECT_TOKEN'] as const;
const originais: Record<string, string | undefined> = {};

function json(status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
}

function chamada(fetchMock: ReturnType<typeof vi.fn>, indice: number): [string, RequestInit & { headers: Record<string, string> }] {
  const args = fetchMock.mock.calls[indice];
  if (!args) throw new Error(`fetch nao foi chamado ${indice + 1} vez(es)`);
  return args as [string, RequestInit & { headers: Record<string, string> }];
}

const CONFIG: ConfigDaPonte = {
  ponteUrl: null,
  ponteToken: null,
  ponteSessao: 'linha-principal',
};

describe('wppconnect.client', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    for (const nome of ENV_VARS) originais[nome] = process.env[nome];
    for (const nome of ENV_VARS) delete process.env[nome];

    vi.resetModules();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    for (const nome of ENV_VARS) {
      if (originais[nome] === undefined) delete process.env[nome];
      else process.env[nome] = originais[nome];
    }
    vi.unstubAllGlobals();
  });

  describe('ausencia de configuracao', () => {
    it('sendText rejeita com CANAL_INDISPONIVEL quando nenhuma variavel de ambiente foi definida', async () => {
      const { enviarTextoWpp } = await import('./wppconnect.client');

      await expect(enviarTextoWpp(CONFIG, '11999999999', 'oi')).rejects.toMatchObject({
        status: 503,
        code: 'CANAL_INDISPONIVEL',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('getStatus nao lanca e devolve DESCONHECIDO quando o WPPConnect nao esta configurado', async () => {
      const { estadoWpp } = await import('./wppconnect.client');

      await expect(estadoWpp(CONFIG)).resolves.toEqual({
        situacao: 'DESCONHECIDO',
        detalhe: 'WPPConnect nao configurado',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('getQRCode nao lanca e devolve motivo quando o WPPConnect nao esta configurado', async () => {
      const { qrWpp } = await import('./wppconnect.client');

      await expect(qrWpp(CONFIG)).resolves.toEqual({
        qr: null,
        conectado: false,
        motivo: 'o WPPConnect ainda nao foi configurado',
      });
    });
  });

  describe('sessao dinamica', () => {
    it('usa a sessao de config.ponteSessao na URL, nunca um nome fixo', async () => {
      process.env.WPP_CONNECT_URL = 'http://wppconnect:21465';
      process.env.WPP_CONNECT_TOKEN = 'token-fixo';
      fetchMock.mockResolvedValueOnce(json(201, { status: 'success', response: { id: 'MSG-1' } }));

      const { enviarTextoWpp } = await import('./wppconnect.client');
      const config: ConfigDaPonte = { ponteUrl: null, ponteToken: null, ponteSessao: 'sessao-do-vendedor-x' };

      await enviarTextoWpp(config, '11999999999', 'oi');

      const [url] = chamada(fetchMock, 0);
      expect(url).toBe('http://wppconnect:21465/api/sessao-do-vendedor-x/send-message');
    });

    it('sendText rejeita com CANAL_INDISPONIVEL quando o canal nao tem ponteSessao', async () => {
      process.env.WPP_CONNECT_URL = 'http://wppconnect:21465';
      process.env.WPP_CONNECT_TOKEN = 'token-fixo';

      const { enviarTextoWpp } = await import('./wppconnect.client');
      const config: ConfigDaPonte = { ponteUrl: null, ponteToken: null, ponteSessao: null };

      await expect(enviarTextoWpp(config, '11999999999', 'oi')).rejects.toMatchObject({
        status: 503,
        code: 'CANAL_INDISPONIVEL',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('sendText', () => {
    it('gera token via secret key, usa Bearer e devolve o idExterno', async () => {
      process.env.WPP_CONNECT_URL = 'http://wppconnect:21465';
      process.env.WPP_CONNECT_SECRET_KEY = 'minha-secret-key';

      fetchMock
        .mockResolvedValueOnce(json(201, { status: 'Success', token: 'token-gerado', session: 'linha-principal' }))
        .mockResolvedValueOnce(json(201, { status: 'success', response: { id: { _serialized: 'MSG-123' } } }));

      const { enviarTextoWpp } = await import('./wppconnect.client');
      const resultado = await enviarTextoWpp(CONFIG, '(11) 99999-9999', 'oi');

      expect(resultado).toEqual({ idExterno: 'MSG-123' });

      const [urlToken] = chamada(fetchMock, 0);
      expect(urlToken).toBe('http://wppconnect:21465/api/linha-principal/minha-secret-key/generate-token');

      const [urlEnvio, initEnvio] = chamada(fetchMock, 1);
      expect(urlEnvio).toBe('http://wppconnect:21465/api/linha-principal/send-message');
      expect(initEnvio.headers.Authorization).toBe('Bearer token-gerado');
      expect(JSON.parse(initEnvio.body as string)).toEqual({
        phone: '5511999999999',
        isGroup: false,
        isNewsletter: false,
        isLid: false,
        message: 'oi',
      });
    });

    it('reusa o token em cache na segunda chamada (nao gera de novo)', async () => {
      process.env.WPP_CONNECT_URL = 'http://wppconnect:21465';
      process.env.WPP_CONNECT_SECRET_KEY = 'minha-secret-key';

      fetchMock
        .mockResolvedValueOnce(json(201, { status: 'Success', token: 'token-gerado' }))
        .mockResolvedValueOnce(json(201, { status: 'success', response: { id: 'MSG-1' } }))
        .mockResolvedValueOnce(json(201, { status: 'success', response: { id: 'MSG-2' } }));

      const { enviarTextoWpp } = await import('./wppconnect.client');
      await enviarTextoWpp(CONFIG, '11999999999', 'primeira');
      await enviarTextoWpp(CONFIG, '11999999999', 'segunda');

      expect(fetchMock).toHaveBeenCalledTimes(3); // 1 generate-token + 2 send-message
    });

    it('usa direto WPP_CONNECT_TOKEN quando definido, sem chamar generate-token', async () => {
      process.env.WPP_CONNECT_URL = 'http://wppconnect:21465';
      process.env.WPP_CONNECT_TOKEN = 'token-fixo';
      fetchMock.mockResolvedValueOnce(json(201, { status: 'success', response: { id: 'MSG-1' } }));

      const { enviarTextoWpp } = await import('./wppconnect.client');
      await enviarTextoWpp(CONFIG, '11999999999', 'oi');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = chamada(fetchMock, 0);
      expect(init.headers.Authorization).toBe('Bearer token-fixo');
    });

    it('rejeita com NUMERO_INVALIDO sem chamar o WPPConnect quando o destino nao e um telefone', async () => {
      process.env.WPP_CONNECT_URL = 'http://wppconnect:21465';
      process.env.WPP_CONNECT_TOKEN = 'token-fixo';

      const { enviarTextoWpp } = await import('./wppconnect.client');
      await expect(enviarTextoWpp(CONFIG, 'abc', 'oi')).rejects.toMatchObject({ code: 'NUMERO_INVALIDO' });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('destino @lid (ETAPA 6)', () => {
    /**
     * Reproduz o achado real: mandar so os digitos de um LID como `phone`
     * (sem `isLid`) o WPPConnect Server recusa com "numero nao existe" —
     * confirmado num teste direto contra o servidor antes desta correcao.
     * `destinoParaWpp` (nao exportado) e coberto indiretamente aqui, via o
     * corpo que `enviarTextoWpp`/`enviarArquivoWpp` mandam.
     */
    it('sendText detecta @lid, manda isLid:true e preserva o identificador verbatim (sem numeroNormalizado)', async () => {
      process.env.WPP_CONNECT_URL = 'http://wppconnect:21465';
      process.env.WPP_CONNECT_TOKEN = 'token-fixo';
      fetchMock.mockResolvedValueOnce(
        json(201, { status: 'success', response: [{ id: 'true_79233992933473@lid_ABC123' }] }),
      );

      const { enviarTextoWpp } = await import('./wppconnect.client');
      const resultado = await enviarTextoWpp(CONFIG, '79233992933473@lid', 'oi');

      const [, init] = chamada(fetchMock, 0);
      expect(JSON.parse(init.body as string)).toEqual({
        phone: '79233992933473@lid',
        isGroup: false,
        isNewsletter: false,
        isLid: true,
        message: 'oi',
      });
      expect(resultado).toEqual({ idExterno: 'true_79233992933473@lid_ABC123' });
    });

    it('sendMedia tambem detecta @lid e manda isLid:true (mesma regra do texto)', async () => {
      process.env.WPP_CONNECT_URL = 'http://wppconnect:21465';
      process.env.WPP_CONNECT_TOKEN = 'token-fixo';
      fetchMock.mockResolvedValueOnce(
        json(201, { status: 'success', response: [{ id: 'true_79233992933473@lid_DEF456' }] }),
      );

      const { enviarArquivoWpp } = await import('./wppconnect.client');
      const arquivo = { buffer: Buffer.from('x'), nome: 'foto.png', tipo: 'image/png' };
      await enviarArquivoWpp(CONFIG, '79233992933473@lid', arquivo);

      const [, init] = chamada(fetchMock, 0);
      const corpo = JSON.parse(init.body as string);
      expect(corpo.phone).toBe('79233992933473@lid');
      expect(corpo.isLid).toBe(true);
    });

    it('numero comum continua isLid:false e passa por numeroNormalizado, sem regressao', async () => {
      process.env.WPP_CONNECT_URL = 'http://wppconnect:21465';
      process.env.WPP_CONNECT_TOKEN = 'token-fixo';
      fetchMock.mockResolvedValueOnce(json(201, { status: 'success', response: [{ id: 'MSG-1' }] }));

      const { enviarTextoWpp } = await import('./wppconnect.client');
      await enviarTextoWpp(CONFIG, '11999999999', 'oi');

      const [, init] = chamada(fetchMock, 0);
      const corpo = JSON.parse(init.body as string);
      expect(corpo.phone).toBe('5511999999999');
      expect(corpo.isLid).toBe(false);
    });

    it('destino com @lid em maiusculas ainda e reconhecido (comparacao tolerante a caixa)', async () => {
      process.env.WPP_CONNECT_URL = 'http://wppconnect:21465';
      process.env.WPP_CONNECT_TOKEN = 'token-fixo';
      fetchMock.mockResolvedValueOnce(json(201, { status: 'success', response: [{ id: 'MSG-1' }] }));

      const { enviarTextoWpp } = await import('./wppconnect.client');
      await enviarTextoWpp(CONFIG, '79233992933473@LID', 'oi');

      const [, init] = chamada(fetchMock, 0);
      const corpo = JSON.parse(init.body as string);
      expect(corpo.phone).toBe('79233992933473@LID');
      expect(corpo.isLid).toBe(true);
    });
  });

  describe('erro HTTP', () => {
    it('sendText rejeita com ENVIO_RECUSADO quando o WPPConnect responde erro generico', async () => {
      process.env.WPP_CONNECT_URL = 'http://wppconnect:21465';
      process.env.WPP_CONNECT_TOKEN = 'token-fixo';
      fetchMock.mockResolvedValueOnce(json(500, { status: 'Error', message: 'falha interna' }));

      const { enviarTextoWpp } = await import('./wppconnect.client');
      await expect(enviarTextoWpp(CONFIG, '11999999999', 'oi')).rejects.toMatchObject({
        status: 502,
        code: 'ENVIO_RECUSADO',
      });
    });

    it('sendText rejeita com CANAL_INDISPONIVEL quando a sessao esta desconectada (404 Disconnected)', async () => {
      process.env.WPP_CONNECT_URL = 'http://wppconnect:21465';
      process.env.WPP_CONNECT_TOKEN = 'token-fixo';
      fetchMock.mockResolvedValueOnce(
        json(404, { response: null, status: 'Disconnected', message: 'A sessao do WhatsApp nao esta ativa.' }),
      );

      const { enviarTextoWpp } = await import('./wppconnect.client');
      await expect(enviarTextoWpp(CONFIG, '11999999999', 'oi')).rejects.toMatchObject({
        status: 503,
        code: 'CANAL_INDISPONIVEL',
      });
    });

    it('sendText rejeita com WPPCONNECT_INACESSIVEL quando o fetch falha (rede fora do ar)', async () => {
      process.env.WPP_CONNECT_URL = 'http://wppconnect:21465';
      process.env.WPP_CONNECT_TOKEN = 'token-fixo';
      fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const { enviarTextoWpp } = await import('./wppconnect.client');
      await expect(enviarTextoWpp(CONFIG, '11999999999', 'oi')).rejects.toMatchObject({
        status: 502,
        code: 'WPPCONNECT_INACESSIVEL',
      });
    });

    it('gera um novo token (uma unica vez) quando a chamada volta 401 e o token veio de secret key', async () => {
      process.env.WPP_CONNECT_URL = 'http://wppconnect:21465';
      process.env.WPP_CONNECT_SECRET_KEY = 'minha-secret-key';

      fetchMock
        .mockResolvedValueOnce(json(201, { status: 'Success', token: 'token-velho' }))
        .mockResolvedValueOnce(json(401, { error: 'Check that the Session and Token are correct' }))
        .mockResolvedValueOnce(json(201, { status: 'Success', token: 'token-novo' }))
        .mockResolvedValueOnce(json(201, { status: 'success', response: { id: 'MSG-1' } }));

      const { enviarTextoWpp } = await import('./wppconnect.client');
      const resultado = await enviarTextoWpp(CONFIG, '11999999999', 'oi');

      expect(resultado).toEqual({ idExterno: 'MSG-1' });
      expect(fetchMock).toHaveBeenCalledTimes(4);
      const [, ultimaInit] = chamada(fetchMock, 3);
      expect(ultimaInit.headers.Authorization).toBe('Bearer token-novo');
    });
  });

  describe('getStatus', () => {
    it('mapeia status CONNECTED para CONECTADO', async () => {
      process.env.WPP_CONNECT_URL = 'http://wppconnect:21465';
      process.env.WPP_CONNECT_TOKEN = 'token-fixo';
      fetchMock.mockResolvedValueOnce(json(200, { status: 'CONNECTED', qrcode: null, urlcode: null }));

      const { estadoWpp } = await import('./wppconnect.client');
      await expect(estadoWpp(CONFIG)).resolves.toEqual({ situacao: 'CONECTADO', detalhe: 'CONNECTED' });
    });

    it('mapeia status CLOSED para DESCONECTADO', async () => {
      process.env.WPP_CONNECT_URL = 'http://wppconnect:21465';
      process.env.WPP_CONNECT_TOKEN = 'token-fixo';
      fetchMock.mockResolvedValueOnce(json(200, { status: 'CLOSED', qrcode: null, urlcode: null }));

      const { estadoWpp } = await import('./wppconnect.client');
      await expect(estadoWpp(CONFIG)).resolves.toEqual({ situacao: 'DESCONECTADO', detalhe: 'CLOSED' });
    });

    it('nao lanca quando o fetch falha, devolve DESCONHECIDO com o motivo', async () => {
      process.env.WPP_CONNECT_URL = 'http://wppconnect:21465';
      process.env.WPP_CONNECT_TOKEN = 'token-fixo';
      fetchMock.mockRejectedValueOnce(new Error('timeout'));

      const { estadoWpp } = await import('./wppconnect.client');
      await expect(estadoWpp(CONFIG)).resolves.toEqual({
        situacao: 'DESCONHECIDO',
        detalhe: 'Nao foi possivel falar com o WPPConnect: timeout',
      });
    });
  });

  describe('getQRCode', () => {
    it('devolve o qrcode em data URL quando ha um pendente', async () => {
      process.env.WPP_CONNECT_URL = 'http://wppconnect:21465';
      process.env.WPP_CONNECT_TOKEN = 'token-fixo';
      fetchMock.mockResolvedValueOnce(
        json(200, { status: 'QRCODE', qrcode: 'data:image/png;base64,abc123', urlcode: 'raw' }),
      );

      const { qrWpp } = await import('./wppconnect.client');
      await expect(qrWpp(CONFIG)).resolves.toEqual({
        qr: 'data:image/png;base64,abc123',
        conectado: false,
        motivo: null,
      });
    });

    it('devolve conectado quando o status ja e CONNECTED, mesmo sem qrcode', async () => {
      process.env.WPP_CONNECT_URL = 'http://wppconnect:21465';
      process.env.WPP_CONNECT_TOKEN = 'token-fixo';
      fetchMock.mockResolvedValueOnce(json(200, { status: 'CONNECTED', qrcode: null, urlcode: null }));

      const { qrWpp } = await import('./wppconnect.client');
      await expect(qrWpp(CONFIG)).resolves.toEqual({ qr: null, conectado: true, motivo: null });
    });
  });

  describe('disconnect', () => {
    it('chama logout-session e nao lanca quando o WPPConnect responde ok', async () => {
      process.env.WPP_CONNECT_URL = 'http://wppconnect:21465';
      process.env.WPP_CONNECT_TOKEN = 'token-fixo';
      fetchMock.mockResolvedValueOnce(json(200, { status: 'success' }));

      const { desconectarWpp } = await import('./wppconnect.client');
      await expect(desconectarWpp(CONFIG)).resolves.toBeUndefined();

      const [url, init] = chamada(fetchMock, 0);
      expect(url).toBe('http://wppconnect:21465/api/linha-principal/logout-session');
      expect(init.method).toBe('POST');
    });

    it('rejeita com DESCONEXAO_RECUSADA quando o WPPConnect recusa', async () => {
      process.env.WPP_CONNECT_URL = 'http://wppconnect:21465';
      process.env.WPP_CONNECT_TOKEN = 'token-fixo';
      fetchMock.mockResolvedValueOnce(json(500, { message: 'nao foi possivel desconectar' }));

      const { desconectarWpp } = await import('./wppconnect.client');
      await expect(desconectarWpp(CONFIG)).rejects.toMatchObject({ status: 502, code: 'DESCONEXAO_RECUSADA' });
    });
  });
});
