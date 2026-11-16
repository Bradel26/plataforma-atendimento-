/**
 * Valor de `trust proxy` do Express a partir da variavel TRUST_PROXY.
 *
 * Por que nao basta `true`: com `true` o Express confia em TODO o
 * X-Forwarded-For e usa o endereco mais a ESQUERDA como `req.ip`. Se o proxy da
 * frente apenas ACRESCENTA o IP de quem conectou (e nao descarta o que o cliente
 * mandou), o atacante escreve o IP que quiser nessa ponta e troca de identidade a
 * cada requisicao — o limite de login por IP deixa de limitar qualquer coisa.
 *
 * Formatos aceitos:
 *   - `false` / vazio : nao confia em proxy (usa o IP da conexao).
 *   - `<n>`           : confia em n saltos (ex.: `1` = so o proxy imediato).
 *                       Cada salto confiavel consome uma entrada da DIREITA do
 *                       X-Forwarded-For, onde o que o cliente escreveu nao chega.
 *   - lista CSV       : enderecos/CIDRs/apelidos confiaveis (ex.:
 *                       `10.0.0.0/8, 172.16.0.0/12` ou `loopback, uniquelocal`).
 *                       O Express confia nesses saltos e para no primeiro IP que
 *                       NAO esta na lista — esse e o cliente.
 *   - `true`          : legado. Mantido para nao quebrar quem ja o usa, mas
 *                       inseguro quando o proxy nao descarta o cabecalho do
 *                       cliente. `modoLegado` sinaliza para o arranque avisar.
 */
export type ConfiguracaoTrustProxy = {
  valor: boolean | number | string;
  modoLegado: boolean;
};

const APELIDOS = new Set(['loopback', 'linklocal', 'uniquelocal']);
const IPV4 = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
// Aceita IPv6 simples e CIDR; a validacao fina e do proprio Express (proxy-addr).
const IPV6 = /^[0-9a-f:]+(\/\d{1,3})?$/i;

function entradaValida(entrada: string): boolean {
  if (APELIDOS.has(entrada.toLowerCase())) return true;
  if (IPV4.test(entrada)) {
    const [ip, mascara] = entrada.split('/');
    const octetosOk = ip!.split('.').every((o) => Number(o) <= 255);
    return octetosOk && (mascara === undefined || Number(mascara) <= 32);
  }
  return entrada.includes(':') && IPV6.test(entrada);
}

export function resolverTrustProxy(bruto: string | undefined): ConfiguracaoTrustProxy {
  const texto = (bruto ?? '').trim();
  if (texto === '' || texto.toLowerCase() === 'false') return { valor: false, modoLegado: false };
  if (texto.toLowerCase() === 'true') return { valor: true, modoLegado: true };

  if (/^\d+$/.test(texto)) {
    const saltos = Number(texto);
    if (saltos === 0) return { valor: false, modoLegado: false };
    if (saltos > 10) throw new Error('TRUST_PROXY: numero de saltos absurdo (maximo 10)');
    return { valor: saltos, modoLegado: false };
  }

  const entradas = texto.split(',').map((e) => e.trim()).filter(Boolean);
  const invalida = entradas.find((e) => !entradaValida(e));
  if (invalida) {
    throw new Error(`TRUST_PROXY: entrada invalida "${invalida}". Use false, um numero de saltos ou uma lista de IP/CIDR.`);
  }
  return { valor: entradas.join(', '), modoLegado: false };
}
