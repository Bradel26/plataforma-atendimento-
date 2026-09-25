import { describe, expect, it } from 'vitest';
import { toConversaResumo } from './conversations.serializer';

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
  });
});
