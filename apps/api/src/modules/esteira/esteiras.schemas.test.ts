import { describe, expect, it } from 'vitest';
import { LIMITE_IDS_EXPORTACAO, exportarQuerySchema } from './esteiras.schemas';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('exportarQuerySchema — ids da seleção', () => {
  it('sem ids: exporta pelos filtros (ids indefinido)', () => {
    expect(exportarQuerySchema.parse({}).ids).toBeUndefined();
    expect(exportarQuerySchema.parse({ ids: '' }).ids).toBeUndefined();
  });

  it('aceita CSV e parâmetro repetido, sem repetir id', () => {
    expect(exportarQuerySchema.parse({ ids: `${uuid(1)}, ${uuid(2)},${uuid(1)}` }).ids).toEqual([uuid(1), uuid(2)]);
    expect(exportarQuerySchema.parse({ ids: [uuid(3), uuid(4)] }).ids).toEqual([uuid(3), uuid(4)]);
  });

  it('id que não é uuid → erro (400)', () => {
    expect(exportarQuerySchema.safeParse({ ids: `${uuid(1)},abc` }).success).toBe(false);
  });

  it(`no máximo ${LIMITE_IDS_EXPORTACAO} ids`, () => {
    const ate = Array.from({ length: LIMITE_IDS_EXPORTACAO }, (_, i) => uuid(i)).join(',');
    expect(exportarQuerySchema.parse({ ids: ate }).ids).toHaveLength(LIMITE_IDS_EXPORTACAO);
    const demais = Array.from({ length: LIMITE_IDS_EXPORTACAO + 1 }, (_, i) => uuid(i)).join(',');
    expect(exportarQuerySchema.safeParse({ ids: demais }).success).toBe(false);
  });
});
