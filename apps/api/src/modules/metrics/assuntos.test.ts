import { describe, expect, it } from 'vitest';
import { agruparAssuntos, type ConversaParaAssunto } from './metrics.service';

/**
 * O relatorio por assunto e a razao de a etiqueta existir em conversa, e todo
 * caso aqui e uma forma de ele mentir com aparencia de certo:
 *
 * - conversa com duas etiquetas somando 1 em vez de 2, e o assunto secundario
 *   nunca aparecendo no relatorio;
 * - a fatia sem etiqueta somindo, e 3 de 100 atendimentos classificados
 *   parecendo o retrato dos 100;
 * - finalizada sem atribuicao entrando com TMA zero e fazendo o assunto mais
 *   demorado parecer o mais rapido.
 *
 * Nenhum deles quebra a tela — todos produzem numero plausivel.
 */

const em = (iso: string) => new Date(iso);

const conversa = (dados: Partial<ConversaParaAssunto> = {}): ConversaParaAssunto => ({
  tags: [],
  status: 'FINALIZADO',
  atribuidoEm: null,
  finalizadoEm: null,
  ...dados,
});

describe('agruparAssuntos', () => {
  it('conta uma conversa em cada etiqueta que ela tem', () => {
    const { assuntos } = agruparAssuntos([conversa({ tags: ['boleto', 'urgente'] })]);

    // O total das linhas (2) passa do total de conversas (1), e esta certo: a
    // pergunta e "quantos atendimentos tocaram este assunto".
    expect(assuntos).toHaveLength(2);
    expect(assuntos.every((a) => a.conversas === 1)).toBe(true);
  });

  it('separa quem nao tem etiqueta em vez de descartar', () => {
    const r = agruparAssuntos([
      conversa({ tags: ['boleto'] }),
      conversa(),
      conversa(),
      conversa(),
    ]);

    expect(r.total).toBe(4);
    expect(r.semEtiqueta).toBe(3);
    // A linha existe, mas descreve 1 de 4 — e e o `semEtiqueta` que conta isso.
    expect(r.assuntos).toEqual([
      { tag: 'boleto', conversas: 1, finalizadas: 1, tmaSegundos: null },
    ]);
  });

  it('conta como finalizada somente o status FINALIZADO', () => {
    const { assuntos } = agruparAssuntos([
      conversa({ tags: ['boleto'], status: 'FINALIZADO' }),
      conversa({ tags: ['boleto'], status: 'EM_ATENDIMENTO' }),
    ]);

    expect(assuntos[0]).toMatchObject({ conversas: 2, finalizadas: 1 });
  });

  it('calcula o TMA da atribuicao ao encerramento', () => {
    const { assuntos } = agruparAssuntos([
      conversa({
        tags: ['boleto'],
        atribuidoEm: em('2026-09-02T10:00:00Z'),
        finalizadoEm: em('2026-09-02T10:10:00Z'),
      }),
      conversa({
        tags: ['boleto'],
        atribuidoEm: em('2026-09-02T11:00:00Z'),
        finalizadoEm: em('2026-09-02T11:20:00Z'),
      }),
    ]);

    // Media de 600s e 1200s. Do `criadoEm` sairia outro numero — este mede
    // tempo de atendente, nao tempo de espera do cliente.
    expect(assuntos[0]?.tmaSegundos).toBe(900);
  });

  it('ignora no TMA a finalizada que nunca foi atribuida', () => {
    const { assuntos } = agruparAssuntos([
      conversa({
        tags: ['boleto'],
        atribuidoEm: em('2026-09-02T10:00:00Z'),
        finalizadoEm: em('2026-09-02T10:10:00Z'),
      }),
      // Bot resolveu, ou o cliente desistiu e ela foi encerrada da fila.
      // Contar zero aqui daria TMA de 300s e faria o assunto parecer o dobro
      // mais rapido do que atende-lo custa de verdade.
      conversa({ tags: ['boleto'], atribuidoEm: null, finalizadoEm: em('2026-09-02T10:05:00Z') }),
    ]);

    expect(assuntos[0]).toMatchObject({ conversas: 2, finalizadas: 2, tmaSegundos: 600 });
  });

  it('devolve TMA nulo quando nenhuma conversa da etiqueta fechou', () => {
    const { assuntos } = agruparAssuntos([
      conversa({ tags: ['boleto'], status: 'EM_ATENDIMENTO' }),
    ]);

    // Nulo, e nao zero: zero seria lido como "atendimento instantaneo".
    expect(assuntos[0]?.tmaSegundos).toBeNull();
  });

  it('ordena por volume e desempata pelo nome', () => {
    const { assuntos } = agruparAssuntos([
      conversa({ tags: ['zebra', 'abacaxi', 'boleto'] }),
      conversa({ tags: ['boleto'] }),
    ]);

    // `boleto` na frente por volume; os dois de volume 1 em ordem alfabetica,
    // para duas chamadas iguais nao devolverem ordens diferentes.
    expect(assuntos.map((a) => a.tag)).toEqual(['boleto', 'abacaxi', 'zebra']);
  });

  it('respeita o limite depois de ordenar, nao antes', () => {
    const { assuntos, total } = agruparAssuntos(
      [
        conversa({ tags: ['raro'] }),
        conversa({ tags: ['comum'] }),
        conversa({ tags: ['comum'] }),
      ],
      1,
    );

    // Cortar antes de ordenar traria `raro` — a etiqueta menos usada — como se
    // fosse o assunto principal do periodo.
    expect(assuntos.map((a) => a.tag)).toEqual(['comum']);
    // O total continua sendo o do periodo, nao o das linhas mostradas.
    expect(total).toBe(3);
  });

  it('devolve vazio coerente sem conversa nenhuma', () => {
    expect(agruparAssuntos([])).toEqual({ assuntos: [], semEtiqueta: 0, total: 0 });
  });
});
