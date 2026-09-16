import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigDaPonte } from '../whatsapp.ponte';

vi.mock('../whatsapp.ponte', () => ({
  enviarTextoPelaPonte: vi.fn(),
  enviarArquivoPelaPonte: vi.fn(),
  qrDaPonte: vi.fn(),
  estadoDaPonte: vi.fn(),
  desconectarPonte: vi.fn(),
}));

import {
  desconectarPonte,
  enviarArquivoPelaPonte,
  enviarTextoPelaPonte,
  estadoDaPonte,
  qrDaPonte,
} from '../whatsapp.ponte';
import { BaileysProvider } from './baileys.provider';

const CONFIG: ConfigDaPonte = {
  ponteUrl: 'http://ponte:3000/api',
  ponteToken: 'segredo',
  ponteSessao: 'padrao',
};

describe('BaileysProvider', () => {
  let provider: BaileysProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new BaileysProvider();
  });

  it('sendText delega para enviarTextoPelaPonte com os mesmos argumentos', async () => {
    vi.mocked(enviarTextoPelaPonte).mockResolvedValue({ idExterno: 'abc' });

    const resultado = await provider.sendText(CONFIG, '11999999999', 'oi');

    expect(enviarTextoPelaPonte).toHaveBeenCalledWith(CONFIG, '11999999999', 'oi');
    expect(enviarTextoPelaPonte).toHaveBeenCalledTimes(1);
    expect(resultado).toEqual({ idExterno: 'abc' });
  });

  it('sendMedia delega para enviarArquivoPelaPonte com os mesmos argumentos', async () => {
    const arquivo = { buffer: Buffer.from('x'), nome: 'foto.png', tipo: 'image/png' };
    vi.mocked(enviarArquivoPelaPonte).mockResolvedValue({ idExterno: 'def' });

    const resultado = await provider.sendMedia(CONFIG, '11999999999', arquivo);

    expect(enviarArquivoPelaPonte).toHaveBeenCalledWith(CONFIG, '11999999999', arquivo);
    expect(enviarArquivoPelaPonte).toHaveBeenCalledTimes(1);
    expect(resultado).toEqual({ idExterno: 'def' });
  });

  it('getQRCode delega para qrDaPonte com a mesma config', async () => {
    const qr = { qr: 'data:image/png;base64,abc', conectado: false, motivo: null };
    vi.mocked(qrDaPonte).mockResolvedValue(qr);

    const resultado = await provider.getQRCode(CONFIG);

    expect(qrDaPonte).toHaveBeenCalledWith(CONFIG);
    expect(resultado).toBe(qr);
  });

  it('getStatus delega para estadoDaPonte com a mesma config', async () => {
    const estado = { situacao: 'CONECTADO' as const, detalhe: null };
    vi.mocked(estadoDaPonte).mockResolvedValue(estado);

    const resultado = await provider.getStatus(CONFIG);

    expect(estadoDaPonte).toHaveBeenCalledWith(CONFIG);
    expect(resultado).toBe(estado);
  });

  it('disconnect delega para desconectarPonte com a mesma config', async () => {
    vi.mocked(desconectarPonte).mockResolvedValue(undefined);

    await provider.disconnect(CONFIG);

    expect(desconectarPonte).toHaveBeenCalledWith(CONFIG);
  });

  it('propaga erro lancado por desconectarPonte em vez de engolir', async () => {
    const erro = new Error('falhou');
    vi.mocked(desconectarPonte).mockRejectedValue(erro);

    await expect(provider.disconnect(CONFIG)).rejects.toThrow('falhou');
  });
});
