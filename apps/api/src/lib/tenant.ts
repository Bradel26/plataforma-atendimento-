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

/**
 * Quem esta operando. Presente em requisicao autenticada; ausente em webhook e
 * em trabalho da fila, que nao tem usuario.
 *
 * Fica no contexto pelo mesmo motivo da organizacao: sem isso, cada politica de
 * visibilidade teria de ser costurada por parametro em todo servico do CRM, e o
 * dia em que alguem esquecesse de passar o solicitante a consulta voltaria sem
 * filtro. A organizacao e uma **fronteira** (o banco recusa o que atravessa); o
 * usuario e um **escopo** (o que ele enxerga dentro da propria organizacao), e
 * por isso o escopo mora em politicas explicitas, nao numa extensao do Prisma.
 */
export type UsuarioDoContexto = { id: string; perfil: string };

type Contexto = {
  organizacaoId: string;
  /** Marca o trecho que atravessa organizacoes de proposito. */
  irrestrito?: boolean;
  /** Por que atravessa. So para diagnostico; aparece no erro se algo escapar. */
  motivo?: string;
  usuario?: UsuarioDoContexto;
  /**
   * Cache de vida curta, do tamanho de uma requisicao.
   *
   * Guarda a **promessa**, nao o valor: duas politicas rodando em paralelo
   * pediriam o contexto de visibilidade ao mesmo tempo, e guardar so o valor
   * faria as duas consultarem o banco antes de qualquer uma gravar o resultado.
   */
  cache?: Map<string, Promise<unknown>>;
};

const armazem = new AsyncLocalStorage<Contexto>();

/** Id da organizacao inicial, criada pela migration `organizacao`. */
export const ORGANIZACAO_INICIAL = '00000000-0000-0000-0000-000000000001';

/**
 * Roda `fn` com a organizacao ativa. Tudo dentro fica isolado nela.
 *
 * O `usuario` e opcional porque webhook e worker legitimamente nao tem um. Quem
 * depende dele (as politicas de visibilidade) chama `usuarioAtual()`, que lanca
 * na ausencia — de novo, ausencia lanca em vez de virar "sem filtro".
 */
export function comOrganizacao<T>(organizacaoId: string, fn: () => T, usuario?: UsuarioDoContexto): T {
  if (!organizacaoId) throw new Error('comOrganizacao recebeu id vazio');
  return armazem.run({ organizacaoId, usuario }, fn);
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

/**
 * Quem esta operando, ou lanca.
 *
 * Lanca em vez de devolver nulo pelo mesmo motivo de `organizacaoAtual`: uma
 * politica de visibilidade sem usuario nao tem como decidir nada, e devolver
 * nulo faria o filtro sumir justamente onde ele importa.
 */
export function usuarioAtual(): UsuarioDoContexto {
  const ctx = armazem.getStore();
  if (!ctx?.usuario) {
    throw new AppError(
      500,
      'SEM_USUARIO_NO_CONTEXTO',
      'Operacao exige o usuario da requisicao. Politica de visibilidade nao se aplica a webhook nem a trabalho da fila.',
    );
  }
  return ctx.usuario;
}

/** Quem esta operando, ou `null`. Para quem trata a ausencia de proposito. */
export const usuarioAtualOuNulo = (): UsuarioDoContexto | null => armazem.getStore()?.usuario ?? null;

/**
 * Calcula uma vez por contexto e reaproveita.
 *
 * Existe para o contexto de visibilidade: ele custa duas consultas (filas e
 * equipe) e e pedido por cada politica que a requisicao usar. Sem isto, uma tela
 * que lista contatos, contas e atividades pagaria seis.
 *
 * Fora de qualquer contexto nao ha onde guardar, e a funcao apenas executa —
 * chamar de um teste de unidade nao deve exigir cerimonia.
 */
export function memoizado<T>(chave: string, produzir: () => Promise<T>): Promise<T> {
  const ctx = armazem.getStore();
  if (!ctx) return produzir();
  ctx.cache ??= new Map();
  const guardado = ctx.cache.get(chave);
  if (guardado) return guardado as Promise<T>;
  const promessa = produzir();
  ctx.cache.set(chave, promessa);
  return promessa;
}
