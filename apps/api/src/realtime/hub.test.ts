import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'socket.io';
import { comOrganizacao } from '../lib/tenant';
import { notificarConversaNova, notificarPreviaAtualizada, registrarIo } from './hub';
import { EVENTOS, salas } from './events';

/**
 * Fase 11.2 — a correcao ligou `iniciarConversa` a `notificarConversaNova`,
 * mas o mecanismo de destinatarios em si (`emitir`, dentro de hub.ts) ja
 * existia e nao mudou. Estes testes cobrem exatamente as duas garantias que a
 * auditoria pediu para o evento de conversa nova: nunca atravessa organizacao,
 * e nunca lanca quando nao ha para quem notificar.
 */
describe('hub — notificarConversaNova', () => {
  const to = vi.fn();
  const emit = vi.fn();
  const io = { to: to.mockReturnValue({ emit }) } as unknown as Server;

  beforeEach(() => {
    vi.clearAllMocks();
    to.mockReturnValue({ emit });
    registrarIo(io);
  });

  it('conversa em fila compartilhada: alvo inclui fila, conversa e supervisao da propria org, sem sala de usuario', () => {
    comOrganizacao('org-A', () => {
      notificarConversaNova({ id: 'conv-1' }, { conversaId: 'conv-1', filaId: 'fila-1' });
    });

    expect(to).toHaveBeenCalledTimes(1);
    const alvos = (to.mock.calls[0]?.[0] as string[] | undefined) ?? [];
    expect(new Set(alvos)).toEqual(
      new Set([salas.supervisao('org-A'), salas.fila('org-A', 'fila-1'), salas.conversa('org-A', 'conv-1')]),
    );
    expect(emit).toHaveBeenCalledWith(EVENTOS.conversaNova, { id: 'conv-1' });
  });

  it('conversa pessoal: alvo inclui o dono da linha, conversa e supervisao, sem sala de fila', () => {
    comOrganizacao('org-A', () => {
      notificarConversaNova({ id: 'conv-2' }, { conversaId: 'conv-2', agenteId: 'dono-1' });
    });

    const alvos = (to.mock.calls[0]?.[0] as string[] | undefined) ?? [];
    expect(new Set(alvos)).toEqual(
      new Set([salas.supervisao('org-A'), salas.usuario('org-A', 'dono-1'), salas.conversa('org-A', 'conv-2')]),
    );
  });

  it('nunca mistura salas de organizacoes diferentes no mesmo emit', () => {
    comOrganizacao('org-A', () => {
      notificarConversaNova({ id: 'x' }, { conversaId: 'x', filaId: 'fila-x', agenteId: 'ag-x' });
    });
    const alvosOrgA = (to.mock.calls[0]?.[0] as string[] | undefined) ?? [];
    expect(alvosOrgA.every((s) => s.startsWith('org:org-A:'))).toBe(true);

    to.mockClear();
    comOrganizacao('org-B', () => {
      notificarConversaNova({ id: 'y' }, { conversaId: 'y', filaId: 'fila-x', agenteId: 'ag-x' });
    });
    const alvosOrgB = (to.mock.calls[0]?.[0] as string[] | undefined) ?? [];
    expect(alvosOrgB.every((s) => s.startsWith('org:org-B:'))).toBe(true);
    expect(alvosOrgB.some((s) => alvosOrgA.includes(s))).toBe(false);
  });

  it('sem organizacao no contexto: nao emite nada e nao lanca', () => {
    expect(() =>
      notificarConversaNova({ id: 'conv-3' }, { conversaId: 'conv-3', agenteId: 'x' }),
    ).not.toThrow();
    expect(to).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('sem fila e sem agente (destino ainda nao decidido): nao lanca, emite so para conversa e supervisao', () => {
    expect(() =>
      comOrganizacao('org-A', () => {
        notificarConversaNova({ id: 'conv-4' }, { conversaId: 'conv-4' });
      }),
    ).not.toThrow();

    const alvos = (to.mock.calls[0]?.[0] as string[] | undefined) ?? [];
    expect(new Set(alvos)).toEqual(new Set([salas.supervisao('org-A'), salas.conversa('org-A', 'conv-4')]));
  });

  it('io ainda nao registrado (bootstrap): nao lanca, so nao emite', () => {
    registrarIo(null as unknown as Server);
    expect(() =>
      comOrganizacao('org-A', () => {
        notificarConversaNova({ id: 'conv-5' }, { conversaId: 'conv-5', filaId: 'fila-1' });
      }),
    ).not.toThrow();
    expect(to).not.toHaveBeenCalled();
  });
});

/**
 * Fase 11.7 — `notificarPreviaAtualizada` e deliberadamente mais restrito que
 * `notificarConversaNova`: uma ChatPreview e o espelho do celular PESSOAL do
 * vendedor, entao nunca pode ir para a sala de supervisao (diferente de toda
 * Conversation, que sempre vai) nem para nenhuma sala de fila.
 */
describe('hub — notificarPreviaAtualizada', () => {
  const to = vi.fn();
  const emit = vi.fn();
  const io = { to: to.mockReturnValue({ emit }) } as unknown as Server;

  beforeEach(() => {
    vi.clearAllMocks();
    to.mockReturnValue({ emit });
    registrarIo(io);
  });

  it('emite SO para a sala do dono da linha — nunca para supervisao', () => {
    comOrganizacao('org-A', () => {
      notificarPreviaAtualizada({ id: 'previa-1' }, { agenteId: 'dono-1' });
    });

    expect(to).toHaveBeenCalledTimes(1);
    expect(to).toHaveBeenCalledWith(salas.usuario('org-A', 'dono-1'));
    expect(emit).toHaveBeenCalledWith(EVENTOS.previaAtualizada, { id: 'previa-1' });
  });

  it('nunca mistura organizacoes: dono da mesma id em orgs diferentes cai em salas diferentes', () => {
    comOrganizacao('org-A', () => {
      notificarPreviaAtualizada({ id: 'x' }, { agenteId: 'dono-1' });
    });
    expect(to).toHaveBeenCalledWith(salas.usuario('org-A', 'dono-1'));

    to.mockClear();
    comOrganizacao('org-B', () => {
      notificarPreviaAtualizada({ id: 'y' }, { agenteId: 'dono-1' });
    });
    expect(to).toHaveBeenCalledWith(salas.usuario('org-B', 'dono-1'));
    expect(to).not.toHaveBeenCalledWith(salas.usuario('org-A', 'dono-1'));
  });

  it('sem organizacao no contexto: nao emite nada e nao lanca', () => {
    expect(() => notificarPreviaAtualizada({ id: 'previa-2' }, { agenteId: 'dono-1' })).not.toThrow();
    expect(to).not.toHaveBeenCalled();
  });

  it('io ainda nao registrado: nao lanca, so nao emite', () => {
    registrarIo(null as unknown as Server);
    expect(() =>
      comOrganizacao('org-A', () => {
        notificarPreviaAtualizada({ id: 'previa-3' }, { agenteId: 'dono-1' });
      }),
    ).not.toThrow();
    expect(to).not.toHaveBeenCalled();
  });
});
