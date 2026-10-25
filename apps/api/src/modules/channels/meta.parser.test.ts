import { describe, expect, it } from 'vitest';
import { normalizarEcosMeta, normalizarStatusMeta, normalizarWebhook } from './meta.parser';

const whatsapp = (mensagem: Record<string, unknown>) => ({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'WABA-1',
      changes: [
        {
          field: 'messages',
          value: {
            metadata: { phone_number_id: '111', display_phone_number: '+5511999998888' },
            contacts: [{ wa_id: '5511977776666', profile: { name: 'Carlos' } }],
            messages: [mensagem],
          },
        },
      ],
    },
  ],
});

describe('webhook do WhatsApp', () => {
  it('normaliza mensagem de texto', () => {
    const [msg] = normalizarWebhook(
      whatsapp({ id: 'wamid.1', from: '5511977776666', timestamp: '1', type: 'text', text: { body: 'Bom dia' } }) as never,
    );
    expect(msg).toMatchObject({
      canal: 'WHATSAPP',
      enderecoExterno: '5511977776666',
      nomeExibicao: 'Carlos',
      telefone: '5511977776666',
      idExterno: 'wamid.1',
      conteudo: 'Bom dia',
      tipoAnexo: 'TEXTO',
      anexoIdExterno: null,
    });
  });

  /** A Cloud API manda so o media id; quem troca pelo binario e o inbound. */
  it('leva o média id e a legenda da imagem', () => {
    const [msg] = normalizarWebhook(
      whatsapp({
        id: 'wamid.2',
        from: '5511977776666',
        timestamp: '1',
        type: 'image',
        image: { id: 'media-99', mime_type: 'image/jpeg', caption: 'Olha o erro' },
      }) as never,
    );
    expect(msg).toMatchObject({ tipoAnexo: 'IMAGEM', conteudo: 'Olha o erro', anexoIdExterno: 'media-99' });
  });

  it('usa marcador quando o anexo não tem legenda', () => {
    const [msg] = normalizarWebhook(
      whatsapp({ id: 'wamid.3', from: '5511977776666', timestamp: '1', type: 'audio', audio: { id: 'a-1' } }) as never,
    );
    expect(msg).toMatchObject({ tipoAnexo: 'AUDIO', conteudo: '[áudio recebido]', anexoIdExterno: 'a-1' });
  });

  it('guarda o nome original do documento', () => {
    const [msg] = normalizarWebhook(
      whatsapp({
        id: 'wamid.4',
        from: '5511977776666',
        timestamp: '1',
        type: 'document',
        document: { id: 'd-1', filename: 'nota-fiscal.pdf' },
      }) as never,
    );
    expect(msg).toMatchObject({ tipoAnexo: 'ARQUIVO', anexoNome: 'nota-fiscal.pdf' });
  });
});

describe('webhook do Messenger e Instagram', () => {
  const messaging = (objeto: string) => ({
    object: objeto,
    entry: [
      {
        id: 'PAGE-1',
        messaging: [
          {
            sender: { id: 'PSID-1' },
            recipient: { id: 'PAGE-1' },
            timestamp: 1,
            message: { mid: 'mid.1', attachments: [{ type: 'image', payload: { url: 'https://cdn.meta/x.jpg' } }] },
          },
        ],
      },
    ],
  });

  it('separa Instagram de Facebook pelo campo object', () => {
    expect(normalizarWebhook(messaging('instagram') as never)[0]?.canal).toBe('INSTAGRAM');
    expect(normalizarWebhook(messaging('page') as never)[0]?.canal).toBe('FACEBOOK');
  });

  it('leva a URL temporária do anexo para o inbound baixar', () => {
    const [msg] = normalizarWebhook(messaging('page') as never);
    expect(msg).toMatchObject({ tipoAnexo: 'IMAGEM', anexoUrl: 'https://cdn.meta/x.jpg', anexoIdExterno: null });
  });
});

/**
 * A Meta reentrega webhook que nao responde 200. Recusar payload desconhecido
 * com erro causaria loop de reentrega; o parser devolve lista vazia.
 */
describe('payload inesperado', () => {
  it('nunca lanca, apenas devolve lista vazia', () => {
    expect(normalizarWebhook({} as never)).toEqual([]);
    expect(normalizarWebhook({ object: 'page', entry: [] } as never)).toEqual([]);
    expect(normalizarWebhook({ object: 'page', entry: [{ id: '1', messaging: [{ sender: { id: 'x' }, recipient: { id: 'y' }, timestamp: 1 }] }] } as never)).toEqual([]);
  });
});

describe('status e ecos do WhatsApp Cloud', () => {
  const envelope = (field: string, value: Record<string, unknown>) => ({
    object: 'whatsapp_business_account',
    entry: [{ id: 'WABA-1', changes: [{ field, value: { metadata: { phone_number_id: '111' }, ...value } }] }],
  });

  it('traduz os status da Meta para o vocabulário da plataforma', () => {
    const status = normalizarStatusMeta(envelope('messages', {
      statuses: [
        { id: 'wamid.a', status: 'sent' },
        { id: 'wamid.b', status: 'delivered' },
        { id: 'wamid.c', status: 'read' },
        { id: 'wamid.d', status: 'failed' },
        { id: 'wamid.e', status: 'deleted' },
      ],
    }) as never);
    expect(status).toEqual([
      { idExterno: 'wamid.a', status: 'ENVIADA' },
      { idExterno: 'wamid.b', status: 'ENTREGUE' },
      { idExterno: 'wamid.c', status: 'LIDA' },
      { idExterno: 'wamid.d', status: 'FALHOU' },
    ]);
  });

  it('normaliza eco de mensagem enviada pelo app do celular (coexistência)', () => {
    const [eco] = normalizarEcosMeta(envelope('smb_message_echoes', {
      message_echoes: [{ id: 'wamid.echo', from: '5511900000000', to: '5511977776666', timestamp: '1', type: 'text', text: { body: 'Oi' } }],
    }) as never);
    expect(eco).toMatchObject({
      canal: 'WHATSAPP', idExterno: 'wamid.echo', enderecoExterno: '5511977776666',
      conteudo: 'Oi', identificadorDestino: '111',
    });
  });

  it('ignora payload sem status nem eco', () => {
    expect(normalizarStatusMeta({ object: 'x' } as never)).toEqual([]);
    expect(normalizarEcosMeta({ object: 'x' } as never)).toEqual([]);
  });
});
