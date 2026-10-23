import { DepTim, MotivoPerdaStarlink, StatusItemTim, StatusVendedor, TipoCaptacao, VivensisStatus } from '@prisma/client';
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

/** Texto opcional: vazio vira nulo (limpa o campo). */
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();

const triEstado = z.boolean().nullable().optional();
const dataOpcional = z.coerce.date().nullable().optional();

/**
 * Campos TIM editáveis. Fora daqui: `origem` (da importação) e `statusParceria`
 * (o serviço mantém em sincronia com a etapa). Campo desconhecido é recusado.
 */
const camposTimSchema = z
  .object({
    flagTrafegoPago: z.boolean().optional(),
    statusDescritivo: textoOpcional(1000),
    dep: z.nativeEnum(DepTim).nullable().optional(),
    dataCredenciamento: dataOpcional,
    matriculaSappdv: textoOpcional(60),
    promoStatus: textoOpcional(60),
    tipoCarteira: textoOpcional(60),
    sistemaTimVendas: triEstado,
    sistemaGn: triEstado,
    sistemaTimFormaMais: triEstado,
    sistemaPortalFornecedor: triEstado,
    sistemaMeuTim: triEstado,
    compraChip: z.nativeEnum(StatusItemTim).nullable().optional(),
    treinamento: z.nativeEnum(StatusItemTim).nullable().optional(),
  })
  .strict();

/** Campos Starlink editáveis (tri-estado: `null` = não respondido, nunca NÃO). */
const camposStarlinkSchema = z
  .object({
    tipoCaptacao: z.nativeEnum(TipoCaptacao).nullable().optional(),
    primeiroContatoEm: dataOpcional,
    cnpjApto: triEstado,
    mei: triEstado,
    altCnae: triEstado,
    vsm: triEstado,
    treinamento: triEstado,
    parceiro: triEstado,
    contrato: triEstado,
    prontoVenda: triEstado,
    perdido: triEstado,
    vivensisStatus: z.nativeEnum(VivensisStatus).nullable().optional(),
    motivoPerda: z.nativeEnum(MotivoPerdaStarlink).nullable().optional(),
  })
  .strict();

const edicaoComum = {
  responsavelId: z.string().uuid().nullable().optional(),
  observacoes: textoOpcional(2000),
  justificativa: z.string().trim().max(1000).optional(),
};

/** Edição do vínculo, um schema por operação (a rota escolhe pela URL). */
export const editarVinculoSchemas = {
  TIM: z.object({ campos: camposTimSchema.default({}), ...edicaoComum }),
  STARLINK: z.object({ campos: camposStarlinkSchema.default({}), ...edicaoComum }),
};

export const notaSchema = z.object({
  texto: z.string().trim().min(1, 'Escreva a nota').max(5000),
});

export const vendedorSchema = z.object({
  /** Sem `id`, cria; com `id`, atualiza o vendedor do vínculo. */
  id: z.string().uuid().optional(),
  nome: z.string().trim().min(2, 'Nome muito curto').max(160),
  cpf: z
    .string()
    .trim()
    .transform(digitos)
    .refine((v) => v === '' || v.length === 11, 'Informe um CPF válido')
    .transform((v) => v || null)
    .nullable()
    .optional(),
  telefone: textoOpcional(30),
  /** Criação: padrão ATIVO. Atualização: omitido mantém o atual (não reativa em silêncio). */
  status: z.nativeEnum(StatusVendedor).optional(),
});

export type CriarVinculoInput = z.infer<typeof criarVinculoSchema>;
export type MoverVinculoInput = z.infer<typeof moverVinculoSchema>;
export type NotaInput = z.infer<typeof notaSchema>;
export type VendedorInput = z.infer<typeof vendedorSchema>;
