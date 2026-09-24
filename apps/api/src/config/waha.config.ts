/**
 * Configuracao global de conexao com o WAHA (WhatsApp HTTP API).
 *
 * Mesmo desenho do `wppconnect.config.ts`: a conexao com o servidor e
 * infraestrutura da instalacao, nunca dado de negocio por organizacao — so a
 * sessao (`ChannelConfig.ponteSessao`) varia por linha. Le `process.env`
 * direto, como os outros arquivos de `config/`, para o client nao depender
 * da validacao completa de `env.ts` (banco, JWT) so para montar uma URL.
 */

function lida(nome: string): string | null {
  return process.env[nome]?.trim() || null;
}

export type ConfigWaha = {
  /** Endereco interno do WAHA, sem barra no fim. Ex.: http://waha:3000 */
  url: string;
  /** Chave em texto puro, enviada em `X-Api-Key` (o container recebe a mesma, ou o hash dela). */
  apiKey: string;
};

/**
 * `null` quando `WAHA_BASE_URL` nao foi definida (WAHA fora de uso nesta
 * instalacao). Lanca quando a URL existe sem a chave: o WAHA exposto sem
 * autenticacao seria recusado em toda chamada, e descobrir isso so no
 * primeiro envio adiaria um erro de configuracao para dentro do atendimento.
 */
export function obterConfigWaha(): ConfigWaha | null {
  const url = lida('WAHA_BASE_URL');
  const apiKey = lida('WAHA_API_KEY');

  if (!url) return null;
  if (!apiKey) {
    throw new Error('Configuracao do WAHA incompleta: defina WAHA_API_KEY junto com WAHA_BASE_URL.');
  }
  return { url: url.replace(/\/+$/, ''), apiKey };
}

/**
 * Segredo do webhook de ENTRADA (WAHA -> nos).
 *
 * Vai em dois lugares da configuracao da sessao: `?secret=` na URL do webhook
 * e a chave do HMAC (`X-Webhook-Hmac`). Os dois porque a edicao Core do WAHA
 * nao assina os eventos (medido pelo Deskcomm na 2026.7.2: chegam sem header
 * mesmo com a chave configurada) — o segredo na URL e a autenticacao que
 * sempre existe; a assinatura, quando vem, e conferida por cima.
 */
export function obterSegredoWebhookWaha(): string | null {
  return lida('WAHA_WEBHOOK_SECRET');
}

/**
 * URL que o WAHA chama a cada evento de uma sessao, gravada na propria
 * sessao quando ela e criada.
 *
 * `WAHA_WEBHOOK_BASE_URL` existe para apontar a rede interna (o WAHA e a API
 * no mesmo Coolify nao precisam dar a volta pela internet); sem ela vale o
 * endereco publico, pela mesma regra do WPPConnect (`PUBLIC_URL`, senao
 * `WEB_ORIGIN`).
 *
 * `null` quando falta o segredo ou o endereco: uma sessao criada assim
 * enviaria, mas nunca receberia nada.
 */
export function obterUrlWebhookWaha(): string | null {
  const segredo = obterSegredoWebhookWaha();
  const base = lida('WAHA_WEBHOOK_BASE_URL') ?? lida('PUBLIC_URL') ?? lida('WEB_ORIGIN');
  if (!segredo || !base) return null;
  return `${base.replace(/\/+$/, '')}/api/webhooks/providers/waha?secret=${encodeURIComponent(segredo)}`;
}
