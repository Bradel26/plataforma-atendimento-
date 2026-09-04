import { describe, expect, it } from 'vitest';
import {
  coordenadaValida,
  duracaoEmMinutos,
  estadoDaVisita,
  impedimentoDoCheckin,
  impedimentoDoCheckout,
  resumirVisitas,
} from './visita';

const t = (iso: string) => new Date(iso);

describe('estadoDaVisita', () => {
  it('sem check-in, nao iniciada', () => {
    expect(estadoDaVisita({ checkinEm: null, checkoutEm: null })).toBe('NAO_INICIADA');
  });

  it('com check-in e sem check-out, em andamento', () => {
    expect(estadoDaVisita({ checkinEm: t('2026-09-03T13:00:00Z'), checkoutEm: null })).toBe('EM_ANDAMENTO');
  });

  it('com os dois, concluida', () => {
    expect(
      estadoDaVisita({ checkinEm: t('2026-09-03T13:00:00Z'), checkoutEm: t('2026-09-03T14:00:00Z') }),
    ).toBe('CONCLUIDA');
  });
});

describe('duracaoEmMinutos', () => {
  it('conta os minutos entre chegada e saida', () => {
    expect(
      duracaoEmMinutos({ checkinEm: t('2026-09-03T13:00:00Z'), checkoutEm: t('2026-09-03T14:30:00Z') }),
    ).toBe(90);
  });

  it('visita em andamento devolve NULO, e nao zero', () => {
    /*
     * Zero entraria em qualquer media futura arrastando o numero para baixo — e
     * uma visita que esta acontecendo agora nao durou zero minuto.
     */
    expect(duracaoEmMinutos({ checkinEm: t('2026-09-03T13:00:00Z'), checkoutEm: null })).toBeNull();
    expect(duracaoEmMinutos({ checkinEm: null, checkoutEm: null })).toBeNull();
  });

  it('visita de segundos conta como um minuto', () => {
    // "0 min" descreveria mal uma visita que aconteceu.
    expect(
      duracaoEmMinutos({ checkinEm: t('2026-09-03T13:00:00Z'), checkoutEm: t('2026-09-03T13:00:20Z') }),
    ).toBe(1);
  });

  it('arredonda para o minuto mais proximo', () => {
    expect(
      duracaoEmMinutos({ checkinEm: t('2026-09-03T13:00:00Z'), checkoutEm: t('2026-09-03T13:02:40Z') }),
    ).toBe(3);
  });
});

describe('impedimentoDoCheckin', () => {
  const visita = { tipo: 'VISITA', checkinEm: null, checkoutEm: null };

  it('visita sem check-in pode entrar', () => {
    expect(impedimentoDoCheckin(visita)).toBeNull();
  });

  it('outro tipo de atividade nao tem check-in', () => {
    // Permitir em qualquer tipo produziria "check-in de e-mail" — um dado que
    // ninguem sabe ler depois, no meio dos que importam.
    expect(impedimentoDoCheckin({ ...visita, tipo: 'EMAIL' })).toContain('Visita');
  });

  it('check-in duas vezes e recusado, e nao sobrescrito', () => {
    /*
     * Sobrescrever apagaria a hora real da chegada — exatamente o dado que o
     * check-in existe para guardar. Quem apertou duas vezes por engano continua
     * com a primeira hora, que e a verdadeira.
     */
    expect(impedimentoDoCheckin({ ...visita, checkinEm: t('2026-09-03T13:00:00Z') })).toContain('já tem check-in');
  });
});

describe('impedimentoDoCheckout', () => {
  const emAndamento = { tipo: 'VISITA', checkinEm: t('2026-09-03T13:00:00Z'), checkoutEm: null };

  it('visita em andamento pode encerrar', () => {
    expect(impedimentoDoCheckout(emAndamento)).toBeNull();
  });

  it('sem check-in nao ha o que encerrar', () => {
    const m = impedimentoDoCheckout({ tipo: 'VISITA', checkinEm: null, checkoutEm: null });
    expect(m).toContain('check-in');
  });

  it('encerrar duas vezes e recusado', () => {
    expect(
      impedimentoDoCheckout({ ...emAndamento, checkoutEm: t('2026-09-03T14:00:00Z') }),
    ).toContain('já foi encerrada');
  });
});

describe('coordenadaValida', () => {
  it('aceita coordenada de Goiania', () => {
    expect(coordenadaValida(-16.6869, -49.2648)).toEqual({ lat: -16.6869, lng: -49.2648 });
  });

  it('recusa 0,0 — o GPS falhando, nao o Golfo da Guine', () => {
    expect(coordenadaValida(0, 0)).toBeNull();
  });

  it('recusa fora de faixa', () => {
    // Latitude 91 nao existe; gravar isso poria um alfinete em lugar nenhum.
    expect(coordenadaValida(91, 0)).toBeNull();
    expect(coordenadaValida(0, 181)).toBeNull();
  });

  it('ausencia devolve nulo sem reclamar', () => {
    /*
     * Coordenada ausente NAO impede o check-in: o tecnico pode estar num
     * subsolo, com GPS negado ou sem sinal, e recusar o registro nesse caso o
     * impediria justamente na visita mais dificil.
     */
    expect(coordenadaValida(undefined, undefined)).toBeNull();
    expect(coordenadaValida('-16.6', '-49.2')).toBeNull();
    expect(coordenadaValida(Number.NaN, 0)).toBeNull();
  });
});

describe('resumirVisitas', () => {
  it('conta os tres estados', () => {
    const r = resumirVisitas([
      { checkinEm: null, checkoutEm: null },
      { checkinEm: t('2026-09-03T13:00:00Z'), checkoutEm: null },
      { checkinEm: t('2026-09-03T09:00:00Z'), checkoutEm: t('2026-09-03T10:00:00Z') },
    ]);
    expect(r).toMatchObject({ total: 3, naoIniciadas: 1, emAndamento: 1, concluidas: 1 });
  });

  it('a media ignora as que nao terminaram', () => {
    // Uma visita em andamento contada como zero puxaria a media para baixo e
    // faria a operacao parecer mais rapida do que e.
    const r = resumirVisitas([
      { checkinEm: t('2026-09-03T09:00:00Z'), checkoutEm: t('2026-09-03T10:00:00Z') },
      { checkinEm: t('2026-09-03T13:00:00Z'), checkoutEm: null },
    ]);
    expect(r.duracaoMediaMinutos).toBe(60);
    expect(r.minutosEmVisita).toBe(60);
  });

  it('nenhuma concluida devolve media nula', () => {
    const r = resumirVisitas([{ checkinEm: t('2026-09-03T13:00:00Z'), checkoutEm: null }]);
    expect(r.duracaoMediaMinutos).toBeNull();
  });

  it('lista vazia nao inventa numero', () => {
    expect(resumirVisitas([])).toMatchObject({ total: 0, duracaoMediaMinutos: null, minutosEmVisita: 0 });
  });
});
