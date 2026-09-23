import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Cobre o mecanismo NATIVO de QR/pareamento do Baileys, tal como o codigo de
 * producao usa (`sessao.ts`): o `u.qr` que sai de `connection.update` e
 * exatamente o que vira o PNG que `qrDe()` devolve — nenhuma transformacao de
 * protocolo, so `qrcode.toDataURL` (biblioteca de renderizacao, roda de
 * verdade aqui, sem mock) desenhando o MESMO valor recebido.
 *
 * Tambem cobre isolamento entre sessoes: o QR/estado de uma sessao nunca
 * aparece na outra, e `connection === 'open'` muda o estado para CONECTADO
 * so daquela sessao especifica.
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

const { garantirNoAr, qrDe, situacaoDe } = await import('./sessao.js');
type Sessao = Awaited<ReturnType<typeof garantirNoAr>>;

let contador = 0;
function nomeDeTeste() {
  contador += 1;
  return `teste-qr-${contador}`;
}

/**
 * `toDataURL` roda de verdade (nao mockada) e nao e sincrona com o emit —
 * espera de verdade ate o PNG aparecer em `sessao.qr`, em vez de um sleep de
 * duracao fixa (o primeiro desenho de QR do processo pode ser mais lento).
 */
async function aguardarQr(sessao: Sessao) {
  for (let tentativa = 0; tentativa < 50; tentativa += 1) {
    if (qrDe(sessao).qr) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.socketsCriados.length = 0;
});

describe('QR nativo do Baileys — sem protocolo proprio', () => {
  it('requisito 1/Etapa A: o QR emitido por connection.update chega intacto em qrDe (mesmo dado, so renderizado)', async () => {
    const nome = nomeDeTeste();
    const sessao = await garantirNoAr(nome);

    const qrBrutoDoBaileys = '2@ABCDEF1234567890,XYZ==,algumaCoisaOpacaDoProtocolo==';
    mocks.socketsCriados[0]!.__emitir('connection.update', { qr: qrBrutoDoBaileys });
    await aguardarQr(sessao);

    const resultado = qrDe(sessao);
    expect(situacaoDe(sessao).status).toBe('QRCODE');
    // `toDataURL` (biblioteca `qrcode`, sem mock) so desenha o MESMO texto
    // recebido — nunca outro protocolo, nunca um QR fabricado pela plataforma.
    expect(resultado.qr).toMatch(/^data:image\/png;base64,/);
    expect(resultado.conectado).toBe(false);
  });

  it('requisito 5/Etapa E: connection "open" muda a sessao para CONECTADO e limpa o QR', async () => {
    const nome = nomeDeTeste();
    const sessao = await garantirNoAr(nome);

    mocks.socketsCriados[0]!.__emitir('connection.update', { qr: '2@algum-qr-de-pareamento==' });
    await aguardarQr(sessao);
    expect(qrDe(sessao).qr).not.toBeNull();

    mocks.socketsCriados[0]!.__emitir('connection.update', {
      connection: 'open',
    });

    const estado = situacaoDe(sessao);
    expect(estado.status).toBe('CONECTADO');
    expect(estado.connected).toBe(true);
    // QR usado nao serve mais — guardado seria convite a parear de novo.
    expect(qrDe(sessao).qr).toBeNull();
  });

  it('requisito 6: sessoes de nomes diferentes ficam isoladas — QR/estado de uma nunca aparece na outra', async () => {
    const nomeA = nomeDeTeste();
    const nomeB = nomeDeTeste();

    const sessaoA = await garantirNoAr(nomeA);
    const sessaoB = await garantirNoAr(nomeB);

    expect(mocks.socketsCriados).toHaveLength(2);
    const [sockA] = mocks.socketsCriados;

    sockA!.__emitir('connection.update', { qr: '2@qr-exclusivo-da-sessao-a==' });
    await aguardarQr(sessaoA);

    expect(situacaoDe(sessaoA).status).toBe('QRCODE');
    expect(qrDe(sessaoA).qr).not.toBeNull();
    // B nunca recebeu nenhum evento — continua como quando `garantirNoAr` a criou.
    expect(qrDe(sessaoB).qr).toBeNull();
    expect(situacaoDe(sessaoB).status).not.toBe('QRCODE');

    sockA!.__emitir('connection.update', { connection: 'open' });
    expect(situacaoDe(sessaoA).connected).toBe(true);
    expect(situacaoDe(sessaoB).connected).toBe(false);
  });
});
