/**
 * Leitura do arquivo da importação (CSV e XLSX) — sem banco, testável em memória.
 *
 * O XLSX é um ZIP vindo do usuário: antes de entregá-lo ao exceljs, o conteúdo
 * é descompactado de verdade (zlib, com teto de saída) entrada por entrada,
 * seguindo os cabeçalhos locais — o tamanho declarado no diretório central
 * pode ser forjado. Na leitura, limites
 * de linhas lidas (inclusive vazias), de colunas e de tamanho de célula.
 */
import { inflateRawSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import { badRequest } from '../../lib/errors';
import { lerCsv } from '../dados/csv';
import { celulaDaPlanilha, numerosDasLinhasCsv, tamanhoDescompactadoDoZip } from './planilhas';

/** Linhas de dados (não vazias) aceitas num arquivo. */
export const LIMITE_IMPORTACAO_LINHAS = 2_000;
/** Linhas que o leitor XLSX percorre, inclusive vazias (planilha com milhões de linhas em branco). */
export const LIMITE_LINHAS_LIDAS_XLSX = 20_000;
/** Teto do conteúdo descompactado do XLSX (defesa contra "zip bomb"). */
export const LIMITE_XLSX_DESCOMPACTADO = 50 * 1024 * 1024;
/** Colunas por linha e caracteres por célula no XLSX. */
export const LIMITE_COLUNAS_XLSX = 100;
export const LIMITE_CELULA_XLSX = 10_000;

/** Linha de dados com o número dela na planilha (contando cabeçalho e linhas em branco puladas). */
export type LinhaBruta = { numero: number; valores: Record<string, string> };
export type Planilha = { cabecalhos: string[]; linhas: LinhaBruta[] };

const grandeDemais = () => badRequest('Planilha grande demais; divida em arquivos menores');
const linhasDemais = () =>
  badRequest(`A planilha passa de ${LIMITE_IMPORTACAO_LINHAS.toLocaleString('pt-BR')} linhas; divida em arquivos menores`);
const xlsxIlegivel = () => badRequest('Não foi possível ler o arquivo XLSX');

// ---------------------------------------------------------------------------
// ZIP: bytes realmente descompactados
// ---------------------------------------------------------------------------

/**
 * Descompacta cada entrada do ZIP seguindo os cabeçalhos locais (como o
 * `unzipper` do exceljs faz), somando a saída real. Para assim que a soma passa
 * do limite (o zlib corta a saída em `maxOutputLength`).
 * 'GRANDE': passou do limite; 'INVALIDO': ZIP que não dá para percorrer.
 */
export function conferirDescompactado(zip: Buffer, limite: number): 'OK' | 'GRANDE' | 'INVALIDO' {
  const CABECALHO_LOCAL = 0x04034b50;
  const DESCRITOR = 0x08074b50;
  let posicao = 0;
  let total = 0;
  let entradas = 0;
  while (posicao + 4 <= zip.length && zip.readUInt32LE(posicao) === CABECALHO_LOCAL) {
    if (posicao + 30 > zip.length) return 'INVALIDO';
    const flags = zip.readUInt16LE(posicao + 6);
    const metodo = zip.readUInt16LE(posicao + 8);
    const compactado = zip.readUInt32LE(posicao + 18);
    const inicio = posicao + 30 + zip.readUInt16LE(posicao + 26) + zip.readUInt16LE(posicao + 28);
    const comDescritor = (flags & 0x08) !== 0;
    if (inicio > zip.length || compactado === 0xffffffff) return 'INVALIDO';

    let consumidos: number;
    if (metodo === 0) {
      // Guardado sem compressão: o tamanho tem de vir no cabeçalho local.
      if (comDescritor) return 'INVALIDO';
      consumidos = compactado;
      total += compactado;
    } else if (metodo === 8) {
      const restante = limite - total;
      try {
        const { buffer, engine } = inflateRawSync(zip.subarray(inicio), { info: true, maxOutputLength: restante + 1 }) as unknown as {
          buffer: Buffer;
          engine: { bytesWritten: number };
        };
        total += buffer.length;
        consumidos = engine.bytesWritten;
      } catch (erro) {
        // Saída acima de `maxOutputLength`: passou do limite.
        if (erro instanceof RangeError || (erro as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE') return 'GRANDE';
        return 'INVALIDO';
      }
    } else {
      return 'INVALIDO';
    }
    if (total > limite) return 'GRANDE';

    posicao = inicio + consumidos;
    if (comDescritor) {
      if (posicao + 4 <= zip.length && zip.readUInt32LE(posicao) === DESCRITOR) posicao += 4;
      posicao += 12; // crc + tamanhos (32 bits; ZIP64 não é aceito)
    }
    entradas += 1;
  }
  return entradas > 0 ? 'OK' : 'INVALIDO';
}

// ---------------------------------------------------------------------------
// Limites da leitura linha a linha
// ---------------------------------------------------------------------------

/** Contador da leitura do XLSX: lança ao passar de linhas lidas, colunas ou tamanho de célula. */
export function contadorDeLeitura(limites = {
  linhasLidas: LIMITE_LINHAS_LIDAS_XLSX,
  colunas: LIMITE_COLUNAS_XLSX,
  celula: LIMITE_CELULA_XLSX,
}) {
  let lidas = 0;
  return {
    /** Toda linha que o leitor entrega, vazia ou não; `colunas` = última coluna preenchida. */
    linha(colunas: number) {
      lidas += 1;
      if (lidas > limites.linhasLidas) throw grandeDemais();
      if (colunas > limites.colunas) throw badRequest(`A planilha passa de ${limites.colunas} colunas`);
    },
    celula(texto: string): string {
      if (texto.length > limites.celula) {
        throw badRequest(`Uma célula passa de ${limites.celula.toLocaleString('pt-BR')} caracteres`);
      }
      return texto;
    },
  };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Texto do CSV: UTF-8; se não for (Excel salvando em Windows-1252), Latin-1. */
function textoDoCsv(buffer: Buffer): string {
  const utf8 = buffer.toString('utf8');
  return utf8.includes('\uFFFD') ? buffer.toString('latin1') : utf8;
}

function lerCsvNumerado(buffer: Buffer): Planilha {
  const texto = textoDoCsv(buffer);
  const { colunas, linhas } = lerCsv(texto);
  if (linhas.length > LIMITE_IMPORTACAO_LINHAS) throw linhasDemais();
  const numeros = numerosDasLinhasCsv(texto);
  return { cabecalhos: colunas, linhas: linhas.map((valores, i) => ({ numero: numeros[i] ?? i + 2, valores })) };
}

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

/**
 * Primeira aba do XLSX; a primeira linha com valor é o cabeçalho; linhas vazias
 * são puladas (e contadas). Antes de abrir: tamanho declarado no diretório
 * central e bytes realmente descompactados (até 50 MB) — é esse teto que limita
 * a memória do `load`.
 *
 * Por que não o leitor em streaming do exceljs (`stream.xlsx.WorkbookReader`):
 * na 4.4.0 ele é não determinístico — conforme a ordem em que o unzipper entrega
 * as entradas, as células de texto saem como `{ sharedString: n }` em vez do texto
 * (no teste, em ~2 de cada 3 leituras do MESMO arquivo), o que apagaria dados em
 * silêncio. Ele também quebra lendo campos internos (`model`, `properties`) quando
 * a aba vem antes de `xl/workbook.xml`. Coberto por `leituraPlanilha.test.ts`
 * ("lê o XLSX que o próprio exceljs escreve"): ao atualizar o exceljs, rode-o.
 */
async function lerXlsx(buffer: Buffer): Promise<Planilha> {
  const declarado = tamanhoDescompactadoDoZip(buffer);
  if (declarado == null) throw xlsxIlegivel();
  if (declarado > LIMITE_XLSX_DESCOMPACTADO) throw grandeDemais();
  const real = conferirDescompactado(buffer, LIMITE_XLSX_DESCOMPACTADO);
  if (real === 'GRANDE') throw grandeDemais();
  if (real === 'INVALIDO') throw xlsxIlegivel();

  const livro = new ExcelJS.Workbook();
  try {
    await livro.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw xlsxIlegivel();
  }
  const planilha = livro.worksheets[0];
  if (!planilha) return { cabecalhos: [], linhas: [] };

  const contador = contadorDeLeitura();
  const colunas: Array<{ indice: number; cabecalho: string }> = [];
  const linhas: LinhaBruta[] = [];
  let cabecalhoLido = false;
  planilha.eachRow({ includeEmpty: false }, (row) => {
    contador.linha(row.cellCount);
    if (!cabecalhoLido) {
      cabecalhoLido = true;
      row.eachCell({ includeEmpty: false }, (celula, indice) => {
        const cabecalho = contador.celula(celulaDaPlanilha(celula.value));
        if (cabecalho && !colunas.some((c) => c.cabecalho === cabecalho)) colunas.push({ indice, cabecalho });
      });
      return;
    }
    const valores = Object.fromEntries(
      colunas.map((c) => [c.cabecalho, contador.celula(celulaDaPlanilha(row.getCell(c.indice).value))]),
    );
    if (!Object.values(valores).some((v) => v !== '')) return;
    linhas.push({ numero: row.number, valores });
    if (linhas.length > LIMITE_IMPORTACAO_LINHAS) throw linhasDemais();
  });
  return { cabecalhos: colunas.map((c) => c.cabecalho), linhas };
}

/** CSV ou XLSX pela extensão; outra extensão, ou sem cabeçalho (1ª aba vazia) → 400. */
export async function lerArquivo(arquivo: { buffer: Buffer; nome: string }): Promise<Planilha> {
  const extensao = arquivo.nome.toLowerCase().split('.').pop();
  let planilha: Planilha;
  if (extensao === 'xlsx') planilha = await lerXlsx(arquivo.buffer);
  else if (extensao === 'csv') planilha = lerCsvNumerado(arquivo.buffer);
  else throw badRequest('Envie um arquivo .csv ou .xlsx');
  if (planilha.cabecalhos.length === 0) throw badRequest('A planilha está vazia ou sem cabeçalho');
  return planilha;
}
