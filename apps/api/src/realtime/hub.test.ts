import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'socket.io';

/*
 * Desde 2026-10-05 o hub consulta o dono do numero de cada conversa para
 * escolher as salas — o prisma e mockado aqui para nenhum teste tocar banco.
 * Padrao: conversa do Numero da empresa (sem linha).
 */
const { conversationFindUnique } = vi.hoisted(() => ({
  conversationFindUnique: vi.fn().mockResolvedValue({ canalConfig: null }),
}));
vi.mock('../lib/prisma', () => ({ prisma: { conversation: { findUnique: conversationFindUnique } } }));

import { comOrganizacao } from '../lib/tenant';
import {
  notificarConversaNova,
  notificarMensagem,
  notificarPreviaAtualizada,
  registrarIo,
  salasDaConversa,
} from './hub';
import { EVENTOS, salas } from './events';

/** Linha pessoal com dono de um perfil — formato que `findUnique` devolve. */
const linhaDe = (donoId: string, perfil: string) => ({ canalConfig: { donoId, dono: { perfil } } });

/**
 * A regra de quem RECEBE cada evento de conversa (2026-10-05). A lista vem do
 * banco e ja respeita a politica; sem isto o socket entregaria ao Supervisor,
 * ao vivo, o que a lista esconde dele.
 */
describe('salasDaConversa', () => {
  const ORG = 'org-1';

  it('numero do Administrador: supervisao nao recebe; o dono e o admin recebem', () => {
    const alvos = salasDaConversa(ORG, {}, { donoId: 'u-admin', donoPerfil: 'ADMIN' });
    expect(alvos).toContain(salas.admin(ORG));
    expect(alvos).toContain(salas.usuario(ORG, 'u-admin'));
    expect(alvos).not.toContain(salas.supervisao(ORG));
  });

  it('numero de outro Supervisor: supervisao nao recebe', () => {
    expect(salasDaConversa(ORG, {}, { donoId: 'u-romulo', donoPerfil: 'SUPERVISOR' })).not.toContain(
      salas.supervisao(ORG),
    );
  });

  it('numero de Comercial ou Suporte: supervisao recebe, e o dono tambem', () => {
    for (const perfil of ['COMERCIAL', 'SUPORTE'] as const) {
      const alvos = salasDaConversa(ORG, {}, { donoId: 'u-leandro', donoPerfil: perfil });
      expect(alvos).toContain(salas.supervisao(ORG));
      expect(alvos).toContain(salas.usuario(ORG, 'u-leandro'));
    }
  });

  it('Numero da empresa: supervisao recebe', () => {
    expect(salasDaConversa(ORG, {}, { donoId: null, donoPerfil: null })).toContain(salas.supervisao(ORG));
  });

  it('dono desconhecido (consulta falhou): so o Administrador — falha fechada', () => {
    expect(salasDaConversa(ORG, {}, null)).toEqual([salas.admin(ORG)]);
  });

  it('fila, responsavel, responsavel anterior e sala da conversa continuam como antes', () => {
    const alvos = salasDaConversa(
      ORG,
      { filaId: 'f-1', agenteId: 'u-a', agenteAnteriorId: 'u-b', conversaId: 'c-1' },
      { donoId: null, donoPerfil: null },
    );
    expect(alvos).toEqual(
      expect.arrayContaining([
        salas.fila(ORG, 'f-1'),
        salas.usuario(ORG, 'u-a'),
        salas.usuario(ORG, 'u-b'),
        salas.conversa(ORG, 'c-1'),
      ]),
    );
  });

  it('incluirSalaDaConversa=false tira a sala da conversa (nota interna)', () => {
    const alvos = salasDaConversa(
      ORG,
      { conversaId: 'c-1', incluirSalaDaConversa: false },
      { donoId: null, donoPerfil: null },
    );
    expect(alvos).not.toContain(salas.conversa(ORG, 'c-1'));
  });
});

/**
 * Fase 11.2 — garantias do evento de conversa nova: nunca atravessa
 * organizacao, e nunca lanca quando nao ha para quem notificar. Desde
 * 2026-10-05 o envio e assincrono (consulta o dono do numero antes).
 */
describe('hub — notificarConversaNova', () => {
  const to = vi.fn();
  const emit = vi.fn();
  const io = { to: to.mockReturnValue({ emit }) } as unknown as Server;

  beforeEach(() => {
    vi.clearAllMocks();
    to.mockReturnValue({ emit });
    conversationFindUnique.mockResolvedValue({ canalConfig: null });
    registrarIo(io);
  });

  it('conversa do Numero da empresa em fila: admin, supervisao, fila e conversa da propria org', async () => {
    await comOrganizacao('org-A', () => notificarConversaNova({ id: 'conv-1' }, { conversaId: 'conv-1', filaId: 'fila-1' }));

    expect(to).toHaveBeenCalledTimes(1);
    const alvos = (to.mock.calls[0]?.[0] as string[] | undefined) ?? [];
    expect(new Set(alvos)).toEqual(
      new Set([
        salas.admin('org-A'),
        salas.supervisao('org-A'),
        salas.fila('org-A', 'fila-1'),
        salas.conversa('org-A', 'conv-1'),
      ]),
    );
    expect(emit).toHaveBeenCalledWith(EVENTOS.conversaNova, { id: 'conv-1' });
  });

  it('conversa do numero de um Comercial: o dono e a supervisao recebem, sem sala de fila', async () => {
    conversationFindUnique.mockResolvedValue(linhaDe('dono-1', 'COMERCIAL'));
    await comOrganizacao('org-A', () => notificarConversaNova({ id: 'conv-2' }, { conversaId: 'conv-2', agenteId: 'dono-1' }));

    const alvos = (to.mock.calls[0]?.[0] as string[] | undefined) ?? [];
    expect(new Set(alvos)).toEqual(
      new Set([
        salas.admin('org-A'),
        salas.supervisao('org-A'),
        salas.usuario('org-A', 'dono-1'),
        salas.conversa('org-A', 'conv-2'),
      ]),
    );
  });

  it('conversa do numero do Administrador: a supervisao NAO recebe', async () => {
    conversationFindUnique.mockResolvedValue(linhaDe('u-admin', 'ADMIN'));
    await comOrganizacao('org-A', () => notificarConversaNova({ id: 'conv-6' }, { conversaId: 'conv-6' }));

    const alvos = (to.mock.calls[0]?.[0] as string[] | undefined) ?? [];
    expect(alvos).not.toContain(salas.supervisao('org-A'));
    expect(alvos).toContain(salas.admin('org-A'));
  });

  it('consulta do dono falhou: so o admin e as salas operacionais — nunca a supervisao', async () => {
    conversationFindUnique.mockRejectedValue(new Error('banco fora'));
    await comOrganizacao('org-A', () => notificarConversaNova({ id: 'conv-7' }, { conversaId: 'conv-7' }));

    const alvos = (to.mock.calls[0]?.[0] as string[] | undefined) ?? [];
    expect(new Set(alvos)).toEqual(new Set([salas.admin('org-A'), salas.conversa('org-A', 'conv-7')]));
  });

  it('nunca mistura salas de organizacoes diferentes no mesmo emit', async () => {
    await comOrganizacao('org-A', () =>
      notificarConversaNova({ id: 'x' }, { conversaId: 'x', filaId: 'fila-x', agenteId: 'ag-x' }),
    );
    const alvosOrgA = (to.mock.calls[0]?.[0] as string[] | undefined) ?? [];
    expect(alvosOrgA.every((s) => s.startsWith('org:org-A:'))).toBe(true);

    to.mockClear();
    await comOrganizacao('org-B', () =>
      notificarConversaNova({ id: 'y' }, { conversaId: 'y', filaId: 'fila-x', agenteId: 'ag-x' }),
    );
    const alvosOrgB = (to.mock.calls[0]?.[0] as string[] | undefined) ?? [];
    expect(alvosOrgB.every((s) => s.startsWith('org:org-B:'))).toBe(true);
    expect(alvosOrgB.some((s) => alvosOrgA.includes(s))).toBe(false);
  });

  it('sem organizacao no contexto: nao emite nada e nao lanca', async () => {
    await expect(notificarConversaNova({ id: 'conv-3' }, { conversaId: 'conv-3', agenteId: 'x' })).resolves.toBeUndefined();
    expect(to).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('sem fila e sem agente (destino ainda nao decidido): emite para gestao e conversa', async () => {
    await comOrganizacao('org-A', () => notificarConversaNova({ id: 'conv-4' }, { conversaId: 'conv-4' }));

    const alvos = (to.mock.calls[0]?.[0] as string[] | undefined) ?? [];
    expect(new Set(alvos)).toEqual(
      new Set([salas.admin('org-A'), salas.supervisao('org-A'), salas.conversa('org-A', 'conv-4')]),
    );
  });

  it('io ainda nao registrado (bootstrap): nao lanca, so nao emite', async () => {
    registrarIo(null as unknown as Server);
    await comOrganizacao('org-A', () => notificarConversaNova({ id: 'conv-5' }, { conversaId: 'conv-5', filaId: 'fila-1' }));
    expect(to).not.toHaveBeenCalled();
  });
});

/**
 * Achado 1(b) da revisao final: uma nota interna (`interno: true`) nunca pode
 * chegar na sala da conversa (`salas.conversa`) — e a mesma sala que o
 * visitante do Webchat escuta. Quem chama `notificarMensagem` sinaliza isso com
 * `incluirSalaDaConversa: false` nos destinos.
 */
describe('hub — notificarMensagem / incluirSalaDaConversa', () => {
  const to = vi.fn();
  const emit = vi.fn();
  const io = { to: to.mockReturnValue({ emit }) } as unknown as Server;

  beforeEach(() => {
    vi.clearAllMocks();
    to.mockReturnValue({ emit });
    conversationFindUnique.mockResolvedValue({ canalConfig: null });
    registrarIo(io);
  });

  it('mensagem normal (sem o parametro): a sala da conversa continua nos alvos, como sempre', async () => {
    await comOrganizacao('org-A', () =>
      notificarMensagem(
        { conversaId: 'conv-1', mensagem: { id: 'm1' } },
        { conversaId: 'conv-1', filaId: 'fila-1', agenteId: 'agente-1' },
      ),
    );

    const alvos = (to.mock.calls[0]?.[0] as string[] | undefined) ?? [];
    expect(new Set(alvos)).toEqual(
      new Set([
        salas.admin('org-A'),
        salas.supervisao('org-A'),
        salas.fila('org-A', 'fila-1'),
        salas.usuario('org-A', 'agente-1'),
        salas.conversa('org-A', 'conv-1'),
      ]),
    );
  });

  it('nota interna (incluirSalaDaConversa: false): a sala da conversa NAO entra nos alvos', async () => {
    await comOrganizacao('org-A', () =>
      notificarMensagem(
        { conversaId: 'conv-1', mensagem: { id: 'm2', interno: true } },
        { conversaId: 'conv-1', filaId: 'fila-1', agenteId: 'agente-1', incluirSalaDaConversa: false },
      ),
    );

    const alvos = (to.mock.calls[0]?.[0] as string[] | undefined) ?? [];
    expect(alvos).not.toContain(salas.conversa('org-A', 'conv-1'));
    expect(new Set(alvos)).toEqual(
      new Set([
        salas.admin('org-A'),
        salas.supervisao('org-A'),
        salas.fila('org-A', 'fila-1'),
        salas.usuario('org-A', 'agente-1'),
      ]),
    );
  });

  it('mensagem sem conversaId nos destinos: usa o conversaId do payload para achar o dono', async () => {
    conversationFindUnique.mockResolvedValue(linhaDe('u-admin', 'ADMIN'));
    await comOrganizacao('org-A', () =>
      notificarMensagem({ conversaId: 'conv-9', mensagem: { id: 'm3' } }, { filaId: 'fila-1' }),
    );

    expect(conversationFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'conv-9' } }));
    expect((to.mock.calls[0]?.[0] as string[]) ?? []).not.toContain(salas.supervisao('org-A'));
  });
});

/**
 * Fase 11.7 — `notificarPreviaAtualizada` e deliberadamente mais restrito que
 * `notificarConversaNova`: uma ChatPreview e o espelho do celular PESSOAL do
 * vendedor, entao nunca vai para a gestao nem para fila nenhuma.
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

  it('emite SO para a sala do dono da linha — nunca para a gestao', () => {
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
