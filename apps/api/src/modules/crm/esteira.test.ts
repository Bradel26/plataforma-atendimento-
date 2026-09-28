import { describe, expect, it } from 'vitest';
import { diasDesde, papelDoEstagio, semaforo } from './esteira';
import { filtroVazio } from '../campaigns/publico';

describe('papelDoEstagio', () => {
  it('reconhece os estagios do seed, com ou sem acento', () => {
    expect(papelDoEstagio('Novo cadastro')).toBe('NOVO');
    expect(papelDoEstagio('Pendencia')).toBe('PENDENCIA');
    expect(papelDoEstagio('Pendência')).toBe('PENDENCIA');
    expect(papelDoEstagio('Aprovação')).toBe('APROVACAO');
    expect(papelDoEstagio('Credenciado')).toBe('CREDENCIADO');
    expect(papelDoEstagio('Ativo')).toBe('ATIVO');
  });

  it('trata documentacao como pendencia e analise a parte', () => {
    expect(papelDoEstagio('Documentação')).toBe('PENDENCIA');
    expect(papelDoEstagio('Análise')).toBe('ANALISE');
    expect(papelDoEstagio('Qualquer outra')).toBe('OUTRO');
  });
});

describe('semaforo', () => {
  it('normal abaixo de 70% do limite, atencao ate o limite, critico acima', () => {
    expect(semaforo(0, 5)).toBe('NORMAL');
    expect(semaforo(3, 5)).toBe('NORMAL');
    expect(semaforo(4, 5)).toBe('ATENCAO');
    expect(semaforo(5, 5)).toBe('ATENCAO');
    expect(semaforo(6, 5)).toBe('CRITICO');
  });
});

describe('diasDesde', () => {
  it('conta dias inteiros e nunca fica negativo', () => {
    const agora = Date.UTC(2026, 8, 28, 12);
    expect(diasDesde(new Date(Date.UTC(2026, 8, 25, 13)), agora)).toBe(2);
    expect(diasDesde(new Date(agora + 10_000), agora)).toBe(0);
  });
});

describe('filtroVazio com filtros da esteira', () => {
  it('situacao, UF, operacao e etapa contam como filtro', () => {
    expect(filtroVazio({})).toBe(true);
    expect(filtroVazio({ situacao: ['TODOS'] })).toBe(false);
    expect(filtroVazio({ uf: ['PA'] })).toBe(false);
    expect(filtroVazio({ funilIds: ['x'] })).toBe(false);
    expect(filtroVazio({ estagioIds: ['x'] })).toBe(false);
  });
});
