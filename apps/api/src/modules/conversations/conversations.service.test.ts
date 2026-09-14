import { describe, expect, it } from 'vitest';
import { decidirDestino } from '../channels/inbound.service';
import { motivoSemTelefone } from './conversations.service';

/**
 * `iniciarConversa` (vendedor abre uma conversa de WhatsApp com um Contato que
 * nunca escreveu) reaproveita a mesma decisao fila-vs-dono de
 * `destinoDaMensagem`, extraida em `decidirDestino` para ser testavel sem
 * banco. Estes testes cobrem so a parte pura — a parte com Prisma real (buscar
 * contato, checar conversa aberta, criar) fica coberta pelo smoke test.
 */
describe('motivoSemTelefone', () => {
  it('recusa contato sem telefone', () => {
    expect(motivoSemTelefone({ telefone: null })).toMatch(/telefone/i);
  });

  it('recusa contato com telefone vazio', () => {
    expect(motivoSemTelefone({ telefone: '' })).toMatch(/telefone/i);
  });

  it('aceita contato com telefone preenchido', () => {
    expect(motivoSemTelefone({ telefone: '5511999998888' })).toBeNull();
  });
});

describe('decidirDestino', () => {
  it('config com donoId (linha pessoal) decide agenteId, sem fila', () => {
    const config = { id: 'config-1', donoId: 'user-1', filaId: null };
    expect(decidirDestino(config)).toEqual({ canalConfigId: 'config-1', filaId: null, agenteId: 'user-1' });
  });

  it('config sem dono (compartilhada) com fila decide filaId, sem agente', () => {
    const config = { id: 'config-2', donoId: null, filaId: 'fila-1' };
    expect(decidirDestino(config)).toEqual({ canalConfigId: 'config-2', filaId: 'fila-1', agenteId: null });
  });

  it('sem config nenhuma, nao decide nem fila nem agente', () => {
    expect(decidirDestino(null)).toEqual({ canalConfigId: null, filaId: null, agenteId: null });
  });
});
