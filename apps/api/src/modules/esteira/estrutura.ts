/**
 * Plano de sincronização das etapas de um funil ESTEIRA com o catálogo — puro.
 *
 * Regras (spec 4.7 e 7):
 *   - casa cada etapa existente com o catálogo pela chave; etapa sem chave cujo
 *     nome é um nome antigo conhecido (`chaveDaEtapaAntiga`) também casa;
 *   - o que falta no catálogo é criado; o que casou recebe chave, ordem e tipo
 *     do catálogo — **nunca o nome**, para preservar a renomeação do ADMIN;
 *   - etapa sem correspondência nunca é apagada: vira `ativa = false` e vai
 *     para o fim da ordem.
 */
import type { TipoEtapa } from '@prisma/client';
import type { ChaveEtapa, EtapaCatalogo } from './catalogo';
import { chaveDaEtapaAntiga } from './migracao';

export type EtapaExistente = {
  id: string;
  nome: string;
  ordem: number;
  chave: string | null;
  /** Opcionais: quando informados, divergência do catálogo também gera atualização. */
  tipoEtapa?: TipoEtapa;
  ativa?: boolean;
};

export type PlanoDeSincronizacao = {
  criar: EtapaCatalogo[];
  atualizar: Array<{ id: string; chave: ChaveEtapa; ordem: number; tipo: TipoEtapa }>;
  desativar: string[];
};

/** Etapa existente -> etapa do catálogo correspondente. */
function casar(existentes: EtapaExistente[], catalogo: EtapaCatalogo[]): Map<string, EtapaCatalogo> {
  const porChave = new Map(catalogo.map((e) => [e.chave as string, e]));
  const casadas = new Map<string, EtapaCatalogo>();
  const usadas = new Set<string>();

  // Primeiro quem já tem chave: a chave gravada vence o nome antigo de outra etapa.
  for (const e of existentes) {
    const alvo = e.chave ? porChave.get(e.chave) : undefined;
    if (alvo && !usadas.has(alvo.chave)) {
      casadas.set(e.id, alvo);
      usadas.add(alvo.chave);
    }
  }
  for (const e of [...existentes].sort((a, b) => a.ordem - b.ordem)) {
    if (e.chave) continue;
    const antiga = chaveDaEtapaAntiga('TIM', e.nome) ?? chaveDaEtapaAntiga('STARLINK', e.nome);
    const alvo = antiga ? porChave.get(antiga) : undefined;
    if (alvo && !usadas.has(alvo.chave)) {
      casadas.set(e.id, alvo);
      usadas.add(alvo.chave);
    }
  }
  return casadas;
}

export function planoDeSincronizacao(existentes: EtapaExistente[], catalogo: EtapaCatalogo[]): PlanoDeSincronizacao {
  const casadas = casar(existentes, catalogo);
  const chavesCasadas = new Set([...casadas.values()].map((e) => e.chave));

  const atualizar: PlanoDeSincronizacao['atualizar'] = [];
  const desativar: string[] = [];
  for (const e of existentes) {
    const alvo = casadas.get(e.id);
    if (!alvo) {
      if (e.ativa !== false) desativar.push(e.id);
      continue;
    }
    const diverge =
      e.chave !== alvo.chave ||
      e.ordem !== alvo.ordem ||
      (e.tipoEtapa !== undefined && e.tipoEtapa !== alvo.tipo) ||
      e.ativa === false;
    if (diverge) atualizar.push({ id: e.id, chave: alvo.chave, ordem: alvo.ordem, tipo: alvo.tipo });
  }

  return { criar: catalogo.filter((e) => !chavesCasadas.has(e.chave)), atualizar, desativar };
}

/**
 * Ordem final de cada etapa existente: a do catálogo para as que casaram; as
 * demais (inativas) depois da última do catálogo, mantendo a ordem relativa.
 * Evita colisão com `@@unique([funilId, ordem])` quando o catálogo cria etapas.
 */
export function ordensFinais(existentes: EtapaExistente[], catalogo: EtapaCatalogo[]): Map<string, number> {
  const casadas = casar(existentes, catalogo);
  const ultima = catalogo.reduce((max, e) => Math.max(max, e.ordem), 0);
  const ordens = new Map<string, number>();
  for (const [id, alvo] of casadas) ordens.set(id, alvo.ordem);
  const sobras = existentes.filter((e) => !casadas.has(e.id)).sort((a, b) => a.ordem - b.ordem);
  sobras.forEach((e, i) => ordens.set(e.id, ultima + i + 1));
  return ordens;
}
