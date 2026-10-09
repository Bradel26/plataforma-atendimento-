import { prisma } from '../../lib/prisma';
import { organizacaoAtual } from '../../lib/tenant';

/**
 * Protocolo legivel de cada atendimento: AAMMDD-NNNNN.
 *
 * O dia e o de Brasilia, nao o de UTC: um atendimento aberto as 23:30 de
 * segunda tem de sair com a data de segunda, que e a que o atendente le no
 * relogio. O sequencial reinicia por dia e por organizacao (decisao de
 * 09/10/2026, ANALISE_VIDEO_IMPLEMENTACAO.md secao 10).
 */
const FORMATO_DIA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: '2-digit',
  month: '2-digit',
  day: '2-digit',
});

export function diaDoProtocolo(agora: Date): string {
  const partes = Object.fromEntries(FORMATO_DIA.formatToParts(agora).map((p) => [p.type, p.value]));
  return `${partes.year}${partes.month}${partes.day}`;
}

export function formatarProtocolo(dia: string, sequencial: number): string {
  return `${dia}-${String(sequencial).padStart(5, '0')}`;
}

/**
 * Reserva o proximo numero do dia num passo so: o INSERT ... ON CONFLICT trava
 * a linha do contador, entao duas conversas criadas no mesmo instante recebem
 * numeros diferentes (mesmo raciocinio de `reservarNumero` em tickets.service).
 */
export async function reservarProtocolo(agora: Date = new Date()): Promise<string> {
  const dia = diaDoProtocolo(agora);
  const [linha] = await prisma.$queryRaw<Array<{ ultimo: number }>>`
    INSERT INTO contadores_protocolo (organizacao_id, dia, ultimo)
    VALUES (${organizacaoAtual()}, ${dia}, 1)
    ON CONFLICT (organizacao_id, dia) DO UPDATE SET ultimo = contadores_protocolo.ultimo + 1
    RETURNING ultimo
  `;
  if (!linha) throw new Error('não foi possível reservar o protocolo da conversa');
  return formatarProtocolo(dia, Number(linha.ultimo));
}
