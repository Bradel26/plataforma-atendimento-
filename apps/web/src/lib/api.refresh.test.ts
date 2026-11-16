import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Renovacao de sessao no cliente. O que cada caso garante:
 *  - 401 CONFIRMADO da API  -> a sessao acabou: limpa o token e dispara o logout;
 *  - 5xx, 429, rede, corpo ilegivel, 401 sem o formato da API -> servico indisponivel:
 *    NAO desloga, nao limpa o token, nao chama nenhum endpoint de logout, e a
 *    proxima chamada tenta de novo (recuperacao automatica).
 *
 * `fetch` e `window` sao simulados; o cookie httpOnly e do navegador e o cliente
 * nunca o toca — o que se verifica e que nenhum caminho de falha chama /auth/sair
 * ou /auth/logout e que toda chamada sai com `credentials: 'include'`.
 */

type Roteiro = Array<Response | Error>;

const sessaoOk = { accessToken: 'token-novo', usuario: { id: 'u1', perfil: 'AGENTE' } };
const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
const erroApi = (status: number, code: string) => json(status, { error: { code, message: code } });

let refresh: Roteiro = [];
let chamadas: Array<{ url: string; init: RequestInit }> = [];
let eventos: string[] = [];

/** `/api/auth/refresh` consome o roteiro (o ultimo item se repete); o resto responde 200 ou 401 conforme o token. */
function instalarFetch(opcoes: { tokenValido?: string } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      chamadas.push({ url, init });
      if (url === '/api/auth/refresh') {
        const proximo = refresh.length > 1 ? refresh.shift()! : refresh[0]!;
        if (proximo instanceof Error) throw proximo;
        return proximo.clone();
      }
      const auth = (init.headers as Record<string, string> | undefined)?.Authorization;
      if (opcoes.tokenValido && auth === `Bearer ${opcoes.tokenValido}`) return json(200, { ok: true });
      return erroApi(401, 'UNAUTHORIZED');
    }),
  );
}

const refreshes = () => chamadas.filter((c) => c.url === '/api/auth/refresh').length;
const chamouLogout = () => chamadas.some((c) => /\/auth\/(sair|logout)/.test(c.url));

async function carregar() {
  vi.resetModules();
  return import('./api');
}

/** Roda a promessa avancando os timers (a segunda tentativa espera 150 ms). */
async function concluir<T>(promessa: Promise<T>): Promise<T | unknown> {
  const resultado = promessa.then(
    (v) => v,
    (e: unknown) => e,
  );
  await vi.runAllTimersAsync();
  return resultado;
}

beforeEach(() => {
  vi.useFakeTimers();
  refresh = [];
  chamadas = [];
  eventos = [];
  vi.stubGlobal('window', { dispatchEvent: (e: Event) => eventos.push(e.type) });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('refreshRequest — estados', () => {
  it('200: ok, guarda o token novo', async () => {
    refresh = [json(200, sessaoOk)];
    instalarFetch();
    const { refreshRequest, getAccessToken } = await carregar();

    const r = await concluir(refreshRequest());

    expect(r).toMatchObject({ estado: 'ok' });
    expect(getAccessToken()).toBe('token-novo');
  });

  it('401 da API: expirada (sessao acabou)', async () => {
    refresh = [erroApi(401, 'UNAUTHORIZED')];
    instalarFetch();
    const { refreshRequest } = await carregar();
    expect(await concluir(refreshRequest())).toEqual({ estado: 'expirada' });
  });

  it('401 SEM_SESSAO: expirada, sem segunda tentativa (nao ha cookie)', async () => {
    refresh = [erroApi(401, 'SEM_SESSAO')];
    instalarFetch();
    const { refreshRequest } = await carregar();

    expect(await concluir(refreshRequest())).toEqual({ estado: 'expirada' });
    expect(refreshes()).toBe(1);
  });

  it.each([
    ['503 SESSAO_INDISPONIVEL', () => erroApi(503, 'SESSAO_INDISPONIVEL')],
    ['500 erro interno', () => erroApi(500, 'INTERNAL_ERROR')],
    ['502 do proxy com HTML', () => new Response('<html>Bad Gateway</html>', { status: 502 })],
    ['504 sem corpo', () => new Response(null, { status: 504 })],
    ['429 limite de requisicoes', () => erroApi(429, 'MUITAS_TENTATIVAS')],
    ['200 com corpo ilegivel', () => new Response('<html>', { status: 200 })],
    ['401 SEM o formato da API (proxy/balanceador)', () => new Response('Unauthorized', { status: 401 })],
  ])('%s: indisponivel — nao e sessao expirada', async (_nome, criar) => {
    refresh = [criar()];
    instalarFetch();
    const { refreshRequest } = await carregar();
    expect(await concluir(refreshRequest())).toEqual({ estado: 'indisponivel' });
  });

  it('falha de rede (fetch rejeita): indisponivel', async () => {
    refresh = [new TypeError('Failed to fetch')];
    instalarFetch();
    const { refreshRequest } = await carregar();
    expect(await concluir(refreshRequest())).toEqual({ estado: 'indisponivel' });
  });

  it('tremor: 503 e logo depois 200 (segunda tentativa curta) -> ok', async () => {
    refresh = [erroApi(503, 'SESSAO_INDISPONIVEL'), json(200, sessaoOk)];
    instalarFetch();
    const { refreshRequest } = await carregar();

    expect(await concluir(refreshRequest())).toMatchObject({ estado: 'ok' });
    expect(refreshes()).toBe(2);
  });

  it('toda chamada de renovacao envia o cookie (credentials: include)', async () => {
    refresh = [json(200, sessaoOk)];
    instalarFetch();
    const { refreshRequest } = await carregar();
    await concluir(refreshRequest());
    expect(chamadas.find((c) => c.url === '/api/auth/refresh')!.init).toMatchObject({ method: 'POST', credentials: 'include' });
  });
});

describe('api.get — 401 e renovacao', () => {
  it('servico fora: NAO desloga, NAO limpa o token, NAO chama logout; devolve 503 ao chamador', async () => {
    refresh = [erroApi(503, 'SESSAO_INDISPONIVEL')];
    instalarFetch({ tokenValido: 'outro' });
    const { api, setAccessToken, getAccessToken } = await carregar();
    setAccessToken('token-antigo');

    const erro = (await concluir(api.get('/qualquer'))) as { status: number; code: string };

    expect(erro).toMatchObject({ status: 503, code: 'SESSAO_INDISPONIVEL' });
    expect(eventos).not.toContain('auth:expirada');
    expect(getAccessToken()).toBe('token-antigo');
    expect(chamouLogout()).toBe(false);
  });

  it('falha de rede na renovacao: NAO desloga', async () => {
    refresh = [new TypeError('Failed to fetch')];
    instalarFetch({ tokenValido: 'outro' });
    const { api, setAccessToken, getAccessToken } = await carregar();
    setAccessToken('token-antigo');

    await concluir(api.get('/qualquer'));

    expect(eventos).not.toContain('auth:expirada');
    expect(getAccessToken()).toBe('token-antigo');
  });

  it('401 confirmado na renovacao: desloga (limpa o token e dispara AUTH_EXPIRADA)', async () => {
    refresh = [erroApi(401, 'UNAUTHORIZED')];
    instalarFetch({ tokenValido: 'outro' });
    const { api, setAccessToken, getAccessToken } = await carregar();
    setAccessToken('token-antigo');

    const erro = (await concluir(api.get('/qualquer'))) as { status: number };

    expect(erro.status).toBe(401);
    expect(eventos).toContain('auth:expirada');
    expect(getAccessToken()).toBeNull();
  });

  it('RECUPERACAO: servico volta, a chamada seguinte renova e refaz a requisicao sozinha', async () => {
    instalarFetch({ tokenValido: 'token-novo' });
    const { api, setAccessToken } = await carregar();
    setAccessToken('token-antigo');

    // Servico fora na primeira chamada...
    refresh = [erroApi(503, 'SESSAO_INDISPONIVEL')];
    await concluir(api.get('/qualquer'));
    expect(eventos).not.toContain('auth:expirada');

    // ...e de volta na segunda: o cookie nunca foi tocado, entao renova e conclui.
    refresh = [json(200, sessaoOk)];
    const r = await concluir(api.get<{ ok: boolean }>('/qualquer'));
    expect(r).toEqual({ ok: true });
    expect(eventos).not.toContain('auth:expirada');
  });

  it('401 com o token ainda bom nao dispara renovacao desnecessaria', async () => {
    instalarFetch({ tokenValido: 'token-bom' });
    const { api, setAccessToken } = await carregar();
    setAccessToken('token-bom');
    await concluir(api.get('/qualquer'));
    expect(refreshes()).toBe(0);
  });
});

describe('obterImagemPrivada e baixarCsv', () => {
  it('imagem: servico fora -> null, sem deslogar', async () => {
    refresh = [erroApi(503, 'SESSAO_INDISPONIVEL')];
    instalarFetch({ tokenValido: 'outro' });
    const { obterImagemPrivada, setAccessToken, getAccessToken } = await carregar();
    setAccessToken('token-antigo');

    expect(await concluir(obterImagemPrivada('/arquivos/x.png'))).toBeNull();
    expect(eventos).not.toContain('auth:expirada');
    expect(getAccessToken()).toBe('token-antigo');
  });

  it('imagem: 401 confirmado -> null e desloga', async () => {
    refresh = [erroApi(401, 'UNAUTHORIZED')];
    instalarFetch({ tokenValido: 'outro' });
    const { obterImagemPrivada, setAccessToken } = await carregar();
    setAccessToken('token-antigo');

    expect(await concluir(obterImagemPrivada('/arquivos/x.png'))).toBeNull();
    expect(eventos).toContain('auth:expirada');
  });

  it('csv: servico fora -> erro 503 para o chamador, sem deslogar', async () => {
    refresh = [erroApi(503, 'SESSAO_INDISPONIVEL')];
    instalarFetch({ tokenValido: 'outro' });
    const { baixarCsv, setAccessToken } = await carregar();
    setAccessToken('token-antigo');

    const erro = (await concluir(baixarCsv('/relatorio.csv', 'r.csv'))) as { status: number };
    expect(erro).toMatchObject({ status: 503 });
    expect(eventos).not.toContain('auth:expirada');
  });
});
