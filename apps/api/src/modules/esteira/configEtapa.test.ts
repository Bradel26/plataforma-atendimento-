import { describe, expect, it } from 'vitest';
import { ETAPAS } from './catalogo';
import { validarConfigEtapa } from './estrutura';
import { configEtapaSchema } from './esteiras.schemas';

describe('configEtapaSchema', () => {
  it('aceita nome (com trim), dias e null', () => {
    expect(configEtapaSchema.parse({ nome: '  Docs  ' })).toEqual({ nome: 'Docs' });
    expect(configEtapaSchema.parse({ diasParado: 10 })).toEqual({ diasParado: 10 });
    expect(configEtapaSchema.parse({ diasParado: null })).toEqual({ diasParado: null });
  });
  it('recusa corpo vazio, nome vazio/longo e dias fora de 1–365', () => {
    expect(configEtapaSchema.safeParse({}).success).toBe(false);
    expect(configEtapaSchema.safeParse({ nome: '   ' }).success).toBe(false);
    expect(configEtapaSchema.safeParse({ nome: 'a'.repeat(61) }).success).toBe(false);
    expect(configEtapaSchema.safeParse({ diasParado: 0 }).success).toBe(false);
    expect(configEtapaSchema.safeParse({ diasParado: 366 }).success).toBe(false);
    expect(configEtapaSchema.safeParse({ diasParado: 1.5 }).success).toBe(false);
  });
  it('recusa ordem, tipo e chave', () => {
    expect(configEtapaSchema.safeParse({ nome: 'x', ordem: 2 }).success).toBe(false);
    expect(configEtapaSchema.safeParse({ nome: 'x', tipoEtapa: 'SAIDA' }).success).toBe(false);
    expect(configEtapaSchema.safeParse({ nome: 'x', chave: 'TIM_CRED_OK' }).success).toBe(false);
  });
});

describe('validarConfigEtapa', () => {
  it('chave fora do catálogo da operação é não encontrada', () => {
    expect(validarConfigEtapa(ETAPAS.TIM, 'SL_MEI', { nome: 'x' })).toBe('NAO_ENCONTRADA');
  });
  it('saída não aceita diasParado, mas aceita renomear', () => {
    expect(validarConfigEtapa(ETAPAS.TIM, 'TIM_DESISTENCIA', { diasParado: 5 })).toMatch(/saída/);
    expect(validarConfigEtapa(ETAPAS.TIM, 'TIM_DESISTENCIA', { diasParado: null })).toMatch(/saída/);
    expect(validarConfigEtapa(ETAPAS.TIM, 'TIM_DESISTENCIA', { nome: 'Saiu' })).toBeNull();
  });
  it('etapa normal aceita ambos', () => {
    expect(validarConfigEtapa(ETAPAS.TIM, 'TIM_CRED_OK', { nome: 'x', diasParado: 3 })).toBeNull();
  });
});
