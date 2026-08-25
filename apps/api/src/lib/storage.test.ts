import { describe, expect, it, vi } from 'vitest';
import {
  assinar,
  assinaturaValida,
  caminhoDe,
  podeExibirInline,
  tipoAceito,
  tipoPorChave,
  urlAssinada,
} from './storage';

const CHAVE = '2026/08/8f14e45f-ceea-467a-9e77-fbc4d3fbe4a5.png';

describe('tipos aceitos', () => {
  it('aceita imagem, audio, video, PDF e documento', () => {
    for (const tipo of ['image/png', 'audio/mpeg', 'video/mp4', 'application/pdf', 'text/csv']) {
      expect(tipoAceito(tipo)).toBe(true);
    }
  });

  /**
   * SVG e HTML servidos de volta ao navegador executam script no dominio da
   * aplicacao. Ficam fora da lista, e este teste existe para que continuem fora.
   */
  it('recusa SVG, HTML e executavel', () => {
    for (const tipo of ['image/svg+xml', 'text/html', 'application/x-msdownload']) {
      expect(tipoAceito(tipo)).toBe(false);
    }
  });

  it('abre no navegador so o que faz sentido abrir', () => {
    expect(podeExibirInline('image/png')).toBe(true);
    expect(podeExibirInline('application/pdf')).toBe(true);
    expect(podeExibirInline('application/zip')).toBe(false);
  });

  it('deduz o MIME pela extensao que ela mesma escolheu', () => {
    expect(tipoPorChave(CHAVE)).toBe('image/png');
    expect(tipoPorChave('2026/08/x.desconhecido')).toBe('application/octet-stream');
  });
});

describe('URL assinada', () => {
  it('aceita a propria assinatura', () => {
    expect(assinaturaValida(CHAVE, assinar(CHAVE))).toBe(true);
  });

  it('recusa assinatura de outra chave', () => {
    expect(assinaturaValida('2026/08/outra-chave.png', assinar(CHAVE))).toBe(false);
  });

  it('recusa assinatura ausente ou malformada', () => {
    expect(assinaturaValida(CHAVE, undefined)).toBe(false);
    expect(assinaturaValida(CHAVE, 'sem-ponto')).toBe(false);
    expect(assinaturaValida(CHAVE, '999.deadbeef')).toBe(false);
  });

  it('recusa assinatura expirada', () => {
    const assinada = assinar(CHAVE);
    // Uma hora e um minuto no futuro: a validade e de uma hora.
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61 * 60 * 1000);
    expect(assinaturaValida(CHAVE, assinada)).toBe(false);
    vi.restoreAllMocks();
  });

  it('assina URL interna e deixa link externo intacto', () => {
    expect(urlAssinada(`/api/arquivos/${CHAVE}`)).toMatch(/\?t=\d+\.[0-9a-f]+$/);
    expect(urlAssinada('https://exemplo.com/contrato.pdf')).toBe('https://exemplo.com/contrato.pdf');
  });
});

describe('caminho no disco', () => {
  it('recusa chave fora do formato', () => {
    expect(() => caminhoDe('nao-e-chave')).toThrow();
  });

  /** A travessia de diretorio e o ataque que este formato existe para barrar. */
  it('recusa travessia de diretorio', () => {
    expect(() => caminhoDe('../../etc/passwd')).toThrow();
    expect(() => caminhoDe('2026/08/../../../package.json')).toThrow();
  });

  it('resolve chave valida dentro da raiz do storage', () => {
    expect(caminhoDe(CHAVE)).toContain('storage-teste');
  });
});
