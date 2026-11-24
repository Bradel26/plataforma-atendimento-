import { prisma } from '../../lib/prisma';
import { notificarConversaAtualizada } from '../../realtime/hub';
import { inclusaoDetalhe, semNotasInternas, toConversaDetalhe } from '../conversations/conversations.serializer';
import { calcularSugestaoDaFila } from './queues.service';

/**
 * Atribuicao automatica de conversas em espera (por fila, desligada por padrao).
 *
 * Quando a fila tem `atribuicaoAutomatica` ligada, a conversa EM_ESPERA sem agente
 * vai ao agente DISPONIVEL com menos conversas abertas (rodizio no empate — ver
 * `escolherAgenteDaFila`). Sem limite de conversas por agente (decisao do negocio).
 * Se ninguem esta disponivel, a conversa continua em espera e e tentada de novo
 * quando alguem fica DISPONIVEL. Linha pessoal (com dono) nunca passa por aqui.
 *
 * Nunca lanca: quem chama (recebimento de mensagem, troca de status) nao pode
 * falhar por causa da distribuicao.
 */
export type ResultadoDaAtribuicao = { atribuida: boolean; agenteId?: string; motivo?: string };

export async function atribuirAutomaticamente(conversaId: string): Promise<ResultadoDaAtribuicao> {
  try {
    const conversa = await prisma.conversation.findUnique({
      where: { id: conversaId },
      select: { id: true, status: true, agenteId: true, filaId: true, arquivada: true, canalConfig: { select: { donoId: true } } },
    });
    if (!conversa) return { atribuida: false, motivo: 'conversa-inexistente' };
    if (conversa.status !== 'EM_ESPERA' || conversa.agenteId) return { atribuida: false, motivo: 'nao-esta-em-espera' };
    if (!conversa.filaId) return { atribuida: false, motivo: 'sem-fila' };
    if (conversa.canalConfig?.donoId) return { atribuida: false, motivo: 'linha-pessoal' };
    if (conversa.arquivada) return { atribuida: false, motivo: 'arquivada' };

    const fila = await prisma.queue.findUnique({ where: { id: conversa.filaId }, select: { ativa: true, atribuicaoAutomatica: true } });
    if (!fila?.ativa || !fila.atribuicaoAutomatica) return { atribuida: false, motivo: 'automatica-desligada' };

    const sugestao = await calcularSugestaoDaFila(conversa.filaId);
    if (!sugestao?.sugerido) return { atribuida: false, motivo: 'ninguem-disponivel' };
    const agente = sugestao.sugerido;

    // A condicao vai NO update: se alguem assumiu entre a leitura e a escrita, nao sobrescreve.
    const { count } = await prisma.conversation.updateMany({
      where: { id: conversaId, status: 'EM_ESPERA', agenteId: null },
      data: { agenteId: agente.id, status: 'ATRIBUIDO', atribuidoEm: new Date() },
    });
    if (count === 0) return { atribuida: false, motivo: 'assumida-por-outro' };

    await prisma.conversation.updateMany({ where: { id: conversaId, atendenteInicialId: null }, data: { atendenteInicialId: agente.id } });
    await prisma.message.create({
      data: { conversaId, autor: 'SISTEMA', evento: 'ACEITE', conteudo: `Atribuída automaticamente a: ${agente.nome}` },
    });

    const atualizada = await prisma.conversation.findUnique({ where: { id: conversaId }, include: inclusaoDetalhe });
    if (atualizada) {
      notificarConversaAtualizada(semNotasInternas(toConversaDetalhe(atualizada)), {
        conversaId,
        filaId: conversa.filaId,
        agenteId: agente.id,
      });
    }
    console.info('[fila][atribuicao-automatica]', JSON.stringify({ conversaId, filaId: conversa.filaId, agenteId: agente.id }));
    return { atribuida: true, agenteId: agente.id };
  } catch (erro) {
    console.error('[fila][atribuicao-automatica] falhou', erro);
    return { atribuida: false, motivo: 'erro' };
  }
}

/** Tenta distribuir as conversas em espera de uma fila, da mais antiga para a mais nova. */
export async function atribuirEsperaDaFila(filaId: string, limite = 50): Promise<number> {
  try {
    const fila = await prisma.queue.findUnique({ where: { id: filaId }, select: { ativa: true, atribuicaoAutomatica: true } });
    if (!fila?.ativa || !fila.atribuicaoAutomatica) return 0;
    const esperando = await prisma.conversation.findMany({
      where: { filaId, status: 'EM_ESPERA', agenteId: null, arquivada: false },
      orderBy: { criadoEm: 'asc' },
      take: limite,
      select: { id: true },
    });
    let atribuidas = 0;
    for (const { id } of esperando) {
      const r = await atribuirAutomaticamente(id);
      if (r.atribuida) atribuidas += 1;
      else if (r.motivo === 'ninguem-disponivel') break; // sem gente: as demais tambem ficam esperando
    }
    return atribuidas;
  } catch (erro) {
    console.error('[fila][atribuicao-automatica] falhou ao distribuir a espera', erro);
    return 0;
  }
}

/** Chamado quando um agente fica DISPONIVEL: distribui a espera das filas dele. */
export async function atribuirEsperaDasFilasDoAgente(usuarioId: string): Promise<number> {
  try {
    const vinculos = await prisma.queueAgent.findMany({ where: { usuarioId }, select: { filaId: true } });
    let total = 0;
    for (const { filaId } of vinculos) total += await atribuirEsperaDaFila(filaId);
    return total;
  } catch (erro) {
    console.error('[fila][atribuicao-automatica] falhou ao distribuir pelo agente', erro);
    return 0;
  }
}
