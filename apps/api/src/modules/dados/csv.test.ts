import { describe, expect, it } from 'vitest';
import { detectarSeparador, gerarCsv, lerCsv } from './csv';

describe('separador', () => {
  /** Excel pt-BR usa ";", planilha exportada em ingles usa ",". Aceitar os dois. */
  it('escolhe o mais frequente no cabecalho', () => {
    expect(detectarSeparador('nome;email;telefone')).toBe(';');
    expect(detectarSeparador('nome,email,telefone')).toBe(',');
  });

  it('empate vai para ponto e virgula (padrao da operacao)', () => {
    expect(detectarSeparador('nome;email,telefone')).toBe(';');
  });
});

describe('leitura', () => {
  it('usa a primeira linha como cabecalho, em minusculas', () => {
    const { colunas, linhas } = lerCsv('Nome;Email\nAna;ana@x.com');
    expect(colunas).toEqual(['nome', 'email']);
    expect(linhas).toEqual([{ nome: 'Ana', email: 'ana@x.com' }]);
  });

  /** BOM vem em todo CSV salvo pelo Excel; sem descartar, a primeira coluna some. */
  it('descarta o BOM do Excel', () => {
    expect(lerCsv('﻿nome;email\nAna;ana@x.com').colunas).toEqual(['nome', 'email']);
  });

  it('respeita separador dentro de aspas', () => {
    const { linhas } = lerCsv('nome;observacao\nAna;"cliente VIP; prioridade alta"');
    expect(linhas[0]?.observacao).toBe('cliente VIP; prioridade alta');
  });

  it('trata aspa escapada como aspa literal', () => {
    const { linhas } = lerCsv('nome;observacao\nAna;"disse ""urgente"" duas vezes"');
    expect(linhas[0]?.observacao).toBe('disse "urgente" duas vezes');
  });

  it('preenche coluna faltante com vazio em vez de deslocar', () => {
    const { linhas } = lerCsv('nome;email;telefone\nAna;ana@x.com');
    expect(linhas[0]).toEqual({ nome: 'Ana', email: 'ana@x.com', telefone: '' });
  });

  it('aceita CRLF, linha em branco e arquivo vazio', () => {
    expect(lerCsv('nome;email\r\nAna;ana@x.com\r\n\r\n').linhas).toHaveLength(1);
    expect(lerCsv('   ')).toEqual({ colunas: [], linhas: [] });
  });
});

describe('geracao', () => {
  it('sai com BOM, ponto e virgula e CRLF para abrir no Excel', () => {
    const csv = gerarCsv(['nome', 'email'], [{ nome: 'Ana', email: 'ana@x.com' }]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('nome;email\r\n');
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('escapa o que quebraria a planilha', () => {
    const csv = gerarCsv(['obs'], [{ obs: 'tem ; ponto e virgula' }, { obs: 'tem "aspas"' }]);
    expect(csv).toContain('"tem ; ponto e virgula"');
    expect(csv).toContain('"tem ""aspas"""');
  });

  it('nulo e indefinido viram campo vazio, data vira ISO', () => {
    const csv = gerarCsv(['a', 'b', 'c'], [{ a: null, b: undefined, c: new Date('2026-08-25T00:00:00Z') }]);
    expect(csv).toContain(';;2026-08-25T00:00:00.000Z');
  });

  /** Ida e volta: o que sai da exportacao tem de voltar na importacao. */
  it('sobrevive a ida e volta', () => {
    const original = [{ nome: 'Ana; Maria', email: 'ana@x.com' }];
    const { linhas } = lerCsv(gerarCsv(['nome', 'email'], original));
    expect(linhas).toEqual(original);
  });
});
