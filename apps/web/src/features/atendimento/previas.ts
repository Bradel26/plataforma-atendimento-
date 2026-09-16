import type { Previa } from '../../lib/types';

/**
 * Insere ou atualiza uma previa recebida por evento de tempo real
 * (`previa:atualizada`, Fase 11.7) — nunca duplica.
 *
 * O `id` de uma `ChatPreview` e estavel entre upserts consecutivos do mesmo
 * `[canalConfigId, numero]` (a API sempre faz upsert por essa chave — ver
 * `chat-previews.service.ts::salvarPrevia`), entao "chegou de novo com o
 * mesmo id" e sempre uma atualizacao, nunca um item novo. O mesmo evento
 * chegando duas vezes (reentrega, reconexao do socket) produz o mesmo
 * resultado: substitui o item existente, nao acumula.
 *
 * Pura, sem estado — extraida so para poder ser testada sem montar
 * `AtendimentoPage.tsx` inteira, que tem carregamento de linha pessoal, QR,
 * ficha do contato e outras dependencias alheias a este calculo.
 */
export function upsertPrevia(atual: readonly Previa[], nova: Previa): Previa[] {
  return [...atual.filter((existente) => existente.id !== nova.id), nova];
}
