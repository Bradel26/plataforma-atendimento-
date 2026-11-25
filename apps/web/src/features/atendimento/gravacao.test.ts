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
  it('sem ogg, prefere mp4/aac (aceito pelo WhatsApp) a webm', () => {
    expect(escolherMimeDeAudio((m) => m !== 'audio/ogg;codecs=opus')).toBe('audio/mp4');
    expect(escolherMimeDeAudio((m) => m === 'audio/mp4')).toBe('audio/mp4');
  });
  it('so com webm (Chrome antigo) cai para webm/opus', () => {
    expect(escolherMimeDeAudio((m) => m.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus');
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

import { CHAVE_MICROFONE, microfoneLiberado } from './gravacao';

function armazem(inicial: Record<string, string> = {}) {
  const dados = { ...inicial };
  return {
    dados,
    getItem: (k: string) => dados[k] ?? null,
    setItem: (k: string, v: string) => { dados[k] = v; },
    removeItem: (k: string) => { delete dados[k]; },
  };
}

describe('microfoneLiberado', () => {
  it('por padrao fica escondido', () => {
    expect(microfoneLiberado('', armazem())).toBe(false);
  });
  it('?microfone=1 liga e lembra no navegador', () => {
    const s = armazem();
    expect(microfoneLiberado('?microfone=1', s)).toBe(true);
    expect(s.dados[CHAVE_MICROFONE]).toBe('1');
    expect(microfoneLiberado('', s)).toBe(true);
  });
  it('?microfone=0 desliga e esquece', () => {
    const s = armazem({ [CHAVE_MICROFONE]: '1' });
    expect(microfoneLiberado('?microfone=0', s)).toBe(false);
    expect(microfoneLiberado('', s)).toBe(false);
  });
  it('sem armazenamento (navegador bloqueou) o padrao continua escondido', () => {
    expect(microfoneLiberado('', null)).toBe(false);
  });
});
