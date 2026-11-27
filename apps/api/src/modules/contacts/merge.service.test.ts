import { describe, expect, it, vi } from 'vitest';
import type { ClienteDeEscrita } from '../../lib/prisma';
import { mesclarContatos, telefoneBrAlternativo, unificarConversasAbertas } from './merge.service';

describe('mesclagem segura de contatos', () => {
  it('reconhece apenas variantes brasileiras de celular com/sem nono dígito', () => {
    expect(telefoneBrAlternativo('556292885001')).toBe('5562992885001');
    expect(telefoneBrAlternativo('5562992885001')).toBe('556292885001');
    expect(telefoneBrAlternativo('55112345678')).toBeNull();
    expect(telefoneBrAlternativo('14155552671')).toBeNull();
  });

  it('transfere histórico e combina campos sem apagar o contato secundário', async () => {
    const principal = {
      id: 'principal', organizacaoId: 'org-1', anonimizadoEm: null,
      email: null, uf: 'GO', cidade: null, contaId: null, responsavelId: 'user-1',
      segmentoParceiro: null, papelNaConta: null, qualificacaoQsa: null, consentimentoEm: null,
      tags: ['cliente'], observacoes: 'nota principal',
    };
    const secundario = {
      id: 'secundario', organizacaoId: 'org-1', anonimizadoEm: null,
      email: 'cliente@example.com', uf: 'TO', cidade: 'Palmas', contaId: 'conta-1', responsavelId: null,
      segmentoParceiro: 'TIM', papelNaConta: null, qualificacaoQsa: null, consentimentoEm: new Date(0),
      tags: ['cliente', 'parceiro'], observacoes: 'nota antiga',
    };
    const itemSecundario = { id: 'camp-2', campanhaId: 'camp', contatoId: 'secundario', status: 'RESPONDIDO', erro: null,
      conversaId: 'conv-2', enviadoEm: new Date(2), respondidoEm: new Date(3), textoEnviadoEm: null, anexosEnviados: ['a'] };
    const itemPrincipal = { ...itemSecundario, id: 'camp-1', contatoId: 'principal', status: 'ENVIADO', conversaId: null,
      enviadoEm: new Date(1), respondidoEm: null, anexosEnviados: ['b'] };
    const tx = {
      contact: {
        findFirst: vi.fn().mockResolvedValueOnce(principal).mockResolvedValueOnce(secundario),
        update: vi.fn().mockResolvedValue({}),
      },
      campaignItem: {
        findMany: vi.fn().mockResolvedValue([itemSecundario]), findFirst: vi.fn().mockResolvedValue(itemPrincipal),
        update: vi.fn().mockResolvedValue({}), delete: vi.fn().mockResolvedValue({}),
      },
      contactOperation: { findMany: vi.fn().mockResolvedValue([]), delete: vi.fn(), update: vi.fn() },
      conversation: { updateMany: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]) }, lead: { updateMany: vi.fn().mockResolvedValue({}) },
      ticket: { updateMany: vi.fn().mockResolvedValue({}) }, call: { updateMany: vi.fn().mockResolvedValue({}) },
      activity: { updateMany: vi.fn().mockResolvedValue({}) }, credenciamento: { updateMany: vi.fn().mockResolvedValue({}) },
      contactDeletionRequest: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as ClienteDeEscrita;

    await mesclarContatos(tx, 'principal', 'secundario');

    expect(tx.conversation.updateMany).toHaveBeenCalledWith({ where: { contatoId: 'secundario' }, data: { contatoId: 'principal' } });
    expect(tx.call.updateMany).toHaveBeenCalledWith({ where: { contatoId: 'secundario' }, data: { contatoId: 'principal' } });
    expect(tx.campaignItem.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'camp-1' }, data: expect.objectContaining({ status: 'RESPONDIDO', conversaId: 'conv-2', anexosEnviados: ['b', 'a'] }),
    }));
    expect(tx.campaignItem.delete).toHaveBeenCalledWith({ where: { id: 'camp-2' } });
    expect(tx.contact.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'principal' }, data: expect.objectContaining({ email: 'cliente@example.com', tags: ['cliente', 'parceiro'] }),
    }));
    expect(tx.contact.update).toHaveBeenLastCalledWith({ where: { id: 'secundario' }, data: { excluidoEm: expect.any(Date) } });
  });

  it('unifica conversas abertas do mesmo titular na mesma linha: fica a mais antiga e as outras entregam o historico', async () => {
    const base = { contatoId: 'c', canal: 'WHATSAPP', canalConfigId: 'linha-1', naoLidas: 0, arquivada: false };
    const antiga = { ...base, id: '00008', status: 'AGUARDANDO_CLIENTE', agenteId: 'u1', criadoEm: new Date(1), ultimaMensagemEm: new Date(10) };
    const nova = { ...base, id: '00009', status: 'EM_ATENDIMENTO', agenteId: 'u1', criadoEm: new Date(2), ultimaMensagemEm: new Date(20), naoLidas: 1 };
    const outraLinha = { ...base, id: 'outra', canalConfigId: 'linha-2', status: 'ATRIBUIDO', agenteId: null, criadoEm: new Date(3), ultimaMensagemEm: new Date(30) };
    const tx = {
      conversation: { findMany: vi.fn().mockResolvedValue([antiga, nova, outraLinha]), update: vi.fn(), deleteMany: vi.fn() },
      message: { updateMany: vi.fn() }, call: { updateMany: vi.fn() }, ticket: { updateMany: vi.fn() }, survey: { updateMany: vi.fn() }, execucaoFluxo: { updateMany: vi.fn() },
    } as unknown as ClienteDeEscrita;

    await unificarConversasAbertas(tx, 'c');

    expect(tx.message.updateMany).toHaveBeenCalledWith({ where: { conversaId: { in: ['00009'] } }, data: { conversaId: '00008' } });
    expect(tx.survey.updateMany).toHaveBeenCalledWith({ where: { conversaId: { in: ['00009'] } }, data: { conversaId: '00008' } });
    expect(tx.execucaoFluxo.updateMany).toHaveBeenCalledWith({ where: { conversaId: { in: ['00009'] } }, data: { conversaId: '00008' } });
    expect(tx.conversation.update).toHaveBeenCalledWith({
      where: { id: '00008' },
      data: expect.objectContaining({ status: 'EM_ATENDIMENTO', ultimaMensagemEm: new Date(20), naoLidas: 1 }),
    });
    expect(tx.conversation.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['00009'] } } });
    expect(tx.conversation.deleteMany).toHaveBeenCalledTimes(1); // a conversa de outra linha nao e tocada
  });

  it('não mescla contato de outra organização nem contato anonimizado', async () => {
    const principal = { id: 'principal', organizacaoId: 'org-1', anonimizadoEm: null };
    const tx = {
      contact: { findFirst: vi.fn().mockResolvedValueOnce(principal).mockResolvedValueOnce({ id: 'secundario', organizacaoId: 'org-2', anonimizadoEm: null }), update: vi.fn() },
    } as unknown as ClienteDeEscrita;
    await mesclarContatos(tx, 'principal', 'secundario');
    expect(tx.contact.update).not.toHaveBeenCalled();
  });
});
