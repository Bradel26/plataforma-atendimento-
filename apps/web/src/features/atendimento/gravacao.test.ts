import { describe, expect, it } from 'vitest';
import { escolherMimeDeAudio, extensaoDoMime, formatarTempo, nomeDeArquivoCapturado } from './gravacao';

describe('formatarTempo', () => {
  it('formata minutos e segundos', () => {
    expect(formatarTempo(0)).toBe('0:00');
    expect(formatarTempo(7)).toBe('0:07');
    expect(formatarTempo(75)).toBe('1:15');
    expect(formatarTempo(754)).toBe('12:34');
  });
  it('nunca fica negativo nem mostra decimais', () => {
    expect(formatarTempo(-3)).toBe('0:00');
    expect(formatarTempo(7.9)).toBe('0:07');
  });
});

describe('escolherMimeDeAudio', () => {
  it('prefere ogg/opus quando o navegador grava (como as mensagens de voz do WhatsApp)', () => {
    expect(escolherMimeDeAudio(() => true)).toBe('audio/ogg;codecs=opus');
  });
  it('cai para webm/opus (Chrome) e depois mp4', () => {
    expect(escolherMimeDeAudio((m) => m.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus');
    expect(escolherMimeDeAudio((m) => m === 'audio/mp4')).toBe('audio/mp4');
  });
  it('sem suporte algum devolve nulo (a tela esconde o microfone)', () => {
    expect(escolherMimeDeAudio(() => false)).toBeNull();
  });
});

describe('extensaoDoMime / nomeDeArquivoCapturado', () => {
  it('ignora o codec e mapeia a extensao', () => {
    expect(extensaoDoMime('audio/ogg;codecs=opus')).toBe('ogg');
    expect(extensaoDoMime('audio/webm;codecs=opus')).toBe('webm');
    expect(extensaoDoMime('audio/mp4')).toBe('m4a');
    expect(extensaoDoMime('image/jpeg')).toBe('jpg');
  });
  it('monta o nome com data e hora locais', () => {
    expect(nomeDeArquivoCapturado('audio', 'audio/ogg;codecs=opus', new Date(2026, 10, 25, 14, 30, 5))).toBe('audio-20261125-143005.ogg');
    expect(nomeDeArquivoCapturado('foto', 'image/jpeg', new Date(2026, 0, 2, 3, 4, 5))).toBe('foto-20260102-030405.jpg');
  });
});
