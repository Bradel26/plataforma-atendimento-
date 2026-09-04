import { describe, expect, it } from 'vitest';
import { criarVisaoSchema, validarFiltroDaEntidade } from './visoes.schemas';

describe('criarVisaoSchema', () => {
  it('aceita o filtro de CONTA (busca, tags)', () => {
    const r = criarVisaoSchema.safeParse({
      entidade: 'CONTA',
      nome: 'Clientes VIP',
      filtro: { busca: 'vip', tags: ['prioridade'] },
    });
    expect(r.success).toBe(true);
  });

  it('aceita o filtro de LEAD (tipo, responsavelId, atrasados, busca)', () => {
    const r = criarVisaoSchema.safeParse({
      entidade: 'LEAD',
      nome: 'Meus atrasados',
      filtro: { atrasados: true, responsavelId: '11111111-1111-1111-1111-111111111111' },
    });
    expect(r.success).toBe(true);
  });

  it('aceita o filtro de OPORTUNIDADE (so funilId)', () => {
    const r = criarVisaoSchema.safeParse({
      entidade: 'OPORTUNIDADE',
      nome: 'Funil comercial',
      filtro: { funilId: '11111111-1111-1111-1111-111111111111' },
    });
    expect(r.success).toBe(true);
  });

  it('recusa campo que a tela de CONTA nao tem hoje (nao inventa vocabulario novo)', () => {
    const r = criarVisaoSchema.safeParse({
      entidade: 'CONTA',
      nome: 'X',
      filtro: { responsavelId: '11111111-1111-1111-1111-111111111111' },
    });
    expect(r.success).toBe(false);
  });

  it('recusa o filtro de LEAD aplicado a entidade OPORTUNIDADE (funilId nao e tipo)', () => {
    const r = criarVisaoSchema.safeParse({
      entidade: 'OPORTUNIDADE',
      nome: 'X',
      filtro: { tipo: 'INBOUND' },
    });
    expect(r.success).toBe(false);
  });

  it('recusa nome com menos de 2 caracteres', () => {
    const r = criarVisaoSchema.safeParse({ entidade: 'CONTA', nome: 'A', filtro: {} });
    expect(r.success).toBe(false);
  });

  it('recusa cor fora do formato hexadecimal', () => {
    const r = criarVisaoSchema.safeParse({ entidade: 'CONTA', nome: 'Nome valido', cor: 'azul', filtro: {} });
    expect(r.success).toBe(false);
  });

  it('aceita sem cor — usa o padrao do banco', () => {
    const r = criarVisaoSchema.safeParse({ entidade: 'CONTA', nome: 'Nome valido', filtro: {} });
    expect(r.success).toBe(true);
  });
});

describe('validarFiltroDaEntidade', () => {
  it('valida contra o schema certo da entidade gravada', () => {
    expect(() => validarFiltroDaEntidade('LEAD', { tipo: 'OUTBOUND' })).not.toThrow();
    expect(() => validarFiltroDaEntidade('CONTA', { tipo: 'OUTBOUND' })).toThrow();
  });
});
