import { describe, expect, it } from 'vitest';
import { textoDaPrevia } from './previaTexto';

const m = (
  autor: 'CLIENTE' | 'AGENTE' | 'SISTEMA' | 'BOT',
  conteudo: string,
  tipoAnexo: 'TEXTO' | 'IMAGEM' | 'AUDIO' | 'VIDEO' | 'ARQUIVO' = 'TEXTO',
  interno = false,
) => ({ autor, conteudo, tipoAnexo, interno });

describe('textoDaPrevia', () => {
  it('sem mensagem', () => expect(textoDaPrevia(null)).toBe('Sem mensagens'));
  it('cliente', () => expect(textoDaPrevia(m('CLIENTE', 'Oi'))).toBe('cliente: Oi'));
  it('agente e bot contam como enviada', () => {
    expect(textoDaPrevia(m('AGENTE', 'boa tarde'))).toBe('enviada: boa tarde');
    expect(textoDaPrevia(m('BOT', 'Menu'))).toBe('enviada: Menu');
  });
  it('imagem sem legenda vira foto', () => expect(textoDaPrevia(m('CLIENTE', '[imagem recebida]', 'IMAGEM'))).toBe('cliente: 📷 Foto'));
  it('imagem com legenda mostra a legenda', () => expect(textoDaPrevia(m('CLIENTE', 'olha isso', 'IMAGEM'))).toBe('cliente: 📷 olha isso'));
  it('audio, video e arquivo', () => {
    expect(textoDaPrevia(m('CLIENTE', '[audio recebido]', 'AUDIO'))).toBe('cliente: 🎤 Áudio');
    expect(textoDaPrevia(m('AGENTE', '[video recebido]', 'VIDEO'))).toBe('enviada: 🎥 Vídeo');
    expect(textoDaPrevia(m('AGENTE', 'proposta.pdf', 'ARQUIVO'))).toBe('enviada: 📄 proposta.pdf');
  });
  it('evento do sistema sem prefixo', () => expect(textoDaPrevia(m('SISTEMA', 'Aceito por: Ana'))).toBe('Aceito por: Ana'));
  it('nota interna marcada', () => expect(textoDaPrevia(m('AGENTE', 'ligar amanha', 'TEXTO', true))).toBe('nota: ligar amanha'));
});
