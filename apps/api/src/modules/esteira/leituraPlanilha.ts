/**
 * Leitura do arquivo da importação (CSV e XLSX) — sem banco, testável em memória.
 *
 * O XLSX é um ZIP vindo do usuário: antes de entregá-lo ao exceljs, o conteúdo
 * é descompactado de verdade, com teto, pelo MESMO caminho que o exceljs usa
 * (JSZip, pelo diretório central) — o tamanho declarado no ZIP pode ser forjado.
 * Na leitura, limites de linhas lidas, de colunas e de tamanho de célula.
 */
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
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
// ZIP: bytes realmente descompactados, pelo mesmo caminho do exceljs
// ---------------------------------------------------------------------------

export type MedicaoDoZip = {
  resultado: 'OK' | 'GRANDE' | 'INVALIDO';
  /** Bytes descompactados efetivamente lidos até a decisão (para provar que o teto aborta cedo). */
  bytes: number;
};

/** Tamanho descompactado que o diretório central declara para a entrada (campo interno do JSZip). */
const declaradoDaEntrada = (entrada: JSZip.JSZipObject): number | null => {
  const tamanho = (entrada as unknown as { _data?: { uncompressedSize?: unknown } })._data?.uncompressedSize;
  return typeof tamanho === 'number' ? tamanho : null;
};

/**
 * Descompacta o XLSX **como o exceljs vai descompactar**: `xlsx.load` do exceljs
 * 4.4.0 usa `JSZip.loadAsync` (exceljs/lib/xlsx/xlsx.js), que lê pelo diretório
 * CENTRAL — então a medição também usa o JSZip (a mesma 3.10.2, dependência fixa
 * da API) e percorre `zip.files`. Cada entrada é lida em stream (blocos de ~16 KB)
 * contando os bytes reais; aborta quando:
 * - a soma passa do `limite` ('GRANDE'), ou
 * - a entrada produz mais (ou, no fim, outra quantidade) do que o diretório
 *   central declara ('INVALIDO': tamanho forjado — o JSZip só confere no fim,
 *   depois de descompactar tudo).
 * ZIP que o JSZip não abre: 'INVALIDO'.
 */
export async function medirDescompactado(zip: Buffer, limite: number): Promise<MedicaoDoZip> {
  let arquivo: JSZip;
  try {
    arquivo = await JSZip.loadAsync(zip);
  } catch {
    return { resultado: 'INVALIDO', bytes: 0 };
  }
  let total = 0;
  for (const entrada of Object.values(arquivo.files)) {
    if (entrada.dir) continue;
    const declarado = declaradoDaEntrada(entrada);
    if (declarado == null) return { resultado: 'INVALIDO', bytes: total };
    const resultado = await new Promise<MedicaoDoZip['resultado']>((resolver) => {
      const fluxo = entrada.nodeStream('nodebuffer');
      let daEntrada = 0;
      let decidido = false;
      const decidir = (r: MedicaoDoZip['resultado']) => {
        if (decidido) return;
        decidido = true;
        // Para de consumir: o JSZip pausa o worker quando o buffer do stream enche.
        fluxo.removeAllListeners('data');
        fluxo.pause();
        resolver(r);
      };
      fluxo.on('data', (bloco: Buffer) => {
        daEntrada += bloco.length;
        total += bloco.length;
        if (daEntrada > declarado) decidir('INVALIDO');
        else if (total > limite) decidir('GRANDE');
      });
      fluxo.on('error', () => decidir('INVALIDO'));
      fluxo.on('end', () => decidir(daEntrada === declarado ? 'OK' : 'INVALIDO'));
    });
    if (resultado !== 'OK') return { resultado, bytes: total };
  }
  return { resultado: 'OK', bytes: total };
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
 * são puladas. Antes de abrir: tamanho declarado no diretório central (sem
 * ZIP64) e bytes realmente descompactados pelo JSZip, o mesmo leitor do `load`
 * (até 50 MB) — é esse teto que limita a memória do `load`. O arquivo é
 * descompactado duas vezes (medição e `load`); a CPU fica limitada pelo teto.
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
  const { resultado } = await medirDescompactado(buffer, LIMITE_XLSX_DESCOMPACTADO);
  if (resultado === 'GRANDE') throw grandeDemais();
  if (resultado === 'INVALIDO') throw xlsxIlegivel();

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
  // `includeEmpty`: linhas vazias também passam pelo contador (teto de linhas lidas).
  planilha.eachRow({ includeEmpty: true }, (row) => {
    contador.linha(row.cellCount); // `cellCount` = índice da última coluna da linha
    if (!cabecalhoLido) {
      if (!row.hasValues) return; // o cabeçalho é a primeira linha com valor
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
