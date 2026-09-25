import { describe, expect, it, vi } from 'vitest';

/**
 * Achado 1(a) da revisao final: `historico()` (GET do Webchat) devolvia TODAS
 * as mensagens da conversa ao visitante, incluindo notas internas
 * (`interno: true`) trocadas so entre a equipe. Este teste usa o serializer
 * REAL (`toConversaDetalhe`/`semNotasInternas`), nao mockado — e exatamente o
 * filtro que precisa ser exercitado aqui.
 */
const { conversationFindUnique } = vi.hoisted(() => ({
  conversationFindUnique: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    conversation: { findUnique: conversationFindUnique },
  },
}));

import { historico } from './webchat.service';

function criarConversaMock() {
  const agora = new Date();
  return {
    id: 'conv-1',
    canal: 'WEBCHAT' as const,
    status: 'EM_ATENDIMENTO' as const,
    assunto: null,
    tags: [],
    naoLidas: 0,
    arquivada: false,
    criadoEm: agora,
    atribuidoEm: null,
    finalizadoEm: null,
    ultimaMensagemEm: agora,
    contato: { id: 'contato-1', nome: 'Visitante', email: null, telefone: null },
    fila: { id: 'fila-1', nome: 'Fila Webchat' },
    agente: { id: 'agente-1', nome: 'Agente Teste' },
    canalConfig: null,
    // `inclusaoDetalhe` busca desc (mais recente primeiro) — `toConversaDetalhe`
    // e quem inverte para ordem cronologica. Aqui a mais recente e m3, depois a
    // nota interna m2, depois m1: por isso o array ja vem nessa ordem.
    mensagens: [
      {
        id: 'm3',
        conversaId: 'conv-1',
        autor: 'AGENTE',
        autorId: 'agente-1',
        conteudo: 'Claro, posso ajudar!',
        tipoAnexo: null,
        anexoUrl: null,
        interno: false,
        criadoEm: agora,
      },
      {
        id: 'm2',
        conversaId: 'conv-1',
        autor: 'AGENTE',
        autorId: 'agente-1',
        conteudo: 'Nota interna: cliente parece irritado',
        tipoAnexo: null,
        anexoUrl: null,
        interno: true,
        criadoEm: agora,
      },
      {
        id: 'm1',
        conversaId: 'conv-1',
        autor: 'CLIENTE',
        autorId: null,
        conteudo: 'Ola, preciso de ajuda',
        tipoAnexo: null,
        anexoUrl: null,
        interno: false,
        criadoEm: agora,
      },
    ],
  };
}

describe('historico (Achado 1a)', () => {
  it('nao inclui mensagens interno:true no historico devolvido ao visitante', async () => {
    conversationFindUnique.mockResolvedValueOnce(criarConversaMock());

    const detalhe = await historico('conv-1');

    const ids = detalhe.mensagens.map((m) => m.id);
    expect(ids).toEqual(['m1', 'm3']);
    expect(detalhe.mensagens.some((m) => m.interno)).toBe(false);
  });

  it('conversa sem nenhuma nota interna continua devolvendo todas as mensagens', async () => {
    const mock = criarConversaMock();
    mock.mensagens = mock.mensagens.filter((m) => !m.interno);
    conversationFindUnique.mockResolvedValueOnce(mock);

    const detalhe = await historico('conv-1');

    expect(detalhe.mensagens.map((m) => m.id)).toEqual(['m1', 'm3']);
  });
});
