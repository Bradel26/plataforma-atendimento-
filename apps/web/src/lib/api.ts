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
let renovacaoEmCurso: Promise<boolean> | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

/** Disparado quando a sessao expira de forma irreversivel. */
export const AUTH_EXPIRADA = 'auth:expirada';

async function raw(path: string, init: RequestInit): Promise<Response> {
  return fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
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

async function renovarSessao(): Promise<boolean> {
  renovacaoEmCurso ??= (async () => {
    try {
      const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
      if (!res.ok) return false;
      const { accessToken: novo } = (await res.json()) as { accessToken: string };
      setAccessToken(novo);
      return true;
    } catch {
      return false;
    } finally {
      // libera na proxima microtask para que chamadas concorrentes reaproveitem o resultado
      setTimeout(() => {
        renovacaoEmCurso = null;
      }, 0);
    }
  })();
  return renovacaoEmCurso;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) };

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

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};

/** Login e refresh sao chamados direto: nao devem entrar no ciclo de renovacao. */
export async function loginRequest(email: string, senha: string) {
  const res = await raw('/auth/login', { method: 'POST', body: JSON.stringify({ email, senha }) });
  return parse<{ accessToken: string; usuario: import('./types').Usuario }>(res);
}

export async function refreshRequest() {
  const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
  if (!res.ok) return null;
  return (await res.json()) as { accessToken: string; usuario: import('./types').Usuario };
}
