import { conflict } from '../../lib/errors';
import { prisma } from '../../lib/prisma';

/**
 * Recusa desativar ou excluir quem ainda tem numero de WhatsApp conectado.
 *
 * Cada pessoa atende pelo proprio numero. Se o dono sai e a linha continua
 * ativa, o `donoId` vira nulo (`onDelete: SetNull`) e as conversas novas desse
 * numero deixam de ter responsavel — sem aviso nenhum. Obrigar a reatribuir (ou
 * desconectar) a linha antes mantem a regra "toda conversa tem um dono".
 *
 * So conta linha ativa: uma desconectada nao recebe conversa.
 */
export async function exigirSemNumeroConectado(usuarioId: string): Promise<void> {
  const conectados = await prisma.channelConfig.count({ where: { donoId: usuarioId, ativo: true } });
  if (conectados === 0) return;
  throw conflict(
    conectados === 1
      ? 'Este usuário ainda tem 1 número de WhatsApp conectado. Reatribua ou desconecte o número antes de desativar ou excluir.'
      : `Este usuário ainda tem ${conectados} números de WhatsApp conectados. Reatribua ou desconecte os números antes de desativar ou excluir.`,
  );
}
