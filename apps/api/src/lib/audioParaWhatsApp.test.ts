import { describe, expect, it, vi } from 'vitest';
import { ARGS_FFMPEG, TIPO_OGG_OPUS, converterAudioParaWhatsApp, ehAudio, jaEOggOpus, nomeOgg } from './audioParaWhatsApp';

const audio = (tipo: string, nome = 'audio-20261125-143005.webm') => ({ buffer: Buffer.from('entrada'), nome, tipo });

describe('converterAudioParaWhatsApp', () => {
  it('webm vira ogg/opus: nome .ogg, tipo do WhatsApp, binario do ffmpeg', async () => {
    const executar = vi.fn().mockResolvedValue(Buffer.from('OggS...'));
    const r = await converterAudioParaWhatsApp(audio('audio/webm'), executar);
    expect(r).toMatchObject({ nome: 'audio-20261125-143005.ogg', tipo: TIPO_OGG_OPUS });
    expect(r?.buffer.toString()).toBe('OggS...');
    expect(executar).toHaveBeenCalledOnce();
  });

  it('m4a e mp3 tambem sao convertidos', async () => {
    const executar = vi.fn().mockResolvedValue(Buffer.from('OggS'));
    expect(await converterAudioParaWhatsApp(audio('audio/mp4', 'a.m4a'), executar)).not.toBeNull();
    expect(await converterAudioParaWhatsApp(audio('audio/mpeg', 'a.mp3'), executar)).not.toBeNull();
  });

  it('ja em ogg: nao reconverte (nulo, manda o original)', async () => {
    const executar = vi.fn();
    expect(await converterAudioParaWhatsApp(audio('audio/ogg; codecs=opus', 'a.ogg'), executar)).toBeNull();
    expect(executar).not.toHaveBeenCalled();
  });

  it('nao e audio (foto, documento): nao toca', async () => {
    const executar = vi.fn();
    expect(await converterAudioParaWhatsApp(audio('image/jpeg', 'a.jpg'), executar)).toBeNull();
    expect(await converterAudioParaWhatsApp(audio('application/pdf', 'a.pdf'), executar)).toBeNull();
    expect(executar).not.toHaveBeenCalled();
  });

  it('sem ffmpeg ou conversao falhou: nulo, o envio segue com o original', async () => {
    expect(await converterAudioParaWhatsApp(audio('audio/webm'), vi.fn().mockResolvedValue(null))).toBeNull();
  });
});

describe('seguranca do ffmpeg', () => {
  it('so abre o protocolo pipe, antes da entrada (arquivo forjado nao le arquivos nem URLs)', () => {
    const i = ARGS_FFMPEG.indexOf('-protocol_whitelist');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(ARGS_FFMPEG[i + 1]).toBe('pipe');
    expect(i).toBeLessThan(ARGS_FFMPEG.indexOf('-i'));
  });
});

describe('auxiliares', () => {
  it('reconhece tipos', () => {
    expect(ehAudio('audio/webm')).toBe(true);
    expect(ehAudio('video/mp4')).toBe(false);
    expect(jaEOggOpus('audio/ogg;codecs=opus')).toBe(true);
    expect(jaEOggOpus('audio/webm')).toBe(false);
  });
  it('nomeOgg troca a extensao e tem nome padrao', () => {
    expect(nomeOgg('minha.voz.m4a')).toBe('minha.voz.ogg');
    expect(nomeOgg('.m4a')).toBe('audio.ogg');
  });
});
