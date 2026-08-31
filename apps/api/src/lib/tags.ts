/**
 * Normalizacao de tags.
 *
 * Uma tag e uma etiqueta escrita a mao por quem atende, e por isso o mesmo
 * conceito chega de varias formas: `Revenda`, `revenda`, `revenda ` e
 * `Revenda  Goias`. Guardar como veio faz tres coisas ruins de uma vez: o
 * filtro perde registro (procurar `revenda` nao acha `Revenda`), a lista de
 * tags existentes cresce com duplicatas, e a gestao (renomear, remover) passa a
 * agir sobre uma variante so.
 *
 * A regra e a mesma na entrada e na consulta — e e por isso que ela mora aqui,
 * numa funcao, e nao repetida em cada rota: normalizar na escrita e esquecer no
 * filtro deixaria o registro salvo em minusculas invisivel para a busca.
 */

/** Limite por tag; o mesmo do schema de validacao. */
export const TAMANHO_MAXIMO = 30;
/** Limite por registro. Vinte etiquetas num contato ja e sintoma de outra coisa. */
export const MAXIMO_POR_REGISTRO = 20;

/**
 * Uma tag normalizada: sem espaco nas pontas, espacos internos colapsados,
 * minuscula.
 *
 * Acento e preservado de proposito: `Sao Paulo` e `sao paulo` sao a mesma coisa,
 * mas `açougue` e `acougue` sao palavras diferentes para quem le, e remover
 * acento tornaria a etiqueta pior do que quem a escreveu quis.
 */
export function normalizarTag(valor: string): string {
  return valor.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

/**
 * Normaliza a lista inteira, descarta vazias e remove duplicata preservando a
 * ordem em que a pessoa escreveu.
 *
 * `Set` sozinho resolveria a duplicata, mas perderia a ordem em alguns motores;
 * a ordem importa porque a primeira tag e a que aparece na lista compacta.
 */
export function normalizarTags(valores: readonly string[]): string[] {
  const vistas = new Set<string>();
  const saida: string[] = [];
  for (const bruto of valores) {
    const tag = normalizarTag(bruto);
    if (!tag || vistas.has(tag)) continue;
    vistas.add(tag);
    saida.push(tag);
  }
  return saida.slice(0, MAXIMO_POR_REGISTRO);
}
