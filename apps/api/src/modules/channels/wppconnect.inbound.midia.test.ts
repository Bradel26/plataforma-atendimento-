import { describe, expect, it } from 'vitest';
import { normalizarEventoWpp } from './wppconnect.inbound';

/*
 * Midia recebida pelo conector do WhatsApp Web (QR). Antes, toda mensagem sem
 * texto era descartada ("API ignorou evento recebido"), entao audio e foto nunca
 * chegavam. O conector agora manda o binario em `midia` (base64 + mimetype).
 */

const base = {
  event: 'onmessage',
  session: 'vendedor-x',
  id: 'false_79233992933473@lid_3EB0A',
  from: '79233992933473@lid',
  chatId: '79233992933473@lid',
  fromMe: false,
  isGroupMsg: false,
  body: '',
  notifyName: 'Cliente',
};

const midia = (mimetype: string, nome: string | null = null) => ({ mimetype, nome, base64: 'QUJD' });

describe('normalizarEventoWpp — midia', () => {
  it('audio (ptt): AUDIO, rotulo no lugar do texto, binario repassado', () => {
    const r = normalizarEventoWpp({ ...base, type: 'ptt', midia: midia('audio/ogg; codecs=opus') });
    expect(r).toMatchObject({
      tipoAnexo: 'AUDIO',
      conteudo: '[áudio recebido]',
      anexoUrl: null,
      anexoConteudo: { base64: 'QUJD', mimetype: 'audio/ogg; codecs=opus' },
    });
  });

  it('foto (image) sem legenda: IMAGEM', () => {
    const r = normalizarEventoWpp({ ...base, type: 'image', midia: midia('image/jpeg') });
    expect(r).toMatchObject({ tipoAnexo: 'IMAGEM', conteudo: '[imagem recebida]' });
  });

  it('foto com legenda: a legenda vira o conteudo', () => {
    const r = normalizarEventoWpp({ ...base, type: 'image', body: 'olha isso', midia: midia('image/png') });
    expect(r).toMatchObject({ tipoAnexo: 'IMAGEM', conteudo: 'olha isso' });
  });

  it('video, figurinha e documento mapeiam para VIDEO, IMAGEM e ARQUIVO; documento leva o nome', () => {
    expect(normalizarEventoWpp({ ...base, type: 'video', midia: midia('video/mp4') })?.tipoAnexo).toBe('VIDEO');
    expect(normalizarEventoWpp({ ...base, type: 'sticker', midia: midia('image/webp') })?.tipoAnexo).toBe('IMAGEM');
    const doc = normalizarEventoWpp({ ...base, type: 'document', midia: midia('application/pdf', 'proposta.pdf') });
    expect(doc).toMatchObject({ tipoAnexo: 'ARQUIVO', anexoNome: 'proposta.pdf', conteudo: '[arquivo recebido]' });
  });

  it('midia que o conector nao conseguiu baixar: a mensagem existe (rotulo), sem binario', () => {
    const r = normalizarEventoWpp({ ...base, type: 'ptt' });
    expect(r).toMatchObject({ tipoAnexo: 'AUDIO', conteudo: '[áudio recebido]', anexoConteudo: null });
  });

  it('midia malformada (sem base64 ou sem mimetype) vira anexoConteudo nulo, sem lancar', () => {
    expect(normalizarEventoWpp({ ...base, type: 'image', midia: { mimetype: 'image/png' } })?.anexoConteudo).toBeNull();
    expect(normalizarEventoWpp({ ...base, type: 'image', midia: { base64: 'QUJD' } })?.anexoConteudo).toBeNull();
    expect(normalizarEventoWpp({ ...base, type: 'image', midia: 'texto' })?.anexoConteudo).toBeNull();
  });

  it('nome longo e truncado em 200 caracteres', () => {
    const r = normalizarEventoWpp({ ...base, type: 'document', midia: midia('application/pdf', 'a'.repeat(300)) });
    expect(r?.anexoNome).toHaveLength(200);
  });

  it('tipos de sistema sem texto continuam ignorados (e2e_notification, protocol, call_log)', () => {
    for (const type of ['e2e_notification', 'protocol', 'call_log', 'notification_template', 'gp2']) {
      expect(normalizarEventoWpp({ ...base, type })).toBeNull();
    }
  });

  it('eco da propria conta e grupo continuam ignorados mesmo com midia', () => {
    expect(normalizarEventoWpp({ ...base, type: 'ptt', fromMe: true, midia: midia('audio/ogg') })).toBeNull();
    expect(normalizarEventoWpp({ ...base, type: 'image', isGroupMsg: true, midia: midia('image/jpeg') })).toBeNull();
  });

  it('texto comum segue como antes: TEXTO, sem anexo', () => {
    const r = normalizarEventoWpp({ ...base, type: 'chat', body: 'oi' });
    expect(r).toMatchObject({ tipoAnexo: 'TEXTO', conteudo: 'oi', anexoNome: null });
    expect(r).not.toHaveProperty('anexoConteudo');
  });
});
