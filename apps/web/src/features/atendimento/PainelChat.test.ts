import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
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
    status: null,
    criadoEm: '2026-09-25T10:05:00.000Z',
    ...overrides,
  };
}

function renderizar(props: Partial<Parameters<typeof PainelChat>[0]> = {}) {
  return renderToStaticMarkup(
    // MemoryRouter: o botao "Ligar" do cabecalho e um <Link>.
    createElement(
      MemoryRouter,
      null,
      createElement(
        ToastProvider,
        null,
        createElement(PainelChat, {
          conversa: criarConversaDetalheMock(),
          onMudou: () => {},
          ...props,
        }),
      ),
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

describe('PainelChat — barra de mensagem no formato do WhatsApp', () => {
  it('mostra uma linha so: anexar, emoji, nota interna, campo e enviar', () => {
    const html = renderizar();
    expect(html).toContain('placeholder="Digite uma mensagem"');
    expect(html).toContain('aria-label="Anexar"');
    expect(html).toContain('aria-label="Inserir emoji"');
    expect(html).toContain('aria-label="Nota interna"');
    expect(html).toContain('aria-label="Enviar"');
  });

  it('nao tem mais as abas "Responder" e "Mensagem Privada" nem o texto de ajuda sempre visivel', () => {
    const html = renderizar();
    expect(html).not.toContain('Mensagem Privada');
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('Escreva sua resposta');
    expect(html).not.toContain('Enter envia · Shift+Enter quebra linha</span>');
  });

  it('comeca na resposta ao cliente: o campo da nota interna so aparece depois de ligar a nota', () => {
    const html = renderizar();
    expect(html).not.toContain('Nota interna — só a equipe vê');
  });

  it('o menu de anexos nao oferece o que o servidor nao envia (contato, enquete, pix, evento, figurinha)', () => {
    // Menu fechado no primeiro render; o conteudo dele vive em AnexosEGravacao.
    const html = renderizar();
    for (const t of ['Enquete', 'Pix', 'Evento', 'figurinha']) expect(html).not.toContain(t);
  });
});

describe('PainelChat — selo de nota interna na bolha (Task 5)', () => {
  // O cadeado "Nota interna" da barra de mensagem tambem entra no HTML; por isso
  // compara-se com a conversa sem mensagens, em vez de exigir ausencia do texto.
  const ocorrencias = (html: string) => html.split('Nota interna').length - 1;
  const base = ocorrencias(renderizar({ conversa: criarConversaDetalheMock({ mensagens: [] }) }));

  it('mensagem com interno=true mostra o selo "Nota interna"', () => {
    const conversa = criarConversaDetalheMock({
      mensagens: [criarMensagemMock({ interno: true, conteudo: 'só a equipe vê' })],
    });
    const html = renderizar({ conversa });
    expect(ocorrencias(html)).toBeGreaterThan(base);
    expect(html).toContain('só a equipe vê');
  });

  it('mensagem normal (interno=false) não mostra o selo "Nota interna"', () => {
    const conversa = criarConversaDetalheMock({
      mensagens: [criarMensagemMock({ interno: false, conteudo: 'mensagem pública' })],
    });
    const html = renderizar({ conversa });
    expect(ocorrencias(html)).toBe(base);
    expect(html).toContain('mensagem pública');
  });
});
