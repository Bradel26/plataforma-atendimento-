import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Informe um email válido'),
  senha: z.string().min(1, 'Informe a senha'),
});

export const alterarSenhaInicialSchema = z.object({
  email: z.string().email('Informe um email válido'),
  senhaAtual: z.string().min(1, 'Informe a senha atual'),
  novaSenha: z.string().min(12, 'A nova senha deve ter ao menos 12 caracteres'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type AlterarSenhaInicialInput = z.infer<typeof alterarSenhaInicialSchema>;
