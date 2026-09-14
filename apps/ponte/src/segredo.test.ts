import { describe, expect, it, vi } from 'vitest';
import { cifrar, decifrar } from './segredo.js';

describe('cifragem de segredos da ponte', () => {
  it('sobrevive a ida e volta', () => {
    const segredo = 'creds-do-baileys-com-conteudo-longo';
    expect(decifrar(cifrar(segredo))).toBe(segredo);
  });

  it('produz texto cifrado diferente a cada chamada (IV novo)', () => {
    expect(cifrar('mesmo-segredo')).not.toBe(cifrar('mesmo-segredo'));
  });

  it('marca a versao no prefixo e nao deixa o valor em claro', () => {
    const cifrado = cifrar('segredo-visivel');
    expect(cifrado.startsWith('v1:')).toBe(true);
    expect(cifrado).not.toContain('segredo-visivel');
  });

  /**
   * GCM detecta alteracao. Devolver vazio e o comportamento seguro: quem chama
   * trata como sessao sem credencial valida e comeca do zero.
   */
  it('devolve vazio quando o texto cifrado foi alterado', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const cifrado = cifrar('segredo-integro');
    const partes = cifrado.split(':');
    const ultimo = Number.parseInt(partes[3]!.slice(-2), 16);
    const invertido = (ultimo ^ 0xff).toString(16).padStart(2, '0');
    const adulterado = [partes[0], partes[1], partes[2], `${partes[3]!.slice(0, -2)}${invertido}`].join(':');
    expect(decifrar(adulterado)).toBe('');
  });
});
