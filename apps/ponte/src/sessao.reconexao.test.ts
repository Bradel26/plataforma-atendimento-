import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Cobre a corrida entre o polling HTTP (`GET /qr/:sessao`, `GET /estado/:sessao`
 * — os dois chamam `garantirNoAr`) e a reconexao automatica apos uma queda.
 *
 * Antes desta correcao, o handler de `close` zerava `sock`/`iniciando` na hora,
 * mas so tentava reconectar 3s depois (`reiniciar`). Nesse intervalo,
 * `garantirNoAr` via os dois campos nulos e entendia "sessao livre para
 * conectar" — abrindo um socket NOVO por cima da reconexao que ja estava a
 * caminho. Dois sockets brigando pela mesma sessao fazem o WhatsApp fechar os
 * dois de novo, e a sessao nunca sai do ciclo CONECTANDO/DESCONECTADO — o
 * sintoma real relatado para a sessao "vendedor-05f89eae".
 *
 * Os testes mockam Baileys (`makeWASocket`), a persistencia de credenciais
 * (`autenticacaoPostgres.js`) e o banco de sessao (`banco.js`) para observar
 * quantos SOCKETS de verdade `garantirNoAr`/a reconexao automatica abrem, sem
 * depender de rede nem Postgres.
 */

const mocks = vi.hoisted(() => {
  const socketsCriados: {
    ev: { on: (evento: string, handler: (payload: unknown) => void) => void };
    user?: { id: string };
    logout: () => Promise<void>;
    __emitir: (evento: string, payload: unknown) => void;
  }[] = [];

  function criarSocketFalso() {
    const handlers = new Map<string, (payload: unknown) => void>();
    return {
      ev: {
        on: (evento: string, handler: (payload: unknown) => void) => {
          handlers.set(evento, handler);
        },
      },
      logout: async () => undefined,
      __emitir: (evento: string, payload: unknown) => {
        handlers.get(evento)?.(payload);
      },
    };
  }

  return { socketsCriados, criarSocketFalso };
});

vi.mock('@whiskeysockets/baileys', () => ({
  DisconnectReason: { loggedOut: 401, restartRequired: 515 },
  Browsers: { ubuntu: (nome: string) => ['Ubuntu', nome, '1.0'] },
  fetchLatestBaileysVersion: vi.fn(async () => ({ version: [2, 3000, 0] })),
  makeWASocket: vi.fn(() => {
    const sock = mocks.criarSocketFalso();
    mocks.socketsCriados.push(sock);
    return sock;
  }),
}));

vi.mock('./autenticacaoPostgres.js', () => ({
  criarAuthStatePersistido: vi.fn(async () => ({
    state: { creds: {}, keys: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) } },
    saveCreds: vi.fn(async () => undefined),
  })),
}));

vi.mock('./banco.js', () => ({
  bancoDeSessaoPg: {
    obter: vi.fn(async () => null),
    salvar: vi.fn(async () => undefined),
    apagar: vi.fn(async () => undefined),
  },
}));

const { makeWASocket } = await import('@whiskeysockets/baileys');
const { bancoDeSessaoPg } = await import('./banco.js');
const { garantirNoAr } = await import('./sessao.js');

/** Nome de sessao unico por teste — o estado de `sessao.ts` e um Map em modulo. */
let contador = 0;
function nomeDeTeste() {
  contador += 1;
  return `teste-sessao-${contador}`;
}

function fecharComoRestartRequired(sock: (typeof mocks.socketsCriados)[number]) {
  sock.__emitir('connection.update', {
    connection: 'close',
    lastDisconnect: { error: { output: { statusCode: 515 } } },
  });
}

function fecharComoLoggedOut(sock: (typeof mocks.socketsCriados)[number]) {
  sock.__emitir('connection.update', {
    connection: 'close',
    lastDisconnect: { error: { output: { statusCode: 401 } } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.socketsCriados.length = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('garantirNoAr — corrida entre polling e reconexao automatica', () => {
  it('TESTE 1: durante o backoff apos um close nao-loggedOut, nao chama conectar() de novo', async () => {
    const nome = nomeDeTeste();
    await garantirNoAr(nome);
    expect(makeWASocket).toHaveBeenCalledTimes(1);

    fecharComoRestartRequired(mocks.socketsCriados[0]!);

    // Simula o polling do frontend (a cada 5s) caindo DENTRO da janela de
    // backoff de 3s — isto e o que a auditoria apontou como a causa raiz.
    const chamadaDurantePolling = garantirNoAr(nome);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(makeWASocket).toHaveBeenCalledTimes(1);

    // Limpa o que ficou pendente para nao vazar para o proximo teste.
    await vi.advanceTimersByTimeAsync(2_000);
    await chamadaDurantePolling;
  });

  it('TESTE 2: depois do backoff, reiniciar() chama conectar() exatamente uma vez', async () => {
    const nome = nomeDeTeste();
    await garantirNoAr(nome);
    expect(makeWASocket).toHaveBeenCalledTimes(1);

    fecharComoRestartRequired(mocks.socketsCriados[0]!);

    await vi.advanceTimersByTimeAsync(3_000);

    expect(makeWASocket).toHaveBeenCalledTimes(2);
  });

  it('TESTE 3: sessao nunca iniciada continua podendo conectar normalmente', async () => {
    const nome = nomeDeTeste();

    const sessao = await garantirNoAr(nome);

    expect(makeWASocket).toHaveBeenCalledTimes(1);
    expect(sessao.nome).toBe(nome);
  });

  it('TESTE 4: sessao ja conectada nao cria outro socket', async () => {
    const nome = nomeDeTeste();
    await garantirNoAr(nome);
    mocks.socketsCriados[0]!.__emitir('connection.update', { connection: 'open' });

    await garantirNoAr(nome);

    expect(makeWASocket).toHaveBeenCalledTimes(1);
  });

  it('TESTE 5: DisconnectReason.loggedOut limpa credenciais e nao entra em loop de reconexao', async () => {
    const nome = nomeDeTeste();
    await garantirNoAr(nome);
    expect(makeWASocket).toHaveBeenCalledTimes(1);

    fecharComoLoggedOut(mocks.socketsCriados[0]!);

    // Credenciais sao apagadas antes de qualquer nova tentativa.
    await vi.advanceTimersByTimeAsync(0);
    expect(bancoDeSessaoPg.apagar).toHaveBeenCalledTimes(1);
    expect(bancoDeSessaoPg.apagar).toHaveBeenCalledWith(nome);

    // Polling durante a janela de espera tambem nao pode abrir socket extra aqui.
    const chamadaDurantePolling = garantirNoAr(nome);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(makeWASocket).toHaveBeenCalledTimes(1);

    // So depois do backoff (2s no caso de deslogado) uma UNICA nova tentativa acontece.
    await vi.advanceTimersByTimeAsync(1_000);
    await chamadaDurantePolling;
    expect(makeWASocket).toHaveBeenCalledTimes(2);
  });

  it('TESTE 6: duas chamadas simultaneas de garantirNoAr iniciam so uma conexao', async () => {
    const nome = nomeDeTeste();

    const [a, b] = await Promise.all([garantirNoAr(nome), garantirNoAr(nome)]);

    expect(makeWASocket).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });
});
