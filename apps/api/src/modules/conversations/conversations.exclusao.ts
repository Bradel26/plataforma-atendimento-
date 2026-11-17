import { z } from 'zod';
import { notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { remover } from '../../lib/storage';
import { chaveDe } from '../lgpd/arquivos';

/**
 * Exclusao definitiva de UMA conversa, feita pelo ADMIN na Auditoria.
 *
 * Diferente do expurgo por retencao (que anonimiza e mantem a linha para nao perder metrica), aqui a
 * pessoa pediu para apagar: a conversa, as mensagens e as pesquisas dela somem (cascata no banco) e os
 * arquivos anexados saem do disco. Protocolos e ligacoes que apontavam para a conversa perdem so o vinculo.
 *
 * Toda exclusao entra na trilha de LGPD (`EXPURGO`) na MESMA transacao: sem registro, nao apaga.
 */
export const excluirConversaSchema = z.object({
  motivo: z.string().trim().min(8, 'Informe o motivo (mínimo de 8 caracteres)').max(1000),
});

export type ResultadoExclusao = { id: string; protocolo: string | null; mensagens: number; arquivosApagados: number };

export async function excluirConversa(id: string, motivo: string, autorId: string): Promise<ResultadoExclusao> {
  const conversa = await prisma.conversation.findFirst({
    where: { id },
    select: {
      id: true,
      protocolo: true,
      canal: true,
      status: true,
      contatoId: true,
      criadoEm: true,
      finalizadoEm: true,
      canalConfig: { select: { nome: true, ponteSessao: true } },
      _count: { select: { mensagens: true } },
    },
  });
  if (!conversa) throw notFound('Conversa não encontrada');

  // As chaves dos arquivos precisam ser lidas ANTES: depois da exclusao as mensagens nao existem mais.
  const anexos = await prisma.message.findMany({
    where: { conversaId: id, anexoUrl: { not: null } },
    select: { anexoUrl: true },
  });
  const chaves = anexos.map((a) => chaveDe(a.anexoUrl)).filter((c): c is string => c !== null);

  await prisma.$transaction(async (tx) => {
    await tx.conversation.deleteMany({ where: { id } });
    await tx.lgpdLog.create({
      data: {
        acao: 'EXPURGO',
        autorId,
        contatoId: conversa.contatoId,
        detalhe: {
          origem: 'auditoria-de-conversas',
          conversaId: conversa.id,
          protocolo: conversa.protocolo,
          canal: conversa.canal,
          linha: conversa.canalConfig?.nome ?? conversa.canalConfig?.ponteSessao ?? null,
          status: conversa.status,
          criadaEm: conversa.criadoEm.toISOString(),
          finalizadaEm: conversa.finalizadoEm?.toISOString() ?? null,
          mensagens: conversa._count.mensagens,
          arquivos: chaves.length,
          motivo,
        },
      },
    });
  });

  // Depois do commit: falha ao remover um arquivo nao desfaz a exclusao (o que sobrar e varrido como orfao).
  let arquivosApagados = 0;
  for (const chave of chaves) {
    try {
      await remover(chave);
      arquivosApagados += 1;
    } catch {
      /* ja nao existia ou nao pode ser removido agora */
    }
  }

  return { id: conversa.id, protocolo: conversa.protocolo, mensagens: conversa._count.mensagens, arquivosApagados };
}
