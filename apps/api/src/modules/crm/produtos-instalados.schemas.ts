import { z } from 'zod';

const TIPOS_GARANTIA = ['LEGAL', 'CONTRATUAL', 'COMPRESSOR', 'OUTRA'] as const;

const componenteSchema = z
  .object({
    tipo: z.enum(TIPOS_GARANTIA),
    /** Obrigatorio so quando tipo = OUTRA — e o rotulo que a tela mostra. */
    nome: z.string().trim().min(2).max(80).optional(),
    prazoDias: z.number().int().min(1).max(36_500),
    /** Omitido: herda a data de instalacao do produto no momento da criacao. */
    dataInicio: z.coerce.date().nullable().optional(),
    observacao: z.string().trim().max(500).nullable().optional(),
  })
  .refine((d) => d.tipo !== 'OUTRA' || Boolean(d.nome), {
    message: 'Informe um nome para a garantia do tipo Outra',
    path: ['nome'],
  });

export const criarProdutoSchema = z.object({
  contaId: z.string().uuid('Informe uma conta valida'),
  modelo: z.string().trim().min(2).max(160),
  numeroSerie: z.string().trim().max(120).nullable().optional(),
  dataInstalacao: z.coerce.date().nullable().optional(),
  instaladorNome: z.string().trim().max(160).nullable().optional(),
  instaladorCredenciado: z.boolean().nullable().optional(),
  notaFiscalNumero: z.string().trim().max(60).nullable().optional(),
  observacoes: z.string().trim().max(2000).nullable().optional(),
  componentes: z.array(componenteSchema).max(20).default([]),
});

export const atualizarProdutoSchema = z
  .object({
    modelo: z.string().trim().min(2).max(160).optional(),
    numeroSerie: z.string().trim().max(120).nullable().optional(),
    dataInstalacao: z.coerce.date().nullable().optional(),
    instaladorNome: z.string().trim().max(160).nullable().optional(),
    instaladorCredenciado: z.boolean().nullable().optional(),
    notaFiscalNumero: z.string().trim().max(60).nullable().optional(),
    observacoes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Informe ao menos um campo' });

export const criarComponenteSchema = componenteSchema;

export const atualizarComponenteSchema = z
  .object({
    tipo: z.enum(TIPOS_GARANTIA).optional(),
    nome: z.string().trim().min(2).max(80).nullable().optional(),
    prazoDias: z.number().int().min(1).max(36_500).optional(),
    dataInicio: z.coerce.date().nullable().optional(),
    observacao: z.string().trim().max(500).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Informe ao menos um campo' });

export const listarProdutosSchema = z.object({
  contaId: z.string().uuid().optional(),
  limite: z.coerce.number().int().min(1).max(200).default(100),
});

export type CriarProdutoInput = z.infer<typeof criarProdutoSchema>;
export type AtualizarProdutoInput = z.infer<typeof atualizarProdutoSchema>;
export type CriarComponenteInput = z.infer<typeof criarComponenteSchema>;
export type AtualizarComponenteInput = z.infer<typeof atualizarComponenteSchema>;
export type ListarProdutosQuery = z.infer<typeof listarProdutosSchema>;
