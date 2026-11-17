import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PainelChat } from './PainelChat';
import type { ConversaDetalhe } from '../../lib/types';
import { ToastProvider } from '../../components/ui/Toast';

/*
 * Botao "Ligar" do cabecalho do chat: leva para /telefonia ja com o numero do cliente. Aparece so em conversa de
 * WhatsApp com telefone, para quem tem o modulo Telefonia, e nunca na Auditoria (somente leitura).
 */

const auth = vi.hoisted(() => ({ temTelefonia: true }));
vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ usuario: { nome: 'Fulano' }, temModulo: (m: string) => m === 'telefonia' && auth.temTelefonia }),
}));

const conversa = (extra: Partial<ConversaDetalhe> = {}, contato: Partial<ConversaDetalhe['contato']> = {}): ConversaDetalhe => ({
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
  contato: { id: 'c1', nome: 'Cliente Teste', email: null, telefone: '(62) 99288-5001', ...contato },
  fila: null,
  agente: { id: 'u1', nome: 'Fulano' },
  iaAtiva: null,
  linha: null,
  mensagens: [],
  ...extra,
});

const html = (c: ConversaDetalhe, somenteLeitura = false) =>
  renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(ToastProvider, null, createElement(PainelChat, { conversa: c, onMudou: () => undefined, somenteLeitura }))),
  );

describe('PainelChat — botao Ligar', () => {
  beforeEach(() => { auth.temTelefonia = true; });

  it('conversa de WhatsApp com telefone: link para /telefonia com so os digitos do numero', () => {
    const saida = html(conversa());
    expect(saida).toContain('aria-label="Ligar para o cliente"');
    expect(saida).toContain('href="/telefonia?ligar=62992885001"');
  });

  it('sem o modulo Telefonia: nao aparece', () => {
    auth.temTelefonia = false;
    expect(html(conversa())).not.toContain('Ligar para o cliente');
  });

  it('canal que nao e WhatsApp: nao aparece', () => {
    expect(html(conversa({ canal: 'WEBCHAT' }))).not.toContain('Ligar para o cliente');
  });

  it('contato sem telefone ou com numero curto demais: nao aparece', () => {
    expect(html(conversa({}, { telefone: null }))).not.toContain('Ligar para o cliente');
    expect(html(conversa({}, { telefone: '1234' }))).not.toContain('Ligar para o cliente');
  });

  it('modo somente leitura (Auditoria): nao aparece', () => {
    expect(html(conversa(), true)).not.toContain('Ligar para o cliente');
  });
});
