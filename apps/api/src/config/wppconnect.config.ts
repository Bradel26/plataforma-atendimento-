/**
 * Configuracao global de conexao com o WPPConnect Server.
 *
 * Ao contrario da Ponte do Baileys (`ponte.config.ts`), aqui a conexao com o
 * servidor e sempre de infraestrutura, nunca dado de negocio por organizacao:
 * so a sessao (`ChannelConfig.ponteSessao`) varia por canal — a URL e as
 * credenciais do WPPConnect Server sao as mesmas para toda a instalacao.
 */

function lida(nome: string): string | null {
  return process.env[nome]?.trim() || null;
}

export type ConfigWppConnect = {
  url: string;
  /** Usada para gerar um token por sessao via `/generate-token`. */
  secretKey: string | null;
  /** Token fixo, quando ja gerado manualmente — pula o `/generate-token`. */
  token: string | null;
};

/**
 * `null` quando `WPP_CONNECT_URL` nao foi definida (WPPConnect nao esta em
 * uso nesta instalacao). Falha cedo (lanca) quando a URL foi definida mas
 * nenhuma forma de autenticacao (`WPP_CONNECT_SECRET_KEY` ou
 * `WPP_CONNECT_TOKEN`) foi: isso e sempre erro de configuracao, e silenciar
 * aqui so adiaria a falha para dentro de uma tentativa de envio.
 */
export function obterConfigWppConnect(): ConfigWppConnect | null {
  const url = lida('WPP_CONNECT_URL');
  const secretKey = lida('WPP_CONNECT_SECRET_KEY');
  const token = lida('WPP_CONNECT_TOKEN');

  if (!url) return null;
  if (!secretKey && !token) {
    throw new Error(
      'Configuracao do WPPConnect incompleta: defina WPP_CONNECT_SECRET_KEY (para gerar token por sessao) ' +
        'ou WPP_CONNECT_TOKEN (token fixo), junto com WPP_CONNECT_URL.',
    );
  }

  return { url, secretKey, token };
}

/**
 * Segredo do webhook de ENTRADA (WPPConnect -> nos), independente das
 * credenciais de SAIDA acima (nos -> WPPConnect).
 *
 * O WPPConnect Server nao assina o que envia (nao ha HMAC nem header proprio
 * — ver `callWebHook` no codigo dele: `api.post(webhook, data)`, sem
 * cabecalho nenhum). Por isso a autenticacao aqui e um segredo simples,
 * enviado por quem CONFIGURA o webhook (`?secret=...` na URL cadastrada no
 * `start-session`), e nao um esquema de assinatura sobre o corpo — nao ha
 * corpo assinado para verificar do lado de quem manda.
 */
export function obterSegredoWebhookWppConnect(): string | null {
  return lida('WPP_CONNECT_WEBHOOK_SECRET');
}
