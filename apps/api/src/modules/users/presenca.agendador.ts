import { prismaSemIsolamento } from '../../lib/prisma';
import { redis } from '../../lib/redis';
import { comOrganizacao, semOrganizacao } from '../../lib/tenant';
import { registrarErro } from '../../lib/redacao';
import { encerrarPresencasInativas } from './users.service';

const UM_MINUTO = 60 * 1000;

/**
 * Fecha a presenca de quem parou de mandar heartbeat, organizacao por
 * organizacao — mesmo formato do expurgo da LGPD (`lgpd/agendador.ts`): lock no
 * Redis por organizacao, para duas instancias da API nao rodarem o mesmo
 * fechamento em paralelo, e falha numa organizacao nao pode impedir as outras.
 */
export function agendarEncerramentoDePresenca() {
  const rodarOrganizacao = async (organizacaoId: string) => {
    const dono = await redis.set(
      `org:${organizacaoId}:presenca:inatividade:lock`,
      String(process.pid),
      'EX',
      60,
      'NX',
    );
    if (!dono) return;

    const total = await encerrarPresencasInativas();
    if (total > 0) {
      console.log(`[presenca] ${total} agente(s) marcado(s) offline por inatividade (${organizacaoId})`);
    }
  };

  const rodar = async () => {
    try {
      const organizacoes = await semOrganizacao('presenca: percorre todas as organizações', () =>
        prismaSemIsolamento.organizacao.findMany({ where: { ativa: true }, select: { id: true } }),
      );
      for (const org of organizacoes) {
        await comOrganizacao(org.id, () => rodarOrganizacao(org.id)).catch((err) =>
          registrarErro(`[presenca] encerramento por inatividade falhou (${org.id}):`, err),
        );
      }
    } catch (err) {
      registrarErro('[presenca] encerramento por inatividade falhou:', err);
    }
  };

  setTimeout(() => void rodar(), UM_MINUTO).unref();
  setInterval(() => void rodar(), UM_MINUTO).unref();
}
