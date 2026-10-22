import { randomUUID } from 'node:crypto';
import { redis } from '../../lib/redis';

export type WebJsCallTicket = {
  organizacaoId: string;
  usuarioId: string;
  canalConfigId: string;
  sessao: string;
};

const PREFIXO = 'webjs-call-ticket:';
const TTL_SEGUNDOS = 45;

export async function emitirTicketWebJsCall(dados: WebJsCallTicket): Promise<string> {
  const ticket = randomUUID();
  await redis.set(`${PREFIXO}${ticket}`, JSON.stringify(dados), 'EX', TTL_SEGUNDOS, 'NX');
  return ticket;
}

/** Ticket de uso único para o upgrade WebSocket; não aceita session/line do navegador. */
export async function consumirTicketWebJsCall(ticket: string): Promise<WebJsCallTicket | null> {
  if (!/^[0-9a-f-]{36}$/i.test(ticket)) return null;
  const valor = await redis.getdel(`${PREFIXO}${ticket}`);
  if (!valor) return null;
  try {
    const dados = JSON.parse(valor) as Partial<WebJsCallTicket>;
    if (!dados.organizacaoId || !dados.usuarioId || !dados.canalConfigId || !dados.sessao) return null;
    return dados as WebJsCallTicket;
  } catch {
    return null;
  }
}
