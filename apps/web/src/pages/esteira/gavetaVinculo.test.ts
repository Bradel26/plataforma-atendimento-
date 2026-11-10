import { describe, expect, it } from 'vitest';
import type { ColunaEsteira } from '../../lib/esteiraTypes';
import {
  agruparAuditoria,
  campoEditavel,
  formatarValorAuditado,
  proximoTriEstado,
  rotuloDoCampoAuditado,
} from './gavetaVinculo';

const COLUNAS: ColunaEsteira[] = [
  { chave: 'responsavel', rotulo: 'Responsável', tipo: 'texto', editavel: true, campo: 'responsavelId', padrao: true, ordenavel: true },
  { chave: 'vsm', rotulo: 'VSM', tipo: 'booleano3', editavel: true, campo: 'campos.vsm', padrao: true, ordenavel: true },
  { chave: 'ehParceiro', rotulo: 'Parceiro', tipo: 'booleano3', editavel: true, campo: 'campos.parceiro', padrao: false, ordenavel: true },
  {
    chave: 'vivensisStatus',
    rotulo: 'Vivensis',
    tipo: 'enum',
    opcoes: [{ valor: 'APROVADO', rotulo: 'Aprovado' }],
    editavel: true,
    campo: 'campos.vivensisStatus',
    padrao: true,
    ordenavel: true,
  },
  { chave: 'origem', rotulo: 'Origem', tipo: 'enum', editavel: false, padrao: false, ordenavel: true },
  { chave: 'primeiroContatoEm', rotulo: 'Primeiro contato', tipo: 'data', editavel: true, campo: 'campos.primeiroContatoEm', padrao: false, ordenavel: true },
];

describe('proximoTriEstado', () => {
  it('clicar no valor ativo volta a vazio; NULL nunca vira NÃO sozinho', () => {
    expect(proximoTriEstado(null, true)).toBe(true);
    expect(proximoTriEstado(true, true)).toBeNull();
    expect(proximoTriEstado(false, false)).toBeNull();
    expect(proximoTriEstado(true, false)).toBe(false);
    expect(proximoTriEstado(null, false)).toBe(false);
  });
});

describe('campoEditavel', () => {
  it('só campos com `editavel` na estrutura', () => {
    expect(campoEditavel(COLUNAS, 'vsm')).toBe(true);
    expect(campoEditavel(COLUNAS, 'parceiro')).toBe(true);
    expect(campoEditavel(COLUNAS, 'origem')).toBe(false);
    expect(campoEditavel(COLUNAS, 'inexistente')).toBe(false);
  });
});

describe('rotuloDoCampoAuditado', () => {
  const vendedores = [{ id: 'v1', nome: 'Ana' }];
  it('usa o rótulo da coluna pelo campo do PATCH', () => {
    expect(rotuloDoCampoAuditado('vsm', COLUNAS, vendedores)).toBe('VSM');
    expect(rotuloDoCampoAuditado('parceiro', COLUNAS, vendedores)).toBe('Parceiro');
    expect(rotuloDoCampoAuditado('responsavelId', COLUNAS, vendedores)).toBe('Responsável');
    expect(rotuloDoCampoAuditado('origem', COLUNAS, vendedores)).toBe('Origem');
    expect(rotuloDoCampoAuditado('motivoSituacao', COLUNAS, vendedores)).toBe('Motivo da situação');
    expect(rotuloDoCampoAuditado('_justificativa', COLUNAS, vendedores)).toBe('Justificativa');
  });
  it('vendedores do PDV pelo id', () => {
    expect(rotuloDoCampoAuditado('vendedores.v1.cpf', COLUNAS, vendedores)).toBe('Vendedor Ana: CPF');
    expect(rotuloDoCampoAuditado('vendedores.v9.status', COLUNAS, vendedores)).toBe('Vendedor (removido): Situação');
  });
});

describe('formatarValorAuditado', () => {
  const nomes = new Map([['u1', 'Bia']]);
  it('tri-estado, enum, data, responsável e vazio', () => {
    expect(formatarValorAuditado('vsm', null, COLUNAS, nomes)).toBe('—');
    expect(formatarValorAuditado('vsm', true, COLUNAS, nomes)).toBe('Sim');
    expect(formatarValorAuditado('vsm', false, COLUNAS, nomes)).toBe('Não');
    expect(formatarValorAuditado('vivensisStatus', 'APROVADO', COLUNAS, nomes)).toBe('Aprovado');
    expect(formatarValorAuditado('primeiroContatoEm', '2026-10-20T15:00:00.000Z', COLUNAS, nomes)).toBe('20/10/2026');
    expect(formatarValorAuditado('responsavelId', 'u1', COLUNAS, nomes)).toBe('Bia');
    expect(formatarValorAuditado('responsavelId', 'u2', COLUNAS, nomes)).toBe('Outro usuário');
    expect(formatarValorAuditado('vendedores.v1.status', 'INATIVO', COLUNAS, nomes)).toBe('Inativo');
    expect(formatarValorAuditado('statusDescritivo', 'ok', COLUNAS, nomes)).toBe('ok');
  });
});

describe('agruparAuditoria', () => {
  const linha = (id: string, campo: string, criadoEm: string, usuarioId: string | null = 'u1', para: unknown = true) => ({
    id,
    campo,
    de: null,
    para,
    usuarioId,
    criadoEm,
  });

  it('agrupa pelo mesmo instante e usuário e tira a justificativa das mudanças', () => {
    const grupos = agruparAuditoria([
      linha('a', 'vsm', '2026-10-26T10:00:00.000Z'),
      linha('b', '_justificativa', '2026-10-26T10:00:00.000Z', 'u1', 'Sem vendedor ainda'),
      linha('c', 'treinamento', '2026-10-26T10:00:00.000Z'),
      linha('d', 'vsm', '2026-10-25T10:00:00.000Z'),
      linha('e', 'mei', '2026-10-25T10:00:00.000Z', 'u2'),
    ]);
    expect(grupos.map((g) => [g.criadoEm, g.usuarioId, g.justificativa, g.mudancas.map((m) => m.id)])).toEqual([
      ['2026-10-26T10:00:00.000Z', 'u1', 'Sem vendedor ainda', ['a', 'c']],
      ['2026-10-25T10:00:00.000Z', 'u1', null, ['d']],
      ['2026-10-25T10:00:00.000Z', 'u2', null, ['e']],
    ]);
  });

  it('justificativa sozinha ainda forma um grupo', () => {
    const grupos = agruparAuditoria([linha('a', '_justificativa', '2026-10-26T10:00:00.000Z', 'u1', 'x')]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]!.justificativa).toBe('x');
    expect(grupos[0]!.mudancas).toEqual([]);
  });
});
