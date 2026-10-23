/**
 * Reposicionamento Starlink da migração (spec 7): `estagioId` passa a ser a
 * etapa derivada dos campos (retropreenchidos pela SQL). Quem vai para uma
 * saída guarda a etapa em que estava.
 *
 * A decisão por card é pura (`destinoStarlink`, testada); a gravação do
 * movimento + histórico fica com quem chama (a CLI `esteira-estrutura`).
 */
import type { CredenciamentoStarlink, Operacao, TipoEtapa, TipoHistoricoEsteira } from '@prisma/client';
import type { ClienteDeEscrita } from '../../lib/prisma';
import type { ChaveEtapa } from './catalogo';
import { CAMPOS_STARLINK_VAZIO, derivarEtapaStarlink } from './starlink';

export const MOTIVO_MIGRACAO_STARLINK = 'Migração: etapa derivada dos campos';

export type EtapaDoFunil = { id: string; tipoEtapa: TipoEtapa };

export type CardStarlink = {
  estagioId: string;
  tipoEtapaAtual: TipoEtapa;
  starlink: CredenciamentoStarlink | null;
};

/** Para onde o card vai; nulo se já está na etapa derivada (ou ela não existe no funil). */
export function destinoStarlink(
  card: CardStarlink,
  etapas: Map<ChaveEtapa, EtapaDoFunil>,
): { estagioId: string; guardarAntesDaSaida: boolean } | null {
  const campos = card.starlink ?? { credenciamentoId: '', ...CAMPOS_STARLINK_VAZIO };
  const destino = etapas.get(derivarEtapaStarlink(campos));
  if (!destino || destino.id === card.estagioId) return null;
  return {
    estagioId: destino.id,
    guardarAntesDaSaida: destino.tipoEtapa === 'SAIDA' && card.tipoEtapaAtual !== 'SAIDA',
  };
}

export type CardParaMover = { id: string; operacao: Operacao; estagioId: string; estagioDesde: Date };
export type MoverCard = (
  card: CardParaMover,
  paraEstagioId: string,
  historico: { tipo: TipoHistoricoEsteira; motivo: string; observacao?: string | null },
  extra?: { estagioAntesDaSaidaId?: string },
) => Promise<void>;

/** Move cada card Starlink não arquivado para a etapa derivada; devolve quantos moveu. */
export async function reposicionarStarlink(
  cliente: ClienteDeEscrita,
  etapas: Map<ChaveEtapa, EtapaDoFunil>,
  mover: MoverCard,
): Promise<number> {
  const cards = await cliente.credenciamento.findMany({
    where: { operacao: 'STARLINK', arquivadoEm: null },
    select: {
      id: true,
      operacao: true,
      estagioId: true,
      estagioDesde: true,
      estagio: { select: { tipoEtapa: true } },
      starlink: true,
    },
  });
  let movidos = 0;
  for (const card of cards) {
    const destino = destinoStarlink(
      { estagioId: card.estagioId, tipoEtapaAtual: card.estagio.tipoEtapa, starlink: card.starlink },
      etapas,
    );
    if (!destino) continue;
    await mover(
      card,
      destino.estagioId,
      { tipo: 'CORRECAO', motivo: MOTIVO_MIGRACAO_STARLINK },
      destino.guardarAntesDaSaida ? { estagioAntesDaSaidaId: card.estagioId } : {},
    );
    movidos += 1;
  }
  return movidos;
}
