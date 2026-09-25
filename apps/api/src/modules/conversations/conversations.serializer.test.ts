import { describe, expect, it } from 'vitest';
import { semNotasInternas, toConversaDetalhe, toConversaResumo } from './conversations.serializer';

/**
 * `toConversaResumo` e testado num arquivo proprio (em vez de dentro de
 * `conversations.service.test.ts`) porque aquele arquivo mocka o modulo
 * `conversations.serializer` inteiro (serializer identidade, so para
 * observar destinos de notificacao) — importar a funcao real por la
 * devolveria o mock, nao a implementacao.
 */
function criarConversaResumoMock(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conv-1',
    canal: 'WHATSAPP' as const,
    status: 'EM_ATENDIMENTO' as const,
    assunto: null,
    tags: [],
    naoLidas: 0,
    arquivada: false,
    criadoEm: new Date(),
    atribuidoEm: null,
    finalizadoEm: null,
    ultimaMensagemEm: new Date(),
    contato: { id: 'contato-1', nome: 'Contato Teste', email: null, telefone: '5511999998888' },
    fila: null,
    agente: null,
    canalConfig: null,
    mensagens: [],
    ...overrides,
  } as unknown as Parameters<typeof toConversaResumo>[0];
}

describe('toConversaResumo — iaAtiva', () => {
  it('resumo da conversa inclui iaAtiva do canal, e null quando nao ha canalConfigId', () => {
    const comCanal = toConversaResumo(criarConversaResumoMock({ canalConfig: { iaAtiva: true } }));
    expect(comCanal.iaAtiva).toBe(true);

    const semCanal = toConversaResumo(criarConversaResumoMock({ canalConfig: null }));
    expect(semCanal.iaAtiva).toBeNull();

    const semIA = toConversaResumo(criarConversaResumoMock({ canalConfig: { iaAtiva: false } }));
    expect(semIA.iaAtiva).toBe(false);
  });
});

/**
 * `criarConversaDetalheMock` e a mesma forma de `criarConversaResumoMock`,
 * mas sem `ultimaMensagem` (o detalhe nao tem esse campo) — usada so nos
 * testes de `toConversaDetalhe` abaixo (Achado 2 da revisao final).
 */
function criarConversaDetalheMock(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conv-1',
    canal: 'WHATSAPP' as const,
    status: 'EM_ATENDIMENTO' as const,
    assunto: null,
    tags: [],
    naoLidas: 0,
    arquivada: false,
    criadoEm: new Date(),
    atribuidoEm: null,
    finalizadoEm: null,
    ultimaMensagemEm: new Date(),
    contato: { id: 'contato-1', nome: 'Contato Teste', email: null, telefone: '5511999998888' },
    fila: null,
    agente: null,
    canalConfig: null,
    mensagens: [],
    ...overrides,
  } as unknown as Parameters<typeof toConversaDetalhe>[0];
}

describe('toConversaDetalhe — iaAtiva (Achado 2)', () => {
  it('detalhe da conversa inclui iaAtiva do canal, e null quando nao ha canalConfig', () => {
    const comCanal = toConversaDetalhe(criarConversaDetalheMock({ canalConfig: { iaAtiva: true } }));
    expect(comCanal.iaAtiva).toBe(true);

    const semCanal = toConversaDetalhe(criarConversaDetalheMock({ canalConfig: null }));
    expect(semCanal.iaAtiva).toBeNull();
  });
});

describe('semNotasInternas (Achado 1)', () => {
  it('remove so as mensagens interno:true, preservando as demais', () => {
    const detalhe = {
      mensagens: [
        { id: 'm1', interno: false, conteudo: 'oi' },
        { id: 'm2', interno: true, conteudo: 'nota privada' },
        { id: 'm3', interno: false, conteudo: 'ate mais' },
      ],
    };

    const filtrado = semNotasInternas(detalhe);

    expect(filtrado.mensagens.map((m) => m.id)).toEqual(['m1', 'm3']);
    // Nao muda o objeto original.
    expect(detalhe.mensagens).toHaveLength(3);
  });
});
