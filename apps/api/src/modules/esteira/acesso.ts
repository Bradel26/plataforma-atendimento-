import type { NivelOperacao, Operacao, Prisma, Role } from '@prisma/client';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { forbidden, notFound } from '../../lib/errors';
import { memoizado, usuarioAtual } from '../../lib/tenant';
import { operacaoDaUrl } from './catalogo';

/**
 * Permissão por operação (TIM / Starlink).
 *
 * O padrão é permissivo: quem tem o módulo Esteira acessa as duas operações com
 * EDICAO. A tabela `usuarios_operacoes` guarda só as **exceções** (LEITURA ou
 * SEM_ACESSO); sem linha, vale EDICAO. ADMIN ignora as linhas.
 */
export type AcessoOperacoes = Partial<Record<Operacao, NivelOperacao>>;

const OPERACOES: Operacao[] = ['TIM', 'STARLINK'];

/** Nível efetivo de cada operação. SEM_ACESSO some do resultado. */
export function nivelEfetivo(
  perfil: Role,
  linhas: Array<{ operacao: Operacao; nivel: NivelOperacao }>,
): AcessoOperacoes {
  const resultado: AcessoOperacoes = {};
  for (const operacao of OPERACOES) {
    const nivel = perfil === 'ADMIN' ? 'EDICAO' : (linhas.find((l) => l.operacao === operacao)?.nivel ?? 'EDICAO');
    if (nivel !== 'SEM_ACESSO') resultado[operacao] = nivel;
  }
  return resultado;
}

/** Quem pode forçar avanço de etapa: perfil de chefia com EDICAO na operação. */
export function podeForcar(perfil: Role, nivel: NivelOperacao | undefined): boolean {
  return (perfil === 'ADMIN' || perfil === 'SUPERVISOR' || perfil === 'GESTOR') && nivel === 'EDICAO';
}

/** SEM_ACESSO nunca é exigido: sem acesso a operação "não existe" (404). */
export function resolverAcesso(
  acesso: AcessoOperacoes,
  operacao: Operacao,
  exigido: 'LEITURA' | 'EDICAO',
): 'OK' | 'NAO_ENCONTRADO' | 'PROIBIDO' {
  const nivel = acesso[operacao];
  if (!nivel || nivel === 'SEM_ACESSO') return 'NAO_ENCONTRADO';
  if (exigido === 'EDICAO' && nivel !== 'EDICAO') return 'PROIBIDO';
  return 'OK';
}

/** Acesso de um usuário já conhecido (visível na organização atual). */
export async function acessoDoUsuario(usuarioId: string, perfil: Role): Promise<AcessoOperacoes> {
  const linhas = await prisma.usuarioOperacao.findMany({
    where: { usuarioId },
    select: { operacao: true, nivel: true },
  });
  return nivelEfetivo(perfil, linhas);
}

/** Acesso do usuário da requisição, memoizado por requisição. */
export function acessoDoUsuarioAtual(): Promise<AcessoOperacoes> {
  const { id, perfil } = usuarioAtual();
  return memoizado('acesso-operacoes', () => acessoDoUsuario(id, perfil as Role));
}

/** Middleware de rota com `:operacao` na URL. 404 se inválida/sem acesso; 403 se só LEITURA. */
export function exigirOperacao(nivel: 'LEITURA' | 'EDICAO'): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const operacao = operacaoDaUrl(String(req.params.operacao ?? ''));
      if (!operacao) throw notFound('Operação não encontrada');
      const acesso = await acessoDoUsuarioAtual();
      const decisao = resolverAcesso(acesso, operacao, nivel);
      if (decisao === 'NAO_ENCONTRADO') throw notFound('Operação não encontrada');
      if (decisao === 'PROIBIDO') throw forbidden('Você tem acesso somente leitura a esta operação');
      res.locals.operacao = operacao;
      res.locals.nivelOperacao = acesso[operacao];
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Filtro de credenciamentos pelas operações que o usuário atual enxerga. */
export async function filtroOperacoesPermitidas(): Promise<Prisma.CredenciamentoWhereInput> {
  const acesso = await acessoDoUsuarioAtual();
  const permitidas = OPERACOES.filter((o) => acesso[o]);
  return permitidas.length ? { operacao: { in: permitidas } } : { id: { in: [] } };
}
