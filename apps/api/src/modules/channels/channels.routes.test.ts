import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../lib/errors';
import { exigirDonoOuAdmin } from './channels.routes';

/*
 * `exigirDonoOuAdmin` e o portao de autorizacao entre "ver/mexer na propria
 * linha pessoal" e "ver/mexer na linha de outro vendedor" — o QR, o estado da
 * ponte e o desconectar de uma linha `donoId`-owned passam todos por aqui.
 * Sem teste, o caminho 403 (vendedor tentando a linha de outro) nunca era
 * exercitado em lugar nenhum: nem aqui, nem no smoke, que so autentica ADMIN.
 */
function fakeReq(sub: string, perfil: 'ADMIN' | 'GESTOR' | 'COMERCIAL' | 'AGENTE'): Request {
  return { user: { sub, perfil, nome: 'Fulano', email: 'f@x.com', org: 'org-1' } } as unknown as Request;
}

describe('exigirDonoOuAdmin', () => {
  it('ADMIN passa sempre, mesmo sem ser o dono', () => {
    const req = fakeReq('admin-1', 'ADMIN');
    expect(() => exigirDonoOuAdmin(req, 'dono-1')).not.toThrow();
    expect(() => exigirDonoOuAdmin(req, null)).not.toThrow();
    expect(() => exigirDonoOuAdmin(req, 'outro-qualquer')).not.toThrow();
  });

  it('o proprio dono da linha passa', () => {
    const req = fakeReq('vendedor-1', 'COMERCIAL');
    expect(() => exigirDonoOuAdmin(req, 'vendedor-1')).not.toThrow();
  });

  it('outro usuario nao-ADMIN, dono diferente, e barrado com forbidden', () => {
    const req = fakeReq('vendedor-2', 'COMERCIAL');
    expect(() => exigirDonoOuAdmin(req, 'vendedor-1')).toThrow(AppError);
    try {
      exigirDonoOuAdmin(req, 'vendedor-1');
      throw new Error('deveria ter lancado');
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).status).toBe(403);
      expect((e as AppError).code).toBe('FORBIDDEN');
    }
  });

  it('donoId nulo (linha compartilhada) barra quem nao e ADMIN', () => {
    const req = fakeReq('vendedor-1', 'COMERCIAL');
    expect(() => exigirDonoOuAdmin(req, null)).toThrow(AppError);
  });
});
