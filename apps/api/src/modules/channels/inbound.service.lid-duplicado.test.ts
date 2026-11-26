// apps/api/src/modules/channels/inbound.service.lid-duplicado.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { comOrganizacao } from '../../lib/tenant';
import { registrarMensagemEntrante } from './inbound.service';

const db = vi.hoisted(() => ({
  messageFindUnique: vi.fn().mockResolvedValue(null),
  conversationFindMany: vi.fn(),
  conversationFindFirst: vi.fn().mockResolvedValue(null),
  contactFindMany: vi.fn(),
  contactFindUniqueOrThrow: vi.fn(),
  contactCreate: vi.fn(),
  transaction: vi.fn(),
}));
const { mesclarContatos } = vi.hoisted(() => ({ mesclarContatos: vi.fn() }));
vi.mock('../contacts/merge.service', async (original) => ({ ...(await original<object>()), mesclarContatos }));
vi.mock('../../lib/prisma', () => ({
  prisma: {
    message: { findUnique: db.messageFindUnique },
    conversation: { findMany: db.conversationFindMany, findFirst: db.conversationFindFirst },
    contact: { findMany: db.contactFindMany, findUniqueOrThrow: db.contactFindUniqueOrThrow, create: db.contactCreate },
    $transaction: db.transaction,
  },
}));
vi.mock('./channels.service', () => ({ configDoDestino: vi.fn().mockResolvedValue(null) }));

describe('contato do @lid sem telefone', () => {
  beforeEach(() => vi.clearAllMocks());

  it('quando o telefone aparece, funde o cadastro vazio do @lid no contato real (sem duplicar)', async () => {
    db.contactFindMany.mockResolvedValue([{ id: 'real', telefoneNormalizado: '5562992885001' }]);
    db.conversationFindMany.mockResolvedValue([{ contatoId: 'vazio' }]);
    db.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({}));
    db.contactFindUniqueOrThrow.mockResolvedValue({ id: 'real' });
    db.conversationFindFirst.mockRejectedValue(new Error('parou depois da resolucao do contato'));

    await comOrganizacao(
      'org-1',
      () =>
        registrarMensagemEntrante({
          canal: 'WHATSAPP', enderecoExterno: '123456@lid', nomeExibicao: null, telefone: '5562992885001',
          idExterno: 'M1', conteudo: 'oi', tipoAnexo: 'TEXTO', anexoUrl: null, anexoIdExterno: null,
          anexoNome: null, identificadorDestino: null,
        }),
      { id: 'sistema', perfil: 'ADMIN' },
    ).catch(() => undefined);

    expect(mesclarContatos).toHaveBeenCalledWith(expect.anything(), 'real', 'vazio');
  });
});
