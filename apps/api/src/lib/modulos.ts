import type { Role } from '@prisma/client';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { asyncHandler } from '../http/async-handler';
import { forbidden, unauthorized } from './errors';
import { prisma } from './prisma';

/**
 * Chaves de modulo, uma por item editavel de `apps/web/src/components/layout/nav.ts`
 * (a mesma `rota` sem a barra). Mantida manualmente em sincronia com o front —
 * lista pequena, muda raramente.
 *
 * `configuracoes` fica de fora de proposito: sempre so ADMIN, hardcoded, para
 * nao existir o risco de alguem se trancar fora do proprio painel.
 */
export const MODULOS_EDITAVEIS = [
  'atendimento',
  'esteira',
  'monitoramento',
  'auditoria',
  'gestao',
  'campanhas',
  'relatorios',
  'crm',
  'dashboards',
  'chamado-ti',
] as const;

/** Perfis que o painel deixa o ADMIN configurar — ADMIN de fora, sempre tem tudo. */
export const PERFIS_EDITAVEIS: Role[] = ['SUPERVISOR', 'GESTOR', 'COMERCIAL', 'SUPORTE', 'AGENTE'];

/**
 * Modulos que este perfil ve, na organizacao do contexto atual.
 *
 * ADMIN nunca consulta a tabela: sempre tem todos os editaveis. Garantia
 * contra lockout — nenhuma linha apagada por engano tira o acesso do ADMIN.
 */
export async function modulosPermitidos(perfil: Role): Promise<Set<string>> {
  if (perfil === 'ADMIN') return new Set(MODULOS_EDITAVEIS);
  const linhas = await prisma.modulePermission.findMany({ where: { perfil }, select: { modulo: true } });
  return new Set(linhas.map((l) => l.modulo));
}

/**
 * Portao de modulo inteiro — mesmo papel que `requireRole(array fixo)` tinha,
 * so que consultando a tabela configuravel em vez do array no codigo. Nunca
 * substitui `requireRole` de acao especifica dentro de um modulo (quem aprova,
 * quem exclui) — so decide se o perfil entra no modulo.
 */
export function requireModulo(modulo: string): RequestHandler {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    const permitidos = await modulosPermitidos(req.user.perfil);
    if (!permitidos.has(modulo)) return next(forbidden());
    next();
  });
}
