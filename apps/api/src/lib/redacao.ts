/**
 * Redacao de dado pessoal em log.
 *
 * O expurgo da LGPD alcanca Postgres e disco, mas nao o que ja foi impresso. Um
 * stack trace com o corpo do webhook dentro guarda telefone e nome do cliente
 * em texto plano, no arquivo de log do servidor, fora de qualquer politica de
 * retencao — e pedido de exclusao nao chega la.
 *
 * A regra e conservadora de proposito: prefere mascarar demais a deixar passar.
 * Log serve para diagnosticar, e diagnostico raramente precisa do dado em si.
 */

/** Mantem o suficiente para correlacionar sem identificar. */
const email = /([\w.+-])[\w.+-]*@([\w-]+\.[\w.-]+)/g;
/** Telefone com DDI/DDD, com ou sem separador. Minimo de 10 digitos. */
const telefone = /(?<!\d)\+?(?:\d{1,3}[\s.-]?)?(?:\(?\d{2,3}\)?[\s.-]?)?\d{4,5}[\s.-]?\d{4}(?!\d)/g;
/**
 * CPF so na forma pontuada. Sem pontuacao ele tem 11 digitos, exatamente como
 * celular com DDD — os dois sao dado pessoal e os dois somem, mas num contact
 * center a aposta certa e telefone, entao o rotulo vai para la.
 */
const cpf = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
const cnpj = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
/** Bearer, JWT e chave hex longa (token de canal, SECRETS_KEY). */
const bearer = /\bBearer\s+[\w-]+\.?[\w-]*\.?[\w-]*/gi;
const jwt = /\beyJ[\w-]{8,}\.[\w-]+\.[\w-]+/g;
const hexLongo = /\b[0-9a-f]{32,}\b/gi;

/** Campos cujo valor nunca deve aparecer, qualquer que seja o formato. */
const CAMPOS_PROIBIDOS = new Set([
  'senha',
  'senhahash',
  'password',
  'accesstoken',
  'refreshtoken',
  'authtoken',
  'appsecret',
  'verifytoken',
  'secretskey',
  'authorization',
  'cookie',
  'sessaotoken',
]);

export function redigirTexto(valor: string): string {
  return valor
    .replace(jwt, '[token]')
    .replace(bearer, 'Bearer [token]')
    .replace(cnpj, '[cnpj]')
    .replace(cpf, '[cpf]')
    .replace(email, (_todo, inicial: string, dominio: string) => `${inicial}***@${dominio}`)
    .replace(telefone, '[telefone]')
    .replace(hexLongo, '[hex]');
}

/**
 * Percorre o valor inteiro. Objeto grande e cortado: log de diagnostico nao
 * melhora com o vigesimo nivel de aninhamento, e ciclo travaria a serializacao.
 */
export function redigir(valor: unknown, profundidade = 0): unknown {
  if (profundidade > 6) return '[profundo]';
  if (valor === null || valor === undefined) return valor;
  if (typeof valor === 'string') return redigirTexto(valor);
  if (typeof valor === 'number' || typeof valor === 'boolean') return valor;

  if (valor instanceof Error) {
    return {
      nome: valor.name,
      mensagem: redigirTexto(valor.message),
      // Stack e a razao de existir do log de erro; o texto dela tambem passa
      // pela redacao, porque mensagem de erro carrega parametro.
      stack: valor.stack ? redigirTexto(valor.stack) : undefined,
    };
  }

  if (Array.isArray(valor)) {
    const cortado = valor.slice(0, 20).map((v) => redigir(v, profundidade + 1));
    return valor.length > 20 ? [...cortado, `[+${valor.length - 20} itens]`] : cortado;
  }

  if (typeof valor === 'object') {
    const saida: Record<string, unknown> = {};
    for (const [chave, item] of Object.entries(valor)) {
      saida[chave] = CAMPOS_PROIBIDOS.has(chave.toLowerCase()) ? '[omitido]' : redigir(item, profundidade + 1);
    }
    return saida;
  }

  return '[desconhecido]';
}

/** console.error com redacao. Use no lugar do console.error direto. */
export function registrarErro(contexto: string, erro: unknown) {
  console.error(contexto, redigir(erro));
}
