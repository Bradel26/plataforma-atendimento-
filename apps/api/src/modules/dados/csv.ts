/**
 * Leitura e escrita de CSV sem dependencia externa.
 *
 * Excel em portugues abre CSV usando ";" como separador e espera BOM UTF-8 —
 * sem isso os acentos aparecem corrompidos. Por isso o padrao aqui e ";" e a
 * exportacao inclui BOM. A leitura aceita "," e ";".
 */

const BOM = '﻿';

export function detectarSeparador(linha: string): ';' | ',' {
  const pontoEVirgula = (linha.match(/;/g) ?? []).length;
  const virgula = (linha.match(/,/g) ?? []).length;
  return pontoEVirgula >= virgula ? ';' : ',';
}

/** Divide uma linha respeitando campos entre aspas duplas ("" escapa a aspa). */
function dividirLinha(linha: string, separador: string): string[] {
  const campos: string[] = [];
  let atual = '';
  let entreAspas = false;

  for (let i = 0; i < linha.length; i += 1) {
    const char = linha[i];

    if (char === '"') {
      if (entreAspas && linha[i + 1] === '"') {
        atual += '"';
        i += 1;
      } else {
        entreAspas = !entreAspas;
      }
      continue;
    }
    if (char === separador && !entreAspas) {
      campos.push(atual);
      atual = '';
      continue;
    }
    atual += char;
  }
  campos.push(atual);
  return campos.map((c) => c.trim());
}

export type LinhaCsv = Record<string, string>;

/** Converte o texto CSV em objetos, usando a primeira linha como cabecalho. */
export function lerCsv(texto: string): { colunas: string[]; linhas: LinhaCsv[] } {
  const limpo = texto.replace(/^﻿/, '').replace(/\r\n/g, '\n').trim();
  if (!limpo) return { colunas: [], linhas: [] };

  const linhasTexto = limpo.split('\n').filter((l) => l.trim().length > 0);
  const cabecalho = linhasTexto[0] ?? '';
  const separador = detectarSeparador(cabecalho);
  const colunas = dividirLinha(cabecalho, separador).map((c) => c.toLowerCase());

  const linhas = linhasTexto.slice(1).map((linha) => {
    const valores = dividirLinha(linha, separador);
    return Object.fromEntries(colunas.map((coluna, i) => [coluna, valores[i] ?? ''])) as LinhaCsv;
  });

  return { colunas, linhas };
}

const escapar = (valor: unknown): string => {
  if (valor === null || valor === undefined) return '';
  const texto = valor instanceof Date ? valor.toISOString() : String(valor);
  return /[";,\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
};

/** Gera o CSV com BOM e separador ";" para abrir direto no Excel pt-BR. */
export function gerarCsv(colunas: string[], linhas: Array<Record<string, unknown>>): string {
  const cabecalho = colunas.join(';');
  const corpo = linhas.map((linha) => colunas.map((c) => escapar(linha[c])).join(';'));
  return BOM + [cabecalho, ...corpo].join('\r\n') + '\r\n';
}
