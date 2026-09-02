import { z } from 'zod';
import { MAXIMO_POR_REGISTRO, TAMANHO_MAXIMO, normalizarTags } from '../../lib/tags';

export const listarConversasSchema = z.object({
  status: z.enum(['EM_ESPERA', 'ATRIBUIDO', 'EM_ATENDIMENTO', 'FINALIZADO']).optional(),
  /** minhas=true limita as conversas atribuidas ao usuario autenticado. */
  minhas: z.enum(['true', 'false']).optional(),
  busca: z.string().trim().min(1).optional(),
  /**
   * Filtro por etiqueta, repetivel: `?tags=boleto&tags=urgente`.
   *
   * Mesma forma e mesma semantica **E** do filtro de contato e conta, incluindo
   * a normalizacao — `?tags=Boleto` tem de achar a conversa salva como
   * `boleto`, e normalizar na escrita sem normalizar no filtro deixaria o
   * registro invisivel para a propria busca.
   */
  tags: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (v === undefined ? [] : normalizarTags(Array.isArray(v) ? v : [v]))),
  limite: z.coerce.number().int().min(1).max(100).default(50),
  /** Cursor opaco devolvido pela pagina anterior. */
  cursor: z.string().optional(),
});

/**
 * Etiquetas da conversa, substituindo a lista inteira.
 *
 * Substituir, e nao adicionar/remover uma a uma: a tela edita a lista como um
 * conjunto, e um par de rotas `POST /etiquetas` + `DELETE /etiquetas/:tag`
 * geraria duas requisicoes para cada arrastar de chip, com estado intermediario
 * visivel para os outros atendentes pelo WebSocket.
 */
export const definirTagsSchema = z.object({
  tags: z.array(z.string().trim().min(1).max(TAMANHO_MAXIMO)).max(MAXIMO_POR_REGISTRO),
});

export const listarMensagensSchema = z.object({
  limite: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
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
export type DefinirTagsInput = z.infer<typeof definirTagsSchema>;
