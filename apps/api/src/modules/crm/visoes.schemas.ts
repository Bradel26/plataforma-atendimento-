import { z } from 'zod';
import { TIPOS } from './leads.schemas';

/**
 * Filtro por entidade (item 6.1) — o MESMO vocabulario que cada tela ja usa,
 * e nao um novo. Contas filtra por busca+etiqueta; Leads por tipo, responsavel
 * e atraso; Oportunidades so por funil, porque e so isso que a tela do kanban
 * expoe hoje. Acrescentar um campo aqui sem a tela ja o ter seria inventar
 * filtro que ninguem pode preencher.
 */
const filtroContaSchema = z
  .object({
    busca: z.string().trim().min(1).optional(),
    tags: z.array(z.string().trim().min(1)).max(20).optional(),
  })
  .strict();

const filtroLeadSchema = z
  .object({
    tipo: z.enum(TIPOS).optional(),
    responsavelId: z.string().uuid().optional(),
    atrasados: z.boolean().optional(),
    busca: z.string().trim().min(1).optional(),
  })
  .strict();

const filtroOportunidadeSchema = z
  .object({
    funilId: z.string().uuid().optional(),
  })
  .strict();

const nomeSchema = z.string().trim().min(2).max(60);
const corSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Cor precisa ser um hexadecimal, ex.: #2563eb');

export const criarVisaoSchema = z.discriminatedUnion('entidade', [
  z.object({ entidade: z.literal('CONTA'), nome: nomeSchema, cor: corSchema.optional(), filtro: filtroContaSchema }),
  z.object({ entidade: z.literal('LEAD'), nome: nomeSchema, cor: corSchema.optional(), filtro: filtroLeadSchema }),
  z.object({
    entidade: z.literal('OPORTUNIDADE'),
    nome: nomeSchema,
    cor: corSchema.optional(),
    filtro: filtroOportunidadeSchema,
  }),
]);

export type CriarVisaoInput = z.infer<typeof criarVisaoSchema>;

/**
 * Atualizacao nao recebe `entidade` — ela e imutavel depois de criada, porque
 * mudar de entidade tornaria o filtro salvo (do formato antigo) invalido sem
 * ninguem editar nada.
 */
export const atualizarVisaoSchema = z
  .object({
    nome: nomeSchema.optional(),
    cor: corSchema.optional(),
    filtro: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Informe ao menos um campo' });

export type AtualizarVisaoInput = z.infer<typeof atualizarVisaoSchema>;

export const listarVisoesSchema = z.object({
  entidade: z.enum(['CONTA', 'LEAD', 'OPORTUNIDADE']).optional(),
});

/** Valida um filtro solto (de PATCH) contra o schema da entidade do registro. */
export function validarFiltroDaEntidade(entidade: 'CONTA' | 'LEAD' | 'OPORTUNIDADE', filtro: unknown) {
  const schema =
    entidade === 'CONTA' ? filtroContaSchema : entidade === 'LEAD' ? filtroLeadSchema : filtroOportunidadeSchema;
  return schema.parse(filtro);
}
