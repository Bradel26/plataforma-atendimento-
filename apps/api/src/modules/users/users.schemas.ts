import { z } from 'zod';

const perfil = z.enum(['ADMIN', 'SUPERVISOR', 'GESTOR', 'COMERCIAL', 'AGENTE']);
const status = z.enum(['OFFLINE', 'DISPONIVEL', 'EM_ATENDIMENTO', 'PAUSA']);

export const createUserSchema = z.object({
  nome: z.string().min(2, 'Nome muito curto').max(120),
  email: z.string().email('Informe um email valido').transform((v) => v.toLowerCase()),
  senha: z.string().min(8, 'A senha deve ter ao menos 8 caracteres'),
  perfil: perfil.default('AGENTE'),
});

export const updateUserSchema = z
  .object({
    nome: z.string().min(2).max(120).optional(),
    email: z.string().email().transform((v) => v.toLowerCase()).optional(),
    senha: z.string().min(8, 'A senha deve ter ao menos 8 caracteres').optional(),
    perfil: perfil.optional(),
    ativo: z.boolean().optional(),
    /**
     * Gestor direto. Define a equipe do perfil GESTOR.
     *
     * Sem este campo, `gestorId` so existiria mexendo no banco — e um escopo de
     * equipe que nao da para configurar e um escopo que ninguem usa.
     */
    gestorId: z.string().uuid().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Informe ao menos um campo' });

export const listUsersSchema = z.object({
  perfil: perfil.optional(),
  ativo: z.enum(['true', 'false']).optional(),
  busca: z.string().trim().min(1).optional(),
});

export const updateStatusSchema = z.object({ status });

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersSchema>;
