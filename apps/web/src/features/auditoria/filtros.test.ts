import { describe, expect, it } from 'vitest';
import { paraQuery, rotuloDoChip } from './filtros';

const OPCOES = {
  usuarios: [{ id: 'u-1', nome: 'Guilherme' }],
  filas: [{ id: 'f-1', nome: 'Comercial' }],
  linhas: [{ id: 'l-1', nome: 'Comercial - 3370' }],
};

describe('paraQuery', () => {
  it('repete a chave para cada valor e leva a página', () => {
    expect(paraQuery([
      { campo: 'agenteId', valores: ['u-1'] },
      { campo: 'situacao', valores: ['EM_ATENDIMENTO', 'FINALIZADA'] },
    ], 2)).toBe('pagina=2&tamanho=10&agenteId=u-1&situacao=EM_ATENDIMENTO&situacao=FINALIZADA');
  });
  it('ignora filtro sem valor', () => expect(paraQuery([{ campo: 'contato', valores: [''] }], 1)).toBe('pagina=1&tamanho=10'));
});

describe('rotuloDoChip', () => {
  it('troca id pelo nome', () => {
    expect(rotuloDoChip({ campo: 'agenteId', valores: ['u-1'] }, OPCOES)).toBe('Usuário: Guilherme');
    expect(rotuloDoChip({ campo: 'situacao', valores: ['EM_ATENDIMENTO'] }, OPCOES)).toBe('Status: Em atendimento');
    expect(rotuloDoChip({ campo: 'filaId', valores: ['SEM_EQUIPE'] }, OPCOES)).toBe('Equipe: Sem equipe');
  });
});
