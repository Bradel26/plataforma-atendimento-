import { prisma } from '../../lib/prisma';
import { notificarPreviaAtualizada } from '../../realtime/hub';
import { numeroNormalizado } from './whatsapp.modo';

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
 *
 * **Nao recria a previa quando ja existe atendimento formal.** A ponte
 * sincroniza os chats do celular por um caminho HTTP independente do webhook
 * de mensagem (`POST /whatsapp/:organizacaoId`) — sem essa checagem, um lote
 * de sincronizacao chegando depois de `promoverPrevia` ja ter apagado a previa
 * recriaria a mesma pessoa como previa E conversa formal ao mesmo tempo na
 * Inbox (Fase 11.4). `canalConfigId` + `numero` (normalizado do mesmo jeito
 * que `enderecoExterno`, ver `numeroNormalizado`) e a mesma identidade que
 * `Conversation.enderecoExterno` usa — nunca so o telefone: duas linhas
 * WhatsApp podem falar com o mesmo numero, e cada uma tem a propria previa.
 * `status: { not: 'FINALIZADO' }` e a mesma definicao de "aberta" usada em
 * todo o resto do modulo (`inbound.service.ts`, `conversations.service.ts`);
 * uma conversa finalizada nao bloqueia a previa — sincronizacao futura pode
 * voltar a mostrar o chat como previa, o mesmo comportamento de "finalizado
 * nao impede nova conversa" que ja existe em `registrarMensagemEntrante`.
 * A checagem e por organizacao (contexto do tenant, nunca global) e por
 * canal+numero — uma consulta so, sem loop por mensagem do cache.
 *
 * **Avisa o dono da linha em tempo real** (Fase 11.7) depois do upsert —
 * nunca quando a checagem acima decide nao criar/atualizar nada: sem previa
 * gravada, nao ha o que notificar, e a `Conversation` formal ja tem seus
 * proprios eventos (`conversa:nova`/`conversa:atualizada`).
 */
export async function salvarPrevia(dados: {
  canalConfigId: string;
  organizacaoId: string;
  /** Dono da linha pessoal -- unico destinatario do evento de tempo real. */
  donoId: string;
  numero: string;
  nome: string;
  ultimaMensagem: string;
  ultimaMensagemEm: Date;
  naoLidas: number;
  mensagens: MensagemPrevia[];
}): Promise<void> {
  const numero = numeroNormalizado(dados.numero) ?? dados.numero;

  const conversaFormalAberta = await prisma.conversation.findFirst({
    where: { canalConfigId: dados.canalConfigId, enderecoExterno: numero, status: { not: 'FINALIZADO' } },
    select: { id: true },
  });
  if (conversaFormalAberta) return;

  const mensagens = cortarCache(dados.mensagens);
  const previa = await prisma.chatPreview.upsert({
    where: { canalConfigId_numero: { canalConfigId: dados.canalConfigId, numero } },
    create: {
      canalConfigId: dados.canalConfigId,
      organizacaoId: dados.organizacaoId,
      numero,
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

  notificarPreviaAtualizada(
    {
      id: previa.id,
      canalConfigId: previa.canalConfigId,
      numero: previa.numero,
      nome: previa.nome,
      ultimaMensagem: previa.ultimaMensagem,
      ultimaMensagemEm: previa.ultimaMensagemEm,
      naoLidas: previa.naoLidas,
    },
    { agenteId: dados.donoId },
  );
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
