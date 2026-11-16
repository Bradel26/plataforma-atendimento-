import { describe, expect, it, vi } from 'vitest';
import { ESPERAS_DE_RECUPERACAO_MS, restaurarSessao } from './restaurarSessao';
import type { ResultadoRefresh } from './api';

/*
 * Carregamento da pagina: 401 confirmado vai para o login; servico fora continua
 * tentando (com espera crescente) e entra sozinho quando o servico volta.
 */

const sessao = { accessToken: 't', usuario: { id: 'u1' } } as never;
const ok: ResultadoRefresh = { estado: 'ok', sessao };
const fora: ResultadoRefresh = { estado: 'indisponivel' };
const expirada: ResultadoRefresh = { estado: 'expirada' };

const roteiro = (...itens: ResultadoRefresh[]) => {
  const fila = [...itens];
  return vi.fn(async () => fila.shift() ?? itens[itens.length - 1]!);
};

describe('restaurarSessao', () => {
  it('ok na primeira: devolve a sessao sem esperar', async () => {
    const esperar = vi.fn(async () => undefined);
    expect(await restaurarSessao({ renovar: roteiro(ok), esperar })).toBe(sessao);
    expect(esperar).not.toHaveBeenCalled();
  });

  it('401 confirmado: null (login) e nao insiste', async () => {
    const renovar = roteiro(expirada);
    expect(await restaurarSessao({ renovar, esperar: async () => undefined })).toBeNull();
    expect(renovar).toHaveBeenCalledTimes(1);
  });

  it('RECUPERACAO AUTOMATICA: servico fora, fora, volta -> devolve a sessao sem logout', async () => {
    const esperar = vi.fn(async () => undefined);
    const aoIndisponivel = vi.fn();
    const renovar = roteiro(fora, fora, ok);

    const r = await restaurarSessao({ renovar, esperar, aoIndisponivel });

    expect(r).toBe(sessao);
    expect(renovar).toHaveBeenCalledTimes(3);
    expect(aoIndisponivel).toHaveBeenCalledTimes(2);
  });

  it('servico fora e DEPOIS 401 real: vai para o login', async () => {
    expect(await restaurarSessao({ renovar: roteiro(fora, expirada), esperar: async () => undefined })).toBeNull();
  });

  it('espera crescente e limitada (o ultimo valor se repete)', async () => {
    const esperas: number[] = [];
    const renovar = roteiro(fora, fora, fora, fora, fora, fora, fora, ok);

    await restaurarSessao({ renovar, esperar: async (ms) => void esperas.push(ms) });

    expect(esperas.slice(0, ESPERAS_DE_RECUPERACAO_MS.length)).toEqual(ESPERAS_DE_RECUPERACAO_MS);
    expect(esperas[esperas.length - 1]).toBe(ESPERAS_DE_RECUPERACAO_MS[ESPERAS_DE_RECUPERACAO_MS.length - 1]);
    expect(Math.max(...esperas)).toBeLessThanOrEqual(30_000);
  });

  it('cancelado (componente desmontado): para de tentar e devolve null', async () => {
    let cancelado = false;
    const renovar = roteiro(fora);
    const r = await restaurarSessao({
      renovar,
      esperar: async () => {
        cancelado = true;
      },
      cancelado: () => cancelado,
    });
    expect(r).toBeNull();
    expect(renovar).toHaveBeenCalledTimes(1);
  });
});
