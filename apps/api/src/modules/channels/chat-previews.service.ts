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

/**
 * Traduz o cache de uma previa para linhas de `Message` prontas para
 * `createMany` -- pura, para dar para testar sem banco. `conversaId` vem de
 * fora porque a conversa so existe depois que quem chama a criou.
 */
export function mensagensParaHistorico(conversaId: string, cache: MensagemPrevia[]) {
  return cache.map((m) => ({
    conversaId,
    autor: m.autor,
    conteudo: m.texto,
    criadoEm: new Date(m.criadoEm),
  }));
}

/**
 * Promove uma previa (se existir) para dentro de uma `Conversation` recem-
 * criada: o cache de mensagens vira historico real, e a previa e apagada --
 * ela vira superflua, a Conversation passa a ser a fonte da verdade.
 *
 * Silenciosa se nao houver previa: o caminho normal (sem historico previo) e
 * so criar a conversa vazia, como sempre foi.
 */
export async function promoverPrevia(conversaId: string, canalConfigId: string, numero: string): Promise<void> {
  const previa = await buscarPrevia(canalConfigId, numero);
  if (!previa) return;

  const cache = previa.mensagens as unknown as MensagemPrevia[];
  if (cache.length > 0) {
    await prisma.message.createMany({ data: mensagensParaHistorico(conversaId, cache) });
    const maisRecente = cache[cache.length - 1]!;
    await prisma.conversation.update({
      where: { id: conversaId },
      data: { ultimaMensagemEm: new Date(maisRecente.criadoEm) },
    });
  }

  await prisma.chatPreview.delete({ where: { id: previa.id } });
}
