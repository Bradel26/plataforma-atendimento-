/**
 * Cliente HTTP.
 *
 * O access token vive apenas em memoria (nao em localStorage) — o refresh token
 * fica num cookie httpOnly, e a sessao e restaurada chamando /auth/refresh.
 * Em 401, tenta renovar o token uma vez e repete a requisicao original.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let accessToken: string | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

/** Usado pelo Socket.IO, que autentica no handshake e nao via header. */
export const getAccessToken = () => accessToken;

/** Disparado quando a sessao expira de forma irreversivel. */
export const AUTH_EXPIRADA = 'auth:expirada';

async function raw(path: string, init: RequestInit): Promise<Response> {
  return fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      // FormData define o proprio Content-Type, com boundary — nao sobrescrever.
      ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  });
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const texto = await res.text();
  const corpo = texto ? JSON.parse(texto) : {};
  if (!res.ok) {
    const erro = corpo?.error ?? {};
    throw new ApiError(res.status, erro.code ?? 'ERRO', erro.message ?? 'Falha na requisicao', erro.details);
  }
  return corpo as T;
}

type Sessao = { accessToken: string; usuario: import('./types').Usuario };

/** Espera curta antes da segunda tentativa, para o cookie novo chegar. */
const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

async function chamarRefresh(): Promise<{ sessao: Sessao | null; codigo: string | null }> {
  try {
    const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    if (res.ok) return { sessao: (await res.json()) as Sessao, codigo: null };
    const corpo = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
    return { sessao: null, codigo: corpo?.error?.code ?? 'DESCONHECIDO' };
  } catch {
    return { sessao: null, codigo: 'REDE' };
  }
}

/**
 * Renovacao de sessao, uma por vez.
 *
 * O refresh token e de uso unico: duas chamadas simultaneas fazem a segunda
 * receber 401 com a sessao ainda valida. Isso acontecia de verdade — o
 * StrictMode do React invoca o efeito de boot duas vezes, e recarregar a pagina
 * deslogava o usuario. Por isso: a chamada em curso e compartilhada, e um
 * cookie invalido (diferente de "sem cookie") ganha uma segunda tentativa, que
 * cobre o caso de outra aba ter rotacionado primeiro.
 */
let refreshEmCurso: Promise<Sessao | null> | null = null;

export function refreshRequest(): Promise<Sessao | null> {
  if (!refreshEmCurso) {
    refreshEmCurso = (async () => {
      const primeira = await chamarRefresh();
      let sessao = primeira.sessao;
      if (!sessao && primeira.codigo !== 'SEM_SESSAO') {
        await espera(150);
        sessao = (await chamarRefresh()).sessao;
      }
      if (sessao) setAccessToken(sessao.accessToken);
      return sessao;
    })();
    // Libera na proxima microtask, para chamadas concorrentes compartilharem
    // o resultado desta.
    void refreshEmCurso.finally(() => {
      setTimeout(() => {
        refreshEmCurso = null;
      }, 0);
    });
  }
  return refreshEmCurso;
}

async function renovarSessao(): Promise<boolean> {
  return (await refreshRequest()) !== null;
}

async function enviar<T>(path: string, init: RequestInit): Promise<T> {
  let res = await raw(path, init);

  const podeRenovar = res.status === 401 && !path.startsWith('/auth/');
  if (podeRenovar) {
    if (await renovarSessao()) {
      res = await raw(path, init);
    } else {
      setAccessToken(null);
      window.dispatchEvent(new Event(AUTH_EXPIRADA));
    }
  }

  return parse<T>(res);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  return enviar<T>(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

export const api = {
  /** Upload de arquivo (multipart). O campo tem de casar com o esperado na rota. */
  upload: <T>(path: string, arquivo: File, campo = 'arquivo', extras?: Record<string, string>) => {
    const corpo = new FormData();
    corpo.append(campo, arquivo);
    for (const [chave, valor] of Object.entries(extras ?? {})) corpo.append(chave, valor);
    return enviar<T>(path, { method: 'POST', body: corpo });
  },
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};

/**
 * Baixa um CSV da API. Um <a href> simples nao serve: a rota exige o header
 * Authorization, que o navegador nao envia em navegacao — entao buscamos o
 * conteudo e disparamos o download por object URL.
 */
export async function baixarCsv(path: string, nomeArquivo: string): Promise<void> {
  let res = await raw(path, { method: 'GET' });

  if (res.status === 401 && (await renovarSessao())) {
    res = await raw(path, { method: 'GET' });
  }
  if (!res.ok) {
    await parse(res); // reaproveita o tratamento de erro padrao
    return;
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Login e refresh sao chamados direto: nao devem entrar no ciclo de renovacao. */
export async function loginRequest(email: string, senha: string) {
  const res = await raw('/auth/login', { method: 'POST', body: JSON.stringify({ email, senha }) });
  return parse<{ accessToken: string; usuario: import('./types').Usuario }>(res);
}

