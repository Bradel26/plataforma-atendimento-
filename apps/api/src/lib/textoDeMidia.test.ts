import { describe, expect, it } from 'vitest';
import { enderecoNaoEPessoa, pareceBase64DeMidia } from './textoDeMidia';

describe('pareceBase64DeMidia', () => {
  it('reconhece a miniatura JPEG em base64 que o WhatsApp Web manda no body', () => {
    expect(pareceBase64DeMidia('/9j/4AAQSkZJRgABAgAAAQABAAD/4gKASUNDX1BST0ZJTEUAAQEAAAJwQURCRQQgAABtbnRyUkdCIFhZWiAH4QADAAQAFwAqAC9hY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tY=')).toBe(true);
  });
  it('texto humano nunca e confundido, mesmo longo (tem espaco)', () => {
    expect(pareceBase64DeMidia('Olá, tudo bem? Segue o documento que combinamos ontem, qualquer dúvida me chame.'.repeat(5))).toBe(false);
    expect(pareceBase64DeMidia('Bem')).toBe(false);
  });
  it('palavra comprida sem espaco mas curta (< 120) passa como texto', () => {
    expect(pareceBase64DeMidia('A'.repeat(60))).toBe(false);
  });
});

describe('enderecoNaoEPessoa', () => {
  it('status, transmissao e canais nao viram conversa', () => {
    expect(enderecoNaoEPessoa('status@broadcast')).toBe(true);
    expect(enderecoNaoEPessoa('120363@newsletter')).toBe(true);
  });
  it('pessoa (c.us e lid) continua valendo', () => {
    expect(enderecoNaoEPessoa('556292885001@c.us')).toBe(false);
    expect(enderecoNaoEPessoa('79233992933473@lid')).toBe(false);
  });
});
