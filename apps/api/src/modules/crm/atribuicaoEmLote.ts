/**
 * Atribuicao de responsavel em lote (CRM > Acompanhamentos > "Precisam de contato").
 *
 * Regras (decididas para nunca causar contato nem sobrescrever o trabalho de alguem):
 * - so atribui onde o credenciamento NAO tem responsavel; nunca troca o de ninguem;
 * - ids repetidos contam uma vez; ids que o usuario nao enxerga contam como "nao encontrados";
 * - e so uma mudanca de carteira interna: nao envia mensagem, nao cria atividade, nao chama o parceiro.
 */
export type ItemParaAtribuir = { id: string; responsavelId: string | null };

export type PlanoDeAtribuicao = {
  paraAtribuir: string[];
  jaTemResponsavel: string[];
  naoEncontrados: string[];
};

export function planejarAtribuicao(idsPedidos: string[], encontrados: ItemParaAtribuir[]): PlanoDeAtribuicao {
  const unicos = [...new Set(idsPedidos)];
  const porId = new Map(encontrados.map((i) => [i.id, i]));
  const plano: PlanoDeAtribuicao = { paraAtribuir: [], jaTemResponsavel: [], naoEncontrados: [] };
  for (const id of unicos) {
    const item = porId.get(id);
    if (!item) plano.naoEncontrados.push(id);
    else if (item.responsavelId) plano.jaTemResponsavel.push(id);
    else plano.paraAtribuir.push(id);
  }
  return plano;
}

export const MAXIMO_POR_LOTE = 200;
