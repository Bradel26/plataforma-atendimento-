import { randomBytes } from 'node:crypto';

/**
 * Guarda temporaria da midia que chega pelo WhatsApp.
 *
 * A plataforma nao consegue baixar do WhatsApp: a midia vem cifrada e so a
 * sessao da ponte tem a chave. Entao a ponte decifra, guarda aqui, e manda um
 * endereco proprio no `anexoUrl` — a plataforma busca UMA vez, salva no storage
 * dela e nunca mais precisa da ponte para aquele arquivo.
 *
 * Por isso a guarda e curta e em memoria, e nao um diretorio que cresce sem fim:
 * o dono do arquivo e a plataforma, e aqui e so o balcao de retirada.
 *
 * O endereco nao pede token porque o `anexoUrl` viaja no corpo do webhook e a
 * plataforma o busca sem cabecalho (veja `media.service.ts`). A protecao e o
 * nome: 32 bytes aleatorios, valido por minutos e entregue uma vez so.
 */

type Item = { buffer: Buffer; tipo: string; nome: string; expiraEm: number };

/** Tempo de balcao. A plataforma busca em segundos; minutos cobrem reentrega. */
const VALIDADE = 10 * 60 * 1000;

const itens = new Map<string, Item>();

export function guardar(buffer: Buffer, tipo: string, nome: string): string {
  const token = randomBytes(32).toString('hex');
  itens.set(token, { buffer, tipo, nome, expiraEm: Date.now() + VALIDADE });
  return token;
}

export function retirar(token: string): Item | null {
  const item = itens.get(token);
  if (!item) return null;

  if (item.expiraEm < Date.now()) {
    itens.delete(token);
    return null;
  }

  /*
   * Nao apaga na primeira leitura: a plataforma reentrega o webhook quando nao
   * recebe 200, e a segunda tentativa buscaria um endereco morto. Some pela
   * validade, que e o unico criterio que nao depende de a primeira ter dado
   * certo.
   */
  return item;
}

/** Varre o que venceu. Sem isso, midia grande fica na memoria ate o restart. */
export function limpar() {
  const agora = Date.now();
  for (const [token, item] of itens) {
    if (item.expiraEm < agora) itens.delete(token);
  }
}

setInterval(limpar, 60_000).unref();
