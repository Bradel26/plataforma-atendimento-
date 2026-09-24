import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL = process.env.WHATSAPP_PROVIDER;

function limpar() {
  delete process.env.WHATSAPP_PROVIDER;
}

describe('getWhatsAppProvider', () => {
  beforeEach(() => {
    vi.resetModules();
    limpar();
  });

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.WHATSAPP_PROVIDER;
    else process.env.WHATSAPP_PROVIDER = ORIGINAL;
  });

  it('WHATSAPP_PROVIDER=baileys devolve uma instancia de BaileysProvider', async () => {
    process.env.WHATSAPP_PROVIDER = 'baileys';
    const { getWhatsAppProvider } = await import('./whatsapp-provider.factory');
    const { BaileysProvider } = await import('./providers/baileys.provider');

    expect(getWhatsAppProvider()).toBeInstanceOf(BaileysProvider);
  });

  it('WHATSAPP_PROVIDER=wppconnect devolve uma instancia de WPPConnectProvider', async () => {
    process.env.WHATSAPP_PROVIDER = 'wppconnect';
    const { getWhatsAppProvider } = await import('./whatsapp-provider.factory');
    const { WPPConnectProvider } = await import('./providers/wppconnect.provider');

    expect(getWhatsAppProvider()).toBeInstanceOf(WPPConnectProvider);
  });

  it('WHATSAPP_PROVIDER=waha serve o WahaProvider pelo contrato legado, sem credencial por linha', async () => {
    process.env.WHATSAPP_PROVIDER = 'waha';
    const { getWhatsAppProvider } = await import('./whatsapp-provider.factory');
    const { WhatsAppProviderLegado } = await import('./providers/legado');

    const provider = getWhatsAppProvider();
    expect(provider).toBeInstanceOf(WhatsAppProviderLegado);
    // Linha no WAHA so precisa da sessao: `impedimentoDeEnvio` nao pode cobrar ponteUrl/ponteToken.
    expect(provider.credenciaisPorLinha).toBe(false);
  });

  it('aceita o valor com espacos e caixa alta (ex.: " WPPCONNECT ")', async () => {
    process.env.WHATSAPP_PROVIDER = ' WPPCONNECT ';
    const { getWhatsAppProvider } = await import('./whatsapp-provider.factory');
    const { WPPConnectProvider } = await import('./providers/wppconnect.provider');

    expect(getWhatsAppProvider()).toBeInstanceOf(WPPConnectProvider);
  });

  it('variavel ausente mantem o comportamento atual (Baileys)', async () => {
    const { getWhatsAppProvider } = await import('./whatsapp-provider.factory');
    const { BaileysProvider } = await import('./providers/baileys.provider');

    expect(getWhatsAppProvider()).toBeInstanceOf(BaileysProvider);
  });

  it('valor invalido falha com erro de configuracao claro, sem escolher um padrao silencioso', async () => {
    process.env.WHATSAPP_PROVIDER = 'evolution-api';
    const { getWhatsAppProvider } = await import('./whatsapp-provider.factory');

    expect(() => getWhatsAppProvider()).toThrow(/WHATSAPP_PROVIDER invalido.*evolution-api/s);
  });

  it('nunca hardcoda sessao: a fabrica nao recebe (nem precisa de) nome de sessao', async () => {
    process.env.WHATSAPP_PROVIDER = 'wppconnect';
    const { getWhatsAppProvider } = await import('./whatsapp-provider.factory');

    // A escolha e global (WHATSAPP_PROVIDER); a sessao so existe na config
    // passada em cada chamada do provider (`ChannelConfig.ponteSessao`), nunca
    // aqui — por isso a fabrica nao tem parametros.
    expect(getWhatsAppProvider.length).toBe(0);

    const provider = getWhatsAppProvider();
    await expect(
      provider.sendText({ ponteUrl: null, ponteToken: null, ponteSessao: null }, '11999999999', 'oi'),
    ).rejects.toMatchObject({ code: 'CANAL_INDISPONIVEL' });
  });
});
