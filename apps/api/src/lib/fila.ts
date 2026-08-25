import { randomUUID } from 'node:crypto';
import { redis } from './redis';

/**
 * Fila de trabalho em Redis.
 *
 * O disparo de campanha era sincrono: mil contatos deixavam uma requisicao HTTP
 * aberta por minutos e qualquer erro no meio perdia o resto do lote. Aqui cada
 * item e um trabalho independente, com nova tentativa e ritmo controlado.
 *
 * Tres chaves: `prontos` (lista, consumida com BRPOP), `atrasados` (zset com o
 * horario da proxima tentativa) e `mortos` (o que desistiu). Nao e Bull nem
 * BullMQ de proposito — o que a plataforma precisa cabe em cem linhas, e uma
 * dependencia a menos e uma superficie a menos.
 */
const PRONTOS = 'fila:prontos';
const ATRASADOS = 'fila:atrasados';
const MORTOS = 'fila:mortos';

/** Backoff das novas tentativas. O tamanho da lista define o limite de tentativas. */
const ESPERAS_MS = [5_000, 30_000, 120_000];

export type Contexto = { tentativa: number; ultimaTentativa: boolean };
type Handler = (dados: never, ctx: Contexto) => Promise<void>;
type Trabalho = { id: string; tipo: string; dados: unknown; tentativa: number };

const handlers = new Map<string, Handler>();

/**
 * Sinaliza falha definitiva: nao tente de novo. Token recusado pela Meta nao
 * fica valido na terceira tentativa — insistir so gasta tempo e confunde o
 * relatorio.
 */
export class ErroPermanente extends Error {}

export function registrarHandler<T>(tipo: string, handler: (dados: T, ctx: Contexto) => Promise<void>) {
  handlers.set(tipo, handler as Handler);
}

export async function enfileirar(tipo: string, dados: unknown, opcoes: { atrasoMs?: number } = {}) {
  const trabalho: Trabalho = { id: randomUUID(), tipo, dados, tentativa: 0 };
  await guardar(trabalho, opcoes.atrasoMs ?? 0);
  return trabalho.id;
}

async function guardar(trabalho: Trabalho, atrasoMs: number) {
  const corpo = JSON.stringify(trabalho);
  if (atrasoMs > 0) {
    await redis.zadd(ATRASADOS, Date.now() + atrasoMs, corpo);
  } else {
    await redis.lpush(PRONTOS, corpo);
  }
}

/** Move para a fila de prontos o que já venceu o tempo de espera. */
async function promoverAtrasados() {
  const vencidos = await redis.zrangebyscore(ATRASADOS, 0, Date.now(), 'LIMIT', 0, 50);
  for (const corpo of vencidos) {
    // Só promove quem conseguiu remover: com duas instancias, o ZREM decide
    // quem ficou com o trabalho e evita processamento em dobro.
    if ((await redis.zrem(ATRASADOS, corpo)) === 1) await redis.lpush(PRONTOS, corpo);
  }
}

async function processar(trabalho: Trabalho) {
  const handler = handlers.get(trabalho.tipo);
  if (!handler) {
    console.error(`[fila] trabalho sem handler: ${trabalho.tipo}`);
    await redis.lpush(MORTOS, JSON.stringify({ ...trabalho, erro: 'sem handler' }));
    return;
  }

  const ultimaTentativa = trabalho.tentativa >= ESPERAS_MS.length;

  try {
    await handler(trabalho.dados as never, { tentativa: trabalho.tentativa + 1, ultimaTentativa });
  } catch (err) {
    const motivo = err instanceof Error ? err.message : 'erro desconhecido';

    if (err instanceof ErroPermanente || ultimaTentativa) {
      await redis.lpush(MORTOS, JSON.stringify({ ...trabalho, erro: motivo }));
      await redis.ltrim(MORTOS, 0, 999);
      return;
    }

    const espera = ESPERAS_MS[trabalho.tentativa]!;
    console.warn(`[fila] ${trabalho.tipo} falhou (${motivo}); nova tentativa em ${espera / 1000}s`);
    await guardar({ ...trabalho, tentativa: trabalho.tentativa + 1 }, espera);
  }
}

let parando = false;

/**
 * Worker no proprio processo da API. Usa conexao separada porque o BRPOP
 * bloqueia o cliente Redis, e o resto da aplicacao precisa do dele livre.
 */
export function iniciarWorker() {
  const consumidor = redis.duplicate();

  const laco = async () => {
    while (!parando) {
      try {
        await promoverAtrasados();
        const item = await consumidor.brpop(PRONTOS, 5);
        if (!item) continue;
        await processar(JSON.parse(item[1]) as Trabalho);
      } catch (err) {
        if (parando) return;
        console.error('[fila] erro no laco:', err instanceof Error ? err.message : err);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  };

  void laco();
  return async () => {
    parando = true;
    await consumidor.quit().catch(() => undefined);
  };
}

export async function estadoDaFila() {
  const [prontos, atrasados, mortos] = await Promise.all([
    redis.llen(PRONTOS),
    redis.zcard(ATRASADOS),
    redis.llen(MORTOS),
  ]);
  const ultimosMortos = await redis.lrange(MORTOS, 0, 9);
  return {
    prontos,
    atrasados,
    mortos,
    ultimosMortos: ultimosMortos.map((m) => JSON.parse(m) as Trabalho & { erro: string }),
  };
}

/**
 * Controle de taxa por canal, em janela de um segundo. A Meta limita envio por
 * numero e devolve 429 quando passa; e melhor esperar do que gastar tentativa.
 */
export async function aguardarVaga(canal: string, porSegundo: number) {
  for (let i = 0; i < 30; i++) {
    const chave = `taxa:${canal}:${Math.floor(Date.now() / 1000)}`;
    const usados = await redis.incr(chave);
    if (usados === 1) await redis.expire(chave, 2);
    if (usados <= porSegundo) return;
    await new Promise((r) => setTimeout(r, 1000 - (Date.now() % 1000) + 10));
  }
}

/**
 * Devolve trabalhos da lista de mortos para a fila de prontos.
 *
 * Trabalho morto por causa passageira (token expirado que ja foi renovado,
 * provedor que voltou do ar) so precisa de outra chance. Sem isso a unica saida
 * era script no servidor — e o dado fica parado justamente quando alguem esta
 * olhando o painel querendo resolver.
 *
 * A tentativa volta a zero de proposito: e uma decisao humana de tentar de novo,
 * nao a continuacao do backoff anterior.
 */
export async function reprocessarMortos(quantidade = 50) {
  let devolvidos = 0;
  let descartados = 0;

  for (let i = 0; i < quantidade; i++) {
    const corpo = await redis.rpop(MORTOS);
    if (!corpo) break;

    try {
      const { erro: _erro, ...trabalho } = JSON.parse(corpo) as Trabalho & { erro?: string };
      // Sem handler registrado nao ha o que reprocessar: voltaria para os mortos
      // no mesmo instante, num laco.
      if (!handlers.has(trabalho.tipo)) {
        await redis.lpush(MORTOS, corpo);
        descartados++;
        continue;
      }
      await guardar({ ...trabalho, tentativa: 0 }, 0);
      devolvidos++;
    } catch {
      // Item corrompido nao volta para a fila nem fica bloqueando a lista.
      descartados++;
    }
  }

  return { devolvidos, descartados };
}
