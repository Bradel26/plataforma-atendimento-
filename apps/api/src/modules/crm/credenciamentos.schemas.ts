import { z } from 'zod';

/**
 * Query dos indicadores da operacao (Dashboard, Gestao, Desempenho). Os
 * schemas de cadastro/movimento da API antiga (e `SITUACOES_EXCECAO`) sairam
 * na Task 21: os vinculos sao escritos por `/api/esteiras/:operacao`.
 */

const uf = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'UF inválida');

const periodo = {
  desde: z.coerce.date().optional(),
  ate: z.coerce.date().optional(),
};

export const painelSchema = z.object(periodo);

export const gestaoSchema = z.object({
  ...periodo,
  funilId: z.string().uuid().optional(),
  /** A partir de quantos dias sem avancar o parceiro conta como parado. */
  limiteDias: z.coerce.number().int().min(1).max(90).default(5),
  horasSemInteracao: z.coerce.number().int().min(1).max(720).default(24),
});

export const desempenhoSchema = z.object({
  ...periodo,
  consultorId: z.string().uuid().optional(),
  uf: uf.optional(),
  funilId: z.string().uuid().optional(),
  estagioId: z.string().uuid().optional(),
});
