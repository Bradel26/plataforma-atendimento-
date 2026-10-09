const URL = /https?:\/\/[^\s<]+/g;
const PONTUACAO_FINAL = /[.,;:!?)\]]+$/;

/** Só transforma URLs HTTP(S) em links; outros esquemas permanecem como texto. */
export function partesComLinks(texto: string): Array<{ texto: string; href?: string }> {
  const partes: Array<{ texto: string; href?: string }> = [];
  let ultimo = 0;
  for (const achado of texto.matchAll(URL)) {
    const inicio = achado.index ?? 0;
    let url = achado[0];
    const sobra = url.match(PONTUACAO_FINAL)?.[0] ?? '';
    if (sobra) url = url.slice(0, -sobra.length);
    if (inicio > ultimo) partes.push({ texto: texto.slice(ultimo, inicio) });
    partes.push({ texto: url, href: url });
    ultimo = inicio + url.length;
  }
  if (ultimo < texto.length) partes.push({ texto: texto.slice(ultimo) });
  return partes.length ? partes : [{ texto }];
}
