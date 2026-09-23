import { describe, expect, it } from 'vitest';
import { normalizarEventoWpp } from './wppconnect.inbound';

/** Payload real capturado na ETAPA 4.1 (contrato confirmado, nao inferido). */
const PAYLOAD_REAL_ONMESSAGE = {
  event: 'onmessage',
  session: 'wpp-poc',
  id: 'false_79233992933473@lid_3EB0A238AC2DE5AE1C5D04',
  body: 'teste inbound 456',
  type: 'chat',
  t: 1790101408,
  timestamp: 1790101408,
  notifyName: 'Kauã',
  from: '79233992933473@lid',
  to: '556299671844@c.us',
  chatId: '79233992933473@lid',
  fromMe: false,
  content: 'teste inbound 456',
  isGroupMsg: false,
  sender: {
    id: '79233992933473@lid',
    pushname: 'Kauã',
    formattedName: '+55 62 9288-5001',
    isMe: false,
    isMyContact: false,
    isWAContact: true,
  },
  ack: 1,
  mediaData: {},
};

describe('normalizarEventoWpp', () => {
  it('A) normaliza o payload real de texto inbound (@lid preservado, id string, nome, sessao)', () => {
    const resultado = normalizarEventoWpp(PAYLOAD_REAL_ONMESSAGE);

    expect(resultado).toEqual({
      canal: 'WHATSAPP',
      enderecoExterno: '79233992933473@lid',
      nomeExibicao: 'Kauã',
      telefone: '556292885001',
      idExterno: 'false_79233992933473@lid_3EB0A238AC2DE5AE1C5D04',
      conteudo: 'teste inbound 456',
      tipoAnexo: 'TEXTO',
      anexoUrl: null,
      anexoIdExterno: null,
      anexoNome: null,
      identificadorDestino: 'wpp-poc',
    });
  });

  it('B) ignora eco da propria conta (fromMe: true)', () => {
    expect(normalizarEventoWpp({ ...PAYLOAD_REAL_ONMESSAGE, fromMe: true })).toBeNull();
  });

  it('C) ignora mensagem de grupo (isGroupMsg: true)', () => {
    expect(normalizarEventoWpp({ ...PAYLOAD_REAL_ONMESSAGE, isGroupMsg: true })).toBeNull();
  });

  it('D) ignora eventos diferentes de onmessage (ex.: onack, onpresencechanged)', () => {
    expect(normalizarEventoWpp({ ...PAYLOAD_REAL_ONMESSAGE, event: 'onack' })).toBeNull();
    expect(normalizarEventoWpp({ ...PAYLOAD_REAL_ONMESSAGE, event: 'onpresencechanged' })).toBeNull();
    expect(normalizarEventoWpp({ ...PAYLOAD_REAL_ONMESSAGE, event: undefined })).toBeNull();
  });

  it('E) descarta quando id esta ausente ou nao e string', () => {
    const { id: _id, ...semId } = PAYLOAD_REAL_ONMESSAGE;
    expect(normalizarEventoWpp(semId)).toBeNull();
    expect(normalizarEventoWpp({ ...PAYLOAD_REAL_ONMESSAGE, id: 12345 })).toBeNull();
    expect(normalizarEventoWpp({ ...PAYLOAD_REAL_ONMESSAGE, id: '   ' })).toBeNull();
    expect(normalizarEventoWpp({ ...PAYLOAD_REAL_ONMESSAGE, id: { fromMe: true, _serialized: 'x' } })).toBeNull();
  });

  it('F) usa from como fallback quando chatId esta ausente', () => {
    const { chatId: _chatId, ...semChatId } = PAYLOAD_REAL_ONMESSAGE;
    const resultado = normalizarEventoWpp(semChatId);
    expect(resultado?.enderecoExterno).toBe('79233992933473@lid');
  });

  it('G) nao quebra quando sender esta ausente (usa notifyName, sem telefone auxiliar)', () => {
    const { sender: _sender, ...semSender } = PAYLOAD_REAL_ONMESSAGE;
    const resultado = normalizarEventoWpp(semSender);

    expect(resultado).not.toBeNull();
    expect(resultado?.nomeExibicao).toBe('Kauã'); // caiu para notifyName
    expect(resultado?.telefone).toBeNull();
  });

  it('H) formattedName nao vira o identificador principal (enderecoExterno continua o @lid)', () => {
    const resultado = normalizarEventoWpp(PAYLOAD_REAL_ONMESSAGE);
    expect(resultado?.enderecoExterno).toBe('79233992933473@lid');
    expect(resultado?.enderecoExterno).not.toContain('9288');
    // so vira `telefone`, auxiliar e nullable:
    expect(resultado?.telefone).toBe('556292885001');
  });

  it('sem enderecoExterno (chatId e from ausentes) descarta em vez de inventar', () => {
    const { chatId: _c, from: _f, ...semEndereco } = PAYLOAD_REAL_ONMESSAGE;
    expect(normalizarEventoWpp(semEndereco)).toBeNull();
  });

  it('sem conteudo (body e content ausentes/vazios) descarta', () => {
    expect(normalizarEventoWpp({ ...PAYLOAD_REAL_ONMESSAGE, body: '', content: '' })).toBeNull();
  });

  it('usa content como fallback quando body esta ausente', () => {
    const { body: _body, ...semBody } = PAYLOAD_REAL_ONMESSAGE;
    const resultado = normalizarEventoWpp(semBody);
    expect(resultado?.conteudo).toBe('teste inbound 456');
  });

  it('formattedName que nao valida como telefone vira telefone null (nao inventa numero)', () => {
    const resultado = normalizarEventoWpp({
      ...PAYLOAD_REAL_ONMESSAGE,
      sender: { ...PAYLOAD_REAL_ONMESSAGE.sender, formattedName: 'nao e um telefone' },
    });
    expect(resultado?.telefone).toBeNull();
    expect(resultado?.enderecoExterno).toBe('79233992933473@lid');
  });

  it('I) campos de timestamp (t/timestamp) nao fazem parte do contrato e nao quebram a normalizacao', () => {
    // MensagemNormalizada nao tem campo de data (Message.criadoEm vem do banco,
    // @default(now())) — mesmo comportamento da Ponte/Meta hoje. So confirmamos
    // que a presenca/ausencia desses campos e inofensiva.
    const { t: _t, timestamp: _timestamp, ...semTimestamp } = PAYLOAD_REAL_ONMESSAGE;
    expect(normalizarEventoWpp(semTimestamp)).not.toBeNull();
    expect(normalizarEventoWpp({ ...PAYLOAD_REAL_ONMESSAGE, t: 'nao-numero', timestamp: null })).not.toBeNull();
  });

  it('entrada nao-objeto (null, string, numero) descarta sem lancar', () => {
    expect(normalizarEventoWpp(null)).toBeNull();
    expect(normalizarEventoWpp(undefined)).toBeNull();
    expect(normalizarEventoWpp('string qualquer')).toBeNull();
    expect(normalizarEventoWpp(42)).toBeNull();
  });

  it('sessao ausente devolve identificadorDestino null (a rota decide o que fazer)', () => {
    const { session: _session, ...semSessao } = PAYLOAD_REAL_ONMESSAGE;
    const resultado = normalizarEventoWpp(semSessao);
    expect(resultado?.identificadorDestino).toBeNull();
  });
});

describe('normalizarEventoWpp — telefone a partir do jid @c.us', () => {
  const PAYLOAD_CUS_CONTATO_SALVO = {
    ...PAYLOAD_REAL_ONMESSAGE,
    id: 'false_5562992885001@c.us_3EB0A238AC2DE5AE1C5D05',
    from: '5562992885001@c.us',
    chatId: '5562992885001@c.us',
    sender: {
      id: '5562992885001@c.us',
      pushname: 'Kauã',
      // Contato salvo na agenda do vendedor: o WhatsApp devolve o nome salvo.
      formattedName: 'Cliente João (obra centro)',
      isMyContact: true,
    },
  };

  it('extrai o telefone do chatId @c.us mesmo quando formattedName e o nome salvo', () => {
    const resultado = normalizarEventoWpp(PAYLOAD_CUS_CONTATO_SALVO);
    expect(resultado?.enderecoExterno).toBe('5562992885001@c.us');
    expect(resultado?.telefone).toBe('5562992885001');
  });

  it('o jid @c.us tem precedencia sobre um formattedName que tambem parece telefone', () => {
    const resultado = normalizarEventoWpp({
      ...PAYLOAD_CUS_CONTATO_SALVO,
      sender: { ...PAYLOAD_CUS_CONTATO_SALVO.sender, formattedName: '+55 11 3333-4444' },
    });
    expect(resultado?.telefone).toBe('5562992885001');
  });

  it('@lid continua dependendo do formattedName (nao ha numero no jid)', () => {
    expect(normalizarEventoWpp(PAYLOAD_REAL_ONMESSAGE)?.telefone).toBe('556292885001');
  });

  it('@lid com contato salvo segue sem telefone (limitacao conhecida, nao inventa numero)', () => {
    const resultado = normalizarEventoWpp({
      ...PAYLOAD_REAL_ONMESSAGE,
      sender: { ...PAYLOAD_REAL_ONMESSAGE.sender, formattedName: 'Cliente João', isMyContact: true },
    });
    expect(resultado?.telefone).toBeNull();
  });
});
