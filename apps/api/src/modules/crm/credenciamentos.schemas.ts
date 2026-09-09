import { z } from 'zod';

export const SITUACOES_EXCECAO = ['REPROVADO', 'CANCELADO', 'INATIVADO'] as const;

export const criarCredenciamentoSchema = z.object({
  contatoId: z.string().uuid('Informe um contato valido'),
  contaId: z.string().uuid().nullable().optional(),
  funilId: z.string().uuid().optional(),
  estagioId: z.string().uuid().optional(),
  responsavelId: z.string().uuid().nullable().optional(),
  observacoes: z.string().trim().max(2000).nullable().optional(),
});

export const atualizarCredenciamentoSchema = z
  .object({
    estagioId: z.string().uuid().optional(),
    responsavelId: z.string().uuid().nullable().optional(),
    situacaoExcecao: z.enum(SITUACOES_EXCECAO).nullable().optional(),
    motivoExcecao: z.string().trim().max(500).nullable().optional(),
    observacoes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Informe ao menos um campo' })
  .refine((d) => d.situacaoExcecao === undefined || d.situacaoExcecao === null || Boolean(d.motivoExcecao?.trim()), {
    message: 'Informe o motivo da excecao',
    path: ['motivoExcecao'],
  });

export const listarCredenciamentosSchema = z.object({
  funilId: z.string().uuid().optional(),
  estagioId: z.string().uuid().optional(),
  contaId: z.string().uuid().optional(),
  responsavelId: z.string().uuid().optional(),
  limite: z.coerce.number().int().min(1).max(200).default(100),
});

export type CriarCredenciamentoInput = z.infer<typeof criarCredenciamentoSchema>;
export type AtualizarCredenciamentoInput = z.infer<typeof atualizarCredenciamentoSchema>;
export type ListarCredenciamentosQuery = z.infer<typeof listarCredenciamentosSchema>;
