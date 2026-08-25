import { describe, expect, it } from 'vitest';
import { normalizarWebhook } from './meta.parser';

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
  it('leva o media id e a legenda da imagem', () => {
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

  it('usa marcador quando o anexo nao tem legenda', () => {
    const [msg] = normalizarWebhook(
      whatsapp({ id: 'wamid.3', from: '5511977776666', timestamp: '1', type: 'audio', audio: { id: 'a-1' } }) as never,
    );
    expect(msg).toMatchObject({ tipoAnexo: 'AUDIO', conteudo: '[audio recebido]', anexoIdExterno: 'a-1' });
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

  it('leva a URL temporaria do anexo para o inbound baixar', () => {
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
