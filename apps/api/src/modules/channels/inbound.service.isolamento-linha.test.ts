import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MensagemNormalizada } from './meta.types';

/**
 * Auditoria de 23/09/2026, achado critico #1: a busca da conversa aberta
 * (`emAberto`, em `registrarMensagemEntrante`) nao filtrava por
 * `canalConfigId` — so por `contatoId` + `canal` + `status`. Um contato com
 * conversa aberta na linha PESSOAL de um vendedor tinha essa conversa
 * reaproveitada quando escrevia para a linha COMPARTILHADA da empresa (ou
 * para a linha pessoal de outro vendedor): a mensagem caia no atendimento de
 * quem nao deveria ve-la, e a resposta saia pelo numero errado.
 *
 * Mesmo padrao de mocks de inbound.service.race.test.ts.
 */
const {
  messageFindUnique,
  contactFindFirst,
  conversationFindFirst,
  conversationCreate,
  conversationUpdate,
  conversationUpdateMany,
  messageCreate,
  configDoDestino,
} = vi.hoisted(() => ({
  messageFindUnique: vi.fn(),
  contactFindFirst: vi.fn(),
  conversationFindFirst: vi.fn(),
  conversationCreate: vi.fn(),
  conversationUpdate: vi.fn(),
  conversationUpdateMany: vi.fn().mockResolvedValue({ count: 0 }),
  messageCreate: vi.fn(),
  configDoDestino: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    message: { findUnique: messageFindUnique, create: messageCreate },
    contact: { findFirst: contactFindFirst, findUniqueOrThrow: vi.fn(), create: vi.fn() },
    conversation: {
      findFirst: conversationFindFirst,
      findMany: vi.fn().mockResolvedValue([]),
      create: conversationCreate,
      update: conversationUpdate,
      updateMany: conversationUpdateMany,
    },
    queue: { findFirst: vi.fn() },
    user: { findUnique: vi.fn().mockResolvedValue({ nome: 'Dono' }) },
  },
}));

vi.mock('../conversations/protocolo', () => ({ reservarProtocolo: vi.fn().mockResolvedValue('261009-00001') }));
vi.mock('./channels.service', () => ({ configDoDestino }));
vi.mock('./chat-previews.service', () => ({ promoverPrevia: vi.fn() }));
vi.mock('./media.service', () => ({ baixarAnexo: vi.fn().mockResolvedValue({ url: null, motivo: null }) }));
vi.mock('../bots/bots.service', () => ({ responderAutomaticamente: vi.fn() }));
vi.mock('../bots/ia.service', () => ({ entregarParaIa: vi.fn().mockResolvedValue({ entregue: true }) }));

const { notificarConversaAtualizada, notificarConversaNova, notificarMensagem } = vi.hoisted(() => ({
  notificarConversaAtualizada: vi.fn(),
  notificarConversaNova: vi.fn(),
  notificarMensagem: vi.fn(),
}));
vi.mock('../../realtime/hub', () => ({ notificarConversaAtualizada, notificarConversaNova, notificarMensagem }));

vi.mock('../conversations/conversations.serializer', () => ({
  toConversaDetalhe: (c: unknown) => c,
  toMensagem: (m: unknown) => m,
  inclusaoDetalhe: {},
}));

import { registrarMensagemEntrante } from './inbound.service';

function mensagem(overrides: Partial<MensagemNormalizada> = {}): MensagemNormalizada {
  return {
    canal: 'WHATSAPP',
    enderecoExterno: '5511999999999',
    nomeExibicao: 'Cliente Teste',
    telefone: '5511999999999',
    idExterno: 'wamid.isolamento',
    conteudo: 'oi',
    tipoAnexo: 'TEXTO',
    anexoUrl: null,
    anexoIdExterno: null,
    anexoNome: null,
    identificadorDestino: null,
    ...overrides,
  };
}

describe('registrarMensagemEntrante — conversa nao atravessa linha (achado critico #1, 23/09/2026)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messageFindUnique.mockResolvedValue(null);
    contactFindFirst.mockResolvedValue({ id: 'contato-1', telefone: '5511999999999' });
    messageCreate.mockResolvedValue({ id: 'msg-1', criadoEm: new Date('2026-09-24T10:00:00.000Z') });
    // Retorno generico do update mandatorio de fim de fluxo (ultimaMensagemEm,
    // naoLidas, enderecoExterno, arquivada) -- roda em toda chamada, nova ou
    // reaproveitada; os testes abaixo nao observam o resultado dele.
    conversationUpdate.mockResolvedValue({ id: 'conv-atualizada', filaId: null, agenteId: null });
  });

  it('conversa aberta na linha PESSOAL de um vendedor NAO e reaproveitada quando o cliente escreve para a linha COMPARTILHADA', async () => {
    // A mensagem chega pela linha compartilhada (configDoDestino resolve a
    // config compartilhada, independente do que outra linha tenha aberto).
    configDoDestino.mockResolvedValue({ id: 'cfg-compartilhada', donoId: null, filaId: 'fila-1' });

    // 1a chamada a conversation.findFirst: lookup de contato por endereco
    // (dentro de encontrarOuCriarContato) -- nao acha, cai no telefone.
    // 2a chamada: `emAberto`, agora filtrada por canalConfigId='cfg-compartilhada'
    // -- nao acha, porque a conversa aberta existente e da linha PESSOAL.
    conversationFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    conversationCreate.mockResolvedValue({
      id: 'conv-nova-compartilhada',
      canalConfigId: 'cfg-compartilhada',
      filaId: 'fila-1',
      agenteId: null,
    });

    await registrarMensagemEntrante(mensagem());

    // A busca da conversa aberta tem que filtrar pela linha que RECEBEU a mensagem.
    const chamadaEmAberto = conversationFindFirst.mock.calls[1]?.[0];
    expect(chamadaEmAberto?.where).toMatchObject({
      contatoId: 'contato-1',
      canal: 'WHATSAPP',
      canalConfigId: 'cfg-compartilhada',
    });

    // Como a conversa aberta e de OUTRA linha, uma nova foi criada -- nunca
    // reaproveitou a da linha pessoal.
    expect(conversationCreate).toHaveBeenCalledTimes(1);
    const dadosCriacao = conversationCreate.mock.calls[0]?.[0]?.data;
    expect(dadosCriacao.canalConfigId).toBe('cfg-compartilhada');
    expect(notificarConversaNova).toHaveBeenCalledTimes(1);
    expect(notificarConversaAtualizada).not.toHaveBeenCalled();
  });

  it('mensagem que chega por LID reutiliza a conversa aberta localizada pelo telefone resolvido', async () => {
    configDoDestino.mockResolvedValue({ id: 'cfg-vendedor', donoId: 'agente-1', filaId: null });
    contactFindFirst.mockResolvedValue({ id: 'contato-por-telefone', telefone: '5562999912345' });
    conversationFindFirst
      .mockResolvedValueOnce(null) // sem conversa para o endereço LID
      .mockResolvedValueOnce({
        id: 'conv-aberta-por-telefone', contatoId: 'contato-por-telefone', canalConfigId: 'cfg-vendedor',
        status: 'EM_ATENDIMENTO', filaId: null, agenteId: 'agente-1', ultimaMensagemEm: new Date(),
      });
    conversationUpdate.mockResolvedValue({ id: 'conv-aberta-por-telefone', filaId: null, agenteId: 'agente-1' });

    await registrarMensagemEntrante(mensagem({
      enderecoExterno: '79233992933473@lid',
      telefone: '5562999912345',
      identificadorDestino: 'vendedor-1',
      idExterno: 'false_79233992933473@lid_nova-msg',
    }));

    expect(contactFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ telefoneNormalizado: '5562999912345', excluidoEm: null }),
    }));
    expect(conversationFindFirst.mock.calls[1]?.[0].where).toMatchObject({
      contatoId: 'contato-por-telefone', canal: 'WHATSAPP', canalConfigId: 'cfg-vendedor',
    });
    expect(conversationCreate).not.toHaveBeenCalled();
    expect(conversationUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'conv-aberta-por-telefone' } }));
  });

  it('linha pessoal do vendedor B NAO reaproveita a conversa aberta na linha pessoal do vendedor A', async () => {
    // Mensagem chega com o identificadorDestino da sessao do vendedor B.
    configDoDestino.mockResolvedValue({ id: 'cfg-vendedor-b', donoId: 'vendedor-b', filaId: null });

    conversationFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    conversationCreate.mockResolvedValue({
      id: 'conv-vendedor-b',
      canalConfigId: 'cfg-vendedor-b',
      filaId: null,
      agenteId: 'vendedor-b',
    });

    await registrarMensagemEntrante(
      mensagem({ idExterno: 'wamid.vendedor-b', identificadorDestino: 'sessao-vendedor-b' }),
    );

    expect(configDoDestino).toHaveBeenCalledWith('WHATSAPP', 'sessao-vendedor-b');

    const chamadaEmAberto = conversationFindFirst.mock.calls[1]?.[0];
    expect(chamadaEmAberto?.where).toMatchObject({ canalConfigId: 'cfg-vendedor-b' });

    const dadosCriacao = conversationCreate.mock.calls[0]?.[0]?.data;
    expect(dadosCriacao.canalConfigId).toBe('cfg-vendedor-b');
    // Linha pessoal: nasce atribuida ao dono da linha, nao em espera de fila.
    expect(dadosCriacao.agenteId).toBe('vendedor-b');
    expect(dadosCriacao.status).toBe('ATRIBUIDO');
  });

  it('conversa aberta na MESMA linha continua sendo reaproveitada (sem regressao no caso comum)', async () => {
    configDoDestino.mockResolvedValue({ id: 'cfg-compartilhada', donoId: null, filaId: 'fila-1' });

    conversationFindFirst
      .mockResolvedValueOnce(null) // contato por endereco
      .mockResolvedValueOnce({
        id: 'conv-existente',
        contatoId: 'contato-1',
        canalConfigId: 'cfg-compartilhada',
        filaId: 'fila-1',
        arquivada: false,
      });

    await registrarMensagemEntrante(mensagem({ idExterno: 'wamid.mesma-linha' }));

    const chamadaEmAberto = conversationFindFirst.mock.calls[1]?.[0];
    expect(chamadaEmAberto?.where).toMatchObject({ canalConfigId: 'cfg-compartilhada' });

    expect(conversationCreate).not.toHaveBeenCalled();
    expect(conversationUpdate).toHaveBeenCalledTimes(1);
    expect(conversationUpdate.mock.calls[0]?.[0]?.where).toEqual({ id: 'conv-existente' });
    expect(notificarConversaAtualizada).toHaveBeenCalledTimes(1);
    expect(notificarConversaNova).not.toHaveBeenCalled();
  });

  it('cliente escrevendo numa conversa AGUARDANDO_CLIENTE devolve o status para EM_ATENDIMENTO', async () => {
    configDoDestino.mockResolvedValue({ id: 'cfg-compartilhada', donoId: null, filaId: 'fila-1' });

    conversationFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'conv-aguardando',
        contatoId: 'contato-1',
        canalConfigId: 'cfg-compartilhada',
        filaId: 'fila-1',
        status: 'AGUARDANDO_CLIENTE',
        arquivada: false,
      });

    await registrarMensagemEntrante(mensagem({ idExterno: 'wamid.aguardando-cliente' }));

    // Compare-and-set atomico: a troca so e tentada condicionada ao status
    // AINDA ser AGUARDANDO_CLIENTE no banco, nao no valor lido antes do
    // download do anexo -- mesma garantia de `assumirConversa`.
    expect(conversationUpdateMany).toHaveBeenCalledWith({
      where: { id: 'conv-aguardando', status: 'AGUARDANDO_CLIENTE' },
      data: { status: 'EM_ATENDIMENTO' },
    });
    expect(conversationUpdate.mock.calls[0]?.[0]?.data).not.toHaveProperty('status');
  });

  it('cliente escrevendo numa conversa EM_ESPERA ou ATRIBUIDO nao muda o status', async () => {
    configDoDestino.mockResolvedValue({ id: 'cfg-compartilhada', donoId: null, filaId: 'fila-1' });

    conversationFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'conv-atribuida',
        contatoId: 'contato-1',
        canalConfigId: 'cfg-compartilhada',
        filaId: 'fila-1',
        status: 'ATRIBUIDO',
        arquivada: false,
      });

    await registrarMensagemEntrante(mensagem({ idExterno: 'wamid.atribuida' }));

    // Sem AGUARDANDO_CLIENTE no banco, o compare-and-set nao casa -- so a
    // tentativa e incondicional, o efeito e que nunca existe.
    expect(conversationUpdateMany).toHaveBeenCalledWith({
      where: { id: 'conv-atribuida', status: 'AGUARDANDO_CLIENTE' },
      data: { status: 'EM_ATENDIMENTO' },
    });
    expect(conversationUpdate.mock.calls[0]?.[0]?.data).not.toHaveProperty('status');
  });

  it('corrida: conversa finalizada por outro agente durante o download do anexo nao e reaberta pela mensagem do cliente', async () => {
    // O status lido no inicio (AGUARDANDO_CLIENTE) fica desatualizado -- um
    // agente finalizou a conversa enquanto o anexo baixava. O compare-and-set
    // nao acha mais a linha (count: 0): simulado aqui explicitamente, para
    // nao depender do valor padrao do mock.
    configDoDestino.mockResolvedValue({ id: 'cfg-compartilhada', donoId: null, filaId: 'fila-1' });
    conversationFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'conv-finalizada-durante-anexo',
        contatoId: 'contato-1',
        canalConfigId: 'cfg-compartilhada',
        filaId: 'fila-1',
        status: 'AGUARDANDO_CLIENTE',
        arquivada: false,
      });
    conversationUpdateMany.mockResolvedValueOnce({ count: 0 });

    await registrarMensagemEntrante(mensagem({ idExterno: 'wamid.corrida-finalizada' }));

    expect(conversationUpdateMany).toHaveBeenCalledWith({
      where: { id: 'conv-finalizada-durante-anexo', status: 'AGUARDANDO_CLIENTE' },
      data: { status: 'EM_ATENDIMENTO' },
    });
    // A tentativa nao casou (ja estava FINALIZADO no banco), e o update
    // principal continua sem a chave status -- nao reabre a conversa.
    expect(conversationUpdate.mock.calls[0]?.[0]?.data).not.toHaveProperty('status');
  });

  it('sem nenhuma linha configurada (config nula dos dois lados), ainda agrupa mensagens do mesmo contato entre si', async () => {
    // Caso extremo: configDoDestino nao resolve config nenhuma (nenhum
    // ChannelConfig cadastrado para o canal). canalConfigId fica null dos
    // dois lados -- null casa com null, o agrupamento nao quebra.
    configDoDestino.mockResolvedValue(null);

    conversationFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'conv-sem-linha',
        contatoId: 'contato-1',
        canalConfigId: null,
        filaId: null,
        arquivada: false,
      });

    await registrarMensagemEntrante(mensagem({ idExterno: 'wamid.sem-linha' }));

    const chamadaEmAberto = conversationFindFirst.mock.calls[1]?.[0];
    expect(chamadaEmAberto?.where).toMatchObject({ canalConfigId: null });
    expect(conversationCreate).not.toHaveBeenCalled();
  });
});
