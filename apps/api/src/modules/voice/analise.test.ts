import { describe, expect, it } from 'vitest';
import {
  analisePrematura,
  estadoDaAcao,
  estadoDaAnalise,
  impedimentoDaTarefa,
  normalizarAcoes,
  resumirSentimento,
  TETO_DE_ACOES,
} from './analise';

describe('normalizarAcoes', () => {
  it('tira espaco sobrando e item vazio', () => {
    expect(normalizarAcoes(['  Ligar na terca  ', '', '   ', 'Mandar proposta'])).toEqual([
      'Ligar na terca',
      'Mandar proposta',
    ]);
  });

  it('junta espaco interno repetido, que e como o repetido se disfarca', () => {
    expect(normalizarAcoes(['Ligar    na terca', 'Ligar na terca'])).toEqual(['Ligar na terca']);
  });

  it('ignora caixa ao comparar repetido', () => {
    expect(normalizarAcoes(['Mandar proposta', 'MANDAR PROPOSTA'])).toEqual(['Mandar proposta']);
  });

  it('preserva a ordem do motor: o mais urgente vem primeiro', () => {
    expect(normalizarAcoes(['A', 'B', 'C'])).toEqual(['A', 'B', 'C']);
  });

  it('corta no teto de leitura', () => {
    const muitas = Array.from({ length: 30 }, (_, i) => `Acao ${i}`);
    expect(normalizarAcoes(muitas)).toHaveLength(TETO_DE_ACOES);
  });

  it('devolve lista vazia para o que nao e lista', () => {
    // O motor externo e codigo de terceiro: string solta, nulo e objeto chegam.
    expect(normalizarAcoes(undefined)).toEqual([]);
    expect(normalizarAcoes('Ligar')).toEqual([]);
    expect(normalizarAcoes({ 0: 'Ligar' })).toEqual([]);
  });

  it('descarta item que nao e texto sem perder os vizinhos', () => {
    expect(normalizarAcoes(['Ligar', 42, null, 'Mandar'])).toEqual(['Ligar', 'Mandar']);
  });

  it('nao junta palavras que se distinguem por acento', () => {
    // "Duvida menor": ignorar acento apagaria par legitimo do portugues.
    expect(normalizarAcoes(['Revisar contrato', 'Revisar contráto'])).toHaveLength(2);
  });
});

describe('estadoDaAcao', () => {
  it('pendente enquanto nada aconteceu', () => {
    expect(estadoDaAcao({ atividadeId: null, descartadoEm: null })).toBe('PENDENTE');
  });

  it('virou tarefa quando existe atividade', () => {
    expect(estadoDaAcao({ atividadeId: 'a1', descartadoEm: null })).toBe('VIROU_TAREFA');
  });

  it('descartada quando foi recusada', () => {
    expect(estadoDaAcao({ atividadeId: null, descartadoEm: new Date() })).toBe('DESCARTADA');
  });

  it('distingue os dois desfechos, que sao respostas opostas sobre o motor', () => {
    // "Resolvida" para os dois perderia a unica pergunta que interessa sobre a
    // sugestao: o motor acertou ou nao?
    const virou = estadoDaAcao({ atividadeId: 'a1', descartadoEm: null });
    const descartada = estadoDaAcao({ atividadeId: null, descartadoEm: new Date() });
    expect(virou).not.toBe(descartada);
  });
});

describe('impedimentoDaTarefa', () => {
  it('libera sugestao pendente de chamada com contato', () => {
    expect(impedimentoDaTarefa({ atividadeId: null, descartadoEm: null }, true)).toBeNull();
  });

  it('explica que a chamada nao tem contato, em vez de deixar o clique falhar', () => {
    const motivo = impedimentoDaTarefa({ atividadeId: null, descartadoEm: null }, false);
    expect(motivo).toContain('nao esta ligada a nenhum contato');
  });

  it('barra a sugestao que ja virou tarefa: clicar duas vezes nao gera duas', () => {
    expect(impedimentoDaTarefa({ atividadeId: 'a1', descartadoEm: null }, true)).toBe(
      'Esta sugestao ja virou tarefa',
    );
  });

  it('barra a descartada', () => {
    expect(impedimentoDaTarefa({ atividadeId: null, descartadoEm: new Date() }, true)).toBe(
      'Esta sugestao foi descartada',
    );
  });
});

describe('resumirSentimento', () => {
  it('nao dobra chamada sem analise em NEUTRO', () => {
    // A regra central do item. "70% neutro" saindo de chamadas que ninguem ouviu
    // faria a gestao concluir que o atendimento e morno.
    const r = resumirSentimento([
      { sentimento: null },
      { sentimento: null },
      { sentimento: 'NEUTRO' },
    ]);
    expect(r.neutro).toBe(1);
    expect(r.semAnalise).toBe(2);
    expect(r.analisadas).toBe(1);
  });

  it('conta os tres degraus separados', () => {
    const r = resumirSentimento([
      { sentimento: 'POSITIVO' },
      { sentimento: 'POSITIVO' },
      { sentimento: 'NEGATIVO' },
      { sentimento: 'NEUTRO' },
    ]);
    expect([r.positivo, r.neutro, r.negativo]).toEqual([2, 1, 1]);
    expect(r.analisadas).toBe(4);
    expect(r.semAnalise).toBe(0);
  });

  it('a fracao de negativas usa a base de analisadas, nao o total', () => {
    // Uma negativa em duas analisadas e 50%, mesmo com oito nao analisadas na
    // lista. Dividir pelo total daria 10% e esconderia o problema.
    const chamadas = [
      { sentimento: 'NEGATIVO' as const },
      { sentimento: 'POSITIVO' as const },
      ...Array.from({ length: 8 }, () => ({ sentimento: null })),
    ];
    const r = resumirSentimento(chamadas);
    expect(r.fracaoNegativa).toBe(0.5);
    expect(r.semAnalise).toBe(8);
  });

  it('sem nada analisado a fracao e nula, e nao zero', () => {
    const r = resumirSentimento([{ sentimento: null }, { sentimento: null }]);
    expect(r.fracaoNegativa).toBeNull();
    expect(r.analisadas).toBe(0);
  });

  it('lista vazia nao inventa numero', () => {
    const r = resumirSentimento([]);
    expect(r).toEqual({
      positivo: 0,
      neutro: 0,
      negativo: 0,
      analisadas: 0,
      semAnalise: 0,
      fracaoNegativa: null,
    });
  });
});

describe('analisePrematura', () => {
  const fim = new Date('2026-09-04T12:00:00Z');

  it('aceita analise posterior ao fim da ligacao', () => {
    expect(analisePrematura(fim, new Date('2026-09-04T12:05:00Z'))).toBe(false);
  });

  it('aceita analise no exato instante do fim', () => {
    expect(analisePrematura(fim, fim)).toBe(false);
  });

  it('recusa analise anterior ao fim: resumo de metade da conversa parece completo', () => {
    expect(analisePrematura(fim, new Date('2026-09-04T11:59:00Z'))).toBe(true);
  });

  it('recusa quando a chamada nao encerrou: nao ha como saber se o audio acabou', () => {
    expect(analisePrematura(null, new Date())).toBe(true);
  });
});

describe('estadoDaAnalise', () => {
  const vazia = { transcricao: null, resumo: null, sentimento: null, analisadoEm: null };

  it('chamada intocada nao tem analise', () => {
    expect(estadoDaAnalise(vazia)).toBe('SEM_ANALISE');
  });

  it('analise sem proxima acao ainda e analise', () => {
    // Motor que ouviu e nao achou proxima acao produziu resultado legitimo; a
    // tela nao pode mostrar isso como "nenhum motor analisou".
    expect(estadoDaAnalise({ ...vazia, analisadoEm: new Date(), resumo: 'Cliente vai pensar' })).toBe(
      'ANALISADA',
    );
  });

  it('so a transcricao ja conta: transcrever sem resumir e uso valido', () => {
    expect(estadoDaAnalise({ ...vazia, transcricao: 'alo?' })).toBe('ANALISADA');
  });
});
