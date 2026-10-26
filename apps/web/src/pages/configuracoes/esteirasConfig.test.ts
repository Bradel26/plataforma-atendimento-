import { describe, expect, it } from 'vitest';
import { corpoDaEtapa, nivelNaTela, corpoDasOperacoes } from './esteirasConfig';

describe('nivelNaTela', () => {
  it('quem não aparece na resposta está sem acesso', () => {
    expect(nivelNaTela({ TIM: 'EDICAO' }, 'STARLINK')).toBe('SEM_ACESSO');
    expect(nivelNaTela({ TIM: 'LEITURA' }, 'TIM')).toBe('LEITURA');
  });
});

describe('corpoDasOperacoes', () => {
  it('manda só a operação alterada', () => {
    expect(corpoDasOperacoes('STARLINK', 'SEM_ACESSO')).toEqual({ STARLINK: 'SEM_ACESSO' });
    expect(corpoDasOperacoes('TIM', 'EDICAO')).toEqual({ TIM: 'EDICAO' });
  });
});

describe('corpoDaEtapa', () => {
  const normal = { nome: 'Contato', diasParado: null as number | null, tipo: 'NORMAL' as const };
  it('sem mudança não há o que enviar', () => {
    expect(corpoDaEtapa(normal, { nome: 'Contato', dias: '' })).toEqual({ vazio: true });
  });
  it('envia só o nome alterado, aparado', () => {
    expect(corpoDaEtapa(normal, { nome: '  Primeiro contato ', dias: '' })).toEqual({ corpo: { nome: 'Primeiro contato' } });
  });
  it('dias em branco voltam ao padrão (null)', () => {
    expect(corpoDaEtapa({ ...normal, diasParado: 10 }, { nome: 'Contato', dias: '' })).toEqual({ corpo: { diasParado: null } });
  });
  it('dias válidos', () => {
    expect(corpoDaEtapa(normal, { nome: 'Contato', dias: '12' })).toEqual({ corpo: { diasParado: 12 } });
  });
  it('rejeita nome vazio e dias fora de 1 a 365 ou fracionados', () => {
    expect(corpoDaEtapa(normal, { nome: ' ', dias: '' })).toEqual({ erro: 'Informe o nome da etapa' });
    expect(corpoDaEtapa(normal, { nome: 'Contato', dias: '0' })).toEqual({ erro: 'Use um número inteiro de 1 a 365 dias' });
    expect(corpoDaEtapa(normal, { nome: 'Contato', dias: '1.5' })).toEqual({ erro: 'Use um número inteiro de 1 a 365 dias' });
    expect(corpoDaEtapa(normal, { nome: 'Contato', dias: '366' })).toEqual({ erro: 'Use um número inteiro de 1 a 365 dias' });
  });
  it('saída não aceita dias: ignora o campo', () => {
    const saida = { nome: 'Descartado', diasParado: null, tipo: 'SAIDA' as const };
    expect(corpoDaEtapa(saida, { nome: 'Descartado', dias: '5' })).toEqual({ vazio: true });
    expect(corpoDaEtapa(saida, { nome: 'Perdido', dias: '5' })).toEqual({ corpo: { nome: 'Perdido' } });
  });
});
