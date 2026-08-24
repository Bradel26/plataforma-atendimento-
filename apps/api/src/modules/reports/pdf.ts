import PDFDocument from 'pdfkit';
import type { Relatorio } from './reports.service';

const MARGEM = 40;
const FONTE = 9;

const dataBr = (d: Date) => d.toLocaleDateString('pt-BR');

/**
 * Renderiza o relatorio em PDF paisagem, com cabecalho repetido a cada pagina.
 * Retorna o Buffer completo — os relatorios sao pequenos e caber em memoria
 * simplifica o handler HTTP.
 */
export function gerarPdf(relatorio: Relatorio, nomeMarca: string, corPrimaria: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: MARGEM });
    const pedacos: Buffer[] = [];

    doc.on('data', (p: Buffer) => pedacos.push(p));
    doc.on('end', () => resolve(Buffer.concat(pedacos)));
    doc.on('error', reject);

    const larguraUtil = doc.page.width - MARGEM * 2;
    const larguraColuna = larguraUtil / relatorio.colunas.length;

    const desenharCabecalho = () => {
      doc.fillColor(corPrimaria).fontSize(16).font('Helvetica-Bold').text(nomeMarca, MARGEM, MARGEM);
      doc.fillColor('#0f172a').fontSize(13).text(relatorio.titulo, MARGEM, doc.y + 2);
      doc
        .fillColor('#64748b')
        .fontSize(9)
        .font('Helvetica')
        .text(
          `Periodo: ${dataBr(relatorio.periodo.desde)} a ${dataBr(relatorio.periodo.ate)}  ·  Gerado em ${new Date().toLocaleString('pt-BR')}`,
          MARGEM,
          doc.y + 2,
        );
      doc.moveDown(0.8);
    };

    const desenharLinha = (
      valores: Array<string | number>,
      opcoes: { negrito?: boolean; fundo?: string } = {},
    ) => {
      const y = doc.y;
      const altura = 18;

      if (opcoes.fundo) {
        doc.rect(MARGEM, y - 3, larguraUtil, altura).fill(opcoes.fundo);
      }

      doc
        .fillColor(opcoes.fundo === corPrimaria ? '#ffffff' : '#0f172a')
        .font(opcoes.negrito ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(FONTE);

      valores.forEach((valor, i) => {
        doc.text(String(valor ?? ''), MARGEM + i * larguraColuna + 4, y + 2, {
          width: larguraColuna - 8,
          ellipsis: true,
          lineBreak: false,
        });
      });

      doc.y = y + altura;
    };

    desenharCabecalho();
    desenharLinha(relatorio.colunas.map((c) => c.rotulo), { negrito: true, fundo: corPrimaria });

    if (relatorio.linhas.length === 0) {
      doc.moveDown(1).fillColor('#64748b').fontSize(10).text('Nenhum dado no periodo selecionado.', MARGEM);
    }

    relatorio.linhas.forEach((linha, indice) => {
      // Quebra de pagina antes de estourar a margem inferior.
      if (doc.y > doc.page.height - MARGEM - 40) {
        doc.addPage();
        desenharCabecalho();
        desenharLinha(relatorio.colunas.map((c) => c.rotulo), { negrito: true, fundo: corPrimaria });
      }
      desenharLinha(
        relatorio.colunas.map((c) => linha[c.chave] ?? ''),
        { fundo: indice % 2 === 1 ? '#f1f5f9' : undefined },
      );
    });

    if (relatorio.totais) {
      desenharLinha(relatorio.colunas.map((c) => relatorio.totais![c.chave] ?? ''), {
        negrito: true,
        fundo: '#e2e8f0',
      });
    }

    doc.end();
  });
}
