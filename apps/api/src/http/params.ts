import type { Request } from 'express';
import { badRequest } from '../lib/errors';

/**
 * Le um parametro de rota garantindo que existe.
 * Necessario porque noUncheckedIndexedAccess tipa req.params[x] como string | undefined.
 */
export function param(req: Request, nome: string): string {
  const valor = req.params[nome];
  if (!valor) throw badRequest(`Parametro de rota "${nome}" ausente`);
  return valor;
}
