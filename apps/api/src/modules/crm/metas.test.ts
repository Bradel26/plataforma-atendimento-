import { describe, expect, it } from 'vitest';
import {
  competencia,
  conferirSomaDaEquipe,
  diasNoMes,
  mesesEntre,
  montarProgresso,
  progressoDaMeta,
  proximoMes,
} from './metas';

const mes = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('competencia e limites do mes', () => {
  it('normaliza qualquer dia para o dia 1', () => {
    expect(competencia(mes('2026-09-17')).toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('o proximo mes atravessa a virada de ano', () => {
    expect(proximoMes(mes('2026-12-01')).toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('conta os dias do mes, inclusive fevereiro bissexto', () => {
    expect(diasNoMes(mes('2026-02-01'))).toBe(28);
    expect(diasNoMes(mes('2028-02-01'))).toBe(29);
    expect(diasNoMes(mes('2026-09-01'))).toBe(30);
  });
});

describe('mesesEntre', () => {
  it('inclui os dois extremos', () => {
    const r = mesesEntre(mes('2026-09-10'), mes('2026-12-31'));
    expect(r.map((d) => d.toISOString().slice(0, 7))).toEqual(['2026-09', '2026-10', '2026-11', '2026-12']);
  });

  it('um mes so quando de e ate caem no mesmo mes', () => {
    expect(mesesEntre(mes('2026-09-01'), mes('2026-09-30'))).toHaveLength(1);
  });

  it('intervalo invertido devolve vazio, e nao a ordem trocada', () => {
    // Gerar a rampa de tras para frente criaria metas em meses que ninguem
    // pediu, e o formulario nao teria como avisar.
    expect(mesesEntre(mes('2026-12-01'), mes('2026-09-01'))).toEqual([]);
  });

  it('teto de 36 meses: data digitada errada nao vira mil linhas', () => {
    expect(mesesEntre(mes('2026-01-01'), mes('2226-01-01'))).toHaveLength(36);
  });
});

describe('progressoDaMeta', () => {
  const setembro = mes('2026-09-01');

  it('meta batida no meio do mes ja conta como atingida', () => {
    const p = progressoDaMeta({ meta: 10_000, realizado: 12_000, mes: setembro, hoje: mes('2026-09-15') });
    expect(p.situacao).toBe('ATINGIDA');
    expect(p.percentual).toBeCloseTo(1.2);
    // Falta negativo e informacao: diz de quanto passou.
    expect(p.falta).toBe(-2000);
  });

  it('projeta pelo ritmo do mes corrente', () => {
    // Metade do mes com metade da meta projeta a meta inteira.
    const p = progressoDaMeta({ meta: 10_000, realizado: 5000, mes: setembro, hoje: mes('2026-09-15') });
    expect(p.projecao).toBe(10_000);
    expect(p.situacao).toBe('NO_RITMO');
    expect(p.variacao).toBe(0);
  });

  it('abaixo do ritmo aparece como abaixo, com variacao negativa', () => {
    const p = progressoDaMeta({ meta: 10_000, realizado: 2000, mes: setembro, hoje: mes('2026-09-15') });
    expect(p.projecao).toBe(4000);
    expect(p.variacao).toBe(-6000);
    expect(p.situacao).toBe('ABAIXO');
  });

  it('no dia 1 ja projeta, sem dividir por zero', () => {
    /*
     * Meia-noite do dia 1 com "zero dias decorridos" daria divisao por zero, e
     * comecar a projetar so no dia 2 esconderia o mes exatamente no dia em que
     * alguem abre a tela para ver se comecou bem.
     */
    const p = progressoDaMeta({ meta: 30_000, realizado: 1000, mes: setembro, hoje: mes('2026-09-01') });
    expect(p.projecao).toBe(30_000);
    expect(Number.isFinite(p.projecao)).toBe(true);
  });

  it('mes encerrado nao tem projecao inventada: o realizado e o resultado', () => {
    const p = progressoDaMeta({ meta: 10_000, realizado: 7000, mes: mes('2026-08-01'), hoje: mes('2026-09-15') });
    expect(p.projecao).toBe(7000);
    expect(p.ritmoNecessario).toBeNull();
  });

  it('mes futuro nao projeta nada — nao ha ritmo de que extrapolar', () => {
    const p = progressoDaMeta({ meta: 10_000, realizado: 0, mes: mes('2026-12-01'), hoje: mes('2026-09-15') });
    expect(p.projecao).toBeNull();
    expect(p.variacao).toBeNull();
  });

  it('sem meta o percentual e nulo, nao zero', () => {
    /*
     * A regra da decisao 56, aqui de novo: `0%` afirma "nao atingiu nada"; nulo
     * diz "nao ha meta contra o que medir". A venda continua aparecendo.
     */
    const p = progressoDaMeta({ meta: 0, realizado: 4000, mes: setembro, hoje: mes('2026-09-15') });
    expect(p.percentual).toBeNull();
    expect(p.variacao).toBeNull();
    expect(p.situacao).toBe('SEM_META');
    expect(p.realizado).toBe(4000);
  });

  it('ritmo necessario e por dia restante, e nunca negativo', () => {
    const p = progressoDaMeta({ meta: 30_000, realizado: 0, mes: setembro, hoje: mes('2026-09-20') });
    // Dez dias restantes para trinta mil.
    expect(p.ritmoNecessario).toBe(3000);

    const batida = progressoDaMeta({ meta: 10_000, realizado: 20_000, mes: setembro, hoje: mes('2026-09-20') });
    // Ja passou: o ritmo necessario e zero, nao um numero negativo que nao
    // significaria nada na tela.
    expect(batida.ritmoNecessario).toBe(0);
  });

  it('no ultimo dia do mes nao ha dia restante para exigir ritmo', () => {
    const p = progressoDaMeta({ meta: 10_000, realizado: 1000, mes: setembro, hoje: mes('2026-09-30') });
    expect(p.ritmoNecessario).toBeNull();
  });
});

describe('montarProgresso', () => {
  const setembro = mes('2026-09-01');
  const hoje = mes('2026-09-15');

  it('quem tem meta e nao vendeu aparece com zero de verdade', () => {
    const { linhas } = montarProgresso(
      [{ usuarioId: 'u1', nome: 'Ana', escopo: 'INDIVIDUAL', valor: 10_000 }],
      new Map(),
      setembro,
      hoje,
    );
    expect(linhas[0]?.realizado).toBe(0);
    expect(linhas[0]?.percentual).toBe(0);
  });

  it('quem vendeu sem meta e apontado, nao escondido', () => {
    /*
     * Esconder a venda porque ninguem definiu meta faria o total da tela
     * discordar do funil, e a primeira conclusao de quem olhasse seria que a
     * plataforma perdeu venda.
     */
    const { semMetaDefinida } = montarProgresso(
      [{ usuarioId: 'u1', nome: 'Ana', escopo: 'INDIVIDUAL', valor: 10_000 }],
      new Map([
        ['u1', 5000],
        ['u2', 3000],
      ]),
      setembro,
      hoje,
    );
    expect(semMetaDefinida).toEqual(['u2']);
  });

  it('meta de equipe nao conta como meta individual de ninguem', () => {
    // O gestor com meta de equipe e sem meta individual continua na lista de
    // "sem meta definida" se vendeu — sao dois numeros diferentes.
    const { semMetaDefinida } = montarProgresso(
      [{ usuarioId: 'g1', nome: 'Gestor', escopo: 'EQUIPE', valor: 50_000 }],
      new Map([['g1', 8000]]),
      setembro,
      hoje,
    );
    expect(semMetaDefinida).toEqual(['g1']);
  });
});

describe('conferirSomaDaEquipe', () => {
  it('mostra a diferenca entre a meta do time e a soma dos individuais', () => {
    // Acima da soma e desafio declarado; abaixo e folga. Somar tudo num numero
    // apagaria a distincao — e contaria a venda do gestor duas vezes, porque ele
    // esta dentro da propria equipe.
    const r = conferirSomaDaEquipe(100_000, [30_000, 30_000, 25_000]);
    expect(r.somaIndividuais).toBe(85_000);
    expect(r.diferenca).toBe(15_000);
  });

  it('sem individuais a soma e zero e a diferenca e a propria meta', () => {
    expect(conferirSomaDaEquipe(50_000, []).diferenca).toBe(50_000);
  });
});
