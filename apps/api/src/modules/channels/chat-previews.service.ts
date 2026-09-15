import { prisma } from '../../lib/prisma';

export type MensagemPrevia = { autor: 'CLIENTE' | 'AGENTE'; texto: string; criadoEm: string };

const LIMITE_MENSAGENS_CACHE = 30;

/**
 * Corta o cache de mensagens de uma previa para as N mais recentes (mais novo
 * por ultimo, mesma ordem em que chegam do Baileys). Pura -- sem banco -- para
 * a ponte poder aplicar o mesmo limite antes de mandar o lote, e a API poder
 * reaplicar no recebimento sem depender de a ponte ter feito certo.
 */
export function cortarCache(
  mensagens: MensagemPrevia[],
  limite = LIMITE_MENSAGENS_CACHE,
): MensagemPrevia[] {
  return mensagens.slice(-limite);
}

/**
 * Grava (ou atualiza) a previa de um numero numa linha pessoal de WhatsApp.
 * Upsert por `[canalConfigId, numero]` -- chamado tanto na carga inicial
 * (`messaging-history.set`) quanto em atualizacoes incrementais
 * (`chats.upsert`), sempre substituindo o cache pelo mais recente que a ponte
 * mandou.
 */
export async function salvarPrevia(dados: {
  canalConfigId: string;
  organizacaoId: string;
  numero: string;
  nome: string;
  ultimaMensagem: string;
  ultimaMensagemEm: Date;
  naoLidas: number;
  mensagens: MensagemPrevia[];
}): Promise<void> {
  const mensagens = cortarCache(dados.mensagens);
  await prisma.chatPreview.upsert({
    where: { canalConfigId_numero: { canalConfigId: dados.canalConfigId, numero: dados.numero } },
    create: {
      canalConfigId: dados.canalConfigId,
      organizacaoId: dados.organizacaoId,
      numero: dados.numero,
      nome: dados.nome,
      ultimaMensagem: dados.ultimaMensagem,
      ultimaMensagemEm: dados.ultimaMensagemEm,
      naoLidas: dados.naoLidas,
      mensagens,
    },
    update: {
      nome: dados.nome,
      ultimaMensagem: dados.ultimaMensagem,
      ultimaMensagemEm: dados.ultimaMensagemEm,
      naoLidas: dados.naoLidas,
      mensagens,
    },
  });
}

/** Previa de um numero numa linha, ou null se o chat ainda nao foi sincronizado. */
export async function buscarPrevia(canalConfigId: string, numero: string) {
  return prisma.chatPreview.findUnique({
    where: { canalConfigId_numero: { canalConfigId, numero } },
  });
}
