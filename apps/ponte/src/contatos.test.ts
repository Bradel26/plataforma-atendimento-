import { describe, expect, it, vi } from 'vitest';
import { acumular, GerenciadorDeContatos } from './contatos.js';

/**
 * `acumular` e a parte PURA da importacao de contatos: so mescla o que chegou
 * num Map existente, sem timer nem rede. O debounce (quando disparar o envio)
 * fica em `GerenciadorDeContatos`, que usa isto por dentro.
 */
describe('acumular', () => {
  it('adiciona contatos novos ao mapa vazio', () => {
    const resultado = acumular(new Map(), [{ numero: '5511999998888', nome: 'Fulano' }]);
    expect(resultado.get('5511999998888')).toBe('Fulano');
  });

  it('mantem o que ja estava e acrescenta o que e novo', () => {
    const atual = new Map([['5511999998888', 'Fulano']]);
    const resultado = acumular(atual, [{ numero: '5511977776666', nome: 'Ciclano' }]);
    expect(resultado.get('5511999998888')).toBe('Fulano');
    expect(resultado.get('5511977776666')).toBe('Ciclano');
  });

  it('contato repetido substitui o nome pelo mais recente', () => {
    const atual = new Map([['5511999998888', 'Nome Antigo']]);
    const resultado = acumular(atual, [{ numero: '5511999998888', nome: 'Nome Novo' }]);
    expect(resultado.get('5511999998888')).toBe('Nome Novo');
  });

  it('nao muda o mapa recebido (devolve um novo)', () => {
    const atual = new Map<string, string>();
    const resultado = acumular(atual, [{ numero: '5511999998888', nome: 'Fulano' }]);
    expect(atual.size).toBe(0);
    expect(resultado.size).toBe(1);
  });
});

/**
 * `GerenciadorDeContatos` agrupa varios `contacts.upsert` (o Baileys dispara em
 * pedacos pequenos) num unico envio, esperando um tempo sem novidade antes de
 * disparar — sem isso cada pedaco viraria uma chamada de rede separada.
 */
describe('GerenciadorDeContatos', () => {
  it('acumula e entrega todos os contatos de uma vez ao dar flush', () => {
    const entregue: { numero: string; nome: string }[][] = [];
    const gerenciador = new GerenciadorDeContatos((contatos) => entregue.push(contatos));

    gerenciador.adicionar([{ numero: '5511999998888', nome: 'Fulano' }]);
    gerenciador.adicionar([{ numero: '5511977776666', nome: 'Ciclano' }]);
    gerenciador.flush();

    expect(entregue).toHaveLength(1);
    expect(entregue[0]).toEqual(
      expect.arrayContaining([
        { numero: '5511999998888', nome: 'Fulano' },
        { numero: '5511977776666', nome: 'Ciclano' },
      ]),
    );
  });

  it('limpa o acumulado depois do flush', () => {
    const entregar = vi.fn();
    const gerenciador = new GerenciadorDeContatos(entregar);

    gerenciador.adicionar([{ numero: '5511999998888', nome: 'Fulano' }]);
    gerenciador.flush();
    gerenciador.flush();

    expect(entregar).toHaveBeenCalledTimes(1);
  });

  it('flush sem nada acumulado nao chama a entrega', () => {
    const entregar = vi.fn();
    const gerenciador = new GerenciadorDeContatos(entregar);

    gerenciador.flush();

    expect(entregar).not.toHaveBeenCalled();
  });
});
