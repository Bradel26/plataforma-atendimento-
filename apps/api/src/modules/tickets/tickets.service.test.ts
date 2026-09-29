import { describe, expect, it } from 'vitest';
import { responsavelPadrao } from './tickets.service';

describe('responsavelPadrao — chamado de TI comeca atribuido a quem abriu', () => {
  it('chamado de TI sem responsavel informado vira responsavel de quem abriu', () => {
    // `politicaProtocolos` só mostra um chamado sem fila para quem já é o
    // responsável (ver lib/politicas.ts) — chamado de TI nunca tem fila, então
    // sem isto quem abre não enxergaria o próprio chamado (nem conseguiria
    // anexar o print: `anexar` usa a mesma política de visibilidade).
    const r = responsavelPadrao({ categoria: 'TI_INTERNO', responsavelId: undefined } as never, 'autor-1');
    expect(r).toBe('autor-1');
  });

  it('chamado de TI com responsavel ja informado nao e sobrescrito', () => {
    const r = responsavelPadrao({ categoria: 'TI_INTERNO', responsavelId: 'ti-time-1' } as never, 'autor-1');
    expect(r).toBe('ti-time-1');
  });

  it('chamado de atendimento (cliente) nao ganha responsavel automatico', () => {
    const r = responsavelPadrao({ categoria: 'ATENDIMENTO', responsavelId: undefined } as never, 'autor-1');
    expect(r).toBeUndefined();
  });

  it('chamado de atendimento (cliente) sem categoria explicita tambem nao ganha responsavel automatico', () => {
    const r = responsavelPadrao({ responsavelId: undefined } as never, 'autor-1');
    expect(r).toBeUndefined();
  });
});
