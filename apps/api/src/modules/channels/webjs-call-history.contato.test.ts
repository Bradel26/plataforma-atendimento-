import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findFirst, findMany } = vi.hoisted(() => ({ findFirst: vi.fn(), findMany: vi.fn() }));
vi.mock('../../lib/prisma', () => ({ prisma: { contact: { findFirst, findMany }, call: {} } }));
vi.mock('../../lib/storage', () => ({ salvar: vi.fn() }));
vi.mock('../../realtime/hub', () => ({ notificarChamada: vi.fn() }));

import { contatoPorTelefone } from './webjs-call-history.service';

describe('contatoPorTelefone (chamadas WhatsApp)', () => {
  beforeEach(() => { findFirst.mockReset(); findMany.mockReset(); findMany.mockResolvedValue([]); });

  it('procura pelo telefone normalizado e pela variação do nono dígito', async () => {
    findFirst.mockResolvedValue({ id: 'c1' });
    expect(await contatoPorTelefone('5562992885001')).toBe('c1');
    expect(findFirst.mock.calls[0]![0].where.telefoneNormalizado.in).toEqual(['5562992885001', '556292885001']);
  });

  it('reconhece cadastro legado sem telefoneNormalizado, em qualquer formatação', async () => {
    findFirst.mockResolvedValue(null);
    findMany.mockResolvedValue([{ id: 'legado', telefone: '(62) 99288-5001' }]);
    expect(await contatoPorTelefone('5562992885001')).toBe('legado');
  });

  it('não vincula quando ninguém tem o número e nunca cria contato', async () => {
    findFirst.mockResolvedValue(null);
    expect(await contatoPorTelefone('5511987654321')).toBeNull();
    expect(await contatoPorTelefone('123')).toBeNull();
  });
});
