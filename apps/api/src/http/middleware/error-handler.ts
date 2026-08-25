import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { AppError } from '../../lib/errors';
import { limiteBytes } from '../../lib/storage';
import { registrarErro } from '../../lib/redacao';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Rota ${req.method} ${req.path} nao existe` } });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados invalidos',
        details: err.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })),
      },
    });
  }

  // Upload recusado pelo multer (tamanho, campo inesperado) e erro do cliente.
  if (err instanceof MulterError) {
    const mensagem =
      err.code === 'LIMIT_FILE_SIZE'
        ? `Arquivo acima do limite de ${Math.round(limiteBytes / 1024 / 1024)} MB`
        : `Envio de arquivo invalido: ${err.message}`;
    return res.status(400).json({ error: { code: 'UPLOAD_INVALIDO', message: mensagem } });
  }

  // Redigido: stack de erro carrega o corpo da requisicao, e corpo de webhook
  // tem telefone e nome do cliente dentro.
  registrarErro('[erro nao tratado]', err);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor' } });
}
