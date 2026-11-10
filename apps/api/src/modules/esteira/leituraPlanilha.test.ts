import { deflateRawSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../lib/errors';
import {
  LIMITE_IMPORTACAO_LINHAS,
  LIMITE_LINHAS_LIDAS_XLSX,
  contadorDeLeitura,
  lerArquivo,
  medirDescompactado,
} from './leituraPlanilha';

/** XLSX em memória escrito pelo próprio exceljs (planilha antes do workbook.xml no ZIP). */
async function xlsx(montar: (livro: ExcelJS.Workbook) => void): Promise<Buffer> {
  const livro = new ExcelJS.Workbook();
  montar(livro);
  return Buffer.from(await livro.xlsx.writeBuffer());
}

/** Erro 400 da leitura (AppError), com a mensagem. */
async function erroDaLeitura(buffer: Buffer, nome = 'planilha.xlsx'): Promise<AppError> {
  try {
    await lerArquivo({ buffer, nome });
  } catch (erro) {
    if (erro instanceof AppError) return erro;
    throw erro;
  }
  throw new Error('não lançou');
}

type Entrada = { nome: string; dados: Buffer; metodo?: 0 | 8; descritor?: boolean; declarado?: number; lixoAntes?: number };

/**
 * ZIP montado à mão: cabeçalhos locais + diretório central (que pode declarar um tamanho falso).
 * `lixoAntes`: bytes de lixo antes da entrada — quebra quem percorre os cabeçalhos locais,
 * mas o diretório central (o que o JSZip lê) aponta direto para ela.
 */
function zip(entradas: Entrada[]): Buffer {
  const locais: Buffer[] = [];
  const centrais: Buffer[] = [];
  let deslocamento = 0;
  for (const e of entradas) {
    const metodo = e.metodo ?? 8;
    const corpo = metodo === 8 ? deflateRawSync(e.dados) : e.dados;
    const nome = Buffer.from(e.nome);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(e.descritor ? 0x08 : 0, 6);
    local.writeUInt16LE(metodo, 8);
    local.writeUInt32LE(e.descritor ? 0 : corpo.length, 18);
    local.writeUInt32LE(e.descritor ? 0 : e.dados.length, 22);
    local.writeUInt16LE(nome.length, 26);
    const descritor = Buffer.alloc(e.descritor ? 16 : 0);
    if (e.descritor) {
      descritor.writeUInt32LE(0x08074b50, 0);
      descritor.writeUInt32LE(corpo.length, 8);
      descritor.writeUInt32LE(e.dados.length, 12);
    }
    const lixo = Buffer.alloc(e.lixoAntes ?? 0, 0x41);
    deslocamento += lixo.length;
    locais.push(lixo);
    const bloco = Buffer.concat([local, nome, corpo, descritor]);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(e.descritor ? 0x08 : 0, 8);
    central.writeUInt16LE(metodo, 10);
    central.writeUInt32LE(corpo.length, 20);
    central.writeUInt32LE(e.declarado ?? e.dados.length, 24);
    central.writeUInt16LE(nome.length, 28);
    central.writeUInt32LE(deslocamento, 42);
    centrais.push(Buffer.concat([central, nome]));
    locais.push(bloco);
    deslocamento += bloco.length;
  }
  const diretorio = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(entradas.length, 8);
  fim.writeUInt16LE(entradas.length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(deslocamento, 16);
  return Buffer.concat([...locais, diretorio, fim]);
}

describe('lerArquivo — XLSX (caminho real, em memória)', () => {
  it('lê o XLSX que o próprio exceljs escreve: número real das linhas e valores', async () => {
    const buffer = await xlsx((livro) => {
      const p = livro.addWorksheet('TIM');
      p.addRow(['CNPJ', 'Parceiro', 'Data do credenciamento']);
      p.addRow(['11222333000181', 'Loja A', new Date(Date.UTC(2026, 9, 5))]);
      p.addRow([]); // linha em branco no meio
      p.addRow([11222333000181, 'Loja B', null]);
      livro.addWorksheet('Outra').addRow(['ignorada']);
    });
    const planilha = await lerArquivo({ buffer, nome: 'esteira.XLSX' });
    expect(planilha.cabecalhos).toEqual(['CNPJ', 'Parceiro', 'Data do credenciamento']);
    expect(planilha.linhas).toEqual([
      { numero: 2, valores: { CNPJ: '11222333000181', Parceiro: 'Loja A', 'Data do credenciamento': '05/10/2026' } },
      { numero: 4, valores: { CNPJ: '11222333000181', Parceiro: 'Loja B', 'Data do credenciamento': '' } },
    ]);
  });

  it('leitura determinística: o mesmo arquivo dá o mesmo texto em toda leitura (sem `{ sharedString: n }`)', async () => {
    const buffer = await xlsx((livro) => {
      const p = livro.addWorksheet('TIM');
      p.addRow(['Parceiro', 'Cidade']);
      p.addRow(['Loja A', 'Goiânia']);
    });
    for (let i = 0; i < 10; i += 1) {
      const planilha = await lerArquivo({ buffer, nome: 'a.xlsx' });
      expect(planilha.linhas).toEqual([{ numero: 2, valores: { Parceiro: 'Loja A', Cidade: 'Goiânia' } }]);
    }
  });

  it('acima do limite de linhas de dados: "divida em arquivos menores"', async () => {
    const buffer = await xlsx((livro) => {
      const p = livro.addWorksheet('TIM');
      p.addRow(['Parceiro']);
      for (let i = 0; i <= LIMITE_IMPORTACAO_LINHAS; i += 1) p.addRow([`Loja ${i}`]);
    });
    const erro = await erroDaLeitura(buffer);
    expect(erro.status).toBe(400);
    expect(erro.message).toContain('divida em arquivos menores');
  });

  it('linhas "vazias" para o cabeçalho também contam: acima do teto de linhas lidas, recusa', async () => {
    const buffer = await xlsx((livro) => {
      const p = livro.addWorksheet('TIM');
      p.addRow(['Parceiro']);
      // Valor fora das colunas do cabeçalho: a linha é lida, mas fica vazia para a importação.
      for (let i = 0; i < LIMITE_LINHAS_LIDAS_XLSX; i += 1) p.getCell(i + 2, 5).value = 'x';
    });
    const erro = await erroDaLeitura(buffer);
    expect(erro.message).toContain('grande demais');
  });

  it('célula gigante e colunas demais: 400', async () => {
    const celula = await xlsx((livro) => {
      const p = livro.addWorksheet('TIM');
      p.addRow(['Parceiro']);
      p.addRow(['x'.repeat(10_001)]);
    });
    expect((await erroDaLeitura(celula)).message).toContain('caracteres');
    const largas = await xlsx((livro) => {
      livro.addWorksheet('TIM').addRow(Array.from({ length: 101 }, (_, i) => `C${i}`));
    });
    expect((await erroDaLeitura(largas)).message).toContain('colunas');
  });

  it('1ª aba vazia ou arquivo que não é XLSX: 400 amigável', async () => {
    const vazia = await xlsx((livro) => {
      livro.addWorksheet('Vazia');
      livro.addWorksheet('Dados').addRow(['Parceiro']);
    });
    expect((await erroDaLeitura(vazia)).message).toBe('A planilha está vazia ou sem cabeçalho');
    const ruim = await erroDaLeitura(Buffer.from('isto não é um xlsx'));
    expect(ruim.status).toBe(400);
    expect(ruim.message).toBe('Não foi possível ler o arquivo XLSX');
  });

  it('zip bomb com diretório central forjado (declara pouco): recusa pelos bytes reais', async () => {
    // Cabeçalhos honestos, diretório central declarando pouco.
    const bomba = zip([{ nome: 'xl/worksheets/sheet1.xml', dados: Buffer.alloc(60 * 1024 * 1024), declarado: 1000 }]);
    expect(bomba.length).toBeLessThan(200_000);
    // Saída maior que o declarado = tamanho forjado: arquivo inválido (aborta no 1º bloco).
    expect((await erroDaLeitura(bomba)).message).toBe('Não foi possível ler o arquivo XLSX');
    // Declarando o tamanho verdadeiro, a barreira do diretório central recusa antes de abrir.
    const honesta = zip([{ nome: 'xl/worksheets/sheet1.xml', dados: Buffer.alloc(60 * 1024 * 1024) }]);
    expect((await erroDaLeitura(honesta)).message).toContain('grande demais');
  });
});

describe('lerArquivo — CSV', () => {
  it('numera as linhas pela planilha e recusa outra extensão', async () => {
    const planilha = await lerArquivo({ buffer: Buffer.from('\uFEFFParceiro;CNPJ\r\n\r\nA;1\r\nB;2\r\n'), nome: 'a.csv' });
    expect(planilha.linhas.map((l) => l.numero)).toEqual([3, 4]);
    expect((await erroDaLeitura(Buffer.from('x'), 'a.txt')).message).toContain('.csv ou .xlsx');
  });
});

describe('medirDescompactado (mesmo caminho do exceljs: JSZip pelo diretório central)', () => {
  const MB = 1024 * 1024;
  const mb = (n: number) => Buffer.alloc(n * MB);

  it('XLSX do exceljs dentro do limite: OK com os bytes reais; com limite menor: GRANDE', async () => {
    const buffer = await xlsx((livro) => livro.addWorksheet('TIM').addRow(['Parceiro']));
    const ok = await medirDescompactado(buffer, 50 * MB);
    expect(ok.resultado).toBe('OK');
    expect(ok.bytes).toBeGreaterThan(0);
    expect((await medirDescompactado(buffer, 100)).resultado).toBe('GRANDE');
  });

  it('bomba escondida dos cabeçalhos locais (lixo antes dela), só no diretório central, declarando pouco: aborta no 1º bloco', async () => {
    const bomba = zip([
      { nome: '[Content_Types].xml', dados: Buffer.from('<a/>') },
      { nome: 'xl/worksheets/sheet1.xml', dados: mb(40), declarado: 1000, lixoAntes: 8 },
    ]);
    const medicao = await medirDescompactado(bomba, 50 * MB);
    expect(medicao.resultado).toBe('INVALIDO');
    // Contador: parou num bloco (~16 KB), longe dos 40 MB reais.
    expect(medicao.bytes).toBeLessThanOrEqual(64 * 1024);
  });

  it('bomba escondida que declara o tamanho verdadeiro: GRANDE ao passar do teto, antes de 2× o limite', async () => {
    const bomba = zip([
      { nome: '[Content_Types].xml', dados: Buffer.from('<a/>') },
      { nome: 'xl/worksheets/sheet1.xml', dados: mb(16), lixoAntes: 8 },
    ]);
    const medicao = await medirDescompactado(bomba, 2 * MB);
    expect(medicao.resultado).toBe('GRANDE');
    expect(medicao.bytes).toBeGreaterThan(2 * MB);
    expect(medicao.bytes).toBeLessThan(4 * MB);
  });

  it('soma entre entradas, guardado (método 0) e descritor de dados', async () => {
    expect((await medirDescompactado(zip([{ nome: 'a', dados: mb(1) }, { nome: 'b', dados: mb(1) }]), 1.5 * MB)).resultado).toBe('GRANDE');
    expect((await medirDescompactado(zip([{ nome: 'a', dados: Buffer.from('abc'), metodo: 0 }]), 3)).resultado).toBe('OK');
    expect((await medirDescompactado(zip([{ nome: 'a', dados: Buffer.from('abc'), metodo: 0 }]), 2)).resultado).toBe('GRANDE');
    const comDescritor = zip([
      { nome: 'a', dados: mb(1), descritor: true },
      { nome: 'b', dados: mb(1), descritor: true },
    ]);
    expect((await medirDescompactado(comDescritor, 3 * MB)).resultado).toBe('OK');
    expect((await medirDescompactado(comDescritor, 1.5 * MB)).resultado).toBe('GRANDE');
  });

  it('declarado maior que o real (incoerente) ou arquivo que não é ZIP: INVALIDO', async () => {
    expect((await medirDescompactado(zip([{ nome: 'a', dados: Buffer.from('abc'), declarado: 10 }]), MB)).resultado).toBe('INVALIDO');
    expect((await medirDescompactado(Buffer.from('nada a ver'), MB)).resultado).toBe('INVALIDO');
  });

  it('lerArquivo: bomba escondida dos cabeçalhos locais é recusada; guardado com descritor também', async () => {
    const bomba = zip([
      { nome: '[Content_Types].xml', dados: Buffer.from('<a/>') },
      { nome: 'xl/worksheets/sheet1.xml', dados: mb(60), declarado: 1000, lixoAntes: 8 },
    ]);
    expect((await erroDaLeitura(bomba)).status).toBe(400);
    const guardado = zip([{ nome: 'a', dados: Buffer.from('abc'), metodo: 0, descritor: true }]);
    expect((await erroDaLeitura(guardado)).message).toBe('Não foi possível ler o arquivo XLSX');
  });
});

describe('contadorDeLeitura', () => {
  const limites = { linhasLidas: 3, colunas: 2, celula: 5 };

  it('conta toda linha entregue (inclusive vazia) e recusa acima do teto', () => {
    const c = contadorDeLeitura(limites);
    c.linha(0);
    c.linha(0);
    c.linha(1);
    expect(() => c.linha(0)).toThrow(/grande demais/);
  });

  it('recusa colunas demais e célula grande demais', () => {
    expect(() => contadorDeLeitura(limites).linha(3)).toThrow(/colunas/);
    const c = contadorDeLeitura(limites);
    expect(c.celula('12345')).toBe('12345');
    expect(() => c.celula('123456')).toThrow(/caracteres/);
  });
});
