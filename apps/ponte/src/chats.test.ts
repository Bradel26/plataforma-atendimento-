import { describe, expect, it, vi } from 'vitest';
import { acumularChats, GerenciadorDeChats } from './chats.js';
import type { ChatBruto } from './sessao.js';

function chat(numero: string, naoLidas = 0): ChatBruto {
  return { numero, nome: numero, naoLidas, ultimaMensagemEm: 1000, mensagens: [] };
}

/**
 * `acumularChats` e a parte PURA da sincronizacao de chats: so mescla o que
 * chegou num Map existente, sem timer nem rede — mesmo papel de `acumular` em
 * `contatos.ts`, so que aqui a entrada inteira e substituida (nao so o nome),
 * porque o chat carrega previa/nao-lidas que mudam a cada mensagem.
 */
describe('acumularChats', () => {
  it('adiciona um chat novo ao mapa', () => {
    const resultado = acumularChats(new Map(), [chat('5511999998888')]);
    expect(resultado.get('5511999998888')).toEqual(chat('5511999998888'));
  });

  it('substitui a entrada existente pela mais recente, por numero', () => {
    const atual = new Map([['5511999998888', chat('5511999998888', 1)]]);
    const resultado = acumularChats(atual, [chat('5511999998888', 3)]);
    expect(resultado.get('5511999998888')?.naoLidas).toBe(3);
  });
});

/**
 * `GerenciadorDeChats` agrupa varios eventos de chat (o Baileys dispara em
 * pedacos pequenos) num unico envio, esperando um tempo sem novidade antes de
 * disparar — mesmo padrao de `GerenciadorDeContatos`.
 */
describe('GerenciadorDeChats', () => {
  it('acumula e entrega todos os chats de uma vez ao dar flush', () => {
    const entregue: ChatBruto[][] = [];
    const gerenciador = new GerenciadorDeChats((chats) => entregue.push(chats));

    gerenciador.adicionar([chat('5511999998888')]);
    gerenciador.adicionar([chat('5511977776666')]);
    gerenciador.flush();

    expect(entregue).toHaveLength(1);
    expect(entregue[0]).toEqual(expect.arrayContaining([chat('5511999998888'), chat('5511977776666')]));
  });

  it('limpa o acumulado depois do flush', () => {
    const entregar = vi.fn();
    const gerenciador = new GerenciadorDeChats(entregar);

    gerenciador.adicionar([chat('5511999998888')]);
    gerenciador.flush();
    gerenciador.flush();

    expect(entregar).toHaveBeenCalledTimes(1);
  });

  it('flush sem nada acumulado nao chama a entrega', () => {
    const entregar = vi.fn();
    const gerenciador = new GerenciadorDeChats(entregar);

    gerenciador.flush();

    expect(entregar).not.toHaveBeenCalled();
  });
});
