import { prisma } from '../../lib/prisma';
import { redis } from '../../lib/redis';
import { comOrganizacao, semOrganizacao } from '../../lib/tenant';
import { registrarErro } from '../../lib/redacao';

const DIA = 24 * 60 * 60 * 1000;
const FREQUENCIA = 120 * 24 * 60 * 60 * 1000;

/** Completa a janela de tarefas recorrentes, mantendo o mesmo registro Activity. */
export function agendarExpansaoDeSeries() {
  const rodar = async () => {
    try {
      const organizacoes = await semOrganizacao('séries de atividades: percorre organizações', () =>
        prisma.organizacao.findMany({ where: { ativa: true }, select: { id: true } }),
      );
      for (const org of organizacoes) {
        await comOrganizacao(org.id, async () => {
          const lock = await redis.set(`org:${org.id}:series-atividades:lock`, '1', 'EX', 3600, 'NX').catch(() => 'sem-lock');
          if (!lock) return;
          const series = await prisma.activitySeries.findMany({ where: { canceladoEm: null } });
          const agora = new Date();
          const horizonte = new Date(agora.getTime() + FREQUENCIA);
          for (const serie of series) {
            const [modelo, ultima] = await Promise.all([
              prisma.activity.findFirst({ where: { serieId: serie.id }, orderBy: { prazo: 'asc' } }),
              prisma.activity.findFirst({ where: { serieId: serie.id, prazo: { not: null } }, orderBy: { prazo: 'desc' }, select: { prazo: true } }),
            ]);
            if (!modelo || !ultima?.prazo) continue;
            let cursor = new Date(ultima.prazo);
            cursor.setDate(cursor.getDate() + 1);
            const limite = serie.fimEm && serie.fimEm < horizonte ? serie.fimEm : horizonte;
            const datas: Date[] = [];
            while (cursor <= limite && datas.length < 120) {
              const dia = cursor.getDay();
              const inclui = serie.frequencia === 'DIARIA' ||
                (serie.frequencia === 'SEMANAL' && serie.diasSemana.includes(dia)) ||
                (serie.frequencia === 'MENSAL' && cursor.getDate() === serie.inicioEm.getDate());
              if (inclui) datas.push(new Date(cursor));
              cursor.setDate(cursor.getDate() + 1);
            }
            if (!datas.length) continue;
            await prisma.activity.createMany({
              skipDuplicates: true,
              data: datas.map((prazo) => ({
                tipo: modelo.tipo, titulo: modelo.titulo, descricao: modelo.descricao, prazo,
                responsavelId: modelo.responsavelId, criadoPorId: modelo.criadoPorId,
                contatoId: modelo.contatoId, contaId: modelo.contaId,
                oportunidadeId: modelo.oportunidadeId, protocoloId: modelo.protocoloId,
                obrigatoria: modelo.obrigatoria, estagioId: modelo.estagioId, serieId: serie.id,
              })),
            });
          }
        }).catch((err) => registrarErro(`[series-atividades] falhou (${org.id}):`, err));
      }
    } catch (err) {
      registrarErro('[series-atividades] falhou:', err);
    }
  };
  setTimeout(() => void rodar(), 90_000).unref();
  setInterval(() => void rodar(), DIA).unref();
}
