/**
 * Texto que na verdade e o conteudo binario de uma midia em base64.
 *
 * O WhatsApp Web entrega, no `body` de uma mensagem de foto/figurinha/video, a
 * MINIATURA em base64 (comeca com `/9j/` para JPEG). Tratada como legenda, ela
 * virava um texto de milhares de caracteres na conversa. Texto humano tem
 * espacos; blob base64 nao tem e e longo.
 */
export function pareceBase64DeMidia(texto: string): boolean {
  const t = texto.trim();
  return t.length >= 120 && !/\s/.test(t) && /^[A-Za-z0-9+/_-]+={0,2}$/.test(t);
}

/** Enderecos do WhatsApp que nao sao uma pessoa: status (stories), listas de transmissao e canais. */
export function enderecoNaoEPessoa(endereco: string): boolean {
  return /@(broadcast|newsletter)$/i.test(endereco.trim());
}
