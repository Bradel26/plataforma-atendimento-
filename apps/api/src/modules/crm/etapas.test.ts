import { describe, expect, it } from 'vitest';
import { bloqueioDeEtapa, comTarefaDeEtapa, ehAvanco, pendentesPorOportunidade } from './etapas';

describe('ehAvanco', () => {
  it('avanca quando a ordem cresce', () => {
    expect(ehAvanco(1, 2)).toBe(true);
    expect(ehAvanco(1, 5)).toBe(true);
  });

  it('voltar nao e avanco — desfazer o proprio engano nao pode ficar preso', () => {
    expect(ehAvanco(3, 1)).toBe(false);
    expect(ehAvanco(2, 1)).toBe(false);
  });

  it('a mesma ordem nao e avanco', () => {
    // `@@unique([funilId, ordem])` garante que ordem igual e a mesma etapa.
    expect(ehAvanco(2, 2)).toBe(false);
  });
});

describe('bloqueioDeEtapa', () => {
  it('sem pendencia, caminho livre', () => {
    expect(bloqueioDeEtapa([], 'Proposta')).toBeNull();
  });

  it('a mensagem nomeia a tarefa e a etapa', () => {
    const m = bloqueioDeEtapa(['Registrar a visita tecnica'], 'Qualificacao');
    // O titulo tem de aparecer: "existe tarefa pendente" obrigaria o vendedor a
    // abrir a ficha para descobrir o que e.
    expect(m).toContain('Registrar a visita tecnica');
    expect(m).toContain('Qualificacao');
  });

  it('lista todas as pendentes, nao so a primeira', () => {
    const m = bloqueioDeEtapa(['Visita tecnica', 'Levantamento de carga'], 'Diagnostico');
    expect(m).toContain('Visita tecnica');
    expect(m).toContain('Levantamento de carga');
  });
});

describe('pendentesPorOportunidade', () => {
  const atual = new Map([
    ['op1', 'et1'],
    ['op2', 'et2'],
  ]);

  it('agrupa por oportunidade preservando a ordem de chegada', () => {
    const mapa = pendentesPorOportunidade(
      [
        { oportunidadeId: 'op1', estagioId: 'et1', titulo: 'primeira' },
        { oportunidadeId: 'op1', estagioId: 'et1', titulo: 'segunda' },
      ],
      atual,
    );
    expect(mapa.get('op1')).toEqual(['primeira', 'segunda']);
  });

  it('ignora tarefa de etapa que a oportunidade ja deixou', () => {
    /*
     * O caso real: o cartao entrou em "Proposta" (tarefa criada), alguem voltou
     * ele para "Qualificacao" — o que e livre — e a tarefa de Proposta ficou
     * aberta. Ela nao pode barrar nada, porque o cartao nao esta la.
     */
    const mapa = pendentesPorOportunidade(
      [{ oportunidadeId: 'op1', estagioId: 'et9', titulo: 'de outra etapa' }],
      atual,
    );
    expect(mapa.has('op1')).toBe(false);
  });

  it('ignora tarefa sem oportunidade ou sem etapa', () => {
    // Atividade obrigatoria orfa nao deveria existir, mas a coluna aceita nulo
    // (e o FK e SET NULL: apagar a etapa deixa a atividade como historico).
    // Contar como bloqueio prenderia o cartao por causa de uma etapa apagada.
    const mapa = pendentesPorOportunidade(
      [
        { oportunidadeId: null, estagioId: 'et1', titulo: 'sem op' },
        { oportunidadeId: 'op1', estagioId: null, titulo: 'etapa apagada' },
      ],
      atual,
    );
    expect(mapa.size).toBe(0);
  });

  it('nao vaza tarefa de uma oportunidade para outra', () => {
    const mapa = pendentesPorOportunidade(
      [
        { oportunidadeId: 'op1', estagioId: 'et1', titulo: 'da op1' },
        { oportunidadeId: 'op2', estagioId: 'et2', titulo: 'da op2' },
      ],
      atual,
    );
    expect(mapa.get('op1')).toEqual(['da op1']);
    expect(mapa.get('op2')).toEqual(['da op2']);
  });
});

describe('comTarefaDeEtapa', () => {
  const ops = [
    { id: 'op1', estagio: { id: 'et1' } },
    { id: 'op2', estagio: { id: 'et2' } },
  ];

  it('quem nao tem pendencia recebe lista vazia, nao undefined', () => {
    // Lista vazia e um zero de verdade: o cartao precisa poder afirmar que nao
    // ha exigencia. `undefined` viraria silencio na tela.
    const [a, b] = comTarefaDeEtapa(ops, [
      { oportunidadeId: 'op1', estagioId: 'et1', titulo: 'visita' },
    ]);
    expect(a!.tarefaDaEtapaPendente).toEqual(['visita']);
    expect(b!.tarefaDaEtapaPendente).toEqual([]);
  });

  it('preserva os outros campos da oportunidade', () => {
    const [a] = comTarefaDeEtapa([{ id: 'op1', estagio: { id: 'et1' }, titulo: 'Ar-condicionado' }], []);
    expect(a!.titulo).toBe('Ar-condicionado');
  });
});
