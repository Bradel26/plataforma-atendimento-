/**
 * Log estruturado: uma linha JSON por evento, com campos que dao para
 * filtrar (`camada`, `organizacaoId`, `canalConfigId`, `sessaoExterna`,
 * `idExterno`...).
 *
 * Existe porque "mensagem nao chegou" so se investiga cruzando camadas —
 * webhook, provider, sessao, mensagem — e `console.log` com frase livre nao
 * se cruza. Comecou pelo WAHA; o resto do codigo migra quando for tocado.
 *
 * NUNCA passe aqui credencial, corpo de mensagem, QR ou payload cru: os
 * campos sao gravados como vierem. Identificador sim, conteudo nao.
 */

export type Camada = 'webhook' | 'provider' | 'sessao' | 'mensagem' | 'canal';
type Nivel = 'info' | 'warn' | 'error';
type Campos = Record<string, string | number | boolean | null | undefined>;

function escrever(nivel: Nivel, camada: Camada, msg: string, campos: Campos) {
  const linha = JSON.stringify({ nivel, camada, msg, ...campos, em: new Date().toISOString() });
  if (nivel === 'error') console.error(linha);
  else if (nivel === 'warn') console.warn(linha);
  else console.log(linha);
}

export const log = {
  info: (camada: Camada, msg: string, campos: Campos = {}) => escrever('info', camada, msg, campos),
  warn: (camada: Camada, msg: string, campos: Campos = {}) => escrever('warn', camada, msg, campos),
  error: (camada: Camada, msg: string, campos: Campos = {}) => escrever('error', camada, msg, campos),
};
