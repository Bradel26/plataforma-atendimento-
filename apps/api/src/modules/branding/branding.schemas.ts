import { z } from 'zod';

const hex = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Use uma cor hexadecimal, ex.: #2563eb');

export const updateBrandingSchema = z
  .object({
    appName: z.string().min(2).max(60).optional(),
    logoUrl: z.string().url('Informe uma URL valida').nullable().optional(),
    corPrimaria: hex.optional(),
    corSecundaria: hex.optional(),
    corDestaque: hex.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Informe ao menos um campo' });
