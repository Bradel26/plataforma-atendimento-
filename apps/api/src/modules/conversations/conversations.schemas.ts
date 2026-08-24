import { z } from 'zod';

export const listarConversasSchema = z.object({
  status: z.enum(['EM_ESPERA', 'ATRIBUIDO', 'EM_ATENDIMENTO', 'FINALIZADO']).optional(),
  /** minhas=true limita as conversas atribuidas ao usuario autenticado. */
  minhas: z.enum(['true', 'false']).optional(),
  busca: z.string().trim().min(1).optional(),
  limite: z.coerce.number().int().min(1).max(100).default(50),
});

export const enviarMensagemSchema = z.object({
  conteudo: z.string().trim().min(1, 'Escreva uma mensagem').max(4000),
});

export const transferirSchema = z
  .object({
    agenteId: z.string().uuid().optional(),
    filaId: z.string().uuid().optional(),
    motivo: z.string().trim().max(280).optional(),
  })
  .refine((d) => Boolean(d.agenteId) !== Boolean(d.filaId), {
    message: 'Informe agenteId (transferir para agente) ou filaId (devolver para fila), nunca os dois',
  });

export type ListarConversasQuery = z.infer<typeof listarConversasSchema>;
export type TransferirInput = z.infer<typeof transferirSchema>;
