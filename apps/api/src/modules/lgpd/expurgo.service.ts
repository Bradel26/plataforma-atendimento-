import { prisma } from '../../lib/prisma';
import { organizacaoAtual } from '../../lib/tenant';
import { apagarArquivosDeMensagens, apagarArquivosDeProtocolos, varrerOrfaos } from './arquivos';
import { anonimizarTitular, obterPolitica, registrar } from './lgpd.service';

/**
 * Expurgo pela politica de retencao.
 *
 * Sempre pode rodar em simulacao: apagar dado de cliente e irreversivel, e
 * quem configura o prazo merece ver quantos registros o numero atinge antes de
 * confirmar. A simulacao nao escreve nada.
 */
const diasAtras = (dias: number) => new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

export type ResumoExpurgo = Awaited<ReturnType<typeof executarExpurgo>>;

export async function executarExpurgo(opcoes: { simulacao: boolean; autorId?: string | null }) {
  const politica = await obterPolitica();
  const corteConversas = diasAtras(politica.diasConversas);
  const corteProtocolos = diasAtras(politica.diasProtocolos);
  const cortePresenca = diasAtras(politica.diasPresenca);

  // 1. Conversas finalizadas antes do corte: o conteudo sai, a casca fica.
  const conversas = await prisma.conversation.findMany({
    where: { status: 'FINALIZADO', finalizadoEm: { lt: corteConversas } },
    select: { id: true },
  });
  const conversaIds = conversas.map((c) => c.id);

  const mensagens = await prisma.message.count({ where: { conversaId: { in: conversaIds } } });

  // 2. Protocolos encerrados antes do corte.
  const protocolos = await prisma.ticket.findMany({
    where: { status: { in: ['RESOLVIDO', 'FECHADO'] }, fechadoEm: { lt: corteProtocolos } },
    select: { id: true },
  });
  const protocoloIds = protocolos.map((p) => p.id);
  const comentarios = await prisma.ticketComment.count({ where: { ticketId: { in: protocoloIds } } });
  const anexos = await prisma.ticketAttachment.count({ where: { ticketId: { in: protocoloIds } } });

  // 3. Log de presenca antigo — alimenta relatorio de jornada, que envelhece.
  const presenca = await prisma.presenceLog.count({ where: { iniciadoEm: { lt: cortePresenca } } });

  /**
   * 4. Titulares sem atividade nenhuma depois do corte. Enquanto houver
   * conversa, protocolo ou lead recente, a pessoa segue sendo cliente ativo e
   * anonimizar quebraria o atendimento em andamento.
   */
  const candidatos = await prisma.contact.findMany({
    where: {
      anonimizadoEm: null,
      criadoEm: { lt: corteConversas },
      conversas: { none: { ultimaMensagemEm: { gte: corteConversas } } },
      protocolos: { none: { atualizadoEm: { gte: corteConversas } } },
      leads: { none: { atualizadoEm: { gte: corteConversas } } },
    },
    select: { id: true },
  });

  const orfaos = await varrerOrfaos(true);

  const resumo = {
    simulacao: opcoes.simulacao,
    politica: {
      diasConversas: politica.diasConversas,
      diasProtocolos: politica.diasProtocolos,
      diasPresenca: politica.diasPresenca,
    },
    corte: { conversas: corteConversas, protocolos: corteProtocolos, presenca: cortePresenca },
    conversas: conversaIds.length,
    mensagens,
    protocolos: protocoloIds.length,
    comentarios,
    anexos,
    presenca,
    titulares: candidatos.length,
    arquivosOrfaos: orfaos,
    arquivosApagados: 0,
  };

  if (opcoes.simulacao) return resumo;

  resumo.arquivosApagados =
    (await apagarArquivosDeMensagens(conversaIds)) + (await apagarArquivosDeProtocolos(protocoloIds));

  await prisma.message.deleteMany({ where: { conversaId: { in: conversaIds } } });
  await prisma.conversation.updateMany({
    where: { id: { in: conversaIds } },
    data: { enderecoExterno: null, assunto: null, naoLidas: 0 },
  });
  await prisma.survey.updateMany({ where: { conversaId: { in: conversaIds } }, data: { comentario: null } });

  await prisma.ticketComment.deleteMany({ where: { ticketId: { in: protocoloIds } } });
  await prisma.ticketAttachment.deleteMany({ where: { ticketId: { in: protocoloIds } } });
  await prisma.ticket.updateMany({
    where: { id: { in: protocoloIds } },
    data: { descricao: '[expurgado pela politica de retencao]' },
  });

  await prisma.presenceLog.deleteMany({ where: { iniciadoEm: { lt: cortePresenca } } });

  for (const { id } of candidatos) {
    await anonimizarTitular(id, { autorId: opcoes.autorId, motivo: 'politica de retencao' });
  }

  resumo.arquivosOrfaos = await varrerOrfaos(false);

  await prisma.retentionPolicy.update({
    where: { organizacaoId: organizacaoAtual() },
    data: { ultimoExpurgoEm: new Date() },
  });
  // Datas viram texto: a coluna e JSON e nao aceita Date.
  await registrar('EXPURGO', JSON.parse(JSON.stringify(resumo)), { autorId: opcoes.autorId ?? null });

  return resumo;
}
