import PDFDocument from 'pdfkit';
import type { Proposta } from './proposta';

/**
 * Desenha a proposta comercial (item 2.2).
 *
 * Retrato, e nao paisagem como `reports/pdf.ts`: aquele arquivo despeja uma
 * tabela larga para conferencia interna, e este e um documento que vai para o
 * cliente — no papel de sempre, com margem de leitura.
 *
 * O conteudo vem pronto de `montarProposta`. Aqui nao se calcula nada: um total
 * recalculado na hora de desenhar poderia discordar do que a tela mostrou, e a
 * discordancia apareceria na frente do cliente.
 */

const MARGEM = 48;
const CINZA = '#64748b';
const TINTA = '#0f172a';

const dinheiro = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

const dataBr = (d: Date) => d.toLocaleDateString('pt-BR');

/** Colunas da tabela de itens, em fracao da largura util. */
const COLUNAS = [
  { rotulo: 'Item', peso: 0.4, alinhamento: 'left' as const },
  { rotulo: 'Qtd', peso: 0.08, alinhamento: 'right' as const },
  { rotulo: 'Unitario', peso: 0.15, alinhamento: 'right' as const },
  { rotulo: 'Desc.', peso: 0.13, alinhamento: 'right' as const },
  { rotulo: 'Cobranca', peso: 0.11, alinhamento: 'left' as const },
  { rotulo: 'Total', peso: 0.13, alinhamento: 'right' as const },
];

export function gerarPropostaPdf(proposta: Proposta, corPrimaria: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGEM });
    const pedacos: Buffer[] = [];
    doc.on('data', (p: Buffer) => pedacos.push(p));
    doc.on('end', () => resolve(Buffer.concat(pedacos)));
    doc.on('error', reject);

    const util = doc.page.width - MARGEM * 2;
    const larguras = COLUNAS.map((c) => c.peso * util);
    const xDe = (i: number) => MARGEM + larguras.slice(0, i).reduce((a, l) => a + l, 0);

    /** Cabecalho da marca e identificacao do documento. */
    const cabecalho = () => {
      doc.fillColor(corPrimaria).font('Helvetica-Bold').fontSize(18).text(proposta.emissor, MARGEM, MARGEM);
      doc.fillColor(TINTA).fontSize(12).text('Proposta comercial', MARGEM, doc.y + 2);
      doc
        .fillColor(CINZA)
        .font('Helvetica')
        .fontSize(9)
        .text(`No ${proposta.numero}  ·  Emitida em ${dataBr(proposta.emitidaEm)}`, MARGEM, doc.y + 2);
      doc.moveDown(1);
    };

    const cabecalhoDaTabela = () => {
      const y = doc.y;
      doc.rect(MARGEM, y - 3, util, 18).fill(corPrimaria);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
      COLUNAS.forEach((c, i) => {
        doc.text(c.rotulo, xDe(i) + 4, y + 2, { width: larguras[i]! - 8, align: c.alinhamento, lineBreak: false });
      });
      doc.y = y + 18;
    };

    cabecalho();

    // Bloco do cliente. Duas colunas para nao virar uma lista alta de uma linha
    // por dado — o cliente le isto de relance antes de ir aos numeros.
    const yCliente = doc.y;
    doc.fillColor(CINZA).fontSize(8).font('Helvetica').text('CLIENTE', MARGEM, yCliente);
    doc.fillColor(TINTA).fontSize(11).font('Helvetica-Bold').text(proposta.cliente, MARGEM, doc.y);
    doc.fillColor(TINTA).fontSize(9).font('Helvetica').text(proposta.titulo, MARGEM, doc.y + 1);

    const meio = MARGEM + util / 2;
    let yLado = yCliente;
    if (proposta.responsavel) {
      doc.fillColor(CINZA).fontSize(8).text('CONTATO COMERCIAL', meio, yLado);
      doc.fillColor(TINTA).fontSize(9).text(proposta.responsavel, meio, yLado + 11);
      yLado += 26;
    }
    if (proposta.validaAte) {
      // A validade so aparece se a oportunidade tiver previsao. Prazo inventado
      // seria a plataforma assumindo compromisso comercial pela empresa.
      doc.fillColor(CINZA).fontSize(8).text('VALIDA ATE', meio, yLado);
      doc.fillColor(TINTA).fontSize(9).text(dataBr(proposta.validaAte), meio, yLado + 11);
    }

    doc.y = Math.max(doc.y, yLado + 26) + 12;
    cabecalhoDaTabela();

    doc.fontSize(9);
    proposta.itens.forEach((item, indice) => {
      // Reserva 120px: o bloco de totais e as observacoes vem depois da tabela,
      // e uma linha que couber rente ao pe empurraria os totais para uma pagina
      // sozinha — o cliente veria a proposta sem valor e o valor sem proposta.
      if (doc.y > doc.page.height - MARGEM - 120) {
        doc.addPage();
        cabecalho();
        cabecalhoDaTabela();
      }

      const y = doc.y;

      const celulas = [
        item.sku ? `${item.descricao} (${item.sku})` : item.descricao,
        String(item.quantidade),
        dinheiro(item.precoUnitario),
        // Desconto zero sai como travessao, nao "R$ 0,00": uma coluna cheia de
        // zeros faz o cliente procurar o desconto que nao existe.
        item.desconto > 0 ? `-${dinheiro(item.desconto)}` : '—',
        item.recorrencia === 'MENSAL' ? 'Mensal' : 'Uma vez',
        dinheiro(item.liquido),
      ];

      /*
       * A altura da linha vem da descricao, medida antes de desenhar.
       *
       * O primeiro rascunho fixava 20px e proibia quebra. O nome real de um
       * produto — "Ar-condicionado split 12.000 BTUs Philco (PH-AC12)" — quebrava
       * de qualquer forma, e a segunda linha encostava na linha seguinte, com a
       * faixa zebrada cortando o texto pelo meio. Cortar o nome com reticencias
       * seria pior: e a descricao do que esta sendo vendido, no documento que o
       * cliente usa para conferir o pedido.
       */
      doc.font('Helvetica').fontSize(9);
      const alturaTexto = doc.heightOfString(celulas[0]!, { width: larguras[0]! - 8 });
      const altura = Math.max(20, Math.ceil(alturaTexto) + 8);

      if (indice % 2 === 1) doc.rect(MARGEM, y - 3, util, altura).fill('#f1f5f9');

      doc.fillColor(TINTA).font('Helvetica').fontSize(9);
      COLUNAS.forEach((c, i) => {
        doc.text(celulas[i]!, xDe(i) + 4, y + 3, {
          width: larguras[i]! - 8,
          align: c.alinhamento,
          // Quebra so na descricao. Nas colunas de numero uma quebra
          // desalinharia a coluna toda, e ali nao ha texto longo legitimo.
          lineBreak: i === 0,
          ellipsis: i !== 0,
        });
      });
      doc.y = y + altura;
    });

    doc.moveDown(1);

    /** Uma linha do bloco de totais, alinhada a direita. */
    const total = (rotulo: string, valor: string, destaque = false) => {
      const y = doc.y;
      const larguraRotulo = util * 0.6;
      doc
        .fillColor(destaque ? TINTA : CINZA)
        .font(destaque ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(destaque ? 11 : 9)
        .text(rotulo, MARGEM, y, { width: larguraRotulo, align: 'right' });
      doc
        .fillColor(destaque ? corPrimaria : TINTA)
        .text(valor, MARGEM + larguraRotulo + 8, y, { width: util - larguraRotulo - 8, align: 'right' });
      doc.y = y + (destaque ? 18 : 14);
    };

    if (proposta.totais.desconto > 0) {
      total('Subtotal', dinheiro(proposta.totais.bruto));
      total('Descontos', `-${dinheiro(proposta.totais.desconto)}`);
    }
    /*
     * Unico e mensal aparecem separados sempre que os dois existem.
     *
     * Somados num numero so, o cliente nao teria como saber quanto e cobrado
     * agora e quanto e por mes — e o total, que embute o horizonte, pareceria
     * cobranca imediata.
     */
    if (proposta.totais.unico > 0 && proposta.totais.mensal > 0) {
      total('Cobranca unica', dinheiro(proposta.totais.unico));
      total(`Mensal (x${proposta.totais.mesesRecorrencia})`, dinheiro(proposta.totais.mensal));
    }
    total('Total', dinheiro(proposta.totais.total), true);

    /*
     * Condicoes de pagamento e entrega, depois dos totais.
     *
     * Depois, e nao antes: o cliente procura o preco primeiro, e um bloco de
     * condicoes entre a tabela e o total afastaria as duas coisas que ele quer
     * comparar. Cada uma so aparece se estiver preenchida.
     */
    const condicoes: Array<[string, string]> = [];
    if (proposta.condicaoPagamento) condicoes.push(['Condicao de pagamento', proposta.condicaoPagamento]);
    if (proposta.prazoEntrega) condicoes.push(['Prazo de entrega', proposta.prazoEntrega]);

    if (condicoes.length > 0) {
      doc.moveDown(1.2);
      condicoes.forEach(([rotulo, valor]) => {
        const y = doc.y;
        doc.fillColor(CINZA).font('Helvetica').fontSize(8).text(rotulo.toUpperCase(), MARGEM, y);
        doc.fillColor(TINTA).fontSize(9).text(valor, MARGEM, y + 11, { width: util });
        doc.y = Math.max(doc.y, y + 26);
      });
    }

    if (proposta.observacoes.length > 0) {
      doc.moveDown(1).fillColor(CINZA).font('Helvetica').fontSize(8);
      proposta.observacoes.forEach((linha) => doc.text(linha, MARGEM, doc.y + 3, { width: util }));
    }

    doc.end();
  });
}
