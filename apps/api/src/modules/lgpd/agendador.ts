import { prismaSemIsolamento } from '../../lib/prisma';
import { redis } from '../../lib/redis';
import { comOrganizacao, semOrganizacao } from '../../lib/tenant';
import { registrarErro } from '../../lib/redacao';
import { executarExpurgo } from './expurgo.service';
import { obterPolitica } from './lgpd.service';

const UM_DIA = 24 * 60 * 60 * 1000;

/**
 * Expurgo diario, se a politica estiver ativa.
 *
 * O lock no Redis existe porque duas instancias da API acordariam ao mesmo
 * tempo e rodariam o expurgo em paralelo. Nao e cron externo por uma razao
 * simples: a plataforma ja depende de Redis e nao depende de agendador do
 * sistema operacional. Para volume grande, o certo e tirar isto do processo web.
 */
export function agendarExpurgo() {
  /**
   * Uma passada por organizacao.
   *
   * Cada uma tem politica de retencao propria, e isso nao e detalhe: prazo de
   * guarda e obrigacao legal de quem trata o dado. Rodar uma politica sobre a
   * base de outra empresa apagaria dado que ela e obrigada a manter, ou manteria
   * dado que ela e obrigada a apagar.
   *
   * O lock tambem e por organizacao: o expurgo de uma nao deve impedir o da
   * outra por ter pegado o lock primeiro.
   */
  const rodarOrganizacao = async (organizacaoId: string) => {
    const politica = await obterPolitica();
    if (!politica.ativa) return;

    const dono = await redis.set(
      `org:${organizacaoId}:lgpd:expurgo:lock`,
      String(process.pid),
      'EX',
      3600,
      'NX',
    );
    if (!dono) return;

    const resumo = await executarExpurgo({ simulacao: false, autorId: null });
    console.log(
      `[lgpd] expurgo automatico (${organizacaoId}): ${resumo.mensagens} mensagens, ${resumo.titulares} titulares anonimizados`,
    );
  };

  const rodar = async () => {
    try {
      const organizacoes = await semOrganizacao('expurgo: percorre todas as organizacoes', () =>
        prismaSemIsolamento.organizacao.findMany({ where: { ativa: true }, select: { id: true } }),
      );
      for (const org of organizacoes) {
        // Falha de uma organizacao nao pode impedir as seguintes.
        await comOrganizacao(org.id, () => rodarOrganizacao(org.id)).catch((err) =>
          registrarErro(`[lgpd] expurgo automatico falhou (${org.id}):`, err),
        );
      }
    } catch (err) {
      registrarErro('[lgpd] expurgo automatico falhou:', err);
    }
  };

  // Espera um minuto para nao competir com o arranque da aplicacao.
  setTimeout(() => void rodar(), 60_000).unref();
  setInterval(() => void rodar(), UM_DIA).unref();
}
