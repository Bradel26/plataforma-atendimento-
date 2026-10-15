// apps/api/src/modules/channels/inbound.service.propria.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { comOrganizacao } from '../../lib/tenant';
import { registrarMensagemPropria } from './inbound.service';

const db = vi.hoisted(() => ({
  messageFindUnique: vi.fn(),
  messageCreate: vi.fn(),
  conversationFindFirst: vi.fn(),
  conversationFindMany: vi.fn().mockResolvedValue([]),
  conversationCreate: vi.fn(),
  conversationUpdate: vi.fn(),
  conversationUpdateMany: vi.fn().mockResolvedValue({ count: 0 }),
  contactFindFirst: vi.fn(),
  contactCreate: vi.fn(),
  contactFindUniqueOrThrow: vi.fn(),
  queueFindFirst: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    message: { findUnique: db.messageFindUnique, create: db.messageCreate },
    conversation: {
      findFirst: db.conversationFindFirst,
      findMany: db.conversationFindMany,
      create: db.conversationCreate,
      update: db.conversationUpdate,
      updateMany: db.conversationUpdateMany,
    },
    contact: { findFirst: db.contactFindFirst, create: db.contactCreate, findUniqueOrThrow: db.contactFindUniqueOrThrow },
    queue: { findFirst: db.queueFindFirst },
    user: { findUnique: vi.fn().mockResolvedValue({ nome: 'Dono' }) },
  },
}));

const { configDoDestino } = vi.hoisted(() => ({ configDoDestino: vi.fn() }));
vi.mock('./channels.service', () => ({ configDoDestino }));
vi.mock('./media.service', () => ({ baixarAnexo: vi.fn().mockResolvedValue({ url: null, motivo: null }) }));
vi.mock('./chat-previews.service', () => ({ promoverPrevia: vi.fn() }));
vi.mock('../conversations/protocolo', () => ({ reservarProtocolo: vi.fn().mockResolvedValue('261009-00003') }));
const { entregarParaIa } = vi.hoisted(() => ({ entregarParaIa: vi.fn() }));
vi.mock('../bots/ia.service', () => ({ entregarParaIa }));
const { responderAutomaticamente } = vi.hoisted(() => ({ responderAutomaticamente: vi.fn() }));
vi.mock('../bots/bots.service', () => ({ responderAutomaticamente }));
const hub = vi.hoisted(() => ({ notificarMensagem: vi.fn(), notificarConversaNova: vi.fn(), notificarConversaAtualizada: vi.fn() }));
vi.mock('../../realtime/hub', () => hub);
vi.mock('../conversations/conversations.serializer', () => ({
  inclusaoDetalhe: {},
  toConversaDetalhe: (c: unknown) => c,
  toMensagem: (m: unknown) => m,
}));


const DADOS = {
  canal: 'WHATSAPP' as const,
  enderecoExterno: '5562992197010',
  nomeExibicao: null,
  telefone: '5562992197010',
  idExterno: 'CEL-1',
  conteudo: 'Meu celular para enviar mensagem',
  tipoAnexo: 'TEXTO' as const,
  anexoUrl: null,
  anexoIdExterno: null,
  anexoNome: null,
  identificadorDestino: 'vendedor-1',
};

const rodar = () => comOrganizacao('org-1', () => registrarMensagemPropria(DADOS), { id: 'sistema', perfil: 'ADMIN' });

describe('registrarMensagemPropria', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.messageFindUnique.mockResolvedValue(null);
    db.contactFindFirst.mockResolvedValue({ id: 'contato-1' });
    db.conversationFindFirst.mockResolvedValue(null);
    db.messageCreate.mockResolvedValue({ id: 'm-1', criadoEm: new Date() });
    db.conversationUpdate.mockResolvedValue({ id: 'c-1', filaId: null, agenteId: 'dono-1' });
  });

  it('linha com espelharCelular desligado: ignora sem gravar nada', async () => {
    configDoDestino.mockResolvedValue({ id: 'cfg-1', donoId: 'dono-1', filaId: null, espelharCelular: false });
    await expect(rodar()).resolves.toEqual({ ignorada: true });
    expect(db.messageCreate).not.toHaveBeenCalled();
    expect(db.conversationCreate).not.toHaveBeenCalled();
  });

  it('idExterno ja gravado (eco da plataforma): duplicada', async () => {
    db.messageFindUnique.mockResolvedValue({ id: 'm-existente' });
    await expect(rodar()).resolves.toEqual({ duplicada: true });
    expect(db.messageCreate).not.toHaveBeenCalled();
  });

  it('sem conversa aberta: cria conversa ATIVA na linha, atribuida ao dono, com protocolo', async () => {
    configDoDestino.mockResolvedValue({ id: 'cfg-1', donoId: 'dono-1', filaId: null, espelharCelular: true });
    db.conversationCreate.mockResolvedValue({ id: 'c-1', status: 'AGUARDANDO_CLIENTE' });

    await rodar();

    expect(db.conversationCreate.mock.calls[0]?.[0]?.data).toMatchObject({
      origem: 'ATIVO',
      protocolo: '261009-00003',
      canalConfigId: 'cfg-1',
      agenteId: 'dono-1',
      atendenteInicialId: 'dono-1',
      // O dono falou primeiro -- ja nasce aguardando o cliente, nao "em
      // atendimento" (que implicaria uma troca ja rolando).
      status: 'AGUARDANDO_CLIENTE',
    });
    expect(db.messageCreate.mock.calls[0]?.[0]?.data).toMatchObject({
      autor: 'AGENTE',
      enviadaPorDispositivo: true,
      idExterno: 'CEL-1',
    });
    expect(db.conversationUpdate.mock.calls[0]?.[0]?.data).not.toHaveProperty('naoLidas');
    expect(hub.notificarConversaNova).toHaveBeenCalledTimes(1);
  });

  it('com conversa aberta: reaproveita e nunca aciona IA nem bot', async () => {
    configDoDestino.mockResolvedValue({ id: 'cfg-1', donoId: 'dono-1', filaId: null, espelharCelular: true });
    // 1a consulta: encontrarOuCriarContato acha o contato pela conversa anterior;
    // 2a consulta: a conversa aberta na linha.
    db.conversationFindFirst
      .mockResolvedValueOnce({ contatoId: 'contato-1' })
      .mockResolvedValueOnce({ id: 'c-9', status: 'EM_ATENDIMENTO', canalConfigId: 'cfg-1' });
    db.contactFindUniqueOrThrow.mockResolvedValue({ id: 'contato-1' });

    await rodar();

    expect(db.conversationCreate).not.toHaveBeenCalled();
    expect(entregarParaIa).not.toHaveBeenCalled();
    expect(responderAutomaticamente).not.toHaveBeenCalled();
    expect(hub.notificarConversaAtualizada).toHaveBeenCalledTimes(1);
  });

  it('mensagem propria em conversa ja ATRIBUIDO ou EM_ATENDIMENTO poe em AGUARDANDO_CLIENTE', async () => {
    configDoDestino.mockResolvedValue({ id: 'cfg-1', donoId: 'dono-1', filaId: null, espelharCelular: true });
    db.conversationFindFirst
      .mockResolvedValueOnce({ contatoId: 'contato-1' })
      .mockResolvedValueOnce({ id: 'c-9', status: 'ATRIBUIDO', canalConfigId: 'cfg-1' });
    db.contactFindUniqueOrThrow.mockResolvedValue({ id: 'contato-1' });

    await rodar();

    // Compare-and-set atomico, nao o status lido antes de `baixarAnexo` (que
    // pode levar segundos) -- mesma garantia de `assumirConversa` e dos outros
    // dois pontos de entrada (achado da revisao final).
    expect(db.conversationUpdateMany).toHaveBeenCalledWith({
      where: { id: 'c-9', status: { in: ['ATRIBUIDO', 'EM_ATENDIMENTO'] } },
      data: { status: 'AGUARDANDO_CLIENTE' },
    });
    expect(db.conversationUpdate.mock.calls[0]?.[0]?.data).not.toHaveProperty('status');
  });

  it('mensagem propria em conversa EM_ESPERA nao mexe no status (sem agente assumido)', async () => {
    configDoDestino.mockResolvedValue({ id: 'cfg-1', donoId: null, filaId: 'fila-1', espelharCelular: true });
    db.conversationFindFirst
      .mockResolvedValueOnce({ contatoId: 'contato-1' })
      .mockResolvedValueOnce({ id: 'c-9', status: 'EM_ESPERA', canalConfigId: 'cfg-1' });
    db.contactFindUniqueOrThrow.mockResolvedValue({ id: 'contato-1' });

    await rodar();

    // Sem ATRIBUIDO/EM_ATENDIMENTO no banco, o compare-and-set nao casa -- a
    // tentativa e incondicional, o efeito e que nunca existe.
    expect(db.conversationUpdateMany).toHaveBeenCalledWith({
      where: { id: 'c-9', status: { in: ['ATRIBUIDO', 'EM_ATENDIMENTO'] } },
      data: { status: 'AGUARDANDO_CLIENTE' },
    });
    expect(db.conversationUpdate.mock.calls[0]?.[0]?.data).not.toHaveProperty('status');
  });

  it('corrida: conversa transferida para fila (EM_ESPERA, sem agente) durante o download do anexo nao e reaberta como AGUARDANDO_CLIENTE', async () => {
    // O status lido no inicio da funcao (ATRIBUIDO) fica desatualizado -- a
    // conversa foi transferida para fila por um supervisor enquanto o anexo
    // baixava. O compare-and-set so acha linha se o banco AINDA tiver
    // ATRIBUIDO/EM_ATENDIMENTO; aqui simulamos que ja nao tem (count: 0).
    configDoDestino.mockResolvedValue({ id: 'cfg-1', donoId: 'dono-1', filaId: null, espelharCelular: true });
    db.conversationFindFirst
      .mockResolvedValueOnce({ contatoId: 'contato-1' })
      .mockResolvedValueOnce({ id: 'c-9', status: 'ATRIBUIDO', canalConfigId: 'cfg-1' });
    db.contactFindUniqueOrThrow.mockResolvedValue({ id: 'contato-1' });
    db.conversationUpdateMany.mockResolvedValueOnce({ count: 0 });

    await rodar();

    // A tentativa foi feita (prova que o padrao atomico roda sempre), mas
    // como nao casou (count: 0), o update principal continua sem a chave
    // status -- nao reabre/sobrescreve o que a transferencia decidiu.
    expect(db.conversationUpdateMany).toHaveBeenCalledWith({
      where: { id: 'c-9', status: { in: ['ATRIBUIDO', 'EM_ATENDIMENTO'] } },
      data: { status: 'AGUARDANDO_CLIENTE' },
    });
    expect(db.conversationUpdate.mock.calls[0]?.[0]?.data).not.toHaveProperty('status');
  });
});
