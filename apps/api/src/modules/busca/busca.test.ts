import { describe, expect, it } from 'vitest';
import { ordenarResultados, type Resultado } from './busca.service';

/**
 * Busca global (item 6.2). A ordem **e** o recurso: uma paleta que devolve o
 * registro certo na setima linha nao economiza tempo de ninguem.
 */

const r = (titulo: string, id = titulo): Resultado => ({
  tipo: 'CONTA',
  id,
  titulo,
  detalhe: null,
  rota: `/clientes/${id}`,
});

describe('ordenarResultados', () => {
  it('quem comeca com o termo vem antes de quem contem no meio', () => {
    const saida = ordenarResultados([r('Mercado Acougueiro'), r('Acougue Central')], 'aco');
    expect(saida.map((x) => x.titulo)).toEqual(['Acougue Central', 'Mercado Acougueiro']);
  });

  it('casamento que veio do detalhe fica por ultimo', () => {
    /*
     * O contato achado pelo telefone e um resultado legitimo, mas quem digitou
     * "aco" estava procurando pelo nome — e o que casa pelo nome tem de vir
     * primeiro.
     */
    const porDetalhe: Resultado = { ...r('Joao Silva', 'j1'), detalhe: '62999990000' };
    const saida = ordenarResultados([porDetalhe, r('Acougue Central')], 'aco');
    expect(saida[0]?.titulo).toBe('Acougue Central');
  });

  it('entre dois que comecam igual, o titulo mais curto vem antes', () => {
    // "Bradel" antes de "Bradel Filial Anapolis Centro": o mais curto e quase
    // sempre o que a pessoa quis.
    const saida = ordenarResultados([r('Bradel Filial Anapolis Centro'), r('Bradel')], 'bradel');
    expect(saida[0]?.titulo).toBe('Bradel');
  });

  it('ignora caixa', () => {
    const saida = ordenarResultados([r('zzz'), r('ACOUGUE')], 'aco');
    expect(saida[0]?.titulo).toBe('ACOUGUE');
  });

  it('empate total desempata por id, para a ordem nao piscar', () => {
    /*
     * Dois registros de mesmo nome e mesmo tamanho: sem desempate estavel, duas
     * execucoes da mesma busca podem trocar a ordem, e a lista "pisca" quando a
     * pessoa redigita a mesma letra.
     */
    const a = ordenarResultados([r('Igual', 'b'), r('Igual', 'a')], 'igual');
    const b = ordenarResultados([r('Igual', 'a'), r('Igual', 'b')], 'igual');
    expect(a.map((x) => x.id)).toEqual(['a', 'b']);
    expect(b.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('termo vazio nao reordena nada', () => {
    // Sem termo nao existe "forca de casamento"; inventar uma ordem aqui
    // esconderia a ordem que a consulta ja deu (mais recentes primeiro).
    const entrada = [r('zzz'), r('aaa')];
    expect(ordenarResultados(entrada, '  ').map((x) => x.titulo)).toEqual(['zzz', 'aaa']);
  });

  it('nao muda a lista recebida', () => {
    const entrada = [r('Mercado'), r('Acougue')];
    ordenarResultados(entrada, 'aco');
    expect(entrada.map((x) => x.titulo)).toEqual(['Mercado', 'Acougue']);
  });
});
