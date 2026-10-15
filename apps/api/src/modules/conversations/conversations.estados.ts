import type { ConversationStatus } from '@prisma/client';

/**
 * Estados de "atendimento ativo": atribuida a alguem e nao finalizada, seja
 * esperando o agente agir ou esperando o cliente responder. Usado nos
 * paineis de carga (quantas conversas cada agente/fila tem em andamento) para
 * nao perder conversas que so estao aguardando o cliente responder.
 */
export const EM_ATENDIMENTO_ATIVO: readonly ConversationStatus[] = [
  'ATRIBUIDO',
  'EM_ATENDIMENTO',
  'AGUARDANDO_CLIENTE',
];

/**
 * Status depois que o AGENTE (ou o dono pelo celular) fala com o cliente.
 *
 * Nota interna nunca sai pelo canal externo — nao e "falar com o cliente", e
 * so avanca EM_ESPERA para ATRIBUIDO (a nota tambem assume a conversa, mas
 * ninguem do lado de fora foi avisado ainda). Fora isso, nota interna
 * preserva o status atual: uma nota numa conversa ja ATRIBUIDO/EM_ATENDIMENTO/
 * AGUARDANDO_CLIENTE nao muda nada do ponto de vista do cliente.
 *
 * Mensagem de verdade sempre poe em AGUARDANDO_CLIENTE: e exatamente o que
 * aconteceu — alguem respondeu, agora e a vez do cliente.
 */
export function aoFalarComCliente(atual: ConversationStatus, interno: boolean): ConversationStatus {
  if (interno) return atual === 'EM_ESPERA' ? 'ATRIBUIDO' : atual;
  return 'AGUARDANDO_CLIENTE';
}

/**
 * Status depois que o CLIENTE escreve (canal externo ou Webchat).
 *
 * So existe uma transicao: de AGUARDANDO_CLIENTE (agente ja tinha respondido e
 * esperava) de volta para EM_ATENDIMENTO (e a vez do agente de novo). Qualquer
 * outro status fica como esta — em especial EM_ESPERA (ninguem assumiu ainda,
 * cliente so engrossa a fila) e ATRIBUIDO (agente assumiu mas ainda nao
 * respondeu nada; mais uma mensagem do cliente nao muda isso).
 */
export function aoReceberDoCliente(atual: ConversationStatus): ConversationStatus {
  return atual === 'AGUARDANDO_CLIENTE' ? 'EM_ATENDIMENTO' : atual;
}
