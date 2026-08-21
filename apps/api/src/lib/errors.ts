/** Erro de dominio com status HTTP — tratado pelo errorHandler. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (msg: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', msg, details);
export const unauthorized = (msg = 'Nao autenticado') => new AppError(401, 'UNAUTHORIZED', msg);
export const forbidden = (msg = 'Acesso negado para este perfil') => new AppError(403, 'FORBIDDEN', msg);
export const notFound = (msg = 'Recurso nao encontrado') => new AppError(404, 'NOT_FOUND', msg);
export const conflict = (msg: string) => new AppError(409, 'CONFLICT', msg);
