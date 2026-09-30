import { prismaSemIsolamento } from '../../lib/prisma';
import { redis } from '../../lib/redis';
import { comOrganizacao, semOrganizacao } from '../../lib/tenant';
import { registrarErro } from '../../lib/redacao';
import { recalcularTodos } from './cicloParceiro.service';

const UM_DIA = 24 * 60 * 60 * 1000;

/**
 * Recalculo diario do ciclo de vida dos parceiros.
 *
 * Grava a mudanca de quem ninguem abriu (ex.: passou de 30 dias sem interacao),
 * para o historico registrar o dia certo e o alerta existir antes de alguem abrir
 * a tela. O recalculo e idempotente, entao o lock so evita trabalho em dobro: se
 * o Redis estiver indisponivel o job roda sem ele em vez de nao rodar.
 */
export function agendarCicloParceiro() {
  const rodarOrganizacao = async (organizacaoId: string) => {
    const dono = await redis
      .set(`org:${organizacaoId}:ciclo-parceiro:lock`, String(process.pid), 'EX', 3600, 'NX')
      .catch(() => 'sem-lock');
    if (!dono) return;

    const r = await recalcularTodos();
    if (r.criados > 0) console.log(`[ciclo-parceiro] ${organizacaoId}: ${r.criados} ciclo(s) iniciado(s)`);
  };

  const rodar = async () => {
    try {
      const organizacoes = await semOrganizacao('ciclo do parceiro: percorre todas as organizações', () =>
        prismaSemIsolamento.organizacao.findMany({ where: { ativa: true }, select: { id: true } }),
      );
      for (const org of organizacoes) {
        await comOrganizacao(org.id, () => rodarOrganizacao(org.id)).catch((err) =>
          registrarErro(`[ciclo-parceiro] recalculo falhou (${org.id}):`, err),
        );
      }
    } catch (err) {
      registrarErro('[ciclo-parceiro] recalculo falhou:', err);
    }
  };

  setTimeout(() => void rodar(), 90_000).unref();
  setInterval(() => void rodar(), UM_DIA).unref();
}
