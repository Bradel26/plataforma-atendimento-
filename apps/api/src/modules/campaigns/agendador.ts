import { prismaSemIsolamento } from '../../lib/prisma';
import { registrarErro } from '../../lib/redacao';
import { comOrganizacao, semOrganizacao } from '../../lib/tenant';
import { dispararCampanha } from './campaigns.service';

const UM_MINUTO = 60_000;

/**
 * "Programar envio" da campanha (SUGESTOES.docx, Campanhas > Controle do disparo).
 *
 * A cada minuto, as campanhas com `agendadaPara` vencido sao ativadas e
 * disparadas pelo MESMO caminho do botao "Enviar agora" (`dispararCampanha`,
 * que so enfileira). Nada aqui fala com canal: o envio continua sendo do worker
 * da fila, com o mesmo ritmo e as mesmas regras de sempre.
 *
 * Sem lock em Redis: a reivindicacao e o proprio `updateMany` condicional —
 * so quem trocar `agendadaPara` de "vencido" para nulo dispara. Duas instancias
 * acordando juntas brigam no banco, e uma delas conta zero linhas.
 */
export function agendarCampanhas() {
  const rodar = async () => {
    try {
      const agora = new Date();
      const vencidas = await semOrganizacao('campanhas agendadas: percorre todas as organizações', () =>
        prismaSemIsolamento.campaign.findMany({
          where: { agendadaPara: { lte: agora }, status: { in: ['RASCUNHO', 'PAUSADA'] } },
          select: { id: true, organizacaoId: true },
        }),
      );
      for (const c of vencidas) {
        await comOrganizacao(c.organizacaoId, async () => {
          const { count } = await prismaSemIsolamento.campaign.updateMany({
            where: { id: c.id, agendadaPara: { lte: agora }, status: { in: ['RASCUNHO', 'PAUSADA'] } },
            data: { status: 'ATIVA', agendadaPara: null, iniciadaEm: agora },
          });
          if (count === 0) return;
          const r = await dispararCampanha(c.id, 5000);
          console.log(`[campanhas] agendada ${c.id} disparada: ${r.enfileirados} envio(s) na fila`);
        }).catch((err) => registrarErro(`[campanhas] disparo agendado falhou (${c.id}):`, err));
      }
    } catch (err) {
      registrarErro('[campanhas] verificação de agendadas falhou:', err);
    }
  };

  setInterval(() => void rodar(), UM_MINUTO).unref();
}
