import { badRequest } from './errors';

/**
 * Paginacao por cursor (keyset).
 *
 * `skip`/`offset` degrada em lista grande — o banco varre e joga fora tudo o que
 * vem antes — e ainda pula ou repete item quando a lista muda entre as paginas,
 * que num painel de atendimento em tempo real acontece a cada mensagem. O cursor
 * carrega "de onde continuar" e nao sofre nenhum dos dois problemas.
 *
 * O cursor e opaco de proposito: quem consome nao deve depender do formato.
 */
export type Cursor = { valor: Date; id: string };

export const codificarCursor = ({ valor, id }: Cursor) =>
  Buffer.from(`${valor.toISOString()}|${id}`).toString('base64url');

export function decodificarCursor(cursor: string | undefined): Cursor | null {
  if (!cursor) return null;

  const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const valor = iso ? new Date(iso) : new Date(Number.NaN);
  if (!id || Number.isNaN(valor.getTime())) throw badRequest('Cursor invalido');
  return { valor, id };
}

/**
 * Filtro do Prisma para "depois deste ponto" em ordem decrescente.
 *
 * O desempate por id e obrigatorio: duas conversas com o mesmo
 * `ultimaMensagemEm` (mesmo milissegundo) fariam o cursor pular uma delas.
 */
export function apos(campo: string, cursor: Cursor | null) {
  if (!cursor) return undefined;
  return {
    OR: [{ [campo]: { lt: cursor.valor } }, { [campo]: cursor.valor, id: { lt: cursor.id } }],
  };
}

/**
 * Corta a pagina e devolve o cursor seguinte. Busca-se `limite + 1` registros:
 * o extra e o que diz se existe proxima pagina, sem um COUNT a mais.
 */
export function fatiar<T extends { id: string }>(
  registros: T[],
  limite: number,
  campo: (item: T) => Date,
) {
  const temMais = registros.length > limite;
  const itens = temMais ? registros.slice(0, limite) : registros;
  const ultimo = itens.at(-1);

  return {
    itens,
    proximoCursor: temMais && ultimo ? codificarCursor({ valor: campo(ultimo), id: ultimo.id }) : null,
  };
}
