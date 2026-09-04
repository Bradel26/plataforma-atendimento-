import { describe, expect, it } from 'vitest';
import { diasDaSemana, montarAgenda, segundaDaSemana, type ItemDaAgenda } from './agenda';

/** Brasil: `getTimezoneOffset()` devolve 180 (minutos a subtrair para virar UTC). */
const BR = 180;

const tarefa = (over: Partial<ItemDaAgenda> & { id: string }): ItemDaAgenda => ({
  titulo: 'Tarefa',
  tipo: 'TAREFA',
  prazo: null,
  concluidoEm: null,
  ...over,
});

describe('diasDaSemana', () => {
  it('devolve sete dias em sequencia', () => {
    const dias = diasDaSemana('2026-09-07', BR);
    expect(dias.map((d) => d.dia)).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
    ]);
  });

  it('o dia comeca a meia-noite de QUEM PEDIU, e nao em UTC', () => {
    // No Brasil, 00h de 07/09 local e 03h UTC do mesmo dia.
    const [primeiro] = diasDaSemana('2026-09-07', BR);
    expect(primeiro?.inicio.toISOString()).toBe('2026-09-07T03:00:00.000Z');
  });

  it('com fuso zero, o dia comeca a meia-noite UTC', () => {
    const [primeiro] = diasDaSemana('2026-09-07', 0);
    expect(primeiro?.inicio.toISOString()).toBe('2026-09-07T00:00:00.000Z');
  });

  it('cada dia termina onde o proximo comeca — sem buraco nem sobreposicao', () => {
    const dias = diasDaSemana('2026-09-07', BR);
    for (let i = 0; i < dias.length - 1; i += 1) {
      expect(dias[i]!.fim.getTime()).toBe(dias[i + 1]!.inicio.getTime());
    }
  });

  it('atravessa a virada de mes sem tropecar', () => {
    const dias = diasDaSemana('2026-09-28', BR);
    expect(dias.map((d) => d.dia)).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
  });

  it('recusa data invalida em vez de devolver semana errada', () => {
    expect(() => diasDaSemana('nao-e-data', BR)).toThrow();
  });
});

describe('segundaDaSemana', () => {
  it('quarta-feira volta para a segunda', () => {
    // 2026-09-09 e uma quarta.
    expect(segundaDaSemana(new Date('2026-09-09T12:00:00Z'), BR)).toBe('2026-09-07');
  });

  it('segunda devolve ela mesma', () => {
    expect(segundaDaSemana(new Date('2026-09-07T12:00:00Z'), BR)).toBe('2026-09-07');
  });

  it('domingo pertence a semana que COMECOU, e nao a que vai comecar', () => {
    // A semana de trabalho comeca na segunda; domingo fecha a semana anterior.
    expect(segundaDaSemana(new Date('2026-09-13T12:00:00Z'), BR)).toBe('2026-09-07');
  });

  it('respeita o fuso na virada do dia', () => {
    // Segunda 01h UTC ainda e domingo no Brasil (22h), entao a semana e a
    // anterior. Sem o deslocamento, a agenda pularia uma semana a meia-noite.
    expect(segundaDaSemana(new Date('2026-09-14T01:00:00Z'), BR)).toBe('2026-09-07');
    expect(segundaDaSemana(new Date('2026-09-14T01:00:00Z'), 0)).toBe('2026-09-14');
  });
});

describe('montarAgenda', () => {
  const dias = diasDaSemana('2026-09-07', BR);
  const dentro = (diaLocal: string, hora = '10:00') =>
    new Date(`${diaLocal}T${hora}:00-03:00`);

  it('põe cada tarefa no dia do prazo dela', () => {
    const a = montarAgenda(
      [
        tarefa({ id: 'seg', prazo: dentro('2026-09-07') }),
        tarefa({ id: 'qua', prazo: dentro('2026-09-09') }),
      ],
      dias,
    );
    expect(a.dias.find((d) => d.dia === '2026-09-07')?.itens.map((i) => i.id)).toEqual(['seg']);
    expect(a.dias.find((d) => d.dia === '2026-09-09')?.itens.map((i) => i.id)).toEqual(['qua']);
  });

  it('a tarefa das 22h de sabado fica no SABADO, e nao no domingo', () => {
    // O caso que o fuso quebra: 22h de sabado no Brasil e 01h de domingo em UTC.
    const a = montarAgenda([tarefa({ id: 'sab', prazo: dentro('2026-09-12', '22:00') })], dias);
    expect(a.dias.find((d) => d.dia === '2026-09-12')?.itens.map((i) => i.id)).toEqual(['sab']);
    expect(a.dias.find((d) => d.dia === '2026-09-13')?.itens).toEqual([]);
  });

  it('atrasada da semana passada aparece em faixa propria', () => {
    // Uma agenda que so mostra a semana corrente esconde o trabalho mais urgente.
    const a = montarAgenda([tarefa({ id: 'velha', prazo: dentro('2026-09-01') })], dias);
    expect(a.atrasadas.map((i) => i.id)).toEqual(['velha']);
    expect(a.totalNaSemana).toBe(0);
  });

  it('atrasada CONCLUIDA nao aparece como atraso', () => {
    // Atraso e sobre compromisso em aberto; concluido nao cobra nada de ninguem.
    const a = montarAgenda(
      [tarefa({ id: 'feita', prazo: dentro('2026-09-01'), concluidoEm: dentro('2026-09-02') })],
      dias,
    );
    expect(a.atrasadas).toEqual([]);
  });

  it('tarefa sem prazo e contada a parte, e nao empurrada para hoje', () => {
    // A tarefa que a etapa do funil exige (item 3.1) nasce sem prazo; inventar um
    // dia para ela seria afirmar um compromisso que ninguem marcou.
    const a = montarAgenda([tarefa({ id: 'etapa', obrigatoria: true })], dias);
    expect(a.semPrazo.map((i) => i.id)).toEqual(['etapa']);
    expect(a.totalNaSemana).toBe(0);
    expect(a.atrasadas).toEqual([]);
  });

  it('concluida sem prazo sai da agenda: nao e trabalho a fazer nem atraso', () => {
    const a = montarAgenda([tarefa({ id: 'x', concluidoEm: new Date() })], dias);
    expect(a.semPrazo).toEqual([]);
    expect(a.totalNaSemana).toBe(0);
  });

  it('concluida DENTRO da semana continua no dia dela', () => {
    // A agenda tambem serve para olhar para tras; esconder o concluido faria a
    // semana passada parecer vazia.
    const a = montarAgenda(
      [tarefa({ id: 'ok', prazo: dentro('2026-09-08'), concluidoEm: dentro('2026-09-08') })],
      dias,
    );
    expect(a.dias.find((d) => d.dia === '2026-09-08')?.itens.map((i) => i.id)).toEqual(['ok']);
  });

  it('tarefa da semana seguinte nao entra', () => {
    const a = montarAgenda([tarefa({ id: 'futura', prazo: dentro('2026-09-14') })], dias);
    expect(a.totalNaSemana).toBe(0);
    expect(a.atrasadas).toEqual([]);
  });

  it('ordena o dia pelo horario, e nao pela ordem de chegada', () => {
    const a = montarAgenda(
      [
        tarefa({ id: 'tarde', prazo: dentro('2026-09-07', '16:00') }),
        tarefa({ id: 'manha', prazo: dentro('2026-09-07', '08:00') }),
      ],
      dias,
    );
    expect(a.dias.find((d) => d.dia === '2026-09-07')?.itens.map((i) => i.id)).toEqual([
      'manha',
      'tarde',
    ]);
  });

  it('sai com os sete dias, inclusive os vazios', () => {
    // Dia que desaparece por estar vazio faz a semana mudar de forma e esconde
    // justamente o dia livre, que e informacao para quem vai marcar visita.
    const a = montarAgenda([], dias);
    expect(a.dias).toHaveLength(7);
    expect(a.dias.every((d) => d.itens.length === 0)).toBe(true);
  });

  it('semana vazia nao inventa numero', () => {
    const a = montarAgenda([], []);
    expect(a).toEqual({ atrasadas: [], dias: [], semPrazo: [], totalNaSemana: 0 });
  });

  it('nao muda a lista recebida', () => {
    const itens = [
      tarefa({ id: 'b', prazo: dentro('2026-09-09') }),
      tarefa({ id: 'a', prazo: dentro('2026-09-07') }),
    ];
    montarAgenda(itens, dias);
    expect(itens.map((i) => i.id)).toEqual(['b', 'a']);
  });
});
