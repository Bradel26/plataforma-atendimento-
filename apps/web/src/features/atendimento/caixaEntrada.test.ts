import { describe, expect, it } from 'vitest';
import type { ConversaResumo } from '../../lib/types';
import { aplicarNaCaixa, type GrupoCaixa } from './caixaEntrada';

const conv = (id: string, extra: Partial<ConversaResumo> = {}) => ({
  id,
  status: 'EM_ESPERA',
  agente: null,
  arquivada: false,
  fila: { id: 'f-com', nome: 'Comercial' },
  ultimaMensagemEm: '2026-10-09T15:00:00Z',
  ...extra,
}) as ConversaResumo;
const grupos = (): GrupoCaixa[] => [
  { fila: null, conversas: [] },
  { fila: { id: 'f-com', nome: 'Comercial' }, conversas: [conv('c-velha', { ultimaMensagemEm: '2026-10-09T14:00:00Z' })] },
];

describe('aplicarNaCaixa', () => {
  it('conversa em espera entra na equipe mais antiga primeiro', () => {
    expect(aplicarNaCaixa(grupos(), conv('c-nova'))[1]?.conversas.map((c) => c.id)).toEqual(['c-velha', 'c-nova']);
  });
  it('conversa aceita sai da caixa', () => {
    const r = aplicarNaCaixa(grupos(), conv('c-velha', { status: 'ATRIBUIDO', agente: { id: 'u-2', nome: 'Viviane' } }));
    expect(r[1]?.conversas).toEqual([]);
  });
  it('sem equipe entra no grupo sem equipe quando existe', () => {
    expect(aplicarNaCaixa(grupos(), conv('c-sem', { fila: null }))[0]?.conversas.map((c) => c.id)).toEqual(['c-sem']);
  });
  it('equipe que não está na tela não recebe conversa', () => {
    expect(aplicarNaCaixa(grupos(), conv('c-fin', { fila: { id: 'f-fin', nome: 'Financeiro' } })).flatMap((g) => g.conversas.map((c) => c.id))).toEqual(['c-velha']);
  });
  it('arquivada sai da caixa', () => {
    expect(aplicarNaCaixa(grupos(), conv('c-velha', { arquivada: true }))[1]?.conversas).toEqual([]);
  });
});
