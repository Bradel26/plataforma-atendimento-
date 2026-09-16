import { describe, expect, it } from 'vitest';
import type { Previa } from '../../lib/types';
import { upsertPrevia } from './previas';

function previa(overrides: Partial<Previa> = {}): Previa {
  return {
    id: 'previa-1',
    numero: '5511999998888',
    nome: 'Cliente Teste',
    ultimaMensagem: 'oi',
    ultimaMensagemEm: '2026-09-16T10:00:00.000Z',
    naoLidas: 1,
    ...overrides,
  };
}

/**
 * Fase 11.7 — o handler do evento `previa:atualizada` usa esta funcao para
 * decidir se insere ou atualiza. Testes cobrem exatamente os cenarios
 * obrigatorios do prompt de implementacao.
 */
describe('upsertPrevia', () => {
  it('evento de nova previa adiciona o item quando a lista esta vazia', () => {
    const resultado = upsertPrevia([], previa());
    expect(resultado).toEqual([previa()]);
  });

  it('evento de nova previa adiciona sem remover as ja existentes', () => {
    const outra = previa({ id: 'previa-2', nome: 'Outro Cliente' });
    const resultado = upsertPrevia([outra], previa());
    expect(resultado).toHaveLength(2);
    expect(resultado.map((p) => p.id).sort()).toEqual(['previa-1', 'previa-2']);
  });

  it('evento de atualizacao (mesmo id) substitui o item existente, nao cria um segundo', () => {
    const original = previa({ naoLidas: 1, ultimaMensagem: 'oi' });
    const atualizada = previa({ naoLidas: 5, ultimaMensagem: 'nova mensagem' });

    const resultado = upsertPrevia([original], atualizada);

    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toEqual(atualizada);
  });

  it('evento duplicado (mesmo payload, chegou duas vezes) nao duplica o item', () => {
    const p = previa();
    const primeiraVez = upsertPrevia([], p);
    const segundaVez = upsertPrevia(primeiraVez, p);

    expect(segundaVez).toHaveLength(1);
    expect(segundaVez).toEqual([p]);
  });

  it('mantem as outras previas intactas ao atualizar uma so', () => {
    const intacta = previa({ id: 'previa-2', nome: 'Nao deve mudar' });
    const atualizada = previa({ naoLidas: 9 });

    const resultado = upsertPrevia([intacta, previa()], atualizada);

    expect(resultado).toContainEqual(intacta);
    expect(resultado).toContainEqual(atualizada);
    expect(resultado).toHaveLength(2);
  });
});
