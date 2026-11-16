import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Revalidacao periodica dos sockets (alternativa D). Banco = Map em memoria,
 * relogio injetado e timers falsos: nenhuma conexao, nada de espera real.
 * `situacaoDaSessao` e o REAL, sobre um validador de sessao real (cache de 5 s).
 *
 * Provam a LOGICA (revogacao, falha do banco, timers, varios sockets, cache).
 * Nao provam o comportamento do Socket.IO entre instancias nem a carga no Postgres.
 */

vi.mock('../lib/redis', () => ({ redis: {} }));
vi.mock('../lib/prisma', () => ({ prisma: {} }));
vi.mock('../lib/politicas', () => ({ conversaVisivel: vi.fn() }));
vi.mock('./hub', () => ({ registrarIo: vi.fn() }));

import type { criarValidadorDeSessao as CriarValidador, EstadoSessao } from '../lib/sessao';

let validador: ReturnType<typeof CriarValidador>;
vi.mock('../lib/sessao', async () => {
  const real = await vi.importActual<typeof import('../lib/sessao')>('../lib/sessao');
  return { ...real, validarSessao: (c: { sub: string; org: string; sv?: number }) => validador.validar(c) };
});

import { criarValidadorDeSessao } from '../lib/sessao';
import type { AccessPayload } from '../lib/tokens';
import { criarRevalidador, type SocketRevalidavel } from './revalidacao';
import { situacaoDaSessao } from './server';

const banco = new Map<string, EstadoSessao>();
let consultas = 0;
let agora = 0;
let bancoFora: Error | null = null;

const usuario = (sub: string, sv: number, org = 'org-a'): AccessPayload =>
  ({ sub, org, sv, nome: sub, email: `${sub}@x.com`, perfil: 'ADMIN' }) as AccessPayload;

const novoSocket = (u?: AccessPayload) => {
  const s = { data: { usuario: u }, disconnect: vi.fn() } satisfies SocketRevalidavel;
  return s;
};

const fonte = (sockets: SocketRevalidavel[]) => ({ local: { fetchSockets: async () => sockets } });

const montar = (sockets: SocketRevalidavel[], extra: Partial<Parameters<typeof criarRevalidador>[0]> = {}) =>
  criarRevalidador({ io: fonte(sockets), situacao: situacaoDaSessao, aoFalhar: () => {}, ...extra });

beforeEach(() => {
  banco.clear();
  consultas = 0;
  agora = 1_000_000;
  bancoFora = null;
  validador = criarValidadorDeSessao({
    agora: () => agora,
    consultar: async (org, id) => {
      consultas++;
      if (bancoFora) throw bancoFora;
      return banco.get(`${org}:${id}`) ?? null;
    },
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('revogacao', () => {
  it('versao subiu: desconecta os sockets da pessoa e so os dela', async () => {
    banco.set('org-a:u1', { versao: 1, ativo: true });
    banco.set('org-a:u2', { versao: 0, ativo: true });
    const revogado = novoSocket(usuario('u1', 0));
    const intacto = novoSocket(usuario('u2', 0));
    expect(await montar([revogado, intacto]).rodar()).toBe(1);
    expect(revogado.disconnect).toHaveBeenCalledWith(true);
    expect(intacto.disconnect).not.toHaveBeenCalled();
  });

  it('usuario desativado ou excluido: desconecta', async () => {
    banco.set('org-a:u1', { versao: 0, ativo: false });
    const desativado = novoSocket(usuario('u1', 0));
    const excluido = novoSocket(usuario('u9', 0)); // sem linha no banco
    await montar([desativado, excluido]).rodar();
    expect(desativado.disconnect).toHaveBeenCalledWith(true);
    expect(excluido.disconnect).toHaveBeenCalledWith(true);
  });

  it('socket de OUTRA instancia: a revogacao feita la e percebida aqui na rodada local', async () => {
    // O banco e compartilhado; esta "instancia" nunca viu `desconectarUsuario`.
    const s = novoSocket(usuario('u1', 0));
    banco.set('org-a:u1', { versao: 0, ativo: true });
    const rev = montar([s]);
    await rev.rodar();
    expect(s.disconnect).not.toHaveBeenCalled();
    banco.set('org-a:u1', { versao: 1, ativo: true }); // revogado por outra instancia
    agora += 5_001; // passou o TTL do cache
    await rev.rodar();
    expect(s.disconnect).toHaveBeenCalledWith(true);
  });

  it('visitante do webchat (sem usuario) nunca e consultado nem desconectado', async () => {
    const visitante = novoSocket(undefined);
    await montar([visitante]).rodar();
    expect(consultas).toBe(0);
    expect(visitante.disconnect).not.toHaveBeenCalled();
  });

  it('mesmo id em outra organizacao e outra pessoa', async () => {
    banco.set('org-b:u1', { versao: 3, ativo: true });
    const daOrgA = novoSocket(usuario('u1', 0, 'org-a')); // nao existe na org-a
    const daOrgB = novoSocket(usuario('u1', 3, 'org-b'));
    await montar([daOrgA, daOrgB]).rodar();
    expect(daOrgA.disconnect).toHaveBeenCalled();
    expect(daOrgB.disconnect).not.toHaveBeenCalled();
  });
});

describe('falha do banco', () => {
  it('banco fora: NAO desconecta ninguem (nem 401 falso)', async () => {
    banco.set('org-a:u1', { versao: 1, ativo: true }); // estaria revogado
    bancoFora = new Error('ECONNRESET');
    const s = novoSocket(usuario('u1', 0));
    expect(await montar([s]).rodar()).toBe(0);
    expect(s.disconnect).not.toHaveBeenCalled();
  });

  it('banco volta: a proxima rodada aplica a revogacao (a falha nao foi cacheada)', async () => {
    banco.set('org-a:u1', { versao: 1, ativo: true });
    bancoFora = new Error('timeout');
    const s = novoSocket(usuario('u1', 0));
    const rev = montar([s]);
    await rev.rodar();
    bancoFora = null;
    await rev.rodar();
    expect(s.disconnect).toHaveBeenCalledWith(true);
  });

  it('erro inesperado em um grupo nao impede os demais', async () => {
    const aoFalhar = vi.fn();
    const ruim = novoSocket(usuario('ruim', 0));
    const bom = novoSocket(usuario('bom', 0));
    banco.set('org-a:bom', { versao: 1, ativo: true });
    const rev = criarRevalidador({
      io: fonte([ruim, bom]),
      situacao: async (u) => {
        if (u.sub === 'ruim') throw new Error('inesperado');
        return situacaoDaSessao(u);
      },
      aoFalhar,
      concorrencia: 1,
    });
    await rev.rodar();
    expect(aoFalhar).toHaveBeenCalledTimes(1);
    expect(bom.disconnect).toHaveBeenCalledWith(true);
    expect(ruim.disconnect).not.toHaveBeenCalled();
  });

  it('falha ao listar sockets: registra e resolve com 0, sem lancar', async () => {
    const aoFalhar = vi.fn();
    const rev = criarRevalidador({
      io: { local: { fetchSockets: async () => { throw new Error('io fora'); } } },
      situacao: situacaoDaSessao,
      aoFalhar,
    });
    await expect(rev.rodar()).resolves.toBe(0);
    expect(aoFalhar).toHaveBeenCalled();
  });
});

describe('varios sockets e consultas simultaneas', () => {
  it('5 abas da mesma pessoa = 1 consulta; todas caem na revogacao', async () => {
    banco.set('org-a:u1', { versao: 1, ativo: true });
    const abas = Array.from({ length: 5 }, () => novoSocket(usuario('u1', 0)));
    await montar(abas).rodar();
    expect(consultas).toBe(1);
    for (const a of abas) expect(a.disconnect).toHaveBeenCalledWith(true);
  });

  it('abas com versoes diferentes no token sao avaliadas separadamente', async () => {
    banco.set('org-a:u1', { versao: 2, ativo: true });
    const velha = novoSocket(usuario('u1', 1));
    const atual = novoSocket(usuario('u1', 2));
    await montar([velha, atual]).rodar();
    expect(velha.disconnect).toHaveBeenCalled();
    expect(atual.disconnect).not.toHaveBeenCalled();
  });

  it('limita a concorrencia', async () => {
    let emVoo = 0;
    let pico = 0;
    const rev = criarRevalidador({
      io: fonte(Array.from({ length: 20 }, (_, i) => novoSocket(usuario(`u${i}`, 0)))),
      situacao: async () => {
        emVoo++;
        pico = Math.max(pico, emVoo);
        await new Promise((r) => setTimeout(r, 1));
        emVoo--;
        return 'valida';
      },
      concorrencia: 3,
      aoFalhar: () => {},
    });
    await rev.rodar();
    expect(pico).toBe(3);
  });

  it('chamada durante uma rodada em curso reaproveita a mesma rodada', async () => {
    let listagens = 0;
    let liberar!: () => void;
    const rev = criarRevalidador({
      io: {
        local: {
          fetchSockets: async () => {
            listagens++;
            await new Promise<void>((r) => (liberar = r));
            return [];
          },
        },
      },
      situacao: situacaoDaSessao,
    });
    const a = rev.rodar();
    const b = rev.rodar();
    liberar();
    await Promise.all([a, b]);
    expect(listagens).toBe(1);
  });
});

describe('cache de sessao', () => {
  it('dentro dos 5 s a rodada nao consulta de novo (e a janela documentada)', async () => {
    banco.set('org-a:u1', { versao: 0, ativo: true });
    const s = novoSocket(usuario('u1', 0));
    const rev = montar([s]);
    await rev.rodar();
    banco.set('org-a:u1', { versao: 1, ativo: true });
    await rev.rodar();
    expect(consultas).toBe(1);
    expect(s.disconnect).not.toHaveBeenCalled();
  });

  it('invalidacao local imediata: a rodada ja enxerga a revogacao feita nesta instancia', async () => {
    banco.set('org-a:u1', { versao: 0, ativo: true });
    const s = novoSocket(usuario('u1', 0));
    const rev = montar([s]);
    await rev.rodar();
    banco.set('org-a:u1', { versao: 1, ativo: true });
    validador.invalidar('org-a', 'u1');
    await rev.rodar();
    expect(s.disconnect).toHaveBeenCalledWith(true);
  });
});

describe('timers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('roda no intervalo com jitter, reagenda so depois do fim da rodada e para ao parar()', async () => {
    banco.set('org-a:u1', { versao: 0, ativo: true });
    const s = novoSocket(usuario('u1', 0));
    const atrasos: number[] = [];
    const rev = criarRevalidador({
      io: fonte([s]),
      situacao: situacaoDaSessao,
      intervaloMs: 60_000,
      jitter: 0.2,
      random: () => 1, // sorteio maximo: +20%
      agendar: (fn, ms) => {
        atrasos.push(ms);
        return setTimeout(fn, ms);
      },
      cancelar: (id) => clearTimeout(id as NodeJS.Timeout),
      aoFalhar: () => {},
    });
    rev.iniciar();
    expect(atrasos).toEqual([72_000]);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(72_000);
    expect(atrasos.length).toBe(2);
    expect(vi.getTimerCount()).toBe(1);
    rev.parar();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(atrasos.length).toBe(2);
  });

  it('o jitter fica dentro de +-20% do intervalo', () => {
    for (const r of [0, 0.5, 1]) {
      const atrasos: number[] = [];
      const rev = criarRevalidador({
        io: fonte([]),
        situacao: situacaoDaSessao,
        random: () => r,
        agendar: (_fn, ms) => (atrasos.push(ms), 1),
        cancelar: () => {},
      });
      rev.iniciar();
      expect(atrasos[0]).toBeGreaterThanOrEqual(48_000);
      expect(atrasos[0]).toBeLessThanOrEqual(72_000);
    }
  });

  it('parar() durante uma rodada em curso nao reagenda', async () => {
    let liberar!: () => void;
    const rev = criarRevalidador({
      io: { local: { fetchSockets: async () => { await new Promise<void>((r) => (liberar = r)); return []; } } },
      situacao: situacaoDaSessao,
      intervaloMs: 1000,
    });
    rev.iniciar();
    await vi.advanceTimersByTimeAsync(1200); // dispara a rodada, que fica pendurada
    rev.parar();
    liberar();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0); // nada pendente logo apos a rodada terminar
  });

  it('iniciar() duas vezes nao cria dois timers', () => {
    const rev = criarRevalidador({ io: fonte([]), situacao: situacaoDaSessao });
    rev.iniciar();
    rev.iniciar();
    expect(vi.getTimerCount()).toBe(1);
    rev.parar();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rodada lenta nao empilha rodadas: nenhum timer novo ate ela terminar', async () => {
    let liberar!: () => void;
    let listagens = 0;
    const rev = criarRevalidador({
      io: { local: { fetchSockets: async () => { listagens++; await new Promise<void>((r) => (liberar = r)); return []; } } },
      situacao: situacaoDaSessao,
      intervaloMs: 1000,
    });
    rev.iniciar();
    await vi.advanceTimersByTimeAsync(1200);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(listagens).toBe(1);
    liberar();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    rev.parar();
  });
});
