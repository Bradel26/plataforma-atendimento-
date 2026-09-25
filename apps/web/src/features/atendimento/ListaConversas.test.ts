import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ListaConversas } from './ListaConversas';
import { upsertPrevia } from './previas';
import type { ConversaResumo, Previa } from '../../lib/types';

/**
 * Fase 11.6 — o badge "Prévia" so pode aparecer no item de ChatPreview, nunca
 * no de Conversation formal. Renderiza para string (`renderToStaticMarkup`,
 * sem DOM/jsdom — roda no mesmo ambiente `node` que o resto da suite) em vez
 * de usar uma lib de testing-library, que este repositorio nao tem instalada;
 * suficiente para verificar presenca/ausencia de texto, que e exatamente o
 * que esta fase muda.
 */
const CONVERSA: ConversaResumo = {
  id: 'conv-1',
  canal: 'WHATSAPP',
  status: 'ATRIBUIDO',
  assunto: null,
  tags: [],
  naoLidas: 2,
  arquivada: false,
  criadoEm: '2026-09-16T10:00:00.000Z',
  atribuidoEm: '2026-09-16T10:00:00.000Z',
  finalizadoEm: null,
  ultimaMensagemEm: '2026-09-16T10:05:00.000Z',
  contato: { id: 'contato-1', nome: 'Cliente Formal', email: null, telefone: '5511999998888' },
  fila: null,
  agente: { id: 'user-1', nome: 'Fulano' },
  ultimaMensagem: null,
  iaAtiva: null,
};

const PREVIA: Previa = {
  id: 'previa-1',
  numero: '5511977776666',
  nome: 'Contato Nao Promovido',
  ultimaMensagem: 'oi, tudo bem?',
  ultimaMensagemEm: '2026-09-16T09:00:00.000Z',
  naoLidas: 1,
};

function renderizar(props: Partial<Parameters<typeof ListaConversas>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(ListaConversas, {
      conversas: [],
      previas: [],
      onAbrirPrevia: () => {},
      selecionadaId: null,
      onSelecionar: () => {},
      carregando: false,
      ...props,
    }),
  );
}

describe('ListaConversas — badge de Previa (Fase 11.6)', () => {
  it('ChatPreview recebe a identificacao visual "Prévia"', () => {
    const html = renderizar({ previas: [PREVIA] });
    expect(html).toContain('Prévia');
    expect(html).toContain('Contato Nao Promovido');
  });

  it('Conversation formal NAO recebe o badge de previa', () => {
    const html = renderizar({ conversas: [CONVERSA] });
    expect(html).not.toContain('Prévia');
    expect(html).toContain('Cliente Formal');
  });

  it('lista mista: badge aparece so no item de previa, nunca no de conversa', () => {
    const html = renderizar({ conversas: [CONVERSA], previas: [PREVIA] });
    const ocorrencias = html.split('Prévia').length - 1;
    expect(ocorrencias).toBe(1);
  });

  it('nao muda nome, mensagem, horario nem contador de nao lidas da previa', () => {
    const html = renderizar({ previas: [PREVIA] });
    expect(html).toContain(PREVIA.nome);
    expect(html).toContain(PREVIA.ultimaMensagem);
    expect(html).toContain('1'); // naoLidas
  });
});

/**
 * Fase 11.7 — round-trip do que `AtendimentoPage.tsx` faz de verdade quando
 * chega `previa:atualizada`: `upsertPrevia` (estado) alimentando `previas`
 * (prop). Prova que o caminho ponta-a-ponta (evento → estado → render) ainda
 * mostra o badge, sem precisar montar a pagina inteira.
 */
describe('ListaConversas — realtime de previa (Fase 11.7)', () => {
  it('previa recebida por evento (via upsertPrevia) aparece na lista com o badge', () => {
    const previasAposEvento = upsertPrevia([], PREVIA);

    const html = renderizar({ previas: previasAposEvento });

    expect(html).toContain('Prévia');
    expect(html).toContain(PREVIA.nome);
  });

  it('atualizacao da mesma previa (segundo evento) nao duplica o cartao na lista renderizada', () => {
    const primeiraVez = upsertPrevia([], PREVIA);
    const segundaVez = upsertPrevia(primeiraVez, { ...PREVIA, naoLidas: 7, ultimaMensagem: 'mensagem nova' });

    const html = renderizar({ previas: segundaVez });

    expect(html.split(PREVIA.nome).length - 1).toBe(1);
    expect(html.split('Prévia').length - 1).toBe(1);
    expect(html).toContain('mensagem nova');
  });
});

/**
 * Task 4 — badge de IA ON/OFF na lista de conversas. `iaAtiva` vem do canal
 * da conversa (Task 3); nulo significa "conversa sem canal" (ex. Webchat) e
 * nao deve renderizar badge nenhum, nem "IA ON" nem "IA OFF".
 */
describe('ListaConversas — badge de IA (Task 4)', () => {
  it('mostra badge IA ON quando iaAtiva=true, IA OFF quando false, e nenhum quando null', () => {
    const conversas: ConversaResumo[] = [
      { ...CONVERSA, id: 'c1', iaAtiva: true },
      { ...CONVERSA, id: 'c2', iaAtiva: false },
      { ...CONVERSA, id: 'c3', iaAtiva: null },
    ];

    const html = renderizar({ conversas });

    expect(html.split('IA ON').length - 1).toBe(1);
    expect(html.split('IA OFF').length - 1).toBe(1);
  });
});
