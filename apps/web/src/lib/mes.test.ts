import { describe, expect, it } from 'vitest';
import { mesPorExtenso } from './mes';

describe('mesPorExtenso', () => {
  it('aceita o mês curto (AAAA-MM)', () => {
    expect(mesPorExtenso('2026-10')).toBe('outubro de 2026');
  });

  it('aceita o instante ISO que a API de metas devolve', () => {
    // GET /metas/minha devolve `mes` como "2026-10-01T00:00:00.000Z".
    expect(mesPorExtenso('2026-10-01T00:00:00.000Z')).toBe('outubro de 2026');
  });

  it('não muda de mês pelo fuso (primeiro dia à meia-noite UTC)', () => {
    expect(mesPorExtenso('2026-01-01T00:00:00.000Z')).toBe('janeiro de 2026');
  });
});
