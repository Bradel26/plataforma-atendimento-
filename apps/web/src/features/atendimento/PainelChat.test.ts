import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PainelChat } from './PainelChat';
import type { ConversaDetalhe, Mensagem } from '../../lib/types';
import { ToastProvider } from '../../components/ui/Toast';

vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ usuario: { nome: 'Fulano' } }) }));

/**
 * Task 5 — botao "Resolver" (rebatizado de "Finalizar") e aba "Mensagem
 * Privada" para nota interna no rodape do painel de chat.
 *
 * Este repositorio nao tem Testing Library instalada (sem `render`/`screen`/
 * `userEvent`). Os testes de componente vizinhos (ver `ListaConversas.test.ts`)
 * usam `renderToStaticMarkup`, sem DOM/jsdom, e verificam presenca/ausencia de
 * texto no HTML resultante — suficiente para o que muda aqui: o rotulo do
 * botao, os dois botoes de aba presentes no rodape, e o selo "Nota interna"
 * na bolha de uma mensagem interna.
 *
 * O que NAO da pra cobrir deste jeito (sem DOM real nem simulacao de evento):
 * clicar numa aba e ver o formulario correspondente trocar, digitar no
 * textarea da nota interna e submeter o form verificando o `interno: true`
 * enviado a API. Esse comportamento foi conferido por leitura do codigo (ver
 * PainelChat.tsx): a aba "privada" chama
 * `api.post(.../mensagens, { conteudo: textoPrivado, interno: true })`
 * dentro do proprio `onSubmit` do segundo `<form>`, espelhando exatamente o
 * corpo que a Task 2 (backend) e a Task 4 (tipo `Mensagem.interno`) esperam.
 */

function criarConversaDetalheMock(overrides: Partial<ConversaDetalhe> = {}): ConversaDetalhe {
  return {
    id: 'conv-1',
    canal: 'WHATSAPP',
    status: 'EM_ATENDIMENTO',
    assunto: null,
    tags: [],
    naoLidas: 0,
    arquivada: false,
    criadoEm: '2026-09-25T10:00:00.000Z',
    atribuidoEm: '2026-09-25T10:00:00.000Z',
    finalizadoEm: null,
    ultimaMensagemEm: '2026-09-25T10:05:00.000Z',
    protocolo: '261009-00001',
    origem: 'RECEPTIVO',
    atendenteInicial: null,
    contato: { id: 'contato-1', nome: 'Cliente Teste', email: null, telefone: '5511999998888' },
    fila: null,
    agente: { id: 'user-1', nome: 'Fulano' },
    iaAtiva: null,
    linha: null,
    mensagens: [],
    ...overrides,
  };
}

function criarMensagemMock(overrides: Partial<Mensagem> = {}): Mensagem {
  return {
    id: 'msg-1',
    conversaId: 'conv-1',
    autor: 'AGENTE',
    autorId: 'user-1',
    autorNome: 'Fulano',
    conteudo: 'ola',
    tipoAnexo: 'TEXTO',
    anexoUrl: null,
    interno: false,
    evento: null,
    enviadaPorDispositivo: false,
    criadoEm: '2026-09-25T10:05:00.000Z',
    ...overrides,
  };
}

function renderizar(props: Partial<Parameters<typeof PainelChat>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(
      ToastProvider,
      null,
      createElement(PainelChat, {
        conversa: criarConversaDetalheMock(),
        onMudou: () => {},
        ...props,
      }),
    ),
  );
}

describe('PainelChat — ações da conversa', () => {
  it('renderiza o status e o menu de ações', () => {
    const html = renderizar();
    expect(html).toContain('Em atendimento');
    expect(html).toContain('Ações da conversa');
  });

  it('conversa finalizada não mostra ações de conversa aberta', () => {
    const html = renderizar({
      conversa: criarConversaDetalheMock({ status: 'FINALIZADO', finalizadoEm: '2026-09-25T11:00:00.000Z' }),
    });
    expect(html).not.toContain('Encerrar');
    expect(html).not.toContain('Aceitar');
  });

  it('conversa AGUARDANDO_CLIENTE mostra o rótulo "Aguardando cliente"', () => {
    const html = renderizar({
      conversa: criarConversaDetalheMock({ status: 'AGUARDANDO_CLIENTE' }),
    });
    expect(html).toContain('Aguardando cliente');
  });
});

describe('PainelChat — abas do rodape (Task 5)', () => {
  it('mostra as duas abas "Responder" e "Mensagem Privada"', () => {
    const html = renderizar();
    expect(html).toContain('Responder');
    expect(html).toContain('Mensagem Privada');
  });

  it('aba "Responder" comeca ativa: o formulário padrão (placeholder de resposta) está no HTML', () => {
    const html = renderizar();
    expect(html).toContain('Escreva sua resposta');
    // O form da nota interna so existe quando a aba "privada" esta ativa;
    // como o estado inicial e 'responder', o placeholder da nota interna
    // nao deve aparecer no primeiro render.
    expect(html).not.toContain('Escreva uma nota interna');
  });
});

describe('PainelChat — selo de nota interna na bolha (Task 5)', () => {
  it('mensagem com interno=true mostra o selo "Nota interna"', () => {
    const conversa = criarConversaDetalheMock({
      mensagens: [criarMensagemMock({ interno: true, conteudo: 'só a equipe vê' })],
    });
    const html = renderizar({ conversa });
    expect(html).toContain('Nota interna');
    expect(html).toContain('só a equipe vê');
  });

  it('mensagem normal (interno=false) não mostra o selo "Nota interna"', () => {
    const conversa = criarConversaDetalheMock({
      mensagens: [criarMensagemMock({ interno: false, conteudo: 'mensagem pública' })],
    });
    const html = renderizar({ conversa });
    expect(html).not.toContain('Nota interna');
    expect(html).toContain('mensagem pública');
  });
});
