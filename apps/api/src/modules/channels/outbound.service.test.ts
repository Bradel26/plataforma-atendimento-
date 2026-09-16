import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../lib/errors';

/*
 * Confirma que o envio de WhatsApp nao oficial passa pelo `WhatsAppProvider`
 * (Fase 3), preservando o comportamento anterior de falar direto com
 * `whatsapp.ponte.ts`: mesmos argumentos, mesmo `idExterno` de volta, mesmo
 * erro propagado quando a ponte recusa.
 *
 * Mocka `whatsapp.ponte.ts` (o driver HTTP real) e `channels.service` (para
 * controlar qual config cada teste usa) — nao mocka o provider, para exercitar
 * a cadeia outbound -> WhatsAppProvider -> BaileysProvider -> whatsapp.ponte de
 * ponta a ponta.
 */

vi.mock('./channels.service', () => ({
  obterConfig: vi.fn(),
  obterConfigPorId: vi.fn(),
}));

vi.mock('./whatsapp.ponte', () => ({
  enviarTextoPelaPonte: vi.fn(),
  enviarArquivoPelaPonte: vi.fn(),
}));

import { obterConfig, obterConfigPorId } from './channels.service';
import { enviarArquivoPelaPonte, enviarTextoPelaPonte } from './whatsapp.ponte';

/** Mesma forma que `obterConfig`/`obterConfigPorId` devolvem de verdade (ChannelConfig aberto). */
type ConfigCanal = NonNullable<Awaited<ReturnType<typeof obterConfig>>>;

const CONFIG_PONTE_BASE = {
  id: 'canal-1',
  canal: 'WHATSAPP',
  ativo: true,
  modo: 'NAO_OFICIAL',
  accessToken: null,
  phoneNumberId: null,
  pageId: null,
  ponteUrl: 'http://ponte:3000/api',
  ponteToken: 'segredo-ponte',
  ponteSessao: null as string | null,
} as ConfigCanal;
import { enviarArquivoParaCanal, enviarParaCanal } from './outbound.service';

describe('enviarParaCanal — WhatsApp nao oficial via WhatsAppProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(obterConfig).mockResolvedValue(CONFIG_PONTE_BASE);
    vi.mocked(obterConfigPorId).mockResolvedValue(null);
  });

  it('chama enviarTextoPelaPonte (via provider) com os mesmos argumentos de antes', async () => {
    vi.mocked(enviarTextoPelaPonte).mockResolvedValue({ idExterno: 'wamid.123' });

    await enviarParaCanal('WHATSAPP', '5511999999999', 'oi, tudo bem?');

    expect(enviarTextoPelaPonte).toHaveBeenCalledTimes(1);
    expect(enviarTextoPelaPonte).toHaveBeenCalledWith(CONFIG_PONTE_BASE, '5511999999999', 'oi, tudo bem?');
  });

  it('devolve o idExterno da ponte exatamente como antes', async () => {
    vi.mocked(enviarTextoPelaPonte).mockResolvedValue({ idExterno: 'wamid.123' });

    const resultado = await enviarParaCanal('WHATSAPP', '5511999999999', 'oi');

    expect(resultado).toEqual({ idExterno: 'wamid.123' });
  });

  it('idExterno nulo (ponte nao devolveu id) continua sendo repassado como nulo', async () => {
    vi.mocked(enviarTextoPelaPonte).mockResolvedValue({ idExterno: null });

    const resultado = await enviarParaCanal('WHATSAPP', '5511999999999', 'oi');

    expect(resultado).toEqual({ idExterno: null });
  });

  it('usa a config resolvida por canalConfigId (linha pessoal), nao a compartilhada', async () => {
    const configPessoal = { ...CONFIG_PONTE_BASE, id: 'canal-pessoal', ponteSessao: 'vendedor-1' };
    vi.mocked(obterConfigPorId).mockResolvedValue(configPessoal);
    vi.mocked(enviarTextoPelaPonte).mockResolvedValue({ idExterno: 'x' });

    await enviarParaCanal('WHATSAPP', '5511999999999', 'oi', 'canal-pessoal');

    expect(obterConfigPorId).toHaveBeenCalledWith('canal-pessoal');
    expect(enviarTextoPelaPonte).toHaveBeenCalledWith(configPessoal, '5511999999999', 'oi');
  });

  it('propaga o erro lancado pela ponte (ex.: sessao caida) sem engolir nem traduzir', async () => {
    const erroDaPonte = new AppError(502, 'PONTE_INACESSIVEL', 'Nao foi possivel falar com a ponte do WhatsApp');
    vi.mocked(enviarTextoPelaPonte).mockRejectedValue(erroDaPonte);

    await expect(enviarParaCanal('WHATSAPP', '5511999999999', 'oi')).rejects.toBe(erroDaPonte);
  });

  it('canal indisponivel (sem credenciais) barra ANTES de chamar a ponte, como antes', async () => {
    vi.mocked(obterConfig).mockResolvedValue({ ...CONFIG_PONTE_BASE, ponteUrl: null, ponteToken: null });

    await expect(enviarParaCanal('WHATSAPP', '5511999999999', 'oi')).rejects.toMatchObject({
      status: 503,
      code: 'CANAL_INDISPONIVEL',
    });
    expect(enviarTextoPelaPonte).not.toHaveBeenCalled();
  });
});

describe('enviarArquivoParaCanal — WhatsApp nao oficial via WhatsAppProvider', () => {
  const arquivo = { buffer: Buffer.from('conteudo'), nome: 'foto.png', tipo: 'image/png', legenda: 'olha isso' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(obterConfig).mockResolvedValue(CONFIG_PONTE_BASE);
    vi.mocked(obterConfigPorId).mockResolvedValue(null);
  });

  it('chama enviarArquivoPelaPonte (via provider) com os mesmos argumentos de antes', async () => {
    vi.mocked(enviarArquivoPelaPonte).mockResolvedValue({ idExterno: 'wamid.456' });

    const resultado = await enviarArquivoParaCanal('WHATSAPP', '5511999999999', arquivo);

    expect(enviarArquivoPelaPonte).toHaveBeenCalledTimes(1);
    expect(enviarArquivoPelaPonte).toHaveBeenCalledWith(CONFIG_PONTE_BASE, '5511999999999', arquivo);
    expect(resultado).toEqual({ idExterno: 'wamid.456' });
  });

  it('propaga o erro lancado pela ponte no envio de arquivo', async () => {
    const erroDaPonte = new AppError(502, 'ENVIO_RECUSADO', 'A ponte recusou o envio');
    vi.mocked(enviarArquivoPelaPonte).mockRejectedValue(erroDaPonte);

    await expect(enviarArquivoParaCanal('WHATSAPP', '5511999999999', arquivo)).rejects.toBe(erroDaPonte);
  });
});
