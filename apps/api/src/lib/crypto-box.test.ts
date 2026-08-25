import { describe, expect, it, vi } from 'vitest';
import { cifrar, decifrar } from './crypto-box';

describe('cifragem de segredos', () => {
  it('sobrevive a ida e volta', () => {
    const segredo = 'EAAG-token-da-meta-com-conteudo-longo';
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

  /** Registro gravado antes da cifragem tem de continuar legivel. */
  it('devolve valor sem prefixo como texto claro de versao anterior', () => {
    expect(decifrar('token-antigo-em-claro')).toBe('token-antigo-em-claro');
  });

  /**
   * GCM detecta alteracao. Devolver vazio faz o canal responder "nao
   * configurado" em vez de tentar autenticar com lixo na Graph API.
   */
  it('devolve vazio quando o texto cifrado foi alterado', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const cifrado = cifrar('segredo-integro');
    const partes = cifrado.split(':');
    const adulterado = [partes[0], partes[1], partes[2], `${partes[3]!.slice(0, -2)}ff`].join(':');
    expect(decifrar(adulterado)).toBe('');
  });
});
