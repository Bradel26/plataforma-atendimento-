import { z } from 'zod';

export const SITUACOES_EXCECAO = ['REPROVADO', 'CANCELADO', 'INATIVADO'] as const;

export const criarCredenciamentoSchema = z.object({
  contatoId: z.string().uuid('Informe um contato válido'),
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
    message: 'Informe o motivo da exceção',
    path: ['motivoExcecao'],
  });

const uf = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'UF inválida');

/** Filtros comuns da lista e do kanban. */
export const filtrosEsteiraSchema = z.object({
  funilId: z.string().uuid().optional(),
  uf: uf.optional(),
  busca: z.string().trim().min(1).max(80).optional(),
  responsavelId: z.string().uuid().optional(),
  excecoes: z.enum(['incluir', 'ocultar', 'somente']).default('incluir'),
});

export const listarCredenciamentosSchema = filtrosEsteiraSchema.extend({
  estagioId: z.string().uuid().optional(),
  contaId: z.string().uuid().optional(),
  contatoId: z.string().uuid().optional(),
  limite: z.coerce.number().int().min(1).max(200).default(100),
});

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

export type CriarCredenciamentoInput = z.infer<typeof criarCredenciamentoSchema>;
export type AtualizarCredenciamentoInput = z.infer<typeof atualizarCredenciamentoSchema>;
export type ListarCredenciamentosQuery = z.infer<typeof listarCredenciamentosSchema>;
