import { z } from 'zod';
import { MOTIVOS_PERDA } from './leads.schemas';

const itemSchema = z.object({
  produtoId: z.string().uuid(),
  quantidade: z.number().int().min(1).default(1),
  /** Omitido: usa o preco do catalogo informado, ou o do primeiro catalogo ativo. */
  precoUnitario: z.number().nonnegative().optional(),
});

export const criarOportunidadeSchema = z.object({
  titulo: z.string().trim().min(2).max(160),
  contaId: z.string().uuid('Informe uma conta valida'),
  funilId: z.string().uuid().optional(),
  estagioId: z.string().uuid().optional(),
  valor: z.number().nonnegative().optional(),
  responsavelId: z.string().uuid().nullable().optional(),
  previsaoFechamento: z.coerce.date().nullable().optional(),
  catalogoId: z.string().uuid().optional(),
  itens: z.array(itemSchema).max(50).optional(),
});

export const atualizarOportunidadeSchema = z
  .object({
    titulo: z.string().trim().min(2).max(160).optional(),
    estagioId: z.string().uuid().optional(),
    valor: z.number().nonnegative().optional(),
    responsavelId: z.string().uuid().nullable().optional(),
    previsaoFechamento: z.coerce.date().nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Informe ao menos um campo' });

export const fecharOportunidadeSchema = z
  .object({
    status: z.enum(['GANHA', 'PERDIDA']),
    motivoPerda: z.enum(MOTIVOS_PERDA).optional(),
  })
  .refine((d) => d.status !== 'PERDIDA' || Boolean(d.motivoPerda), {
    message: 'Informe o motivo da perda',
    path: ['motivoPerda'],
  });

export const listarOportunidadesSchema = z.object({
  funilId: z.string().uuid().optional(),
  estagioId: z.string().uuid().optional(),
  contaId: z.string().uuid().optional(),
  responsavelId: z.string().uuid().optional(),
  status: z.enum(['ABERTA', 'GANHA', 'PERDIDA']).optional(),
  busca: z.string().trim().min(1).optional(),
  limite: z.coerce.number().int().min(1).max(200).default(100),
});

export const itensSchema = z.object({
  catalogoId: z.string().uuid().optional(),
  itens: z.array(itemSchema).min(1).max(50),
});

export const criarFunilSchema = z.object({
  nome: z.string().trim().min(2).max(80),
  estagios: z
    .array(
      z.object({
        nome: z.string().trim().min(2).max(60),
        probabilidade: z.number().int().min(0).max(100).default(0),
      }),
    )
    .min(2, 'Um funil precisa de ao menos 2 estagios')
    .max(12),
});

export type CriarOportunidadeInput = z.infer<typeof criarOportunidadeSchema>;
export type AtualizarOportunidadeInput = z.infer<typeof atualizarOportunidadeSchema>;
export type FecharOportunidadeInput = z.infer<typeof fecharOportunidadeSchema>;
export type ListarOportunidadesQuery = z.infer<typeof listarOportunidadesSchema>;
export type ItensInput = z.infer<typeof itensSchema>;
