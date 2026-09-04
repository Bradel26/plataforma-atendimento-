import { describe, expect, it } from 'vitest';
import { matrizProdutividade, type AtividadeParaProdutividade } from './produtividade';

const ANA = { id: 'ana', nome: 'Ana' };
const BRUNO = { id: 'bruno', nome: 'Bruno' };

let seq = 0;
const atividade = (parcial: Partial<AtividadeParaProdutividade>): AtividadeParaProdutividade => ({
  id: `a${seq++}`,
  titulo: 'Atividade',
  tipo: 'LIGACAO',
  prazo: new Date('2026-09-10T12:00:00Z'),
  concluidoEm: null,
  responsavel: ANA,
  ...parcial,
});

describe('matrizProdutividade', () => {
  it('atividade sem prazo nao conta nem como agendada nem como feita', () => {
    const linhas = matrizProdutividade([
      atividade({ prazo: null, concluidoEm: new Date('2026-09-10T13:00:00Z') }),
    ]);
    // Nenhuma atividade agendada: o usuario nem aparece na matriz.
    expect(linhas).toHaveLength(0);
  });

  it('atividade sem responsavel nao entra em linha nenhuma', () => {
    const linhas = matrizProdutividade([atividade({ responsavel: null })]);
    expect(linhas).toHaveLength(0);
  });

  it('celula sem nenhuma atividade agendada e nula, nao zero', () => {
    const linhas = matrizProdutividade([atividade({ tipo: 'LIGACAO' })]);
    expect(linhas[0]!.porTipo.EMAIL).toBeNull();
    expect(linhas[0]!.porTipo.LIGACAO).not.toBeNull();
  });

  it('feitas conta so as agendadas que foram concluidas', () => {
    const linhas = matrizProdutividade([
      atividade({ tipo: 'LIGACAO', concluidoEm: new Date('2026-09-10T13:00:00Z') }),
      atividade({ tipo: 'LIGACAO', concluidoEm: null }),
      atividade({ tipo: 'LIGACAO', concluidoEm: null }),
    ]);
    const celula = linhas[0]!.porTipo.LIGACAO!;
    expect(celula.agendadas).toBe(3);
    expect(celula.feitas).toBe(1);
    expect(celula.percentual).toBe(33);
  });

  it('100% quando todas as agendadas foram feitas', () => {
    const linhas = matrizProdutividade([
      atividade({ tipo: 'VISITA', concluidoEm: new Date('2026-09-10T13:00:00Z') }),
    ]);
    expect(linhas[0]!.porTipo.VISITA!.percentual).toBe(100);
  });

  it('0% quando nenhuma agendada foi feita — diferente de nula (sem agendada nenhuma)', () => {
    const linhas = matrizProdutividade([atividade({ tipo: 'VISITA', concluidoEm: null })]);
    expect(linhas[0]!.porTipo.VISITA!.percentual).toBe(0);
    expect(linhas[0]!.porTipo.VISITA).not.toBeNull();
  });

  it('total da linha soma todos os tipos, nao so o mais frequente', () => {
    const linhas = matrizProdutividade([
      atividade({ tipo: 'LIGACAO', concluidoEm: new Date('2026-09-10T13:00:00Z') }),
      atividade({ tipo: 'EMAIL', concluidoEm: null }),
    ]);
    expect(linhas[0]!.total.agendadas).toBe(2);
    expect(linhas[0]!.total.feitas).toBe(1);
    expect(linhas[0]!.total.percentual).toBe(50);
  });

  it('duas pessoas viram duas linhas, cada uma com o proprio numero', () => {
    const linhas = matrizProdutividade([
      atividade({ responsavel: ANA, tipo: 'LIGACAO', concluidoEm: new Date('2026-09-10T13:00:00Z') }),
      atividade({ responsavel: BRUNO, tipo: 'LIGACAO', concluidoEm: null }),
    ]);
    expect(linhas).toHaveLength(2);
    const ana = linhas.find((l) => l.usuarioId === 'ana')!;
    const bruno = linhas.find((l) => l.usuarioId === 'bruno')!;
    expect(ana.porTipo.LIGACAO!.percentual).toBe(100);
    expect(bruno.porTipo.LIGACAO!.percentual).toBe(0);
  });

  it('linhas vem ordenadas por nome', () => {
    const linhas = matrizProdutividade([
      atividade({ responsavel: BRUNO }),
      atividade({ responsavel: ANA }),
    ]);
    expect(linhas.map((l) => l.usuarioNome)).toEqual(['Ana', 'Bruno']);
  });

  it('a lista de atividades da celula vem ordenada por prazo, para o drill-down', () => {
    const linhas = matrizProdutividade([
      atividade({ tipo: 'EMAIL', prazo: new Date('2026-09-15T00:00:00Z'), titulo: 'Segunda' }),
      atividade({ tipo: 'EMAIL', prazo: new Date('2026-09-05T00:00:00Z'), titulo: 'Primeira' }),
    ]);
    expect(linhas[0]!.porTipo.EMAIL!.atividades.map((a) => a.titulo)).toEqual(['Primeira', 'Segunda']);
  });

  it('lista vazia produz matriz vazia', () => {
    expect(matrizProdutividade([])).toEqual([]);
  });
});
