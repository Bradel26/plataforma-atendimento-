import { prisma } from '../../lib/prisma';

/** Cria uma tarefa interna quando a perda completa o prazo configurado no funil. */
export async function gerarTarefasDeReativacao(agora = new Date()) {
  let criadas = 0;
  let cursor: string | undefined;
  for (;;) {
    const lote = await prisma.opportunity.findMany({
      where: { status: 'PERDIDA', fechadoEm: { not: null } },
      include: {
        funil: { select: { reativacaoDias: true } },
        conta: { select: { responsavelId: true } },
      },
      orderBy: { id: 'asc' },
      take: 200,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!lote.length) break;
    cursor = lote[lote.length - 1]!.id;
    for (const o of lote) {
      if (o.funil.reativacaoDias === null || !o.fechadoEm) continue;
      const prazo = new Date(o.fechadoEm.getTime() + o.funil.reativacaoDias * 86_400_000);
      if (prazo > agora) continue;
      const automacaoChave = `reativacao:${o.id}:${o.fechadoEm.toISOString()}`;
      const vigente = await prisma.opportunity.findFirst({
        where: { id: o.id, status: 'PERDIDA', fechadoEm: o.fechadoEm }, select: { id: true },
      });
      if (!vigente) continue;
      // createMany com skipDuplicates torna a rotina segura para workers concorrentes.
      const resultado = await prisma.activity.createMany({
        data: [{
          organizacaoId: o.organizacaoId,
          oportunidadeId: o.id,
          contaId: o.contaId,
          responsavelId: o.responsavelId ?? o.conta.responsavelId,
          tipo: 'TAREFA',
          titulo: `Reavaliar oportunidade perdida: ${o.titulo}`,
          descricao: o.motivoPerda ? `Motivo da perda: ${o.motivoPerda}. Revise o histórico antes de contatar o cliente.` : 'Revise o histórico antes de contatar o cliente.',
          prazo: agora,
          automacaoChave,
        }],
        skipDuplicates: true,
      });
      criadas += resultado.count;
    }
    if (lote.length < 200) break;
  }
  return { criadas };
}
