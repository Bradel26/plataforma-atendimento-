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

// ---------------------------------------------------------------------------
// Consultas (os filtros vêm de `parseFiltros`, na mesma query string)
// ---------------------------------------------------------------------------

/** Kanban: tamanho da página de cada coluna. */
export const kanbanQuerySchema = z.object({
  porColuna: z.coerce.number().int().min(1).max(100).default(50),
});

/** "Carregar mais" de uma coluna: cursor opaco devolvido em `proximoCursor`. */
export const kanbanColunaQuerySchema = kanbanQuerySchema.extend({
  cursor: z.string().trim().max(300).optional(),
});

/** Lista: paginação por offset; `ordenarPor` é a chave de uma coluna ordenável da operação. */
export const listaQuerySchema = z.object({
  pagina: z.coerce.number().int().min(1).max(100_000).default(1),
  tamanho: z.coerce.number().int().min(1).max(100).default(50),
  ordenarPor: z.string().trim().max(60).optional(),
  direcao: z.enum(['asc', 'desc']).default('asc'),
});

/** Teto de ids numa exportação por seleção (a seleção da Lista respeita o mesmo limite). */
export const LIMITE_IDS_EXPORTACAO = 1000;

/** `ids` da seleção: CSV ou parâmetro repetido, sem repetição; vazio = sem seleção. */
const idsDaSelecao = z.preprocess(
  (v) => {
    const itens = (Array.isArray(v) ? v : [v])
      .flatMap((x) => String(x ?? '').split(','))
      .map((s) => s.trim())
      .filter(Boolean);
    return itens.length ? [...new Set(itens)] : undefined;
  },
  z.array(z.string().uuid('Id inválido na seleção')).max(LIMITE_IDS_EXPORTACAO, `Selecione no máximo ${LIMITE_IDS_EXPORTACAO} parceiros`).optional(),
);

/**
 * Exportação: formato, colunas (chaves separadas por vírgula; vazio = as padrão),
 * a ordenação da Lista e, opcionalmente, os `ids` selecionados (em AND com os filtros).
 */
export const exportarQuerySchema = z.object({
  formato: z.enum(['csv', 'xlsx']).default('csv'),
  colunas: z.string().trim().max(2000).optional(),
  ordenarPor: z.string().trim().max(60).optional(),
  direcao: z.enum(['asc', 'desc']).default('asc'),
  ids: idsDaSelecao,
});

/** POST da exportação: a seleção no corpo (os demais parâmetros seguem na query). */
export const exportarCorpoSchema = z.object({ ids: idsDaSelecao });
export type ExportarCorpo = z.infer<typeof exportarCorpoSchema>;

/** Campos de texto do multipart da importação: `mapa` (JSON cabeçalho → chave ou nulo) e `previa`. */
export const importarCorpoSchema = z.object({
  mapa: z
    .string()
    .trim()
    .optional()
    .transform((texto, ctx) => {
      if (!texto) return undefined;
      try {
        return JSON.parse(texto) as unknown;
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'O mapa de colunas não é um JSON válido' });
        return z.NEVER;
      }
    })
    .pipe(z.record(z.string(), z.string().max(60).nullable()).optional()),
  previa: z
    .preprocess((v) => v === true || v === 'true' || v === '1', z.boolean())
    .default(false),
});

export type CriarVinculoInput = z.infer<typeof criarVinculoSchema>;
export type ExportarQuery = z.infer<typeof exportarQuerySchema>;
export type MoverVinculoInput = z.infer<typeof moverVinculoSchema>;
export type NotaInput = z.infer<typeof notaSchema>;
export type VendedorInput = z.infer<typeof vendedorSchema>;
export type KanbanQuery = z.infer<typeof kanbanQuerySchema>;
export type KanbanColunaQuery = z.infer<typeof kanbanColunaQuerySchema>;
export type ListaQuery = z.infer<typeof listaQuerySchema>;

/** Configuração de etapa pelo ADMIN: só nome e limite de dias parado (nunca ordem, tipo ou chave). */
export const configEtapaSchema = z
  .object({
    nome: z.string().trim().min(1, 'Informe o nome da etapa').max(60, 'Nome com no máximo 60 caracteres').optional(),
    diasParado: z.number().int('Use dias inteiros').min(1, 'Mínimo 1 dia').max(365, 'Máximo 365 dias').nullable().optional(),
  })
  .strict()
  .refine((d) => d.nome !== undefined || d.diasParado !== undefined, { message: 'Informe o nome ou os dias parado' });
export type ConfigEtapaInput = z.infer<typeof configEtapaSchema>;
