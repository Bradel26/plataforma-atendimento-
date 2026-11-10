import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CAMPOS_STARLINK_ANTIGOS,
  NOMES_ANTIGOS,
  camposStarlinkDaEtapaAntiga,
  chaveDaEtapaAntiga,
  normalizarNomeDeEtapa,
  saidaDaExcecaoAntiga,
} from './migracao';

describe('chaveDaEtapaAntiga', () => {
  it('TIM: nomes antigos viram as chaves do catalogo', () => {
    expect(chaveDaEtapaAntiga('TIM', 'Em negociação')).toBe('TIM_NEGOCIACAO');
    expect(chaveDaEtapaAntiga('TIM', 'Credenciamento em andamento')).toBe('TIM_CRED_ANDAMENTO');
    expect(chaveDaEtapaAntiga('TIM', 'Credenciamento OK')).toBe('TIM_CRED_OK');
    expect(chaveDaEtapaAntiga('TIM', 'Apto para venda')).toBe('TIM_VENDA_LIBERADA');
  });
  it('compara sem acento, sem caixa e sem espacos sobrando', () => {
    expect(chaveDaEtapaAntiga('TIM', 'Documentação')).toBe('TIM_DOCUMENTACAO');
    expect(chaveDaEtapaAntiga('TIM', 'Documentacao')).toBe('TIM_DOCUMENTACAO');
    expect(chaveDaEtapaAntiga('TIM', '  DOCUMENTAÇÃO ')).toBe('TIM_DOCUMENTACAO');
    expect(chaveDaEtapaAntiga('TIM', 'Em  negociacao')).toBe('TIM_NEGOCIACAO');
  });
  it('Starlink: VSM, contrato e pronto para venda', () => {
    expect(chaveDaEtapaAntiga('STARLINK', 'Preencher o VSM')).toBe('SL_CREDENCIAMENTO');
    expect(chaveDaEtapaAntiga('STARLINK', 'Contrato assinado')).toBe('SL_CONTRATO');
    expect(chaveDaEtapaAntiga('STARLINK', 'Pronto para venda')).toBe('SL_PRONTO_VENDA');
  });
  it('"Treinamento realizado" nao tem etapa equivalente (o card e reposicionado pelo derivado)', () => {
    expect(chaveDaEtapaAntiga('STARLINK', 'Treinamento realizado')).toBeNull();
  });
  it('nome de outra operacao ou desconhecido devolve nulo', () => {
    expect(chaveDaEtapaAntiga('STARLINK', 'Apto para venda')).toBeNull();
    expect(chaveDaEtapaAntiga('TIM', 'Preencher o VSM')).toBeNull();
    expect(chaveDaEtapaAntiga('TIM', 'Novo cadastro')).toBeNull();
  });
});

describe('camposStarlinkDaEtapaAntiga', () => {
  it('retropreenche os campos para o derivado bater com a etapa antiga', () => {
    expect(camposStarlinkDaEtapaAntiga('Preencher o VSM')).toEqual({ cnpjApto: true });
    expect(camposStarlinkDaEtapaAntiga('Contrato assinado')).toEqual({ contrato: true });
    expect(camposStarlinkDaEtapaAntiga('Treinamento realizado')).toEqual({ contrato: true, treinamento: true });
    expect(camposStarlinkDaEtapaAntiga('Pronto para venda')).toEqual({ prontoVenda: true });
  });
  it('etapa desconhecida nao preenche nada', () => {
    expect(camposStarlinkDaEtapaAntiga('Novo cadastro')).toEqual({});
  });
});

describe('saidaDaExcecaoAntiga', () => {
  it('TIM: cancelado/reprovado antes de Credenciamento OK vira Desistencia', () => {
    expect(saidaDaExcecaoAntiga('TIM', 'CANCELADO', 2)).toEqual({ chave: 'TIM_DESISTENCIA', statusParceria: 'DESISTENTE' });
    expect(saidaDaExcecaoAntiga('TIM', 'REPROVADO', 3)).toEqual({ chave: 'TIM_DESISTENCIA', statusParceria: 'DESISTENTE' });
  });
  it('TIM: qualquer excecao a partir de Credenciamento OK vira Descredenciado', () => {
    expect(saidaDaExcecaoAntiga('TIM', 'REPROVADO', 5)).toEqual({ chave: 'TIM_DESCREDENCIADO', statusParceria: 'DESCREDENCIADO' });
    expect(saidaDaExcecaoAntiga('TIM', 'CANCELADO', 4)).toEqual({ chave: 'TIM_DESCREDENCIADO', statusParceria: 'DESCREDENCIADO' });
  });
  it('TIM: inativado vira Descredenciado em qualquer posicao', () => {
    expect(saidaDaExcecaoAntiga('TIM', 'INATIVADO', 1)).toEqual({ chave: 'TIM_DESCREDENCIADO', statusParceria: 'DESCREDENCIADO' });
  });
  it('TIM: etapa fora do trilho (sem chave) conta como antes de Credenciamento OK', () => {
    expect(saidaDaExcecaoAntiga('TIM', 'CANCELADO', null).chave).toBe('TIM_DESISTENCIA');
  });
  it('Starlink: sempre Descartado, perdido, motivo Outro, definitivo', () => {
    const esperado = { chave: 'SL_DESCARTADO', perdido: true, motivoPerda: 'OUTRO', classe: 'DEFINITIVO' };
    for (const situacao of ['REPROVADO', 'CANCELADO', 'INATIVADO'] as const) {
      expect(saidaDaExcecaoAntiga('STARLINK', situacao, 3)).toEqual(esperado);
      expect(saidaDaExcecaoAntiga('STARLINK', situacao, null)).toEqual(esperado);
    }
  });
});

describe('migration SQL espelha as tabelas de migracao.ts', () => {
  // A SQL nao importa TypeScript: este teste e o que impede as duas tabelas de divergirem.
  const sql = readFileSync(
    join(__dirname, '../../../prisma/migrations/20261023130000_esteiras_dados/migration.sql'),
    'utf8',
  );
  const linhas = sql.split('\n').map((l) => l.trim());

  it('cada nome antigo aparece com a mesma chave', () => {
    for (const [operacao, mapa] of Object.entries(NOMES_ANTIGOS)) {
      for (const [nome, chave] of Object.entries(mapa)) {
        expect(linhas.some((l) => l.includes(`'${operacao}'`) && l.includes(`'${nome}'`) && l.includes(`'${chave}'`))).toBe(true);
      }
    }
  });
  it('cada etapa antiga da Starlink retropreenche os mesmos campos', () => {
    const coluna = { cnpjApto: 'cnpj_apto', contrato: 'contrato', treinamento: 'treinamento', prontoVenda: 'pronto_venda' } as const;
    for (const [nome, campos] of Object.entries(CAMPOS_STARLINK_ANTIGOS)) {
      const linha = linhas.find((l) => l.startsWith(`('${nome}'`));
      expect(linha, nome).toBeDefined();
      // Ordem dos valores na SQL: (nome, cnpj_apto, contrato, treinamento, pronto_venda).
      const valores = linha!.replace(/[(),]/g, ' ').trim().split(/\s+/).slice(-4);
      const esperado = (['cnpjApto', 'contrato', 'treinamento', 'prontoVenda'] as const).map((c) =>
        campos[c] ? 'true' : 'NULL',
      );
      expect(valores, `${nome} (${Object.values(coluna).join(', ')})`).toEqual(esperado);
    }
  });
  it('duplicatas: o card sem excecao vence; entre iguais, o mais recente', () => {
    const sqlSemEspacos = sql.replace(/\s+/g, ' ');
    expect(sqlSemEspacos).toContain(
      'PARTITION BY "organizacao_id", "operacao", coalesce("conta_id", "contato_id") ORDER BY ("situacao_excecao" IS NULL) DESC, "atualizado_em" DESC',
    );
  });
  it('normaliza como a SQL: sem acento, minusculo, espacos colapsados', () => {
    expect(normalizarNomeDeEtapa('  Em   Negociação ')).toBe('em negociacao');
  });
});
