import { randomBytes } from 'node:crypto';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';

/** Limites de nota por tipo de pesquisa. */
const FAIXA = { CSAT: { min: 1, max: 5 }, NPS: { min: 0, max: 10 } } as const;

/**
 * Cria a pesquisa ao finalizar o atendimento. Idempotente por conversa
 * (a conversa pode ser finalizada mais de uma vez apos reabertura).
 */
export async function criarPesquisa(conversaId: string, tipo: 'CSAT' | 'NPS' = 'CSAT') {
  const existente = await prisma.survey.findUnique({ where: { conversaId } });
  if (existente) return existente;

  return prisma.survey.create({
    data: { conversaId, tipo, token: randomBytes(16).toString('hex') },
  });
}

/** Dados minimos para a tela publica de resposta — sem expor histórico. */
export async function obterPorToken(token: string) {
  const pesquisa = await prisma.survey.findUnique({
    where: { token },
    include: {
      conversa: {
        select: {
          canal: true,
          finalizadoEm: true,
          contato: { select: { nome: true } },
          agente: { select: { nome: true } },
        },
      },
    },
  });
  if (!pesquisa) throw notFound('Pesquisa nao encontrada');

  return {
    tipo: pesquisa.tipo,
    faixa: FAIXA[pesquisa.tipo],
    respondida: pesquisa.respondidoEm !== null,
    nota: pesquisa.nota,
    comentario: pesquisa.comentario,
    cliente: pesquisa.conversa.contato.nome,
    atendente: pesquisa.conversa.agente?.nome ?? null,
    canal: pesquisa.conversa.canal,
    finalizadoEm: pesquisa.conversa.finalizadoEm,
  };
}

export async function responder(token: string, nota: number, comentario?: string) {
  const pesquisa = await prisma.survey.findUnique({ where: { token } });
  if (!pesquisa) throw notFound('Pesquisa nao encontrada');
  if (pesquisa.respondidoEm) throw badRequest('Esta pesquisa ja foi respondida');

  const faixa = FAIXA[pesquisa.tipo];
  if (!Number.isInteger(nota) || nota < faixa.min || nota > faixa.max) {
    throw badRequest(`A nota do ${pesquisa.tipo} deve ser um inteiro entre ${faixa.min} e ${faixa.max}`);
  }

  await prisma.survey.update({
    where: { token },
    data: { nota, comentario: comentario?.trim() || null, respondidoEm: new Date() },
  });

  return { agradecimento: 'Obrigado pela sua avaliacao!' };
}

/** Resultados para a Area da Gestao. */
export async function resultados(desde: Date, ate: Date) {
  const pesquisas = await prisma.survey.findMany({
    where: { enviadoEm: { gte: desde, lte: ate } },
    include: {
      conversa: {
        select: {
          canal: true,
          agente: { select: { id: true, nome: true } },
          fila: { select: { nome: true } },
          contato: { select: { nome: true } },
        },
      },
    },
    orderBy: { enviadoEm: 'desc' },
  });

  const respondidas = pesquisas.filter((p) => p.nota !== null);
  const porAgente = new Map<string, { nome: string; notas: number[] }>();

  for (const p of respondidas) {
    const agente = p.conversa.agente;
    if (!agente) continue;
    const atual = porAgente.get(agente.id) ?? { nome: agente.nome, notas: [] };
    atual.notas.push(p.nota!);
    porAgente.set(agente.id, atual);
  }

  return {
    enviadas: pesquisas.length,
    respondidas: respondidas.length,
    /** Taxa de resposta é o indicador que diz se a média é confiável. */
    taxaResposta: pesquisas.length === 0 ? null : Math.round((respondidas.length / pesquisas.length) * 100),
    porAgente: [...porAgente.entries()].map(([id, dados]) => ({
      id,
      nome: dados.nome,
      respostas: dados.notas.length,
      media: Math.round((dados.notas.reduce((a, b) => a + b, 0) / dados.notas.length) * 100) / 100,
    })),
    comentarios: respondidas
      .filter((p) => p.comentario)
      .slice(0, 50)
      .map((p) => ({
        nota: p.nota,
        tipo: p.tipo,
        comentario: p.comentario,
        cliente: p.conversa.contato.nome,
        agente: p.conversa.agente?.nome ?? null,
        respondidoEm: p.respondidoEm,
      })),
  };
}
