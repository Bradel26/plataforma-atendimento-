import { z } from 'zod';

const canal = z.enum(['WEBCHAT', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'EMAIL', 'VOZ']);

export const createQueueSchema = z.object({
  nome: z.string().min(2, 'Nome muito curto').max(80),
  descricao: z.string().max(280).optional(),
  canalPadrao: canal.default('WEBCHAT'),
});

export const updateQueueSchema = z
  .object({
    nome: z.string().min(2).max(80).optional(),
    descricao: z.string().max(280).nullable().optional(),
    canalPadrao: canal.optional(),
    ativa: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Informe ao menos um campo' });

export const vincularAgenteSchema = z.object({ usuarioId: z.string().uuid('usuarioId invalido') });
