import { describe, expect, it } from 'vitest';
import { CICLOS, cicloDeVida, funilDeCicloDeVida, type FatosDoContato } from './cicloDeVida';

const NADA: FatosDoContato = {
  oportunidadesGanhas: 0,
  oportunidadesAbertas: 0,
  oportunidadesPerdidas: 0,
  leadsQualificados: 0,
  leads: 0,
  conversas: 0,
};

describe('cicloDeVida', () => {
  it('cadastro sem nada e LEAD', () => {
    expect(cicloDeVida(NADA)).toBe('LEAD');
  });

  it('conversa faz o contato virar CONTATADO — o "suspect" da demonstracao', () => {
    expect(cicloDeVida({ ...NADA, conversas: 1 })).toBe('CONTATADO');
  });

  it('lead na entrada tambem e CONTATADO, mesmo sem conversa', () => {
    // Lead importado de feira: alguem sabe que a pessoa existe.
    expect(cicloDeVida({ ...NADA, leads: 1 })).toBe('CONTATADO');
  });

  it('lead que passou da triagem e QUALIFICADO', () => {
    expect(cicloDeVida({ ...NADA, leads: 1, leadsQualificados: 1, conversas: 3 })).toBe('QUALIFICADO');
  });

  it('negociacao aberta e EM_NEGOCIACAO', () => {
    expect(cicloDeVida({ ...NADA, oportunidadesAbertas: 1, conversas: 5 })).toBe('EM_NEGOCIACAO');
  });

  it('oportunidade ganha e CLIENTE', () => {
    expect(cicloDeVida({ ...NADA, oportunidadesGanhas: 1 })).toBe('CLIENTE');
  });

  it('quem comprou continua CLIENTE mesmo negociando de novo', () => {
    // Precedencia: compra e o fato mais forte, e ele nao expira.
    expect(cicloDeVida({ ...NADA, oportunidadesGanhas: 1, oportunidadesAbertas: 2 })).toBe('CLIENTE');
  });

  it('perda antiga com proposta em analise hoje e EM_NEGOCIACAO', () => {
    // O degrau descreve o presente: nao faz sentido chamar de "perdido" quem
    // esta com proposta na mesa agora.
    expect(cicloDeVida({ ...NADA, oportunidadesPerdidas: 3, oportunidadesAbertas: 1 })).toBe(
      'EM_NEGOCIACAO',
    );
  });

  it('quem perdeu e nao tem nada aberto e PERDIDO, e nao volta a QUALIFICADO', () => {
    // Campanha para quem disse "nao" e campanha diferente; juntar os dois faria
    // a lista de qualificados prometer mais do que tem.
    expect(cicloDeVida({ ...NADA, oportunidadesPerdidas: 1, leadsQualificados: 1 })).toBe('PERDIDO');
  });

  it('nenhum degrau depende de quantos dias faz', () => {
    // Guarda contra "INATIVO ha 90 dias": os fatos de entrada sao contagens, e o
    // tipo nao tem data nenhuma para um limiar se apoiar.
    expect(Object.keys(NADA).some((k) => /em$|data|dias/i.test(k))).toBe(false);
  });

  it('todo degrau da escada e alcancavel por algum conjunto de fatos', () => {
    // Sem isto, um degrau podia ficar inalcancavel por uma precedencia errada e
    // ninguem notaria — ele so nunca apareceria na tela.
    const alcancados = new Set([
      cicloDeVida(NADA),
      cicloDeVida({ ...NADA, conversas: 1 }),
      cicloDeVida({ ...NADA, leadsQualificados: 1 }),
      cicloDeVida({ ...NADA, oportunidadesPerdidas: 1 }),
      cicloDeVida({ ...NADA, oportunidadesAbertas: 1 }),
      cicloDeVida({ ...NADA, oportunidadesGanhas: 1 }),
    ]);
    expect([...alcancados].sort()).toEqual([...CICLOS].sort());
  });
});

describe('funilDeCicloDeVida', () => {
  it('conta cada contato em exatamente um degrau, e a soma e o total', () => {
    const f = funilDeCicloDeVida(['CLIENTE', 'CLIENTE', 'LEAD', 'EM_NEGOCIACAO']);
    expect(f.total).toBe(4);
    expect(f.degraus.reduce((a, d) => a + d.total, 0)).toBe(4);
  });

  it('mantem os seis degraus, inclusive os vazios', () => {
    // Degrau que desaparece em zero faz a escada mudar de forma a cada leitura,
    // e some justamente quando "nao temos nenhum qualificado" e a informacao.
    const f = funilDeCicloDeVida(['LEAD']);
    expect(f.degraus.map((d) => d.ciclo)).toEqual([...CICLOS]);
  });

  it('sai na ordem da escada, do mais avancado para o menos', () => {
    const f = funilDeCicloDeVida([]);
    expect(f.degraus[0]?.ciclo).toBe('CLIENTE');
    expect(f.degraus[f.degraus.length - 1]?.ciclo).toBe('LEAD');
  });

  it('base vazia tem fracao nula, e nao zero por cento', () => {
    const f = funilDeCicloDeVida([]);
    expect(f.total).toBe(0);
    expect(f.degraus.every((d) => d.fracao === null)).toBe(true);
  });

  it('a fracao e sobre o total da base', () => {
    const f = funilDeCicloDeVida(['CLIENTE', 'LEAD', 'LEAD', 'LEAD']);
    expect(f.degraus.find((d) => d.ciclo === 'CLIENTE')?.fracao).toBe(0.25);
    expect(f.degraus.find((d) => d.ciclo === 'LEAD')?.fracao).toBe(0.75);
  });

  it('degrau vazio numa base povoada tem fracao zero, e nao nula', () => {
    // Aqui zero e verdade: existe base, e ninguem esta neste degrau. Nulo diria
    // "nao da para calcular", que seria falso.
    const f = funilDeCicloDeVida(['CLIENTE']);
    expect(f.degraus.find((d) => d.ciclo === 'LEAD')?.fracao).toBe(0);
  });
});
