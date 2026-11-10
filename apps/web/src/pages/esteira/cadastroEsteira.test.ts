import { describe, expect, it } from 'vitest';
import type { ColunaEsteira, ResultadoImportacao, VinculoLinha } from '../../lib/esteiraTypes';
import {
  cabecalhosIgnorados,
  colunasImportaveis,
  corpoNovoParceiro,
  formatarDocumento,
  linhasComProblema,
  operacoesComEdicao,
  operacoesParaAdicionar,
  presencaNasOperacoes,
  textoDoResumo,
  validarDocumento,
} from './cadastroEsteira';

const linha = (id: string, parceiro: Partial<VinculoLinha['parceiro']>): VinculoLinha => ({
  id,
  operacao: 'TIM',
  parceiro: { contatoId: 'c', contaId: null, nome: 'Loja', cnpj: null, cpf: null, telefone: null, cidade: null, uf: null, ...parceiro },
  responsavel: null,
  etapa: { chave: 'TIM_NEGOCIACAO', nome: 'Negociação', tipo: 'NORMAL', diasParado: 7 },
  diasNaEtapa: 1,
  parado: false,
  ultimaInteracaoEm: '2026-10-26T12:00:00Z',
  etiquetas: [],
  valores: {},
});

const coluna = (chave: string, campo?: string): ColunaEsteira => ({
  chave,
  rotulo: chave,
  tipo: 'texto',
  editavel: false,
  padrao: true,
  ordenavel: false,
  ...(campo ? { campo } : {}),
});

describe('validarDocumento', () => {
  it('CNPJ: 14 dígitos com dígito verificador', () => {
    expect(validarDocumento('CNPJ', '11.222.333/0001-81')).toBeNull();
    expect(validarDocumento('CNPJ', '11.222.333/0001-80')).toBe('Informe um CNPJ válido');
    expect(validarDocumento('CNPJ', '11111111111111')).toBe('Informe um CNPJ válido');
  });

  it('CPF: 11 dígitos', () => {
    expect(validarDocumento('CPF', '123.456.789-09')).toBeNull();
    expect(validarDocumento('CPF', '1234')).toBe('Informe um CPF válido');
  });

  it('telefone: com DDD (10 a 13 dígitos)', () => {
    expect(validarDocumento('TELEFONE', '(62) 99999-0000')).toBeNull();
    expect(validarDocumento('TELEFONE', '9999-0000')).toBe('Informe o telefone com DDD');
  });
});

describe('formatarDocumento', () => {
  it('formata CNPJ e CPF; telefone fica como digitado', () => {
    expect(formatarDocumento('CNPJ', '11222333000181')).toBe('11.222.333/0001-81');
    expect(formatarDocumento('CPF', '12345678909')).toBe('123.456.789-09');
    expect(formatarDocumento('TELEFONE', '62999990000')).toBe('62999990000');
  });
});

describe('presencaNasOperacoes', () => {
  it('só conta quem tem o documento exato (a busca da Lista casa por trecho)', () => {
    const r = presencaNasOperacoes('CNPJ', '11222333000181', {
      TIM: [linha('a', { cnpj: '11222333000181' }), linha('b', { cnpj: '911222333000181' })],
      STARLINK: [],
    });
    expect(r.map((p) => [p.operacao, p.vinculo.id])).toEqual([['TIM', 'a']]);
  });

  it('CPF exato', () => {
    const r = presencaNasOperacoes('CPF', '12345678909', { STARLINK: [linha('s', { cpf: '12345678909' }), linha('t', { cpf: '12345678900' })] });
    expect(r.map((p) => p.vinculo.id)).toEqual(['s']);
  });

  it('telefone casa com ou sem o 55 do país', () => {
    const r = presencaNasOperacoes('TELEFONE', '62999990000', {
      TIM: [linha('a', { telefone: '+55 (62) 99999-0000' })],
      STARLINK: [linha('b', { telefone: '6299999000' })],
    });
    expect(r.map((p) => p.vinculo.id)).toEqual(['a']);
  });

  it('ordem fixa TIM → Starlink', () => {
    const r = presencaNasOperacoes('CPF', '12345678909', {
      STARLINK: [linha('s', { cpf: '12345678909' })],
      TIM: [linha('t', { cpf: '12345678909' })],
    });
    expect(r.map((p) => p.operacao)).toEqual(['TIM', 'STARLINK']);
  });
});

describe('corpoNovoParceiro', () => {
  const base = {
    tipo: 'CNPJ' as const,
    documento: '11.222.333/0001-81',
    nome: '  Maria  ',
    empresa: 'Loja da Maria',
    telefone: '',
    email: '',
    cidade: 'Goiânia',
    uf: 'go',
    responsavelId: '',
    observacoes: '',
    tipoCaptacao: 'LEAD_INBOUND' as const,
  };

  it('documento vai no campo do tipo; vazios ficam de fora; captação só na Starlink', () => {
    expect(corpoNovoParceiro('TIM', base)).toEqual({
      cnpj: '11222333000181',
      nome: 'Maria',
      empresa: 'Loja da Maria',
      cidade: 'Goiânia',
      uf: 'GO',
    });
    expect(corpoNovoParceiro('STARLINK', base).tipoCaptacao).toBe('LEAD_INBOUND');
  });

  it('CPF e telefone', () => {
    expect(corpoNovoParceiro('TIM', { ...base, tipo: 'CPF', documento: '123.456.789-09', telefone: '62 99999-0000', empresa: '' })).toMatchObject({
      cpf: '12345678909',
      telefone: '62 99999-0000',
    });
    expect(corpoNovoParceiro('TIM', { ...base, tipo: 'TELEFONE', documento: '(62) 99999-0000', telefone: 'ignorado' }).telefone).toBe(
      '(62) 99999-0000',
    );
  });

  it('empresa só acompanha CNPJ (sem CNPJ não há conta nova)', () => {
    expect(corpoNovoParceiro('TIM', { ...base, tipo: 'CPF', documento: '12345678909' }).empresa).toBeUndefined();
  });

  it('responsável e observações quando preenchidos', () => {
    const id = '7b0f9a52-3f7e-4a43-9a51-6c1f4f0d2c11';
    expect(corpoNovoParceiro('TIM', { ...base, responsavelId: id, observacoes: ' veio da feira ' })).toMatchObject({
      responsavelId: id,
      observacoes: 'veio da feira',
    });
  });
});

describe('importação', () => {
  it('colunas importáveis: comuns do cadastro/etapa/responsável e campos da operação', () => {
    const colunas = [
      coluna('parceiro'),
      coluna('cnpj'),
      coluna('etapa'),
      coluna('responsavel', 'responsavelId'),
      coluna('diasNaEtapa'),
      coluna('dep', 'campos.dep'),
      coluna('ultimaInteracao'),
    ];
    expect(colunasImportaveis(colunas).map((c) => c.chave)).toEqual(['parceiro', 'cnpj', 'etapa', 'responsavel', 'dep']);
  });

  it('cabeçalhos sem destino', () => {
    expect(cabecalhosIgnorados({ CNPJ: 'cnpj', Obs: null, Extra: null })).toEqual(['Obs', 'Extra']);
  });

  const resultado: ResultadoImportacao = {
    cabecalhos: ['CNPJ'],
    mapa: { CNPJ: 'cnpj' },
    total: 5,
    validas: 3,
    criadas: 2,
    atualizadas: 1,
    erros: [
      { linha: 4, erros: ['Informe um CNPJ válido'] },
      { linha: 2, erros: ['Etapa desconhecida'] },
    ],
    avisos: [{ linha: 4, avisos: ['Coluna da Starlink ignorada'] }, { linha: 3, avisos: ['x'] }],
  };

  it('erros e avisos juntos por linha, em ordem', () => {
    expect(linhasComProblema(resultado)).toEqual([
      { linha: 2, erros: ['Etapa desconhecida'], avisos: [] },
      { linha: 3, erros: [], avisos: ['x'] },
      { linha: 4, erros: ['Informe um CNPJ válido'], avisos: ['Coluna da Starlink ignorada'] },
    ]);
  });

  it('resumo da prévia e da gravação', () => {
    expect(textoDoResumo(resultado, true)).toBe('5 linhas: 2 serão criadas, 1 será atualizada, 2 com erro (não serão gravadas).');
    expect(textoDoResumo(resultado, false)).toBe('Importação concluída: 2 criadas, 1 atualizada, 2 com erro.');
    expect(textoDoResumo({ ...resultado, total: 1, criadas: 1, atualizadas: 0, erros: [] }, false)).toBe(
      'Importação concluída: 1 criada, 0 atualizadas, 0 com erro.',
    );
  });
});

describe('operações', () => {
  it('com edição, em ordem fixa', () => {
    expect(operacoesComEdicao({ STARLINK: 'EDICAO', TIM: 'LEITURA' })).toEqual(['STARLINK']);
    expect(operacoesComEdicao({ STARLINK: 'EDICAO', TIM: 'EDICAO' })).toEqual(['TIM', 'STARLINK']);
    expect(operacoesComEdicao(undefined)).toEqual([]);
  });

  it('para adicionar: com edição e ainda sem vínculo', () => {
    expect(operacoesParaAdicionar({ TIM: 'EDICAO', STARLINK: 'EDICAO' }, ['TIM'])).toEqual(['STARLINK']);
    expect(operacoesParaAdicionar({ TIM: 'EDICAO', STARLINK: 'LEITURA' }, [])).toEqual(['TIM']);
  });
});
