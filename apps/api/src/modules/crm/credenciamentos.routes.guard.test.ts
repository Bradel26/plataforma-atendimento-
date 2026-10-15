import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { credenciamentosRoutes } from './credenciamentos.routes';

/*
 * `credenciamentosRoutes.use(requireRole(...))` (logo apos `requireAuth`) e o
 * portao que fecha o modulo inteiro da Esteira para quem nao esta na lista —
 * e o unico lugar que decide se SUPORTE entra ou leva 403 em qualquer rota
 * daqui. Testa o middleware direto pelo `stack`, sem montar servidor: mais
 * barato e exercita exatamente a checagem que protege a rota real.
 */
function guardDoModulo() {
  const layer = credenciamentosRoutes.stack[1] as { handle: (req: Request, res: Response, next: NextFunction) => void };
  return layer.handle;
}

function fakeReq(perfil: string): Request {
  return { user: { sub: 'u-1', perfil, nome: 'Fulano', email: 'f@x.com', org: 'org-1' } } as unknown as Request;
}

function rodar(perfil: string) {
  let erro: unknown;
  guardDoModulo()(fakeReq(perfil), {} as Response, (e?: unknown) => {
    erro = e;
  });
  return erro;
}

describe('credenciamentosRoutes — guard do modulo', () => {
  it('SUPORTE acessa a Esteira, mesmo nivel operacional de COMERCIAL', () => {
    expect(rodar('SUPORTE')).toBeUndefined();
  });

  it('AGENTE continua fora — mesmo corte de Oportunidades', () => {
    expect(rodar('AGENTE')).toMatchObject({ status: 403 });
  });

  it('COMERCIAL continua passando (nao regrediu)', () => {
    expect(rodar('COMERCIAL')).toBeUndefined();
  });
});
