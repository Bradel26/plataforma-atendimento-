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
    throw new ApiError(res.status, erro.code ?? 'ERRO', erro.message ?? 'Falha na requisição', erro.details);
  }
  return corpo as T;
}

export type Sessao = { accessToken: string; usuario: import('./types').Usuario };

/**
 * Resultado de uma renovacao. Tres estados, e nao dois, porque "nao consegui
 * renovar" mistura coisas opostas:
 *  - `expirada`: o servidor respondeu 401 — a sessao acabou (cookie ausente,
 *    invalido, conta desativada, perfil/senha mudaram). Unico caso de logout.
 *  - `indisponivel`: 5xx, 429, falha de rede ou resposta ilegivel. O servidor
 *    NAO disse que a credencial e invalida; o cookie continua valido e a
 *    renovacao deve ser tentada de novo quando o servico voltar.
 */
export type ResultadoRefresh = { estado: 'ok'; sessao: Sessao } | { estado: 'expirada' } | { estado: 'indisponivel' };

/** Espera curta antes da segunda tentativa, para o cookie novo chegar. */
const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

async function chamarRefresh(): Promise<{ resultado: ResultadoRefresh; codigo: string | null }> {
  let res: Response;
  try {
    res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
  } catch {
    return { resultado: { estado: 'indisponivel' }, codigo: 'REDE' };
  }

  if (res.ok) {
    try {
      return { resultado: { estado: 'ok', sessao: (await res.json()) as Sessao }, codigo: null };
    } catch {
      return { resultado: { estado: 'indisponivel' }, codigo: 'RESPOSTA_ILEGIVEL' };
    }
  }

  const corpo = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
  const codigo = corpo?.error?.code ?? 'DESCONHECIDO';
  // So um 401 DA API (com o corpo de erro dela) encerra a sessao. 5xx, 429 e um 401
  // sem o formato da API (proxy, balanceador no meio de uma queda) nao provam que a
  // credencial morreu — deslogar por isso transformaria uma queda em perda de sessao.
  if (res.status === 401 && codigo !== 'DESCONHECIDO') return { resultado: { estado: 'expirada' }, codigo };
  return { resultado: { estado: 'indisponivel' }, codigo };
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
let refreshEmCurso: Promise<ResultadoRefresh> | null = null;

export function refreshRequest(): Promise<ResultadoRefresh> {
  if (!refreshEmCurso) {
    refreshEmCurso = (async () => {
      const primeira = await chamarRefresh();
      let final = primeira;
      // Uma segunda tentativa curta, sem repetir quando nao ha cookie nenhum:
      // cobre a outra aba que rotacionou primeiro (401) e o tremor de rede (5xx).
      if (primeira.resultado.estado !== 'ok' && primeira.codigo !== 'SEM_SESSAO') {
        await espera(150);
        final = await chamarRefresh();
      }
      if (final.resultado.estado === 'ok') setAccessToken(final.resultado.sessao.accessToken);
      return final.resultado;
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

const SESSAO_INDISPONIVEL = () =>
  new ApiError(503, 'SESSAO_INDISPONIVEL', 'Serviço temporariamente indisponível. Tentando novamente...');

function encerrarSessaoNoCliente() {
  setAccessToken(null);
  window.dispatchEvent(new Event(AUTH_EXPIRADA));
}

async function enviar<T>(path: string, init: RequestInit): Promise<T> {
  let res = await raw(path, init);

  const podeRenovar = res.status === 401 && !path.startsWith('/auth/');
  if (podeRenovar) {
    const renovacao = await refreshRequest();
    if (renovacao.estado === 'ok') {
      res = await raw(path, init);
    } else if (renovacao.estado === 'expirada') {
      encerrarSessaoNoCliente();
    } else {
      // Servico fora: nao desloga. A proxima chamada tenta renovar de novo.
      throw SESSAO_INDISPONIVEL();
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

/** Baixa uma imagem privada da API usando o token em memória e renovando a sessão se necessário. */
export async function obterImagemPrivada(path: string): Promise<Blob | null> {
  let res = await raw(path, { method: 'GET', cache: 'no-store' });
  if (res.status === 401) {
    const renovacao = await refreshRequest();
    if (renovacao.estado === 'ok') res = await raw(path, { method: 'GET', cache: 'no-store' });
    else {
      if (renovacao.estado === 'expirada') encerrarSessaoNoCliente();
      return null;
    }
  }
  const tipo = res.headers.get('content-type')?.toLowerCase() ?? '';
  if (!res.ok || !tipo.startsWith('image/')) return null;
  return res.blob();
}

/**
 * Baixa um arquivo da API (CSV, XLSX, PDF...). Um <a href> simples nao serve: a
 * rota exige o header Authorization, que o navegador nao envia em navegacao —
 * entao buscamos o conteudo e disparamos o download por object URL. Erro da API
 * vira `ApiError` (status e codigo preservados).
 */
export async function baixarArquivo(path: string, nomeArquivo: string, corpo?: unknown): Promise<void> {
  // Com corpo, POST (ex.: exportar uma seleção grande de ids, que não cabe na URL).
  const init = (): RequestInit => (corpo === undefined ? { method: 'GET' } : { method: 'POST', body: JSON.stringify(corpo) });
  let res = await raw(path, init());

  if (res.status === 401) {
    const renovacao = await refreshRequest();
    if (renovacao.estado === 'ok') res = await raw(path, init());
    else if (renovacao.estado === 'indisponivel') throw SESSAO_INDISPONIVEL();
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

/** Nome antigo, mantido para as telas que ja usam. */
export const baixarCsv = baixarArquivo;

/** Login e refresh sao chamados direto: nao devem entrar no ciclo de renovacao. */
export async function loginRequest(email: string, senha: string) {
  const res = await raw('/auth/login', { method: 'POST', body: JSON.stringify({ email, senha }) });
  return parse<{ accessToken: string; usuario: import('./types').Usuario }>(res);
}

