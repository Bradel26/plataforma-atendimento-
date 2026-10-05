import { describe, expect, it, vi } from 'vitest';

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn().mockResolvedValue(null) }));
vi.mock('../../lib/prisma', () => ({ prisma: { channelConfig: { findFirst } } }));

import { obterConfig } from './channels.service';

describe('obterConfig', () => {
  it('linha sem dono: prefere a ativa, e desempata de forma estavel', async () => {
    await obterConfig('WHATSAPP');
    // Sem orderBy, com duas linhas sem dono o Postgres devolve qualquer uma —
    // e uma inativa faz o envio falhar com "O canal WhatsApp esta inativo".
    expect(findFirst.mock.calls[0]?.[0]).toEqual({
      where: { canal: 'WHATSAPP', donoId: null },
      orderBy: [{ ativo: 'desc' }, { atualizadoEm: 'asc' }, { id: 'asc' }],
    });
  });
});
