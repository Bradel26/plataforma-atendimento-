import { describe, expect, it } from 'vitest';
import { semNotasInternas, toConversaDetalhe, toConversaResumo, toMensagem } from './conversations.serializer';

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
    protocolo: null,
    origem: 'RECEPTIVO' as const,
    atendenteInicial: null,
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
    protocolo: null,
    origem: 'RECEPTIVO' as const,
    atendenteInicial: null,
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

describe('campos do atendimento estilo PCM', () => {
  it('resumo expoe protocolo, origem, atendente inicial e nome da linha', () => {
    const r = toConversaResumo(
      criarConversaResumoMock({
        protocolo: '261009-00001',
        origem: 'ATIVO',
        atendenteInicial: { id: 'u-1', nome: 'Guilherme' },
        canalConfig: { id: 'cfg-1', donoId: null, iaAtiva: false, nome: 'Comercial - 3370' },
      }),
    );
    expect(r.protocolo).toBe('261009-00001');
    expect(r.origem).toBe('ATIVO');
    expect(r.atendenteInicial).toEqual({ id: 'u-1', nome: 'Guilherme' });
    expect(r.linha).toEqual({ id: 'cfg-1', donoId: null, nome: 'Comercial - 3370' });
  });

  it('mensagem expoe autorNome, evento e enviadaPorDispositivo', () => {
    const m = toMensagem({
      id: 'm-1',
      organizacaoId: 'org-1',
      conversaId: 'c-1',
      autor: 'AGENTE',
      autorId: null,
      conteudo: 'Meu celular',
      tipoAnexo: 'TEXTO',
      anexoUrl: null,
      idExterno: 'X1',
      interno: false,
      evento: null,
      enviadaPorDispositivo: true,
      criadoEm: new Date('2026-10-09T15:00:00Z'),
      autorUsuario: null,
    });
    expect(m).toMatchObject({ autorNome: null, evento: null, enviadaPorDispositivo: true });
  });

  it('mensagem sem include de autor (recem-criada) devolve autorNome nulo sem quebrar', () => {
    const m = toMensagem({
      id: 'm-2',
      organizacaoId: 'org-1',
      conversaId: 'c-1',
      autor: 'SISTEMA',
      autorId: null,
      conteudo: 'Aceito por: Ana',
      tipoAnexo: 'TEXTO',
      anexoUrl: null,
      idExterno: null,
      interno: false,
      evento: 'ACEITE',
      enviadaPorDispositivo: false,
      criadoEm: new Date(),
    });
    expect(m.autorNome).toBeNull();
    expect(m.evento).toBe('ACEITE');
  });
});
