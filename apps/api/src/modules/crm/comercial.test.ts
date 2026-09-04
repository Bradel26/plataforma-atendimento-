import { describe, expect, it } from 'vitest';
import {
  compararFluxos,
  montarFluxo,
  montarFunil,
  montarPerdas,
  montarRisco,
  variacao,
  type EstagioDoFunil,
  type FechamentoComercial,
} from './comercial.service';

/**
 * Itens 1.2 a 1.5 do plano em ANALISE-CRM.md.
 *
 * Cada caso e uma forma de o relatorio mentir **de modo plausivel**. Relatorio
 * de gestao nao quebra quando esta errado: ele devolve um numero bonito e alguem
 * decide em cima dele. Por isso os casos aqui sao denominadores, fronteiras e
 * divisao por zero — nao "a funcao roda".
 */

const ESTAGIOS: EstagioDoFunil[] = [
  { id: 'e1', nome: 'Primeiro contato', ordem: 1, probabilidade: 10 },
  { id: 'e2', nome: 'Orcamento', ordem: 2, probabilidade: 40 },
  { id: 'e3', nome: 'Fechamento', ordem: 3, probabilidade: 80 },
];

describe('montarFunil (1.2)', () => {
  it('devolve uma linha por estagio, na ordem do funil, mesmo sem movimento', () => {
    const r = montarFunil(ESTAGIOS, [], [], new Map());
    expect(r.estagios.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
    // Sem denominador, taxa e NULA e nao zero: "0% de conversao" e uma
    // afirmacao sobre desempenho; nulo diz que nao houve o que medir.
    expect(r.estagios[0]?.taxaAvanco).toBeNull();
    expect(r.estagios[0]?.taxaPerda).toBeNull();
  });

  it('conta entrada, avanco e taxa', () => {
    const r = montarFunil(
      ESTAGIOS,
      [
        { deEstagioId: null, paraEstagioId: 'e1', segundosNoEstagio: null },
        { deEstagioId: null, paraEstagioId: 'e1', segundosNoEstagio: null },
        { deEstagioId: 'e1', paraEstagioId: 'e2', segundosNoEstagio: 600 },
      ],
      [],
      new Map(),
    );
    const e1 = r.estagios.find((e) => e.id === 'e1')!;
    expect(e1.entrou).toBe(2);
    expect(e1.avancou).toBe(1);
    expect(e1.taxaAvanco).toBe(0.5);
    expect(e1.tempoMedioSegundos).toBe(600);
  });

  it('retrocesso nao conta como avanco', () => {
    // Se contasse, a conversao inflaria exatamente nos funis mal trabalhados —
    // aqueles em que o vendedor arrasta o cartao para tras — que sao os que mais
    // precisam do relatorio dizer a verdade.
    const r = montarFunil(
      ESTAGIOS,
      [
        { deEstagioId: null, paraEstagioId: 'e2', segundosNoEstagio: null },
        { deEstagioId: 'e2', paraEstagioId: 'e1', segundosNoEstagio: 100 },
      ],
      [],
      new Map(),
    );
    const e2 = r.estagios.find((e) => e.id === 'e2')!;
    expect(e2.avancou).toBe(0);
    expect(e2.retrocedeu).toBe(1);
    expect(e2.taxaAvanco).toBe(0);
  });

  it('destino fora do funil nao e classificado como avanco nem retrocesso', () => {
    const r = montarFunil(
      ESTAGIOS,
      [
        { deEstagioId: null, paraEstagioId: 'e1', segundosNoEstagio: null },
        { deEstagioId: 'e1', paraEstagioId: 'de-outro-funil', segundosNoEstagio: 50 },
      ],
      [],
      new Map(),
    );
    const e1 = r.estagios.find((e) => e.id === 'e1')!;
    expect(e1.avancou).toBe(0);
    expect(e1.retrocedeu).toBe(0);
    // Mas o tempo da saida continua valendo: ele foi medido de verdade.
    expect(e1.tempoMedioSegundos).toBe(50);
  });

  it('ganhar na ultima etapa aparece como ganho, nao como abandono', () => {
    // `fecharOportunidade` nao grava passagem de estagio: a ganha fica parada na
    // ultima etapa por onde passou. Sem contar fechamento em separado, a etapa
    // final apareceria com 0% de avanco e ninguem entenderia por que.
    const r = montarFunil(
      ESTAGIOS,
      [{ deEstagioId: 'e2', paraEstagioId: 'e3', segundosNoEstagio: 300 }],
      [
        { estagioId: 'e3', status: 'GANHA' },
        { estagioId: 'e3', status: 'GANHA' },
        { estagioId: 'e2', status: 'PERDIDA' },
      ],
      new Map(),
    );
    expect(r.estagios.find((e) => e.id === 'e3')!.ganhas).toBe(2);
    expect(r.estagios.find((e) => e.id === 'e2')!.perdidas).toBe(1);
  });

  it('tempo medio ignora saida sem tempo medido em vez de tratar como zero', () => {
    // O primeiro registro do historico tem `segundosNoEstagio` nulo. Contar nulo
    // como zero puxaria toda media para baixo — e o relatorio diria que o funil
    // e mais rapido do que e.
    const r = montarFunil(
      ESTAGIOS,
      [
        { deEstagioId: 'e1', paraEstagioId: 'e2', segundosNoEstagio: null },
        { deEstagioId: 'e1', paraEstagioId: 'e2', segundosNoEstagio: 1000 },
      ],
      [],
      new Map(),
    );
    expect(r.estagios.find((e) => e.id === 'e1')!.tempoMedioSegundos).toBe(1000);
  });

  it('abertas agora vem da foto do momento, nao do fluxo do periodo', () => {
    const r = montarFunil(ESTAGIOS, [], [], new Map([['e2', 7]]));
    expect(r.estagios.find((e) => e.id === 'e2')!.abertasAgora).toBe(7);
    expect(r.estagios.find((e) => e.id === 'e1')!.abertasAgora).toBe(0);
  });
});

describe('montarRisco (1.3)', () => {
  const agora = new Date('2026-09-02T12:00:00Z');
  const dia = 86_400_000;
  const emDias = (n: number) => new Date(agora.getTime() + n * dia);

  const abertas = [
    { id: 'a', valor: 100, previsaoFechamento: emDias(-10) }, // atrasada
    { id: 'b', valor: 200, previsaoFechamento: emDias(3) }, // vencendo
    { id: 'c', valor: 400, previsaoFechamento: emDias(30) }, // forecast, longe
    { id: 'd', valor: 800, previsaoFechamento: null }, // sem previsao
  ];

  it('classifica os quatro baldes de prazo', () => {
    const r = montarRisco(abertas, new Set(['a', 'b', 'c', 'd']), agora);
    expect(r.atrasadas).toEqual({ total: 1, valor: 100 });
    expect(r.vencendo).toEqual({ total: 1, valor: 200 });
    expect(r.semPrevisao).toEqual({ total: 1, valor: 800 });
    expect(r.abertas).toEqual({ total: 4, valor: 1500 });
  });

  it('em forecast inclui o que vence em breve — os baldes se sobrepoem', () => {
    // `vencendo` e um subconjunto de `emForecast`, de proposito. Baldes
    // exclusivos esconderiam a pior combinacao: atrasada E abandonada.
    const r = montarRisco(abertas, new Set(['a', 'b', 'c', 'd']), agora);
    expect(r.emForecast).toEqual({ total: 2, valor: 600 });
  });

  it('atrasada e sem proxima acao entra nos dois baldes', () => {
    const r = montarRisco(abertas, new Set(['b', 'c', 'd']), agora);
    expect(r.atrasadas.total).toBe(1);
    expect(r.semProximaAcao).toEqual({ total: 1, valor: 100 });
  });

  it('sem proxima acao usa a mesma regra do cartao do kanban', () => {
    // Quem nao esta no conjunto de "tem tarefa com prazo aberta" conta como sem
    // proxima acao. Se esta tela usasse outra definicao, o supervisor veria um
    // numero no painel e outro no quadro para a mesma pergunta.
    const r = montarRisco(abertas, new Set(), agora);
    expect(r.semProximaAcao).toEqual({ total: 4, valor: 1500 });
  });

  it('previsao exatamente agora nao e atraso', () => {
    const r = montarRisco([{ id: 'x', valor: 10, previsaoFechamento: agora }], new Set(['x']), agora);
    expect(r.atrasadas.total).toBe(0);
    expect(r.vencendo.total).toBe(1);
  });

  it('a janela de aviso e configuravel e muda o balde', () => {
    const r = montarRisco(abertas, new Set(['a', 'b', 'c', 'd']), agora, 60);
    // Com 60 dias de aviso, a de 30 dias passa a "vencendo".
    expect(r.vencendo.total).toBe(2);
    expect(r.diasDeAviso).toBe(60);
  });

  it('sem oportunidade aberta devolve zeros, nao nulos', () => {
    const r = montarRisco([], new Set(), agora);
    expect(r.abertas).toEqual({ total: 0, valor: 0 });
    expect(r.semProximaAcao).toEqual({ total: 0, valor: 0 });
  });
});

describe('montarFluxo (1.4)', () => {
  const f = (
    status: string,
    valor: number,
    criadoEm: string,
    fechadoEm: string | null,
  ): FechamentoComercial => ({
    status,
    valor,
    criadoEm: new Date(criadoEm),
    fechadoEm: fechadoEm ? new Date(fechadoEm) : null,
  });

  it('conta ganhas e perdidas, ticket medio e conversao', () => {
    const r = montarFluxo([
      f('GANHA', 1000, '2026-08-01T00:00:00Z', '2026-08-11T00:00:00Z'),
      f('GANHA', 3000, '2026-08-01T00:00:00Z', '2026-08-21T00:00:00Z'),
      f('PERDIDA', 500, '2026-08-01T00:00:00Z', '2026-08-05T00:00:00Z'),
    ]);
    expect(r.ganhas).toBe(2);
    expect(r.perdidas).toBe(1);
    expect(r.valorGanho).toBe(4000);
    expect(r.ticketMedio).toBe(2000);
    // Ganhas sobre DECIDIDAS: 2 de 3.
    expect(r.taxaConversao).toBeCloseTo(2 / 3);
  });

  it('ciclo medio conta so as ganhas', () => {
    // Incluir as perdidas mede "quanto tempo demoramos para desistir", que e
    // outra pergunta — e uma perda rapida faria o ciclo de venda parecer menor.
    const r = montarFluxo([
      f('GANHA', 1000, '2026-08-01T00:00:00Z', '2026-08-11T00:00:00Z'), // 10 dias
      f('PERDIDA', 500, '2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'), // 1 dia
    ]);
    expect(r.cicloMedioDias).toBe(10);
  });

  it('descarta ciclo negativo em vez de devolver numero impossivel', () => {
    const r = montarFluxo([f('GANHA', 100, '2026-08-10T00:00:00Z', '2026-08-01T00:00:00Z')]);
    expect(r.cicloMedioDias).toBeNull();
  });

  it('periodo sem fechamento devolve nulo nas medias, e zero nas contagens', () => {
    const r = montarFluxo([]);
    expect(r.ganhas).toBe(0);
    expect(r.ticketMedio).toBeNull();
    expect(r.taxaConversao).toBeNull();
    expect(r.cicloMedioDias).toBeNull();
  });

  it('so perdas: conversao e zero de verdade, nao nulo', () => {
    // Aqui HOUVE denominador — tres decisoes, nenhuma ganha. Zero e a resposta
    // certa, e trocar por nulo esconderia um mes ruim.
    const r = montarFluxo([
      f('PERDIDA', 1, '2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'),
      f('PERDIDA', 2, '2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'),
      f('PERDIDA', 3, '2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'),
    ]);
    expect(r.taxaConversao).toBe(0);
  });
});

describe('variacao (1.4)', () => {
  it('calcula crescimento e queda', () => {
    expect(variacao(150, 100)).toBeCloseTo(0.5);
    expect(variacao(50, 100)).toBeCloseTo(-0.5);
  });

  it('anterior zero devolve nulo, nao infinito nem 100%', () => {
    // Crescer de 0 para 5 nao e "+500%": e divisao por zero. O painel tem de
    // dizer "sem base de comparacao" em vez de estampar um numero inventado.
    expect(variacao(5, 0)).toBeNull();
    expect(variacao(0, 0)).toBeNull();
  });

  it('qualquer lado nulo devolve nulo', () => {
    expect(variacao(null, 100)).toBeNull();
    expect(variacao(100, null)).toBeNull();
  });

  it('estabilidade e zero, nao nulo', () => {
    expect(variacao(100, 100)).toBe(0);
  });

  it('compararFluxos cobre todas as chaves do fluxo', () => {
    const vazio = montarFluxo([]);
    const v = compararFluxos(vazio, vazio);
    // Toda chave do fluxo tem de existir na variacao: uma chave nova no fluxo
    // que nao aparecesse aqui viraria `undefined` no painel, e `undefined`
    // renderiza como nada — a variacao sumiria em silencio.
    expect(Object.keys(v).sort()).toEqual(Object.keys(vazio).sort());
  });
});

describe('montarPerdas (1.5)', () => {
  it('agrupa por motivo, soma valor e ordena por contagem', () => {
    const r = montarPerdas([
      { motivoPerda: 'PRECO', valor: 100 },
      { motivoPerda: 'PRECO', valor: 200 },
      { motivoPerda: 'CONCORRENTE', valor: 5000 },
    ]);
    expect(r.motivos[0]?.motivo).toBe('PRECO');
    expect(r.motivos[0]?.total).toBe(2);
    expect(r.motivos[0]?.valor).toBe(300);
    expect(r.total).toBe(3);
    expect(r.valor).toBe(5300);
  });

  it('a fatia e sobre a contagem, e o valor mostra a outra ordem', () => {
    // "O motivo que mais aparece" e "o motivo que mais custa" costumam ser
    // motivos diferentes: preco perde muitas pequenas, concorrente perde poucas
    // grandes. Por isso o valor vem junto em vez de virar a unica ordenacao.
    const r = montarPerdas([
      { motivoPerda: 'PRECO', valor: 100 },
      { motivoPerda: 'PRECO', valor: 100 },
      { motivoPerda: 'CONCORRENTE', valor: 9000 },
    ]);
    expect(r.motivos[0]?.fatia).toBeCloseTo(2 / 3);
    const maisCaro = [...r.motivos].sort((a, b) => b.valor - a.valor)[0];
    expect(maisCaro?.motivo).toBe('CONCORRENTE');
  });

  it('perda sem motivo aparece como SEM_MOTIVO em vez de ser descartada', () => {
    // Hoje o motivo e obrigatorio ao perder, entao esta linha deveria ficar em
    // zero — e e por isso que ela precisa existir: se crescer, e sinal de dado
    // entrando por outro caminho, e um relatorio que descarta calado nunca
    // mostraria isso.
    const r = montarPerdas([{ motivoPerda: null, valor: 42 }]);
    expect(r.motivos[0]?.motivo).toBe('SEM_MOTIVO');
    expect(r.total).toBe(1);
  });

  it('sem perda no periodo devolve lista vazia e zeros', () => {
    const r = montarPerdas([]);
    expect(r.motivos).toEqual([]);
    expect(r.total).toBe(0);
    expect(r.valor).toBe(0);
  });

  it('empate na contagem desempata pelo valor', () => {
    const r = montarPerdas([
      { motivoPerda: 'PRECO', valor: 10 },
      { motivoPerda: 'SEM_BUDGET', valor: 900 },
    ]);
    expect(r.motivos[0]?.motivo).toBe('SEM_BUDGET');
  });
});
