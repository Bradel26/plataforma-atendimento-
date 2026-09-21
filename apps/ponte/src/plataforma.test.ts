import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { avisarStatus } from './plataforma.js';

/**
 * Cobre a diferenciacao entre erro transitorio (vale reentregar) e erro de
 * configuracao/permissao (reentregar nao conserta nada).
 *
 * Antes desta correcao, `tentar()` so olhava o STATUS HTTP (`4xx` = definitivo,
 * `5xx` = vale repetir) — e a API devolve `CANAL_INDISPONIVEL` como 503
 * (a organizacao esta viva, so nao aceita este modo), entao caia sempre no
 * "vale repetir": 3 tentativas com backoff, "desisti apos 3 tentativas", e a
 * sessao (`padrao`, ou qualquer outra) reconectando e tentando reportar de
 * novo poucos segundos depois — dezenas de ciclos identicos no log, sem
 * nenhum deles corrigir nada, porque nao existe reentrega que troque o modo
 * da organizacao.
 *
 * A correcao le o `error.code` estruturado do corpo da resposta (quando
 * existe) para decidir isso, em vez de depender so da faixa do status HTTP.
 */

const respostaCanalIndisponivel = () =>
  new Response(JSON.stringify({ error: { code: 'CANAL_INDISPONIVEL', message: 'O WhatsApp desta organizacao nao esta no modo nao oficial' } }), {
    status: 503,
  });

const respostaOk = () => new Response(JSON.stringify({ ok: true }), { status: 200 });

const resposta503Generico = () =>
  new Response(JSON.stringify({ error: { code: 'ALGO_TEMPORARIO', message: 'tente de novo' } }), { status: 503 });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('avisarStatus — CANAL_INDISPONIVEL nao gera retry infinito', () => {
  it('TESTE 1: 503 CANAL_INDISPONIVEL nao reentrega — uma unica tentativa, log claro, sem loop', async () => {
    const fetchFalso = vi.fn(async () => respostaCanalIndisponivel());
    vi.stubGlobal('fetch', fetchFalso);
    const erroSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const ok = await avisarStatus('padrao', 'DESCONECTADO', 'sem QR escaneado');

    expect(ok).toBe(false);
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    expect(erroSpy).toHaveBeenCalledWith(expect.stringContaining('plataforma recusou'));

    erroSpy.mockRestore();
  });

  it('TESTE 2: organizacao em NAO_OFICIAL (200 OK) — fluxo normal preservado', async () => {
    const fetchFalso = vi.fn(async () => respostaOk());
    vi.stubGlobal('fetch', fetchFalso);

    const ok = await avisarStatus('padrao', 'CONECTADO', null);

    expect(ok).toBe(true);
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it('erro transitorio (503 SEM o codigo CANAL_INDISPONIVEL) continua reentregando normalmente', async () => {
    const fetchFalso = vi.fn(async () => resposta503Generico());
    vi.stubGlobal('fetch', fetchFalso);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const promessa = avisarStatus('padrao', 'DESCONECTADO', null);
    await vi.advanceTimersByTimeAsync(1_000 + 5_000 + 15_000);
    const ok = await promessa;

    expect(ok).toBe(false);
    // 1 tentativa inicial + 3 reentregas (ESPERAS tem 3 elementos) = 4 chamadas.
    expect(fetchFalso).toHaveBeenCalledTimes(4);
  });

  it('erro de rede (fetch rejeita) continua reentregando normalmente', async () => {
    const fetchFalso = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    vi.stubGlobal('fetch', fetchFalso);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const promessa = avisarStatus('padrao', 'DESCONECTADO', null);
    await vi.advanceTimersByTimeAsync(1_000 + 5_000 + 15_000);
    const ok = await promessa;

    expect(ok).toBe(false);
    expect(fetchFalso).toHaveBeenCalledTimes(4);
  });
});
