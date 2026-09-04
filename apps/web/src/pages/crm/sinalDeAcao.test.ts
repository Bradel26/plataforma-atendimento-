import { describe, expect, it } from 'vitest';
import type { Oportunidade } from '../../lib/types';
import { sinalDeAcao } from './sinalDeAcao';

/**
 * Cada caso aqui e uma forma de o aviso do cartao mentir de modo plausivel.
 * O risco desta funcao nao e quebrar — e ficar sutilmente errada e treinar o
 * vendedor a ignorar o aviso.
 */

const AGORA = new Date('2026-09-02T12:00:00Z').getTime();
const dia = 86_400_000;

/** Oportunidade minima: o teste so mexe nos campos que o sinal le. */
const op = (campos: Partial<Oportunidade>): Oportunidade =>
  ({
    id: 'o1',
    titulo: 'Teste',
    valor: 0,
    status: 'ABERTA',
    motivoPerda: null,
    previsaoFechamento: null,
    criadoEm: '2026-08-01T00:00:00Z',
    fechadoEm: null,
    conta: { id: 'c1', nome: 'Conta' },
    funil: { id: 'f1', nome: 'Vendas' },
    estagio: { id: 'e1', nome: 'Primeiro contato', ordem: 1, probabilidade: 10 },
    responsavel: null,
    itens: [],
    totalItens: 0,
    ...campos,
  }) as Oportunidade;

describe('sinalDeAcao', () => {
  it('nao avisa nada quando ha tarefa aberta com prazo no futuro', () => {
    const s = sinalDeAcao(op({ tarefasAbertas: 1, proximoPrazo: new Date(AGORA + dia).toISOString() }), AGORA);
    expect(s).toBeNull();
  });

  it('avisa "sem proxima acao" quando nao ha nenhuma tarefa com prazo aberta', () => {
    const s = sinalDeAcao(op({ tarefasAbertas: 0, proximoPrazo: null }), AGORA);
    expect(s).toEqual({ texto: 'Sem proxima acao', tom: 'neutro' });
  });

  it('avisa atraso quando o prazo mais proximo ja passou', () => {
    const s = sinalDeAcao(op({ tarefasAbertas: 2, proximoPrazo: new Date(AGORA - dia).toISOString() }), AGORA);
    expect(s).toEqual({ texto: 'Tarefa atrasada', tom: 'alerta' });
  });

  it('o atraso ganha do resto: cartao com tarefa atrasada e outras em dia mostra o atraso', () => {
    // `proximoPrazo` e o MENOR prazo aberto — se ele passou, ha atraso, mesmo
    // que as outras tarefas estejam em dia. Se a precedencia fosse a inversa, um
    // cartao com uma tarefa atrasada e cinco em dia pareceria saudavel.
    const s = sinalDeAcao(op({ tarefasAbertas: 6, proximoPrazo: new Date(AGORA - 3 * dia).toISOString() }), AGORA);
    expect(s?.tom).toBe('alerta');
  });

  it('prazo exatamente agora nao e atraso', () => {
    // Fronteira: o prazo e o instante ate quando vale fazer. Marcar atraso no
    // milissegundo do vencimento poria cartao em vermelho durante a reuniao em
    // que a tarefa esta sendo cumprida.
    const s = sinalDeAcao(op({ tarefasAbertas: 1, proximoPrazo: new Date(AGORA).toISOString() }), AGORA);
    expect(s).toBeNull();
  });

  it('cala quando a API nao mandou o campo, em vez de inventar "sem proxima acao"', () => {
    // `undefined` != 0. Um cartao vindo de resposta antiga (ou de tela que monta
    // a oportunidade a mao) nao sabe se ha tarefa — e afirmar que nao ha treina
    // o vendedor a ignorar o aviso onde ele esta certo.
    expect(sinalDeAcao(op({}), AGORA)).toBeNull();
  });

  it('tarefa aberta sem prazo nenhum ainda conta como proximo passo', () => {
    // A API so conta tarefa COM prazo, entao `tarefasAbertas > 0` com
    // `proximoPrazo` nulo nao deveria acontecer. Se acontecer, o sinal cala em
    // vez de gritar atraso — nao ha prazo para estar atrasado.
    const s = sinalDeAcao(op({ tarefasAbertas: 1, proximoPrazo: null }), AGORA);
    expect(s).toBeNull();
  });
});

describe('tarefa obrigatoria da etapa (item 3.1)', () => {
  it('avisa quando a etapa exige tarefa em aberto', () => {
    expect(sinalDeAcao(op({ tarefaDaEtapaPendente: ['Visita tecnica'] }), AGORA)).toEqual({
      texto: 'Etapa exige tarefa',
      tom: 'neutro',
    });
  });

  it('vence "sem proxima acao" — a tarefa da etapa nao tem prazo e nao conta como tarefa aberta', () => {
    /*
     * O caso que a ordem existe para resolver: `tarefasAbertas` conta so tarefa
     * com prazo, e a tarefa da etapa nasce sem prazo. Se "sem proxima acao"
     * viesse primeiro, o cartao barrado diria que nao ha proximo passo.
     */
    expect(sinalDeAcao(op({ tarefasAbertas: 0, tarefaDaEtapaPendente: ['Visita tecnica'] }), AGORA)).toEqual({
      texto: 'Etapa exige tarefa',
      tom: 'neutro',
    });
  });

  it('perde para a tarefa atrasada — atraso e o unico caso em que alguem descumpriu algo', () => {
    const ontem = new Date(AGORA - dia).toISOString();
    expect(
      sinalDeAcao(
        op({ proximoPrazo: ontem, tarefasAbertas: 1, tarefaDaEtapaPendente: ['Visita tecnica'] }),
        AGORA,
      ),
    ).toEqual({ texto: 'Tarefa atrasada', tom: 'alerta' });
  });

  it('lista vazia nao avisa nada', () => {
    expect(sinalDeAcao(op({ tarefasAbertas: 2, tarefaDaEtapaPendente: [] }), AGORA)).toBeNull();
  });
});
