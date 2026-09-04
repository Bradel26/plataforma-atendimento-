import { z } from 'zod';

export const ENTIDADES_CAMPO_CUSTOMIZADO = ['CONTA', 'LEAD', 'OPORTUNIDADE'] as const;
export const TIPOS_CAMPO_CUSTOMIZADO = ['TEXTO', 'NUMERO', 'DATA', 'BOOLEANO', 'SELECAO'] as const;

const entidade = z.enum(ENTIDADES_CAMPO_CUSTOMIZADO);
const tipo = z.enum(TIPOS_CAMPO_CUSTOMIZADO);
const opcoes = z.array(z.string().trim().min(1).max(80)).max(50);

export const criarCampoCustomizadoSchema = z
  .object({
    entidade,
    nome: z.string().trim().min(2, 'Nome muito curto').max(80),
    tipo,
    opcoes: opcoes.optional(),
    obrigatorio: z.boolean().default(false),
    valorUnico: z.boolean().default(false),
    secao: z.string().trim().max(80).optional(),
    ordem: z.number().int().default(0),
  })
  .refine((d) => d.tipo !== 'SELECAO' || (d.opcoes && d.opcoes.length >= 2), {
    message: 'Campo do tipo SELECAO exige ao menos 2 opcoes',
    path: ['opcoes'],
  });

export const listarCamposCustomizadosSchema = z.object({ entidade: entidade.optional() });

export const atualizarCampoCustomizadoSchema = z
  .object({
    nome: z.string().trim().min(2).max(80).optional(),
    opcoes: opcoes.optional(),
    obrigatorio: z.boolean().optional(),
    secao: z.string().trim().max(80).nullable().optional(),
    ordem: z.number().int().optional(),
    ativo: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Informe ao menos um campo' });
