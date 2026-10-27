import type { ClienteDeEscrita } from '../../lib/prisma';

const prioridadeCampanha = { PENDENTE: 0, IGNORADO: 1, FALHOU: 2, ENVIADO: 3, RESPONDIDO: 4 } as const;

/**
 * Consolida dois cadastros do mesmo titular dentro do contexto da organizacao.
 * Todas as FKs historicas sao movidas antes do cadastro secundario ser ocultado.
 * Conversas mantem canalConfigId/enderecoExterno; somente o dono CRM muda.
 */
export async function mesclarContatos(tx: ClienteDeEscrita, principalId: string, secundarioId: string) {
  if (principalId === secundarioId) return;

  const [principal, secundario] = await Promise.all([
    tx.contact.findFirst({ where: { id: principalId, excluidoEm: null } }),
    tx.contact.findFirst({ where: { id: secundarioId, excluidoEm: null } }),
  ]);
  if (!principal || !secundario || principal.organizacaoId !== secundario.organizacaoId) return;
  // Registros com anonimização ou pedido de remoção seguem o fluxo LGPD próprio.
  if (principal.anonimizadoEm || secundario.anonimizadoEm) return;
  if (principal.contaId && secundario.contaId && principal.contaId !== secundario.contaId) return;
  const pedidos = await tx.contactDeletionRequest.findMany({
    where: { contatoId: { in: [principalId, secundarioId] }, status: { in: ['PENDENTE', 'APROVADA'] } },
    select: { id: true }, take: 1,
  });
  if (pedidos.length) return;

  // Campanha tem unicidade por campanha+contato. Combina os dois itens preservando
  // o estado mais avançado e os metadados de envio antes de reassociar os demais.
  const itensSecundarios = await tx.campaignItem.findMany({ where: { contatoId: secundarioId } });
  for (const item of itensSecundarios) {
    const existente = await tx.campaignItem.findFirst({ where: { campanhaId: item.campanhaId, contatoId: principalId } });
    if (existente) {
      const status = prioridadeCampanha[item.status] > prioridadeCampanha[existente.status] ? item.status : existente.status;
      await tx.campaignItem.update({
        where: { id: existente.id },
        data: {
          status,
          erro: existente.erro ?? item.erro,
          conversaId: existente.conversaId ?? item.conversaId,
          enviadoEm: existente.enviadoEm ?? item.enviadoEm,
          respondidoEm: existente.respondidoEm ?? item.respondidoEm,
          textoEnviadoEm: existente.textoEnviadoEm ?? item.textoEnviadoEm,
          anexosEnviados: [...new Set([...existente.anexosEnviados, ...item.anexosEnviados])],
        },
      });
      await tx.campaignItem.delete({ where: { id: item.id } });
    } else {
      await tx.campaignItem.update({ where: { id: item.id }, data: { contatoId: principalId } });
    }
  }

  const [opsSecundarias, opsPrincipais] = await Promise.all([
    tx.contactOperation.findMany({ where: { contatoId: secundarioId } }),
    tx.contactOperation.findMany({ where: { contatoId: principalId }, select: { operacao: true } }),
  ]);
  const operacoesPrincipais = new Set(opsPrincipais.map((item) => item.operacao));
  for (const item of opsSecundarias) {
    if (operacoesPrincipais.has(item.operacao)) await tx.contactOperation.delete({ where: { id: item.id } });
    else await tx.contactOperation.update({ where: { id: item.id }, data: { contatoId: principalId } });
  }

  await Promise.all([
    tx.conversation.updateMany({ where: { contatoId: secundarioId }, data: { contatoId: principalId } }),
    tx.lead.updateMany({ where: { contatoId: secundarioId }, data: { contatoId: principalId } }),
    tx.ticket.updateMany({ where: { contatoId: secundarioId }, data: { contatoId: principalId } }),
    tx.call.updateMany({ where: { contatoId: secundarioId }, data: { contatoId: principalId } }),
    tx.activity.updateMany({ where: { contatoId: secundarioId }, data: { contatoId: principalId } }),
    tx.credenciamento.updateMany({ where: { contatoId: secundarioId }, data: { contatoId: principalId } }),
  ]);

  const observacoes = [principal.observacoes, secundario.observacoes]
    .filter((valor, indice, todos): valor is string => Boolean(valor) && todos.indexOf(valor) === indice)
    .join('\n\n');
  await tx.contact.update({
    where: { id: principalId },
    data: {
      email: principal.email ?? secundario.email,
      uf: principal.uf ?? secundario.uf,
      cidade: principal.cidade ?? secundario.cidade,
      contaId: principal.contaId ?? secundario.contaId,
      responsavelId: principal.responsavelId ?? secundario.responsavelId,
      segmentoParceiro: principal.segmentoParceiro ?? secundario.segmentoParceiro,
      papelNaConta: principal.papelNaConta ?? secundario.papelNaConta,
      qualificacaoQsa: principal.qualificacaoQsa ?? secundario.qualificacaoQsa,
      consentimentoEm: principal.consentimentoEm ?? secundario.consentimentoEm,
      tags: [...new Set([...principal.tags, ...secundario.tags])],
      observacoes: observacoes || null,
    },
  });
  await tx.contact.update({ where: { id: secundarioId }, data: { excluidoEm: new Date() } });
}

/** Retorna o número brasileiro equivalente com ou sem nono dígito móvel. */
export function telefoneBrAlternativo(numero: string): string | null {
  if (!numero.startsWith('55')) return null;
  const ddd = numero.slice(2, 4);
  const local = numero.slice(4);
  if (local.length === 8 && /^[6-9]/.test(local)) return `55${ddd}9${local}`;
  if (local.length === 9 && local.startsWith('9')) return `55${ddd}${local.slice(1)}`;
  return null;
}
