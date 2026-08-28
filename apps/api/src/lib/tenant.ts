import { AsyncLocalStorage } from 'node:async_hooks';
import { AppError } from './errors';

/**
 * Contexto de organizacao da operacao em andamento.
 *
 * Toda requisicao autenticada, todo trabalho da fila e todo webhook resolvido
 * abrem este contexto antes de tocar no banco. A extensao do Prisma (ver
 * `prisma.ts`) le daqui e injeta o filtro — e por isso que nenhum service
 * precisa mencionar organizacao para estar isolado.
 *
 * A regra que sustenta o desenho: **ausencia de contexto lanca**. O modo de
 * falha classico de multi-tenancy e o filtro que, sem valor, vira "sem filtro";
 * aqui ele vira excecao. Quem legitimamente atravessa organizacoes (login,
 * webhook antes de resolver o canal, worker antes de ler o trabalho) diz isso em
 * voz alta com `semOrganizacao`, que existe em poucos lugares e e facil de
 * auditar por busca.
 */

type Contexto = {
  organizacaoId: string;
  /** Marca o trecho que atravessa organizacoes de proposito. */
  irrestrito?: boolean;
  /** Por que atravessa. So para diagnostico; aparece no erro se algo escapar. */
  motivo?: string;
};

const armazem = new AsyncLocalStorage<Contexto>();

/** Id da organizacao inicial, criada pela migration `organizacao`. */
export const ORGANIZACAO_INICIAL = '00000000-0000-0000-0000-000000000001';

/** Roda `fn` com a organizacao ativa. Tudo dentro fica isolado nela. */
export function comOrganizacao<T>(organizacaoId: string, fn: () => T): T {
  if (!organizacaoId) throw new Error('comOrganizacao recebeu id vazio');
  return armazem.run({ organizacaoId }, fn);
}

/**
 * Roda `fn` sem filtro de organizacao, de proposito.
 *
 * Tres usos legitimos, e nenhum outro deveria aparecer numa revisao:
 *   - login: resolve o usuario pelo e-mail antes de saber a organizacao dele;
 *   - webhook de canal: descobre a organizacao pelo identificador externo que
 *     vem no corpo (phone_number_id, page_id) antes de poder abrir o contexto;
 *   - worker: le o trabalho da fila antes de saber de quem ele e.
 *
 * O `motivo` nao e decorativo: ele entra na mensagem de erro quando um trecho
 * irrestrito acaba fazendo escrita, que e o unico jeito de essa valvula virar
 * vazamento.
 */
export function semOrganizacao<T>(motivo: string, fn: () => T): T {
  return armazem.run({ organizacaoId: '', irrestrito: true, motivo }, fn);
}

/** Contexto atual, ou `undefined` fora de qualquer contexto. */
export const contextoAtual = () => armazem.getStore();

/**
 * Id da organizacao atual. Lanca se nao houver contexto ou se ele for
 * irrestrito — quem precisa do id nao pode estar num trecho que atravessa
 * organizacoes.
 */
export function organizacaoAtual(): string {
  const ctx = armazem.getStore();
  if (!ctx) {
    throw new AppError(
      500,
      'SEM_CONTEXTO_ORGANIZACAO',
      'Operacao sem organizacao ativa. Abra o contexto com comOrganizacao, ou declare a excecao com semOrganizacao.',
    );
  }
  if (ctx.irrestrito) {
    throw new AppError(
      500,
      'CONTEXTO_IRRESTRITO',
      `Operacao exige organizacao mas o contexto e irrestrito (${ctx.motivo ?? 'sem motivo'}).`,
    );
  }
  return ctx.organizacaoId;
}

/** Id da organizacao atual, ou `null` em contexto irrestrito. Nao lanca. */
export function organizacaoAtualOuNula(): string | null {
  const ctx = armazem.getStore();
  if (!ctx) {
    throw new AppError(
      500,
      'SEM_CONTEXTO_ORGANIZACAO',
      'Operacao sem organizacao ativa. Abra o contexto com comOrganizacao, ou declare a excecao com semOrganizacao.',
    );
  }
  return ctx.irrestrito ? null : ctx.organizacaoId;
}
