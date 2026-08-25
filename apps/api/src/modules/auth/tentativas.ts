import { AppError } from '../../lib/errors';
import { redis } from '../../lib/redis';

/**
 * Bloqueio temporario por tentativas erradas de senha.
 *
 * O limite por IP (middleware) nao cobre o caso de forca bruta distribuida
 * contra uma conta especifica, e o limite por conta nao cobre varredura de
 * muitas contas a partir de um IP. Os dois juntos cobrem.
 *
 * Contrapartida assumida: quem souber o email de alguem consegue travar aquele
 * login por 15 minutos. E o preco conhecido do bloqueio por conta; a alternativa
 * (nao bloquear) deixa senha fraca exposta a milhares de tentativas por hora.
 */
const MAXIMO = 5;
const BLOQUEIO_SEGUNDOS = 15 * 60;

const chave = (email: string) => `login:falhas:${email.toLowerCase()}`;

export async function garantirNaoBloqueado(email: string) {
  const falhas = Number((await redis.get(chave(email)).catch(() => null)) ?? 0);
  if (falhas < MAXIMO) return;

  const restante = await redis.ttl(chave(email)).catch(() => BLOQUEIO_SEGUNDOS);
  throw new AppError(
    429,
    'CONTA_BLOQUEADA',
    `Muitas tentativas de senha. Este acesso esta bloqueado por ${Math.ceil((restante > 0 ? restante : BLOQUEIO_SEGUNDOS) / 60)} minuto(s).`,
  );
}

export async function registrarFalha(email: string) {
  try {
    const falhas = await redis.incr(chave(email));
    // Renova a janela a cada falha: tentativa nova reinicia a contagem do prazo.
    await redis.expire(chave(email), BLOQUEIO_SEGUNDOS);
    return falhas;
  } catch {
    return 0;
  }
}

export const limparFalhas = (email: string) => redis.del(chave(email)).catch(() => 0);
