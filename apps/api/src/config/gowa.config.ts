/**
 * Configuracao global de conexao com o GOWA (go-whatsapp-web-multidevice).
 *
 * Mesmo desenho do `waha.config.ts`: infraestrutura da instalacao, nunca dado
 * de negocio por organizacao. So a sessao (que vira `X-Device-Id`) varia por
 * linha. Le `process.env` direto, para nao depender da validacao completa de
 * `env.ts` so para montar uma URL.
 */

function lida(nome: string): string | null {
  return process.env[nome]?.trim() || null;
}

export type ConfigGowa = {
  /** Endereco interno do GOWA, sem barra no fim. Ex.: http://gowa:3000 */
  url: string;
};

/** `null` quando `GOWA_BASE_URL` nao foi definida (GOWA fora de uso nesta instalacao). */
export function obterConfigGowa(): ConfigGowa | null {
  const url = lida('GOWA_BASE_URL');
  if (!url) return null;
  return { url: url.replace(/\/+$/, '') };
}

/**
 * Segredo do webhook de ENTRADA (GOWA -> nos), conferido via `?secret=` na
 * URL: o GOWA de referencia nao assina eventos (sem HMAC), mesma situacao do
 * WPPConnect.
 */
export function obterSegredoWebhookGowa(): string | null {
  return lida('GOWA_WEBHOOK_SECRET');
}

/**
 * A `ponteSessao` da UNICA linha desta instalacao de GOWA (v1 = uma linha por
 * instancia — ver spec, "Limite conhecido da v1"). O corpo do webhook do GOWA
 * nao diz de qual linha veio o evento; sem esta variavel, toda mensagem
 * recebida cai como sessao desconhecida e e descartada.
 */
export function obterSessaoFixaGowa(): string | null {
  return lida('GOWA_SESSAO');
}
