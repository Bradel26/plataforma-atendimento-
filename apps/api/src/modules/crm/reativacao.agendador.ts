import { prismaSemIsolamento } from '../../lib/prisma';
import { redis } from '../../lib/redis';
import { comOrganizacao, semOrganizacao } from '../../lib/tenant';
import { registrarErro } from '../../lib/redacao';
import { gerarTarefasDeReativacao } from './reativacao.service';

export function agendarReativacao() {
  const rodar = async () => {
    try {
      const organizacoes = await semOrganizacao('reativacao: percorre organizacoes ativas', () =>
        prismaSemIsolamento.organizacao.findMany({ where: { ativa: true }, select: { id: true } }),
      );
      for (const org of organizacoes) {
        await comOrganizacao(org.id, async () => {
          const lock = await redis.set(`org:${org.id}:reativacao:lock`, String(process.pid), 'EX', 3600, 'NX').catch(() => 'sem-lock');
          if (!lock) return;
          const resultado = await gerarTarefasDeReativacao();
          if (resultado.criadas) console.log(`[reativacao] ${org.id}: ${resultado.criadas} tarefa(s)`);
        }).catch((err) => registrarErro(`[reativacao] falhou (${org.id}):`, err));
      }
    } catch (err) {
      registrarErro('[reativacao] falhou:', err);
    }
  };
  setTimeout(() => void rodar(), 120_000).unref();
  setInterval(() => void rodar(), 24 * 60 * 60 * 1000).unref();
}
