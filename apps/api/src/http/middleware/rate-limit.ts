import type { NextFunction, Request, Response } from 'express';
import { redis } from '../../lib/redis';

/**
 * Limite de requisicoes por janela fixa, contado no Redis.
 *
 * Redis e nao memoria do processo porque o contador tem de valer para o
 * servico inteiro: com duas instancias atras de um balanceador, um limite em
 * memoria e o dobro do limite anunciado.
 *
 * Falha aberta de proposito: se o Redis cair, a plataforma continua atendendo
 * em vez de recusar todo mundo. Perder o limite por alguns minutos e menos
 * grave que ficar fora do ar.
 */
export function limitar(opcoes: {
  nome: string;
  janelaSegundos: number;
  maximo: number;
  /** Por padrao conta por IP. */
  chave?: (req: Request) => string;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const identificador = opcoes.chave?.(req) ?? ipDe(req);
    const chave = `limite:${opcoes.nome}:${identificador}`;

    try {
      const atual = await redis.incr(chave);
      if (atual === 1) await redis.expire(chave, opcoes.janelaSegundos);

      if (atual > opcoes.maximo) {
        const restante = await redis.ttl(chave);
        res.setHeader('Retry-After', String(restante > 0 ? restante : opcoes.janelaSegundos));
        return res.status(429).json({
          error: {
            code: 'MUITAS_TENTATIVAS',
            message: `Muitas tentativas. Tente novamente em ${Math.ceil((restante > 0 ? restante : opcoes.janelaSegundos) / 60)} minuto(s).`,
          },
        });
      }
    } catch (err) {
      console.error(`[rate-limit] ${opcoes.nome} sem Redis:`, err instanceof Error ? err.message : err);
    }

    return next();
  };
}

/**
 * IP do cliente pelo `req.ip` do Express, nunca lendo X-Forwarded-For na mao:
 * o header e do cliente e pode ser inventado, entao confiar nele sem proxy na
 * frente entrega ao atacante o direito de trocar de identidade a cada
 * requisicao. Atras de proxy reverso, ligue TRUST_PROXY — o Express passa a
 * resolver o header e o `req.ip` volta a ser o IP real.
 */
export const ipDe = (req: Request) => req.ip ?? 'desconhecido';
