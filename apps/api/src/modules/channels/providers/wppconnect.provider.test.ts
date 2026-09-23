import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigDaPonte } from '../whatsapp.ponte';

vi.mock('../wppconnect.client', () => ({
  enviarTextoWpp: vi.fn(),
  enviarArquivoWpp: vi.fn(),
  qrWpp: vi.fn(),
  estadoWpp: vi.fn(),
  desconectarWpp: vi.fn(),
}));

import {
  desconectarWpp,
  enviarArquivoWpp,
  enviarTextoWpp,
  estadoWpp,
  qrWpp,
} from '../wppconnect.client';
import { WPPConnectProvider } from './wppconnect.provider';

const CONFIG: ConfigDaPonte = {
  ponteUrl: null,
  ponteToken: null,
  ponteSessao: 'linha-principal',
};

describe('WPPConnectProvider', () => {
  let provider: WPPConnectProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new WPPConnectProvider();
  });

  it('sendText delega para enviarTextoWpp com os mesmos argumentos', async () => {
    vi.mocked(enviarTextoWpp).mockResolvedValue({ idExterno: 'abc' });

    const resultado = await provider.sendText(CONFIG, '11999999999', 'oi');

    expect(enviarTextoWpp).toHaveBeenCalledWith(CONFIG, '11999999999', 'oi');
    expect(enviarTextoWpp).toHaveBeenCalledTimes(1);
    expect(resultado).toEqual({ idExterno: 'abc' });
  });

  it('sendMedia delega para enviarArquivoWpp com os mesmos argumentos', async () => {
    const arquivo = { buffer: Buffer.from('x'), nome: 'foto.png', tipo: 'image/png' };
    vi.mocked(enviarArquivoWpp).mockResolvedValue({ idExterno: 'def' });

    const resultado = await provider.sendMedia(CONFIG, '11999999999', arquivo);

    expect(enviarArquivoWpp).toHaveBeenCalledWith(CONFIG, '11999999999', arquivo);
    expect(enviarArquivoWpp).toHaveBeenCalledTimes(1);
    expect(resultado).toEqual({ idExterno: 'def' });
  });

  it('getQRCode delega para qrWpp com a mesma config', async () => {
    const qr = { qr: 'data:image/png;base64,abc', conectado: false, motivo: null };
    vi.mocked(qrWpp).mockResolvedValue(qr);

    const resultado = await provider.getQRCode(CONFIG);

    expect(qrWpp).toHaveBeenCalledWith(CONFIG);
    expect(resultado).toBe(qr);
  });

  it('getStatus delega para estadoWpp com a mesma config', async () => {
    const estado = { situacao: 'CONECTADO' as const, detalhe: null };
    vi.mocked(estadoWpp).mockResolvedValue(estado);

    const resultado = await provider.getStatus(CONFIG);

    expect(estadoWpp).toHaveBeenCalledWith(CONFIG);
    expect(resultado).toBe(estado);
  });

  it('disconnect delega para desconectarWpp com a mesma config', async () => {
    vi.mocked(desconectarWpp).mockResolvedValue(undefined);

    await provider.disconnect(CONFIG);

    expect(desconectarWpp).toHaveBeenCalledWith(CONFIG);
  });

  it('propaga erro lancado por desconectarWpp em vez de engolir', async () => {
    const erro = new Error('falhou');
    vi.mocked(desconectarWpp).mockRejectedValue(erro);

    await expect(provider.disconnect(CONFIG)).rejects.toThrow('falhou');
  });
});
