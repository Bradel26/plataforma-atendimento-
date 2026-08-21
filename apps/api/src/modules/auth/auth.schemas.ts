import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Informe um email valido'),
  senha: z.string().min(1, 'Informe a senha'),
});

export type LoginInput = z.infer<typeof loginSchema>;
