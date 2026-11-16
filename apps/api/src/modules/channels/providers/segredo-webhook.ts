import { timingSafeEqual } from 'node:crypto';

/**
 * Segredo que o provedor mandou no webhook, de onde quer que tenha vindo.
 *
 * Preferencia: cabecalho `X-Webhook-Secret`. Um segredo em cabecalho nao entra em
 * URL, entao nao aparece em log de acesso de proxy (Traefik/Coolify), historico de
 * navegador nem em mensagem de erro que repita a URL. A query string `?secret=`
 * continua aceita porque o WPPConnect Server e o GOWA de referencia nao assinam
 * nem enviam cabecalho proprio — para eles a URL e a unica opcao, e recusa-la
 * derrubaria a integracao.
 *
 * Se o cabecalho vier, ele e o unico considerado: um segredo errado em cabecalho
 * nao pode ser "salvo" por um certo na URL.
 */
export function segredoRecebido(req: { header(nome: string): string | undefined; query: Record<string, unknown> }): string | null {
  const cabecalho = req.header('x-webhook-secret')?.trim();
  if (cabecalho) return cabecalho;
  return typeof req.query.secret === 'string' ? req.query.secret : null;
}

/** Comparacao em tempo constante; tamanhos diferentes ja sao diferentes. */
export function segredosIguais(recebido: string | null, esperado: string | null): boolean {
  if (!recebido || !esperado) return false;
  const a = Buffer.from(recebido, 'utf8');
  const b = Buffer.from(esperado, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
