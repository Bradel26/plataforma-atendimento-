import { describe, expect, it } from 'vitest';
import { diferencas, diferencasDoVendedor, valorAuditavel } from './auditoria';

describe('diferencas', () => {
  it('datas iguais em instâncias diferentes não são diferença', () => {
    const antes = { dataCredenciamento: new Date('2026-10-23T12:00:00Z') };
    const depois = { dataCredenciamento: new Date('2026-10-23T12:00:00Z') };
    expect(diferencas(antes, depois)).toEqual([]);
  });

  it('datas diferentes são diferença', () => {
    const de = new Date('2026-10-22T12:00:00Z');
    const para = new Date('2026-10-23T12:00:00Z');
    expect(diferencas({ primeiroContatoEm: de }, { primeiroContatoEm: para })).toEqual([
      { campo: 'primeiroContatoEm', de, para },
    ]);
  });

  it('null → false é diferença (tri-estado: NULL nunca é NÃO)', () => {
    expect(diferencas({ cnpjApto: null }, { cnpjApto: false })).toEqual([{ campo: 'cnpjApto', de: null, para: false }]);
  });

  it('null e undefined não são mudança', () => {
    expect(diferencas({ dep: null }, { dep: undefined })).toEqual([]);
    expect(diferencas({ dep: undefined }, { dep: null })).toEqual([]);
    expect(diferencas({}, { dep: null })).toEqual([]);
  });

  it('chave ausente no depois é ignorada', () => {
    expect(diferencas({ matriculaSappdv: '123', dep: 'TIM' }, { dep: 'TIM' })).toEqual([]);
  });

  it('chave com undefined no depois é "não informado", não limpeza', () => {
    expect(diferencas({ matriculaSappdv: '123' }, { matriculaSappdv: undefined })).toEqual([]);
  });

  it('lista uma linha por campo alterado, na ordem do depois', () => {
    expect(
      diferencas(
        { sistemaGn: null, compraChip: 'PENDENTE', observacoes: 'a' },
        { compraChip: 'CONCLUIDO', sistemaGn: true, observacoes: 'a' },
      ),
    ).toEqual([
      { campo: 'compraChip', de: 'PENDENTE', para: 'CONCLUIDO' },
      { campo: 'sistemaGn', de: null, para: true },
    ]);
  });

  it('valor limpo vira null no "para"', () => {
    expect(diferencas({ responsavelId: 'u1' }, { responsavelId: null })).toEqual([{ campo: 'responsavelId', de: 'u1', para: null }]);
  });
});

describe('valorAuditavel', () => {
  it('data vira ISO, undefined vira null, o resto passa', () => {
    expect(valorAuditavel(new Date('2026-10-23T12:00:00Z'))).toBe('2026-10-23T12:00:00.000Z');
    expect(valorAuditavel(undefined)).toBeNull();
    expect(valorAuditavel(null)).toBeNull();
    expect(valorAuditavel(false)).toBe(false);
    expect(valorAuditavel('CONCLUIDO')).toBe('CONCLUIDO');
  });
});

describe('diferencasDoVendedor', () => {
  it('vendedor novo: uma linha por campo preenchido, prefixada pelo id', () => {
    expect(diferencasDoVendedor('v1', null, { nome: 'Ana', cpf: '12345678901', telefone: null, status: 'ATIVO' })).toEqual([
      { campo: 'vendedores.v1.nome', de: null, para: 'Ana' },
      { campo: 'vendedores.v1.cpf', de: null, para: '12345678901' },
      { campo: 'vendedores.v1.status', de: null, para: 'ATIVO' },
    ]);
  });

  it('vendedor existente: só o que mudou', () => {
    expect(
      diferencasDoVendedor(
        'v1',
        { nome: 'Ana', cpf: null, telefone: null, status: 'ATIVO' },
        { nome: 'Ana', cpf: null, telefone: null, status: 'INATIVO' },
      ),
    ).toEqual([{ campo: 'vendedores.v1.status', de: 'ATIVO', para: 'INATIVO' }]);
  });
});
