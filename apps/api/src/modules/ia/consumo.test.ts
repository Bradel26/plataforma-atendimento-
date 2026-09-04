import { describe, expect, it } from 'vitest';
import { agregarConsumo, projetarCiclo, type Uso } from './consumo';

/**
 * Medidor de consumo de IA (item 6.8).
 *
 * O erro possivel e o mesmo das metas: um numero de fim de mes calculado sobre a
 * base errada faz a operacao descobrir o custo na fatura.
 */

const uso = (recurso: Uso['recurso'], unidades: number, custo: number | null): Uso => ({
  recurso,
  unidades,
  custo,
});

describe('agregarConsumo', () => {
  it('sem uso nenhum, custo nulo e nao zero', () => {
    const r = agregarConsumo([]);
    expect(r.custoTotal).toBeNull();
    expect(r.usos).toBe(0);
    expect(r.porRecurso).toEqual([]);
  });

  it('custo nao informado em todos NAO vira gasto zero', () => {
    /*
     * "O motor nao informou" e diferente de "foi de graca". O uso conta, o custo
     * fica nulo — e a tela diz que o consumo nao foi informado.
     */
    const r = agregarConsumo([uso('SUGESTAO_RESPOSTA', 0, null), uso('SUGESTAO_RESPOSTA', 0, null)]);
    expect(r.custoTotal).toBeNull();
    expect(r.usos).toBe(2);
    expect(r.usosComCusto).toBe(0);
    expect(r.porRecurso[0]?.custo).toBeNull();
  });

  it('soma so o que tem custo, e diz quantos usos isso cobre', () => {
    const r = agregarConsumo([
      uso('RESUMO', 2, 0.03),
      uso('RESUMO', 3, null),
      uso('TRANSCRICAO', 10, 0.5),
    ]);
    expect(r.custoTotal).toBe(0.53);
    expect(r.usosComCusto).toBe(2);
    expect(r.unidadesTotais).toBe(15);
  });

  it('quebra por recurso, do maior gasto para o menor', () => {
    // "Gastamos demais" nao e acionavel; "a transcricao e 80% do gasto" e.
    const r = agregarConsumo([uso('RESUMO', 1, 0.01), uso('TRANSCRICAO', 1, 0.9)]);
    expect(r.porRecurso.map((x) => x.recurso)).toEqual(['TRANSCRICAO', 'RESUMO']);
  });

  it('recurso sem custo informado vai para o fim', () => {
    // Ele nao ajuda a decidir onde cortar.
    const r = agregarConsumo([uso('CLASSIFICACAO', 5, null), uso('RESUMO', 1, 0.01)]);
    expect(r.porRecurso[0]?.recurso).toBe('RESUMO');
    expect(r.porRecurso[1]?.custo).toBeNull();
  });

  it('custo em fracao pequena nao e arredondado para zero', () => {
    // Preco de token e cotado em fracao de centavo — o mesmo cuidado da tarifa
    // de voz no item 6.6.
    const r = agregarConsumo([uso('RESUMO', 1, 0.000012)]);
    expect(r.custoTotal).toBe(0.000012);
  });
});

describe('projetarCiclo', () => {
  const setembro = new Date('2026-09-01T00:00:00Z');

  it('projeta pelo ritmo do mes corrente', () => {
    // Metade do mes com metade do teto projeta o teto inteiro.
    const p = projetarCiclo({
      gastoAteAgora: 50,
      teto: 100,
      mes: setembro,
      hoje: new Date('2026-09-15T00:00:00Z'),
    });
    expect(p.projecao).toBe(100);
    expect(p.fracaoDoTeto).toBe(1);
    expect(p.situacao).toBe('DENTRO');
  });

  it('avisa quando o ritmo projeta estouro antes de estourar', () => {
    /*
     * E o unico aviso que serve: depois de estourar, a informacao chega junto com
     * a fatura.
     */
    const p = projetarCiclo({
      gastoAteAgora: 60,
      teto: 100,
      mes: setembro,
      hoje: new Date('2026-09-10T00:00:00Z'),
    });
    expect(p.projecao).toBe(180);
    expect(p.situacao).toBe('PROJETA_ESTOURO');
  });

  it('estouro consumado e outro estado', () => {
    const p = projetarCiclo({
      gastoAteAgora: 120,
      teto: 100,
      mes: setembro,
      hoje: new Date('2026-09-20T00:00:00Z'),
    });
    expect(p.situacao).toBe('ESTOUROU');
  });

  it('mes encerrado nao projeta: o gasto real e o resultado', () => {
    const p = projetarCiclo({
      gastoAteAgora: 40,
      teto: 100,
      mes: new Date('2026-08-01T00:00:00Z'),
      hoje: new Date('2026-09-15T00:00:00Z'),
    });
    expect(p.projecao).toBe(40);
  });

  it('mes futuro nao projeta nada', () => {
    const p = projetarCiclo({
      gastoAteAgora: null,
      teto: 100,
      mes: new Date('2026-12-01T00:00:00Z'),
      hoje: new Date('2026-09-15T00:00:00Z'),
    });
    expect(p.projecao).toBeNull();
    expect(p.fracaoDoTeto).toBeNull();
  });

  it('sem consumo a projecao e nula, e nao zero', () => {
    /*
     * Zero afirmaria que o mes vai fechar sem gasto. Pode ser que a IA nem tenha
     * comecado a ser usada — e o estado tem nome proprio.
     */
    const p = projetarCiclo({
      gastoAteAgora: null,
      teto: 100,
      mes: setembro,
      hoje: new Date('2026-09-15T00:00:00Z'),
    });
    expect(p.projecao).toBeNull();
    expect(p.situacao).toBe('SEM_CONSUMO');
  });

  it('sem teto nao ha fracao nem estouro', () => {
    // Teto ausente e o padrao de quem nunca configurou: a projecao aparece, o
    // percentual nao — "0% de 0" nao significa nada.
    const p = projetarCiclo({
      gastoAteAgora: 50,
      teto: null,
      mes: setembro,
      hoje: new Date('2026-09-15T00:00:00Z'),
    });
    expect(p.projecao).toBe(100);
    expect(p.fracaoDoTeto).toBeNull();
    expect(p.situacao).toBe('SEM_TETO');
  });

  it('no dia 1 ja projeta, sem dividir por zero', () => {
    const p = projetarCiclo({
      gastoAteAgora: 3,
      teto: 100,
      mes: setembro,
      hoje: new Date('2026-09-01T00:00:00Z'),
    });
    expect(p.projecao).toBe(90);
    expect(Number.isFinite(p.projecao)).toBe(true);
  });
});
