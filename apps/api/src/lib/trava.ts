import { randomUUID } from 'node:crypto';
import { redis } from './redis';

/**
 * Travas curtas no Redis (SET NX PX), com dono e validade.
 *
 * - `adquirir` devolve um token, ou null se outra pessoa ja segura a chave;
 * - a trava expira sozinha: se o processo morrer, ninguem fica bloqueado para sempre;
 * - `liberar` so apaga se o token ainda for o nosso (script atomico), para nunca
 *   soltar uma trava que expirou e foi assumida por outro processo.
 *
 * Isso evita processamento em dobro, mas NAO e entrega "exatamente uma vez": se o
 * processo cair depois de o provedor aceitar a mensagem e antes de gravarmos o
 * resultado, uma nova tentativa pode reenviar.
 */
export type ClienteTrava = {
  set(chave: string, valor: string, modoTtl: 'PX', ttl: number, modoCondicao: 'NX'): Promise<'OK' | null>;
  del(chave: string): Promise<unknown>;
  eval(script: string, numChaves: number, ...args: string[]): Promise<unknown>;
};

const LIBERAR = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

export function criarTrava(cliente: ClienteTrava) {
  return {
    async adquirir(chave: string, ttlMs: number): Promise<string | null> {
      const token = randomUUID();
      const ok = await cliente.set(chave, token, 'PX', ttlMs, 'NX');
      return ok === 'OK' ? token : null;
    },
    async liberar(chave: string, token: string): Promise<void> {
      await cliente.eval(LIBERAR, 1, chave, token);
    },
    /** Remove a marca incondicionalmente (uso: fim definitivo do trabalho). */
    async remover(chave: string): Promise<void> {
      await cliente.del(chave);
    },
  };
}

export const trava = criarTrava(redis as unknown as ClienteTrava);
