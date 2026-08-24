import { z } from 'zod';

export const FASES = ['NOVO', 'QUALIFICACAO', 'PROPOSTA', 'NEGOCIACAO', 'GANHO', 'PERDIDO'] as const;
export const TIPOS = ['INBOUND', 'OUTBOUND', 'INDICACAO', 'PARCEIRO'] as const;
export const MOTIVOS_PERDA = [
  'PRECO',
  'SEM_INTERESSE',
  'CONCORRENTE',
  'SEM_BUDGET',
  'SEM_RESPOSTA',
  'OUTRO',
] as const;
const CANAIS = ['WEBCHAT', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'EMAIL', 'VOZ'] as const;

const fase = z.enum(FASES);
const dataOpcional = z.coerce.date().optional();

export const criarLeadSchema = z.object({
  contatoId: z.string().uuid('Informe um contato valido'),
  contaId: z.string().uuid().nullable().optional(),
  fase: fase.default('NOVO'),
  tipo: z.enum(TIPOS).default('INBOUND'),
  responsavelId: z.string().uuid().nullable().optional(),
  prazo: dataOpcional,
  canalOrigem: z.enum(CANAIS).default('WEBCHAT'),
  valorEstimado: z.number().nonnegative().nullable().optional(),
  observacoes: z.string().trim().max(2000).nullable().optional(),
});

export const atualizarLeadSchema = z
  .object({
    contaId: z.string().uuid().nullable().optional(),
    fase: fase.optional(),
    tipo: z.enum(TIPOS).optional(),
    responsavelId: z.string().uuid().nullable().optional(),
    prazo: z.coerce.date().nullable().optional(),
    canalOrigem: z.enum(CANAIS).optional(),
    motivoPerda: z.enum(MOTIVOS_PERDA).nullable().optional(),
    valorEstimado: z.number().nonnegative().nullable().optional(),
    observacoes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Informe ao menos um campo' })
  .refine((d) => d.fase !== 'PERDIDO' || d.motivoPerda !== null, {
    message: 'Ao marcar como PERDIDO informe o motivo da perda',
    path: ['motivoPerda'],
  });

/** Filtros avancados exigidos pelo escopo da Fase 2. */
export const listarLeadsSchema = z.object({
  fase: fase.optional(),
  tipo: z.enum(TIPOS).optional(),
  responsavelId: z.string().uuid().optional(),
  canalOrigem: z.enum(CANAIS).optional(),
  motivoPerda: z.enum(MOTIVOS_PERDA).optional(),
  contaId: z.string().uuid().optional(),
  /** Leads com prazo vencido e ainda em aberto. */
  atrasados: z.enum(['true', 'false']).optional(),
  criadoDe: dataOpcional,
  criadoAte: dataOpcional,
  busca: z.string().trim().min(1).optional(),
  limite: z.coerce.number().int().min(1).max(200).default(100),
});

export type CriarLeadInput = z.infer<typeof criarLeadSchema>;
export type AtualizarLeadInput = z.infer<typeof atualizarLeadSchema>;
export type ListarLeadsQuery = z.infer<typeof listarLeadsSchema>;
