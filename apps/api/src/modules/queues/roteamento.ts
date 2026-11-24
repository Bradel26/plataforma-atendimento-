import type { AgentStatus } from '@prisma/client';

/**
 * Escolha do proximo agente de uma fila (sugestao, nunca atribuicao).
 *
 * Regras, em ordem:
 * 1. so quem esta DISPONIVEL (pausa, offline e em atendimento manual ficam de fora);
 * 2. so quem esta abaixo do limite de conversas ativas;
 * 3. menor carga primeiro (conversas ativas);
 * 4. empate: quem recebeu atribuicao ha mais tempo (rodizio); quem nunca recebeu vem antes.
 *
 * Funcao pura: nao le banco nem relogio, para ser testavel e previsivel.
 */
export type CandidatoDeFila = {
  id: string;
  nome: string;
  status: AgentStatus;
  conversasAtivas: number;
  /** Quando recebeu a ultima conversa; null = nunca. */
  ultimaAtribuicaoEm: Date | null;
};

/** Decisao do negocio (24/11/2026): sem limite de conversas por agente. */
export const CAPACIDADE_PADRAO = Number.POSITIVE_INFINITY;

export type MotivoDeExclusao = 'indisponivel' | 'capacidade';

export function escolherAgenteDaFila(candidatos: CandidatoDeFila[], capacidadeMaxima = CAPACIDADE_PADRAO) {
  const excluidos: Array<{ id: string; nome: string; motivo: MotivoDeExclusao }> = [];
  const elegiveis: CandidatoDeFila[] = [];
  for (const c of candidatos) {
    if (c.status !== 'DISPONIVEL') excluidos.push({ id: c.id, nome: c.nome, motivo: 'indisponivel' });
    else if (c.conversasAtivas >= capacidadeMaxima) excluidos.push({ id: c.id, nome: c.nome, motivo: 'capacidade' });
    else elegiveis.push(c);
  }
  elegiveis.sort((a, b) => {
    if (a.conversasAtivas !== b.conversasAtivas) return a.conversasAtivas - b.conversasAtivas;
    const ta = a.ultimaAtribuicaoEm?.getTime() ?? -Infinity;
    const tb = b.ultimaAtribuicaoEm?.getTime() ?? -Infinity;
    if (ta !== tb) return ta - tb;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
  return { sugerido: elegiveis[0] ?? null, elegiveis, excluidos };
}
