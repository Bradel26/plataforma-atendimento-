import { z } from 'zod';

export const STATUS_TICKET = [
  'ABERTO',
  'EM_ANDAMENTO',
  'AGUARDANDO_CLIENTE',
  'RESOLVIDO',
  'FECHADO',
] as const;

export const PRIORIDADES = ['BAIXA', 'NORMAL', 'ALTA', 'URGENTE'] as const;

const status = z.enum(STATUS_TICKET);
const prioridade = z.enum(PRIORIDADES);

export const criarTicketSchema = z.object({
  titulo: z.string().trim().min(3, 'Titulo muito curto').max(160),
  descricao: z.string().trim().min(3, 'Descreva o chamado').max(4000),
  prioridade: prioridade.default('NORMAL'),
  contatoId: z.string().uuid().nullable().optional(),
  contaId: z.string().uuid().nullable().optional(),
  conversaId: z.string().uuid().nullable().optional(),
  responsavelId: z.string().uuid().nullable().optional(),
  filaId: z.string().uuid().nullable().optional(),
  prazoSla: z.coerce.date().nullable().optional(),
});

export const atualizarTicketSchema = z
  .object({
    titulo: z.string().trim().min(3).max(160).optional(),
    descricao: z.string().trim().min(3).max(4000).optional(),
    status: status.optional(),
    prioridade: prioridade.optional(),
    responsavelId: z.string().uuid().nullable().optional(),
    filaId: z.string().uuid().nullable().optional(),
    contatoId: z.string().uuid().nullable().optional(),
    contaId: z.string().uuid().nullable().optional(),
    prazoSla: z.coerce.date().nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Informe ao menos um campo' });

export const listarTicketsSchema = z.object({
  status: status.optional(),
  prioridade: prioridade.optional(),
  responsavelId: z.string().uuid().optional(),
  filaId: z.string().uuid().optional(),
  contatoId: z.string().uuid().optional(),
  contaId: z.string().uuid().optional(),
  /** Somente chamados com SLA vencido e ainda em aberto. */
  slaVencido: z.enum(['true', 'false']).optional(),
  busca: z.string().trim().min(1).optional(),
  limite: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.string().optional(),
});

export const comentarioSchema = z.object({
  conteudo: z.string().trim().min(1, 'Escreva o comentario').max(4000),
  /** Nota interna por padrao — resposta ao cliente exige interno=false explicito. */
  interno: z.boolean().default(true),
});

export const anexoSchema = z.object({
  nome: z.string().trim().min(1).max(200),
  url: z.string().url('Informe a URL do arquivo'),
  tipo: z.string().trim().max(80).nullable().optional(),
  tamanho: z.number().int().positive().nullable().optional(),
});

export const agendamentoSchema = z.object({
  titulo: z.string().trim().min(3).max(160),
  inicio: z.coerce.date(),
  fim: z.coerce.date().nullable().optional(),
  responsavelId: z.string().uuid().nullable().optional(),
});

export type CriarTicketInput = z.infer<typeof criarTicketSchema>;
export type AtualizarTicketInput = z.infer<typeof atualizarTicketSchema>;
export type ListarTicketsQuery = z.infer<typeof listarTicketsSchema>;
export type AgendamentoInput = z.infer<typeof agendamentoSchema>;
