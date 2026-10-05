import type { Prisma } from '@prisma/client';
import { DO_NUMERO_DA_EMPRESA } from '../../lib/politicas';

/** Abas do Atendimento, organizadas por numero de WhatsApp (2026-10-05). */
export type VisaoInbox = 'MINHAS' | 'FILA' | 'ACOMPANHAR';

/** Valor do seletor de Acompanhar para o Numero da empresa. */
export const DONO_EMPRESA = 'EMPRESA';

export type FiltroDaVisao = { visao?: VisaoInbox; donoId?: string; canalConfigId?: string };

/**
 * Tudo que nao e de um numero meu.
 *
 * Os dois termos de nulo sao obrigatorios: `donoId: { not: eu }` sozinho vira
 * `dono_id <> eu` no SQL, que e NULL — e portanto falso — para linha sem dono.
 * O Numero da empresa sumiria de Fila e de Acompanhar.
 */
function foraDosMeusNumeros(usuarioId: string): Prisma.ConversationWhereInput {
  return {
    OR: [{ canalConfigId: null }, { canalConfig: { donoId: null } }, { canalConfig: { donoId: { not: usuarioId } } }],
  };
}

/**
 * Filtro extra de cada aba. So estreita: `listarConversas` combina com a
 * politica de visibilidade por AND, entao um `donoId` de alguem que eu nao
 * posso acompanhar devolve lista vazia, nunca abre nada.
 */
export function filtroDaVisao(
  f: FiltroDaVisao,
  eu: { usuarioId: string; filaIds: string[] },
): Prisma.ConversationWhereInput {
  switch (f.visao) {
    case undefined:
      return {};
    case 'MINHAS':
      return { canalConfig: { donoId: eu.usuarioId } };
    case 'FILA':
      return {
        AND: [
          foraDosMeusNumeros(eu.usuarioId),
          { OR: [{ agenteId: eu.usuarioId }, { status: 'EM_ESPERA', filaId: { in: eu.filaIds } }] },
        ],
      };
    case 'ACOMPANHAR': {
      const termos: Prisma.ConversationWhereInput[] = [foraDosMeusNumeros(eu.usuarioId)];
      if (f.donoId === DONO_EMPRESA) termos.push(DO_NUMERO_DA_EMPRESA);
      else if (f.donoId) termos.push({ canalConfig: { donoId: f.donoId } });
      if (f.canalConfigId) termos.push({ canalConfigId: f.canalConfigId });
      return { AND: termos };
    }
  }
}
