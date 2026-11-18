import { z } from 'zod';

const hex = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Use uma cor hexadecimal, ex.: #2563eb');

/** Ids dos modelos de fundo das conversas; o front tem a mesma lista em features/branding/fundosChat.ts. */
export const FUNDOS_CHAT = ['liso', 'doodle', 'menta', 'azul', 'pontilhado', 'diagonal', 'ondas', 'grade'] as const;

export const updateBrandingSchema = z
  .object({
    appName: z.string().min(2).max(60).optional(),
    logoUrl: z.string().url('Informe uma URL valida').nullable().optional(),
    corPrimaria: hex.optional(),
    corSecundaria: hex.optional(),
    corDestaque: hex.optional(),
    fundoChat: z.enum(FUNDOS_CHAT).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Informe ao menos um campo' });
