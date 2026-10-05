import type { ConversaResumo } from '../../lib/types';

/**
 * Abas do Atendimento, organizadas pelo NUMERO de WhatsApp (2026-10-05), nao
 * pelo responsavel:
 *  - Minhas: conversas de qualquer numero meu
 *  - Fila: o que esta atribuido a mim de outros numeros + espera das minhas filas
 *  - Acompanhar: o que posso ver dos outros numeros (ADMIN e SUPERVISOR)
 *
 * Uma camada ACIMA de `ConversaStatus`: o status continua com os quatro valores
 * de sempre, e a aba so escolhe como consultar/filtrar.
 */
export type VisaoInbox = 'MINHAS' | 'FILA' | 'ACOMPANHAR';

export const VISOES_INBOX: readonly VisaoInbox[] = ['MINHAS', 'FILA', 'ACOMPANHAR'];

export const LABEL_VISAO_INBOX: Record<VisaoInbox, string> = {
  MINHAS: 'Minhas',
  FILA: 'Fila',
  ACOMPANHAR: 'Acompanhar',
};

/** Seletor de Acompanhar. `donoId` nulo = todos os usuarios permitidos; 'EMPRESA' = Numero da empresa. */
export type FiltroAcompanhar = { donoId: string | null; canalConfigId: string | null };
export const SEM_FILTRO_ACOMPANHAR: FiltroAcompanhar = { donoId: null, canalConfigId: null };

export const visoesDisponiveis = (podeAcompanhar: boolean): readonly VisaoInbox[] =>
  podeAcompanhar ? VISOES_INBOX : VISOES_INBOX.filter((v) => v !== 'ACOMPANHAR');

/**
 * Query de `GET /conversas` para a aba. O seletor so vale em Acompanhar — a API
 * recusa `donoId`/`canalConfigId` em qualquer outra aba.
 */
export function parametrosDaVisao(visao: VisaoInbox, filtro: FiltroAcompanhar): Record<string, string> {
  const p: Record<string, string> = { visao };
  if (visao === 'ACOMPANHAR') {
    if (filtro.donoId) p.donoId = filtro.donoId;
    if (filtro.canalConfigId) p.canalConfigId = filtro.canalConfigId;
  }
  return p;
}

export type ContextoDaVisao = {
  meuUsuarioId: string | null;
  /** Filas em que atuo — vem de `GET /conversas/contadores`. */
  minhasFilaIds: readonly string[];
  filtro: FiltroAcompanhar;
};

type Campos = Pick<ConversaResumo, 'status' | 'agente' | 'fila' | 'linha'>;

/**
 * Uma conversa que chegou pelo socket entra na aba ativa?
 *
 * So decide a ABA. Quem pode ver ja foi decidido pelo servidor ao escolher as
 * salas (`realtime/hub.ts`) — nenhuma regra de perfil e reimplementada aqui.
 * Espelha `filtroDaVisao` (api, conversations.visao.ts).
 */
export function pertenceAVisao(conversa: Campos, visao: VisaoInbox, ctx: ContextoDaVisao): boolean {
  const eu = ctx.meuUsuarioId;
  const dono = conversa.linha?.donoId ?? null;
  const doMeuNumero = eu !== null && dono === eu;

  switch (visao) {
    case 'MINHAS':
      return doMeuNumero;
    case 'FILA':
      if (doMeuNumero) return false;
      if (eu !== null && conversa.agente?.id === eu) return true;
      return conversa.status === 'EM_ESPERA' && conversa.fila !== null && ctx.minhasFilaIds.includes(conversa.fila.id);
    case 'ACOMPANHAR': {
      if (doMeuNumero) return false;
      const { donoId, canalConfigId } = ctx.filtro;
      if (donoId === 'EMPRESA' && dono !== null) return false;
      if (donoId && donoId !== 'EMPRESA' && dono !== donoId) return false;
      if (canalConfigId && conversa.linha?.id !== canalConfigId) return false;
      return true;
    }
  }
}

/**
 * Pertence a LISTA (aba + arquivamento). Arquivada sai de todas as abas antes
 * de qualquer outra regra: o evento de socket carrega a conversa inteira sem
 * saber que filtro a tela pediu — sem isto, arquivar a deixaria visivel ate a
 * proxima consulta (Fase 11.9-B).
 */
export function pertenceALista(
  conversa: Campos & Pick<ConversaResumo, 'arquivada'>,
  visao: VisaoInbox,
  ctx: ContextoDaVisao,
): boolean {
  if (conversa.arquivada) return false;
  return pertenceAVisao(conversa, visao, ctx);
}
