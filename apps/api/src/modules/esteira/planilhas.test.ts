import { describe, expect, it } from 'vitest';
import { COLUNAS, type VinculoLinha } from './colunas';
import {
  celulaDaPlanilha,
  cabecalhosDeExportacao,
  linhasDeExportacao,
  mapearCabecalhos,
  neutralizarFormula,
  validarLinha,
} from './planilhas';

const CNPJ_VALIDO = '11.222.333/0001-81';

const coluna = (operacao: 'TIM' | 'STARLINK', chave: string) => COLUNAS[operacao].find((c) => c.chave === chave)!;

const linha = (operacao: 'TIM' | 'STARLINK', valores: VinculoLinha['valores']): VinculoLinha => ({
  id: 'v1',
  operacao,
  parceiro: { contatoId: 'c1', contaId: null, nome: 'Loja', cnpj: null, cpf: null, telefone: null, cidade: null, uf: null },
  responsavel: null,
  etapa: { chave: null, nome: 'Etapa', tipo: 'NORMAL', diasParado: null },
  diasNaEtapa: 0,
  parado: false,
  ultimaInteracaoEm: new Date('2026-10-01T12:00:00Z'),
  etiquetas: [],
  valores,
});

describe('neutralizarFormula', () => {
  it('prefixa com aspa simples o texto que o Excel leria como fórmula', () => {
    for (const perigoso of ['=SOMA(A1)', '+5562999990000', '-1', '@usuario', '\tx', '\rx']) {
      expect(neutralizarFormula(perigoso)).toBe(`'${perigoso}`);
    }
  });
  it('não mexe no texto comum nem no vazio', () => {
    expect(neutralizarFormula('Loja do Zé')).toBe('Loja do Zé');
    expect(neutralizarFormula('')).toBe('');
    expect(neutralizarFormula('a=b')).toBe('a=b');
  });
});

describe('linhasDeExportacao', () => {
  it('tri-estado nulo vira vazio (nunca "Não") e falso vira "Não"', () => {
    const [l] = linhasDeExportacao([linha('STARLINK', { vsm: null, cnpjApto: false, mei: true })], [
      coluna('STARLINK', 'vsm'),
      coluna('STARLINK', 'cnpjApto'),
      coluna('STARLINK', 'mei'),
    ]);
    expect(l).toEqual({ vsm: '', cnpjApto: 'Não', mei: 'Sim' });
  });

  it('data em dd/mm/aaaa no fuso de Brasília, enum pelo rótulo e número como texto', () => {
    const [l] = linhasDeExportacao(
      [linha('TIM', { criadoEm: '2026-10-01T02:00:00.000Z', dep: 'BRADEL', diasNaEtapa: 4, parceiro: 'Loja' })],
      [coluna('TIM', 'criadoEm'), coluna('TIM', 'dep'), coluna('TIM', 'diasNaEtapa'), coluna('TIM', 'parceiro')],
    );
    // 02:00Z de 01/10 ainda é 30/09 em -03:00.
    expect(l).toEqual({ criadoEm: '30/09/2026', dep: 'Bradel', diasNaEtapa: '4', parceiro: 'Loja' });
  });
});

describe('cabecalhosDeExportacao', () => {
  it('rótulo repetido na mesma planilha ganha a chave entre parênteses', () => {
    const cab = cabecalhosDeExportacao([coluna('STARLINK', 'parceiro'), coluna('STARLINK', 'ehParceiro'), coluna('STARLINK', 'vsm')]);
    expect(cab).toEqual(['Parceiro', 'Parceiro (ehParceiro)', 'VSM']);
  });
});

describe('mapearCabecalhos', () => {
  it('casa por rótulo ou chave, sem acento nem caixa; desconhecido fica nulo', () => {
    expect(mapearCabecalhos(['CNPJ', 'Matrícula SAPPDV', 'xpto'], COLUNAS.TIM)).toEqual({
      CNPJ: 'cnpj',
      'Matrícula SAPPDV': 'matriculaSappdv',
      xpto: null,
    });
    expect(mapearCabecalhos(['matricula sappdv', 'MATRICULASAPPDV', 'responsavel'], COLUNAS.TIM)).toEqual({
      'matricula sappdv': 'matriculaSappdv',
      MATRICULASAPPDV: 'matriculaSappdv',
      responsavel: 'responsavel',
    });
  });

  it('só colunas importáveis: as calculadas e as mantidas pelo sistema ficam nulas', () => {
    expect(mapearCabecalhos(['Venda liberada', 'Dias na etapa', 'Situação', 'Status da parceria', 'Origem'], COLUNAS.TIM)).toEqual({
      'Venda liberada': null,
      'Dias na etapa': null,
      Situação: null,
      'Status da parceria': null,
      Origem: null,
    });
  });

  it('Starlink: "Parceiro" é o nome; o tri-estado vem como "Parceiro (ehParceiro)"', () => {
    expect(mapearCabecalhos(['Parceiro', 'Parceiro (ehParceiro)'], COLUNAS.STARLINK)).toEqual({
      Parceiro: 'parceiro',
      'Parceiro (ehParceiro)': 'ehParceiro',
    });
  });
});

describe('validarLinha', () => {
  const validar = (operacao: 'TIM' | 'STARLINK', bruta: Record<string, string>) =>
    validarLinha(operacao, bruta, mapearCabecalhos(Object.keys(bruta), COLUNAS[operacao]));

  it('sem CNPJ, CPF e telefone: erro', () => {
    const r = validar('TIM', { Parceiro: 'Loja do Zé', Cidade: 'Goiânia' });
    expect(r.erros).toContain('Informe CNPJ, CPF ou telefone');
  });

  it('UF inválida: erro', () => {
    const r = validar('TIM', { Parceiro: 'Loja', Telefone: '62999990000', UF: 'XX' });
    expect(r.erros.some((e) => e.includes('UF inválida'))).toBe(true);
    expect(validar('TIM', { Parceiro: 'Loja', Telefone: '62999990000', UF: 'go' }).parceiro.uf).toBe('GO');
  });

  it('documentos só com dígitos; CNPJ inválido é erro', () => {
    const r = validar('TIM', { Parceiro: 'Loja', CNPJ: CNPJ_VALIDO, CPF: '123.456.789-01', Telefone: '(62) 99999-0000' });
    expect(r.erros).toEqual([]);
    expect(r.parceiro).toMatchObject({ cnpj: '11222333000181', cpf: '12345678901', telefone: '(62) 99999-0000', nome: 'Loja' });
    expect(validar('TIM', { CNPJ: '11.222.333/0001-82' }).erros.some((e) => e.includes('CNPJ'))).toBe(true);
  });

  it('enum aceito sem acento/caixa, pelo valor ou rótulo', () => {
    expect(validar('TIM', { CNPJ: CNPJ_VALIDO, DEP: 'parceiro' }).campos).toEqual({ dep: 'PARCEIRO' });
    expect(validar('TIM', { CNPJ: CNPJ_VALIDO, 'Compra de chip': 'concluído' }).campos).toEqual({ compraChip: 'CONCLUIDO' });
    expect(validar('TIM', { CNPJ: CNPJ_VALIDO, DEP: 'outro' }).erros.some((e) => e.includes('DEP'))).toBe(true);
  });

  it('Starlink: coluna da TIM é ignorada com aviso, sem erro', () => {
    const r = validar('STARLINK', { Telefone: '62999990000', DEP: 'TIM', VSM: 'sim' });
    expect(r.erros).toEqual([]);
    expect(r.campos).toEqual({ vsm: true });
    expect(r.avisos.some((a) => a.includes('DEP'))).toBe(true);
  });

  it('mapa informado apontando para campo da outra operação: aviso, não erro', () => {
    const r = validarLinha('STARLINK', { 'Quem trava': 'TIM', Fone: '62999990000' }, { 'Quem trava': 'dep', Fone: 'telefone' });
    expect(r.erros).toEqual([]);
    expect(r.campos).toEqual({});
    expect(r.avisos).toHaveLength(1);
  });

  it('tri-estado: Sim/Não; vazio não informa; valor estranho é erro', () => {
    const r = validar('STARLINK', { Telefone: '62999990000', VSM: 'Não', MEI: 'S', 'CNPJ apto': '', Contrato: 'talvez' });
    expect(r.campos).toEqual({ vsm: false, mei: true });
    expect(r.erros.some((e) => e.includes('Contrato'))).toBe(true);
  });

  it('o tri-estado "Parceiro" da Starlink vai para o campo `parceiro`', () => {
    const r = validar('STARLINK', { Parceiro: 'Loja', 'Parceiro (ehParceiro)': 'sim', Telefone: '62999990000' });
    expect(r.parceiro.nome).toBe('Loja');
    expect(r.campos).toEqual({ parceiro: true });
  });

  it('data dd/mm/aaaa vira o início do dia em -03:00; data inválida é erro', () => {
    const r = validar('TIM', { CNPJ: CNPJ_VALIDO, 'Data do credenciamento': '05/10/2026' });
    expect((r.campos as { dataCredenciamento: Date }).dataCredenciamento.toISOString()).toBe('2026-10-05T03:00:00.000Z');
    expect(validar('TIM', { CNPJ: CNPJ_VALIDO, 'Data do credenciamento': '31/02/2026' }).erros).toHaveLength(1);
  });

  it('etapa pelo nome do catálogo ou pela chave; desconhecida é erro', () => {
    expect(validar('TIM', { CNPJ: CNPJ_VALIDO, Etapa: 'credenciamento ok' }).etapa).toBe('TIM_CRED_OK');
    expect(validar('TIM', { CNPJ: CNPJ_VALIDO, Etapa: 'TIM_POS_CRED' }).etapa).toBe('TIM_POS_CRED');
    expect(validar('TIM', { CNPJ: CNPJ_VALIDO, Etapa: 'SL_CONTRATO' }).erros.some((e) => e.includes('Etapa'))).toBe(true);
    // Nome renomeado pela organização.
    const r = validarLinha('TIM', { CNPJ: CNPJ_VALIDO, Etapa: 'Liberado!' }, { CNPJ: 'cnpj', Etapa: 'etapa' }, {
      etapasPorNome: { 'Liberado!': 'TIM_VENDA_LIBERADA' },
    });
    expect(r.etapa).toBe('TIM_VENDA_LIBERADA');
  });

  it('responsável: e-mail ou nome', () => {
    expect(validar('TIM', { CNPJ: CNPJ_VALIDO, Responsável: 'ana@bradel.com.br' }).responsavelEmail).toBe('ana@bradel.com.br');
    expect(validar('TIM', { CNPJ: CNPJ_VALIDO, Responsável: 'Ana Souza' }).responsavelNome).toBe('Ana Souza');
  });

  it('desfaz a aspa que a exportação pôs contra fórmula', () => {
    const r = validar('TIM', { Telefone: "'+5562999990000", 'Status (aceite comercial)': "'-aceito" });
    expect(r.parceiro.telefone).toBe('+5562999990000');
    expect(r.campos).toEqual({ statusDescritivo: '-aceito' });
  });
});

describe('celulaDaPlanilha', () => {
  it('converte o valor da célula XLSX em texto', () => {
    expect(celulaDaPlanilha(null)).toBe('');
    expect(celulaDaPlanilha('  x ')).toBe('x');
    expect(celulaDaPlanilha(62999990000)).toBe('62999990000');
    expect(celulaDaPlanilha(true)).toBe('Sim');
    expect(celulaDaPlanilha(new Date(Date.UTC(2026, 9, 5)))).toBe('05/10/2026');
    expect(celulaDaPlanilha({ richText: [{ text: 'Lo' }, { text: 'ja' }] })).toBe('Loja');
    expect(celulaDaPlanilha({ formula: 'A1', result: 'ok' })).toBe('ok');
    expect(celulaDaPlanilha({ text: 'site', hyperlink: 'http://x' })).toBe('site');
  });
});
