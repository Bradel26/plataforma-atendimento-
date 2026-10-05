import { describe, expect, it } from 'vitest';
import { DONO_EMPRESA, filtroDaVisao } from './conversations.visao';

const EU = { usuarioId: 'u-eu', filaIds: ['f-comercial'] };
const FORA_DOS_MEUS = {
  OR: [{ canalConfigId: null }, { canalConfig: { donoId: null } }, { canalConfig: { donoId: { not: 'u-eu' } } }],
};

/**
 * As abas so ESTREITAM o que a politica ja liberou — sao combinadas com
 * `politicaConversas` por AND em `listarConversas`. Nada aqui decide quem pode
 * ver o que.
 */
describe('filtroDaVisao', () => {
  it('sem visao: nenhum filtro extra', () => {
    expect(filtroDaVisao({}, EU)).toEqual({});
  });

  it('Minhas: conversas de qualquer numero meu, nao as atribuidas a mim', () => {
    expect(filtroDaVisao({ visao: 'MINHAS' }, EU)).toEqual({ canalConfig: { donoId: 'u-eu' } });
  });

  it('Fila: fora dos meus numeros, atribuidas a mim ou em espera nas minhas filas', () => {
    expect(filtroDaVisao({ visao: 'FILA' }, EU)).toEqual({
      AND: [FORA_DOS_MEUS, { OR: [{ agenteId: 'u-eu' }, { status: 'EM_ESPERA', filaId: { in: ['f-comercial'] } }] }],
    });
  });

  it('Acompanhar sem seletor: tudo fora dos meus numeros, inclusive sem linha e linha sem dono', () => {
    // Os dois termos de nulo sao o que importa: `not` sozinho perderia, no SQL,
    // a conversa sem linha e a da linha sem dono.
    expect(filtroDaVisao({ visao: 'ACOMPANHAR' }, EU)).toEqual({ AND: [FORA_DOS_MEUS] });
  });

  it('Acompanhar um usuario: so os numeros dele', () => {
    expect(filtroDaVisao({ visao: 'ACOMPANHAR', donoId: 'u-leandro' }, EU)).toEqual({
      AND: [FORA_DOS_MEUS, { canalConfig: { donoId: 'u-leandro' } }],
    });
  });

  it('Acompanhar o Numero da empresa', () => {
    expect(filtroDaVisao({ visao: 'ACOMPANHAR', donoId: DONO_EMPRESA }, EU)).toEqual({
      AND: [FORA_DOS_MEUS, { OR: [{ canalConfigId: null }, { canalConfig: { donoId: null } }] }],
    });
  });

  it('Acompanhar um numero especifico', () => {
    expect(filtroDaVisao({ visao: 'ACOMPANHAR', donoId: 'u-leandro', canalConfigId: 'c-2' }, EU)).toEqual({
      AND: [FORA_DOS_MEUS, { canalConfig: { donoId: 'u-leandro' } }, { canalConfigId: 'c-2' }],
    });
  });
});
