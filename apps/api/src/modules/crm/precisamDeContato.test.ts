import { describe, expect, it } from 'vitest';
import { resumirPrecisamDeContato } from './precisamDeContato';

describe('resumirPrecisamDeContato', () => {
  it('base importada em lote: todos entram so por falta de responsavel e a conta fecha', () => {
    const r = resumirPrecisamDeContato([
      ...Array.from({ length: 5 }, () => ({ semResponsavel: true, semConversa: true })),
      ...Array.from({ length: 2 }, () => ({ semResponsavel: true, semConversa: false })),
      { semResponsavel: false, semConversa: true },
      { semResponsavel: false, semConversa: false },
    ]);
    expect(r.total).toBe(8);
    expect(r.somenteSemResponsavel + r.somenteSemConversa + r.semResponsavelENemConversa).toBe(r.total);
    expect(r).toMatchObject({ semResponsavel: 7, semConversa: 6, semResponsavelENemConversa: 5, somenteSemResponsavel: 2, somenteSemConversa: 1 });
  });

  it('lista vazia', () => {
    expect(resumirPrecisamDeContato([]).total).toBe(0);
  });
});
