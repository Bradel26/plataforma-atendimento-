import { z } from 'zod';

const uf = z
  .string()
  .trim()
  .length(2, 'UF deve ter 2 letras')
  .toUpperCase();

export const criarFilialSchema = z.object({
  nome: z.string().trim().min(2, 'Nome muito curto').max(120),
  cidade: z.string().trim().max(120).optional(),
  uf: uf.optional(),
});

export const atualizarFilialSchema = z
  .object({
    nome: z.string().trim().min(2).max(120).optional(),
    cidade: z.string().trim().max(120).nullable().optional(),
    uf: uf.nullable().optional(),
    ativa: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Informe ao menos um campo' });
