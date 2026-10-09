import type { ConversaResumo } from '../../lib/types';

export type GrupoCaixa = { fila: { id: string; nome: string } | null; conversas: ConversaResumo[] };
const maisAntigaPrimeiro = (a: ConversaResumo, b: ConversaResumo) =>
  new Date(a.ultimaMensagemEm).getTime() - new Date(b.ultimaMensagemEm).getTime();

/** Atualiza a caixa pelo socket: remove a conversa de todos os grupos e a reinsere se ainda estiver aguardando. */
export function aplicarNaCaixa(grupos: GrupoCaixa[], conversa: ConversaResumo): GrupoCaixa[] {
  const esperando = conversa.status === 'EM_ESPERA' && !conversa.agente && !conversa.arquivada;
  const filaId = conversa.fila?.id ?? null;
  return grupos.map((grupo) => {
    const semEla = grupo.conversas.filter((c) => c.id !== conversa.id);
    const ehDoGrupo = esperando && (grupo.fila?.id ?? null) === filaId;
    return { ...grupo, conversas: ehDoGrupo ? [...semEla, conversa].sort(maisAntigaPrimeiro) : semEla };
  });
}
