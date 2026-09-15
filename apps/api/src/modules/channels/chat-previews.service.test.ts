import { describe, expect, it } from 'vitest';
import { cortarCache, mensagensParaHistorico, type MensagemPrevia } from './chat-previews.service';

function msg(texto: string): MensagemPrevia {
  return { autor: 'CLIENTE', texto, criadoEm: '2026-09-14T10:00:00.000Z' };
}

describe('cortarCache', () => {
  it('mantem a lista intacta quando ja esta dentro do limite', () => {
    const mensagens = [msg('a'), msg('b')];
    expect(cortarCache(mensagens, 30)).toEqual(mensagens);
  });

  it('corta para as N mais recentes, descartando as mais antigas (inicio do array)', () => {
    const mensagens = [msg('antiga'), msg('do meio'), msg('recente')];
    expect(cortarCache(mensagens, 2)).toEqual([msg('do meio'), msg('recente')]);
  });

  it('usa 30 como limite padrao quando nao informado', () => {
    const mensagens = Array.from({ length: 35 }, (_, i) => msg(String(i)));
    expect(cortarCache(mensagens)).toHaveLength(30);
    expect(cortarCache(mensagens)[0]).toEqual(msg('5'));
  });
});

describe('mensagensParaHistorico', () => {
  it('mapeia o cache da previa para o formato de Message, preservando ordem e data', () => {
    const cache: MensagemPrevia[] = [
      { autor: 'CLIENTE', texto: 'Oi', criadoEm: '2026-09-10T10:00:00.000Z' },
      { autor: 'AGENTE', texto: 'Ola!', criadoEm: '2026-09-10T10:01:00.000Z' },
    ];
    expect(mensagensParaHistorico('conversa-1', cache)).toEqual([
      { conversaId: 'conversa-1', autor: 'CLIENTE', conteudo: 'Oi', criadoEm: new Date('2026-09-10T10:00:00.000Z') },
      { conversaId: 'conversa-1', autor: 'AGENTE', conteudo: 'Ola!', criadoEm: new Date('2026-09-10T10:01:00.000Z') },
    ]);
  });

  it('cache vazio produz lista vazia', () => {
    expect(mensagensParaHistorico('conversa-1', [])).toEqual([]);
  });
});
