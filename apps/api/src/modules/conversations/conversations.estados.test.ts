import { describe, expect, it } from 'vitest';
import { aoFalarComCliente, aoReceberDoCliente, EM_ATENDIMENTO_ATIVO } from './conversations.estados';

describe('aoFalarComCliente', () => {
  it('poe em espera para AGUARDANDO_CLIENTE quando a mensagem nao e interna', () => {
    expect(aoFalarComCliente('ATRIBUIDO', false)).toBe('AGUARDANDO_CLIENTE');
    expect(aoFalarComCliente('EM_ATENDIMENTO', false)).toBe('AGUARDANDO_CLIENTE');
    expect(aoFalarComCliente('AGUARDANDO_CLIENTE', false)).toBe('AGUARDANDO_CLIENTE');
  });

  it('nota interna nunca poe em AGUARDANDO_CLIENTE', () => {
    expect(aoFalarComCliente('ATRIBUIDO', true)).toBe('ATRIBUIDO');
    expect(aoFalarComCliente('EM_ATENDIMENTO', true)).toBe('EM_ATENDIMENTO');
    expect(aoFalarComCliente('AGUARDANDO_CLIENTE', true)).toBe('AGUARDANDO_CLIENTE');
  });

  it('nota interna em conversa EM_ESPERA promove so para ATRIBUIDO, nunca para AGUARDANDO_CLIENTE', () => {
    expect(aoFalarComCliente('EM_ESPERA', true)).toBe('ATRIBUIDO');
  });
});

describe('aoReceberDoCliente', () => {
  it('devolve o agente para EM_ATENDIMENTO quando o cliente responde', () => {
    expect(aoReceberDoCliente('AGUARDANDO_CLIENTE')).toBe('EM_ATENDIMENTO');
  });

  it('nao mexe em EM_ESPERA, ATRIBUIDO, EM_ATENDIMENTO ou FINALIZADO', () => {
    expect(aoReceberDoCliente('EM_ESPERA')).toBe('EM_ESPERA');
    expect(aoReceberDoCliente('ATRIBUIDO')).toBe('ATRIBUIDO');
    expect(aoReceberDoCliente('EM_ATENDIMENTO')).toBe('EM_ATENDIMENTO');
    expect(aoReceberDoCliente('FINALIZADO')).toBe('FINALIZADO');
  });
});

describe('EM_ATENDIMENTO_ATIVO', () => {
  it('inclui os tres estados de atendimento atribuido', () => {
    expect(EM_ATENDIMENTO_ATIVO).toEqual(['ATRIBUIDO', 'EM_ATENDIMENTO', 'AGUARDANDO_CLIENTE']);
  });
});
