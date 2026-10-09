import { describe, expect, it } from 'vitest';
import { foiEnviadaPelaPlataforma, lembrarEnviadaPelaPlataforma } from './enviadas.js';

describe('ids enviados pela plataforma', () => {
  it('lembra o id por 10 minutos', () => {
    lembrarEnviadaPelaPlataforma('A1', 1_000);
    expect(foiEnviadaPelaPlataforma('A1', 1_000 + 9 * 60_000)).toBe(true);
    expect(foiEnviadaPelaPlataforma('A1', 1_000 + 11 * 60_000)).toBe(false);
  });

  it('id desconhecido nao foi enviado pela plataforma', () => {
    expect(foiEnviadaPelaPlataforma('NUNCA', Date.now())).toBe(false);
  });
});
