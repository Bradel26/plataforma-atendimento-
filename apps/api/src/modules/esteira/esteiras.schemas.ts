import { MotivoPerdaStarlink, TipoCaptacao } from '@prisma/client';
import { z } from 'zod';
import { cnpjValido } from '../crm/cnpj';
import { ETAPAS } from './catalogo';

const digitos = (v: string) => v.replace(/\D/g, '');

const CHAVES = [...ETAPAS.TIM, ...ETAPAS.STARLINK].map((e) => e.chave) as [string, ...string[]];

/**
 * Cadastro manual de um vínculo. O parceiro vem de um contato existente
 * (`contatoId`) ou é achado/criado pelos dados: CNPJ → conta; CPF/telefone → contato.
 */
export const criarVinculoSchema = z
  .object({
    contatoId: z.string().uuid().optional(),
    contaId: z.string().uuid().nullable().optional(),
    /** Nome da pessoa (contato). */
    nome: z.string().trim().min(2, 'Nome muito curto').max(160).optional(),
    /** Nome da empresa, quando o CNPJ cria uma conta nova; sem ele, usa `nome`. */
    empresa: z.string().trim().min(2, 'Nome da empresa muito curto').max(160).optional(),
    cnpj: z.string().trim().transform(digitos).refine(cnpjValido, 'Informe um CNPJ válido').optional(),
    cpf: z
      .string()
      .trim()
      .transform(digitos)
      .refine((v) => v.length === 11, 'Informe um CPF válido')
      .optional(),
    telefone: z.string().trim().min(8, 'Telefone inválido').max(30).optional(),
    email: z.string().trim().email('E-mail inválido').max(160).optional(),
    cidade: z.string().trim().max(120).optional(),
    uf: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, 'UF inválida')
      .optional(),
    responsavelId: z.string().uuid().nullable().optional(),
    observacoes: z.string().trim().max(2000).nullable().optional(),
    /** Só Starlink: como o lead chegou (etiqueta, não etapa). */
    tipoCaptacao: z.nativeEnum(TipoCaptacao).optional(),
  })
  .refine((d) => d.contatoId || d.nome || d.empresa, {
    message: 'Informe o contato ou o nome do parceiro',
    path: ['nome'],
  });

export const moverVinculoSchema = z.object({
  paraChave: z.enum(CHAVES),
  justificativa: z.string().trim().max(1000).optional(),
  motivo: z.string().trim().max(500).optional(),
  motivoPerda: z.nativeEnum(MotivoPerdaStarlink).optional(),
});

export type CriarVinculoInput = z.infer<typeof criarVinculoSchema>;
export type MoverVinculoInput = z.infer<typeof moverVinculoSchema>;
