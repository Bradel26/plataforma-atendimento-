import { describe, expect, it } from 'vitest';
import { gravacaoPertenceASessao } from './webjs-recording-access';

const data = '2026-10-26T15-30-42.123Z';

describe('gravacaoPertenceASessao', () => {
  it('aceita somente o nome de gravação pertencente à sessão exata', () => {
    expect(gravacaoPertenceASessao(`sessao-vendedor-chamada-${data}-audio-completo.wav`, 'vendedor')).toBe(true);
    expect(gravacaoPertenceASessao(`sessao-vendedor-chamada-${data}`, 'vendedor')).toBe(true);
  });

  it('não confunde uma sessão com outra que apenas começa pelo mesmo prefixo', () => {
    expect(gravacaoPertenceASessao(`sessao-vendedor-abc-chamada-${data}-audio-completo.wav`, 'vendedor')).toBe(false);
  });

  it('nega gravações que pertencem a outra sessão, inclusive entre organizações', () => {
    expect(gravacaoPertenceASessao(`sessao-org2-vendedor-chamada-${data}-audio-remoto.wav`, 'org1-vendedor')).toBe(false);
  });

  it('nega nomes malformados e tentativas de atravessar diretórios', () => {
    expect(gravacaoPertenceASessao(`../sessao-vendedor-chamada-${data}-audio-completo.wav`, 'vendedor')).toBe(false);
    expect(gravacaoPertenceASessao(`sessao-vendedor-abc-chamada-qualquer.wav`, 'vendedor')).toBe(false);
  });
});
