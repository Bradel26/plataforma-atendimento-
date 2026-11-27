import { describe, expect, it } from 'vitest';
import { escondeTextoDaMidia } from './textoDeMidia';

const m = (tipoAnexo: 'IMAGEM' | 'AUDIO' | 'VIDEO' | 'ARQUIVO' | 'TEXTO', conteudo: string, anexoUrl: string | null = '/a') =>
  ({ tipoAnexo, conteudo, anexoUrl }) as Parameters<typeof escondeTextoDaMidia>[0];

describe('escondeTextoDaMidia', () => {
  it('audio com arquivo nunca mostra texto', () => {
    expect(escondeTextoDaMidia(m('AUDIO', 'audio-20261127-145113.m4a'))).toBe(true);
    expect(escondeTextoDaMidia(m('AUDIO', '[Áudio recebido]'))).toBe(true);
  });
  it('foto sem legenda: nome do arquivo e marcador somem', () => {
    expect(escondeTextoDaMidia(m('IMAGEM', 'IMG-20261127-WA0012.jpg'))).toBe(true);
    expect(escondeTextoDaMidia(m('IMAGEM', 'foto do cliente.PNG'))).toBe(true);
    expect(escondeTextoDaMidia(m('IMAGEM', '[Imagem recebida]'))).toBe(true);
    expect(escondeTextoDaMidia(m('IMAGEM', ''))).toBe(true);
  });
  it('foto com legenda de verdade mantem o texto', () => {
    expect(escondeTextoDaMidia(m('IMAGEM', 'Segue o comprovante'))).toBe(false);
    expect(escondeTextoDaMidia(m('IMAGEM', 'veja o arquivo foto.jpg que mandei'))).toBe(false);
  });
  it('sem o arquivo carregado, o texto fica', () => {
    expect(escondeTextoDaMidia(m('IMAGEM', '[Imagem recebida]', null))).toBe(false);
    expect(escondeTextoDaMidia(m('AUDIO', 'audio.m4a', null))).toBe(false);
  });
  it('documento e texto nao sao afetados', () => {
    expect(escondeTextoDaMidia(m('ARQUIVO', 'contrato.pdf'))).toBe(false);
    expect(escondeTextoDaMidia(m('TEXTO', 'oi'))).toBe(false);
  });
});
