import { describe, expect, it } from 'vitest';
import { COLUNAS, ordenacaoDaColuna, valorDaColuna, valoresDaLinha, type FonteDaColuna } from './colunas';
import { CAMPOS_STARLINK_VAZIO } from './starlink';
import { CAMPOS_TIM_VAZIO } from './tim';

const base = {
  parceiro: {
    contatoId: 'c1',
    contaId: 'a1',
    nome: 'Loja do Zé',
    cnpj: '12345678000190',
    cpf: '12345678901',
    telefone: '62999990000',
    cidade: 'Goiânia',
    uf: 'GO',
  },
  responsavel: { id: 'u1', nome: 'Ana' },
  diasNaEtapa: 3,
  ultimaInteracaoEm: new Date('2026-10-22T10:00:00Z'),
  criadoEm: new Date('2026-10-01T10:00:00Z'),
  observacoes: null,
  situacao: 'EM_ANDAMENTO' as const,
};

const tim: FonteDaColuna = {
  ...base,
  operacao: 'TIM',
  etapa: { chave: 'TIM_POS_CRED', nome: 'Pós-credenciamento', tipo: 'NORMAL', diasParado: null },
  campos: { ...CAMPOS_TIM_VAZIO, dep: 'BRADEL', sistemaTimVendas: true, compraChip: 'CONCLUIDO', treinamento: 'CONCLUIDO' },
};

const starlink: FonteDaColuna = {
  ...base,
  operacao: 'STARLINK',
  etapa: { chave: 'SL_PARCEIRO', nome: 'Parceiro', tipo: 'NORMAL', diasParado: 10 },
  campos: { ...CAMPOS_STARLINK_VAZIO, parceiro: true, vsm: null, primeiroContatoEm: new Date('2026-10-02T00:00:00Z') },
};

describe('COLUNAS', () => {
  it('chaves únicas por operação, com as comuns nas duas', () => {
    for (const op of ['TIM', 'STARLINK'] as const) {
      const chaves = COLUNAS[op].map((c) => c.chave);
      expect(new Set(chaves).size).toBe(chaves.length);
      for (const comum of ['parceiro', 'cnpj', 'cpf', 'telefone', 'cidade', 'uf', 'responsavel', 'etapa', 'situacao', 'diasNaEtapa', 'ultimaInteracaoEm', 'criadoEm']) {
        expect(chaves).toContain(comum);
      }
    }
    expect(COLUNAS.TIM.map((c) => c.chave)).toContain('dep');
    expect(COLUNAS.STARLINK.map((c) => c.chave)).not.toContain('dep');
  });

  it('cadastro central não é editável aqui; responsável e campos da operação são', () => {
    const tim = Object.fromEntries(COLUNAS.TIM.map((c) => [c.chave, c]));
    for (const chave of ['parceiro', 'cnpj', 'cpf', 'telefone', 'cidade', 'uf', 'etapa', 'situacao', 'origem', 'statusParceria', 'vendaLiberada']) {
      expect(tim[chave]!.editavel).toBe(false);
    }
    expect(tim.responsavel).toMatchObject({ editavel: true, campo: 'responsavelId' });
    expect(tim.dep).toMatchObject({ editavel: true, campo: 'campos.dep' });
    const sl = Object.fromEntries(COLUNAS.STARLINK.map((c) => [c.chave, c]));
    expect(sl.vsm).toMatchObject({ editavel: true, tipo: 'booleano3', campo: 'campos.vsm' });
    // Boolean não nulo: dois estados.
    expect(tim.flagTrafegoPago).toMatchObject({ editavel: true, tipo: 'booleano', campo: 'campos.flagTrafegoPago' });
  });

  it('ordenável só onde há ordenação no banco', () => {
    for (const op of ['TIM', 'STARLINK'] as const) {
      for (const c of COLUNAS[op]) expect(ordenacaoDaColuna(op, c.chave, 'asc') != null).toBe(c.ordenavel);
    }
  });
});

describe('valorDaColuna', () => {
  it('comuns', () => {
    expect(valorDaColuna(tim, 'parceiro')).toBe('Loja do Zé');
    expect(valorDaColuna(tim, 'cnpj')).toBe('12345678000190');
    expect(valorDaColuna(tim, 'responsavel')).toBe('Ana');
    expect(valorDaColuna(tim, 'etapa')).toBe('Pós-credenciamento');
    expect(valorDaColuna(tim, 'situacao')).toBe('EM_ANDAMENTO');
    expect(valorDaColuna(tim, 'diasNaEtapa')).toBe(3);
    expect(valorDaColuna(tim, 'criadoEm')).toBe('2026-10-01T10:00:00.000Z');
    expect(valorDaColuna({ ...tim, responsavel: null }, 'responsavel')).toBeNull();
  });

  it('específicas: venda liberada calculada, tri-estado nulo continua nulo', () => {
    expect(valorDaColuna(tim, 'dep')).toBe('BRADEL');
    expect(valorDaColuna(tim, 'vendaLiberada')).toBe(true);
    expect(valorDaColuna(tim, 'sistemaGn')).toBeNull();
    expect(valorDaColuna(starlink, 'vsm')).toBeNull();
    expect(valorDaColuna(starlink, 'ehParceiro')).toBe(true);
    expect(valorDaColuna(starlink, 'primeiroContatoEm')).toBe('2026-10-02T00:00:00.000Z');
  });

  it('coluna de outra operação ou desconhecida é nula', () => {
    expect(valorDaColuna(starlink, 'dep')).toBeNull();
    expect(valorDaColuna(starlink, 'vendaLiberada')).toBeNull();
    expect(valorDaColuna(tim, 'naoExiste')).toBeNull();
  });

  it('linha já montada: lê os valores', () => {
    const valores = valoresDaLinha(starlink);
    expect(Object.keys(valores)).toEqual(COLUNAS.STARLINK.map((c) => c.chave));
    expect(valorDaColuna({ valores } as never, 'ehParceiro')).toBe(true);
    expect(valorDaColuna({ valores } as never, 'naoExiste')).toBeNull();
  });
});

describe('ordenacaoDaColuna', () => {
  it('colunas diretas, por relação e invertidas; sempre desempata pelo id', () => {
    expect(ordenacaoDaColuna('TIM', 'criadoEm', 'desc')).toEqual([{ criadoEm: 'desc' }, { id: 'desc' }]);
    expect(ordenacaoDaColuna('TIM', 'etapa', 'asc')).toEqual([{ estagio: { ordem: 'asc' } }, { id: 'asc' }]);
    expect(ordenacaoDaColuna('TIM', 'responsavel', 'asc')).toEqual([{ responsavel: { nome: 'asc' } }, { id: 'asc' }]);
    // Mais dias na etapa = entrou antes.
    expect(ordenacaoDaColuna('TIM', 'diasNaEtapa', 'desc')).toEqual([{ estagioDesde: 'asc' }, { id: 'desc' }]);
    expect(ordenacaoDaColuna('TIM', 'dep', 'asc')).toEqual([{ tim: { dep: 'asc' } }, { id: 'asc' }]);
    expect(ordenacaoDaColuna('STARLINK', 'ehParceiro', 'asc')).toEqual([{ starlink: { parceiro: 'asc' } }, { id: 'asc' }]);
  });

  it('não ordenável, desconhecida ou de outra operação: nulo', () => {
    expect(ordenacaoDaColuna('TIM', 'cnpj', 'asc')).toBeNull();
    expect(ordenacaoDaColuna('TIM', 'vendaLiberada', 'asc')).toBeNull();
    expect(ordenacaoDaColuna('TIM', 'vsm', 'asc')).toBeNull();
    expect(ordenacaoDaColuna('STARLINK', 'naoExiste', 'asc')).toBeNull();
  });
});
