import { describe, expect, it } from 'vitest';
import { separarDestinos, type Destinos } from './destinos';

const D: Destinos = {
  usuarios: [
    { id: 'u-1', nome: 'Atual', perfil: 'SUPORTE', status: 'DISPONIVEL' },
    { id: 'u-2', nome: 'Viviane', perfil: 'SUPORTE', status: 'OFFLINE' },
    { id: 'u-3', nome: 'Comercial', perfil: 'COMERCIAL', status: 'DISPONIVEL' },
  ],
  filas: [{ id: 'f-1', nome: 'Suporte' }],
};

describe('separarDestinos', () => {
  it('separa online, offline e remove o responsável atual', () => {
    const r = separarDestinos(D, '', 'u-1');
    expect(r.disponiveis.map((u) => u.nome)).toEqual(['Comercial']);
    expect(r.indisponiveis.map((u) => u.nome)).toEqual(['Viviane']);
    expect(r.equipes.map((f) => f.nome)).toEqual(['Suporte']);
  });
  it('busca sem acento e sem caixa em usuários e equipes', () => {
    const r = separarDestinos(D, 'VIV', null);
    expect(r.indisponiveis.map((u) => u.nome)).toEqual(['Viviane']);
    expect(r.disponiveis).toEqual([]);
    expect(r.equipes).toEqual([]);
  });
});
