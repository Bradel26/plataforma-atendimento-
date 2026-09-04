import { describe, expect, it } from 'vitest';
import { atualizarFilialSchema, criarFilialSchema } from './filiais.schemas';

describe('criarFilialSchema', () => {
  it('aceita nome e cidade/uf opcionais', () => {
    const r = criarFilialSchema.safeParse({ nome: 'Anapolis Centro', cidade: 'Anapolis', uf: 'go' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.uf).toBe('GO');
  });

  it('aceita so o nome, sem cidade/uf', () => {
    const r = criarFilialSchema.safeParse({ nome: 'Matriz' });
    expect(r.success).toBe(true);
  });

  it('rejeita nome muito curto', () => {
    expect(criarFilialSchema.safeParse({ nome: 'A' }).success).toBe(false);
  });

  it('rejeita UF que nao tem exatamente 2 letras', () => {
    expect(criarFilialSchema.safeParse({ nome: 'Matriz', uf: 'goias' }).success).toBe(false);
    expect(criarFilialSchema.safeParse({ nome: 'Matriz', uf: 'g' }).success).toBe(false);
  });
});

describe('atualizarFilialSchema', () => {
  it('exige ao menos um campo', () => {
    expect(atualizarFilialSchema.safeParse({}).success).toBe(false);
  });

  it('aceita desativar sem mexer em mais nada', () => {
    const r = atualizarFilialSchema.safeParse({ ativa: false });
    expect(r.success).toBe(true);
  });

  it('aceita limpar cidade/uf com null', () => {
    const r = atualizarFilialSchema.safeParse({ cidade: null, uf: null });
    expect(r.success).toBe(true);
  });
});
