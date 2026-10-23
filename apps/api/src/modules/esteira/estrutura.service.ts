/**
 * Garante a estrutura das esteiras de uma organização: um funil ESTEIRA por
 * operação, com as etapas do catálogo (chave, ordem, tipo). Idempotente — roda
 * no seed, na CLI `esteira:estrutura` e pode rodar de novo sem efeito.
 *
 * Nunca apaga etapa; nunca grava `nome` de etapa existente (renomeação do ADMIN
 * é preservada). O plano é puro e testado em `estrutura.ts`.
 */
import type { Operacao } from '@prisma/client';
import { prisma, type ClienteDeEscrita } from '../../lib/prisma';
import { badRequest } from '../../lib/errors';
import { comOrganizacao } from '../../lib/tenant';
import { ETAPAS } from './catalogo';
import { ordensFinais, planoDeSincronizacao } from './estrutura';

export const NOME_DO_FUNIL: Record<Operacao, string> = {
  TIM: 'Credenciamento TIM',
  STARLINK: 'Credenciamento Starlink',
};

/** Deslocamento temporário de `ordem` para reordenar sem violar `@@unique([funilId, ordem])`. */
const DESLOCAMENTO = 1000;

/** Funil ESTEIRA da operação: pela coluna, senão pelo nome padrão (adotado), senão criado. */
async function garantirFunil(tx: ClienteDeEscrita, operacao: Operacao) {
  const porOperacao = await tx.funnel.findFirst({ where: { tipo: 'ESTEIRA', operacao } });
  if (porOperacao) return { funil: porOperacao, criado: false };

  const nome = NOME_DO_FUNIL[operacao];
  const porNome = await tx.funnel.findFirst({ where: { nome: { equals: nome, mode: 'insensitive' } } });
  if (porNome) {
    if (porNome.tipo !== 'ESTEIRA') {
      throw badRequest(`O funil "${porNome.nome}" existe, mas não é do tipo Esteira; renomeie-o antes de sincronizar`);
    }
    const adotado = await tx.funnel.update({ where: { id: porNome.id }, data: { operacao } });
    return { funil: adotado, criado: false };
  }

  const criado = await tx.funnel.create({ data: { nome, tipo: 'ESTEIRA', operacao } });
  return { funil: criado, criado: true };
}

async function sincronizarOperacao(tx: ClienteDeEscrita, operacao: Operacao) {
  const { funil, criado } = await garantirFunil(tx, operacao);
  const catalogo = ETAPAS[operacao];
  const existentes = await tx.funnelStage.findMany({
    where: { funilId: funil.id },
    select: { id: true, nome: true, ordem: true, chave: true, tipoEtapa: true, ativa: true },
  });

  const plano = planoDeSincronizacao(existentes, catalogo);
  const ordens = ordensFinais(existentes, catalogo);
  const reordenar = existentes.some((e) => ordens.get(e.id) !== e.ordem);
  if (!reordenar && !plano.criar.length && !plano.atualizar.length && !plano.desativar.length) {
    return { funilCriado: criado, etapasCriadas: 0, etapasAtualizadas: 0 };
  }

  // Tudo para fora da faixa final antes de gravar as ordens definitivas.
  if (existentes.length) {
    await tx.funnelStage.updateMany({ where: { funilId: funil.id }, data: { ordem: { increment: DESLOCAMENTO } } });
  }
  const atualizar = new Map(plano.atualizar.map((a) => [a.id, a]));
  const desativar = new Set(plano.desativar);
  for (const e of existentes) {
    const alvo = atualizar.get(e.id);
    await tx.funnelStage.update({
      where: { id: e.id },
      data: {
        ordem: ordens.get(e.id)!,
        ...(alvo ? { chave: alvo.chave, tipoEtapa: alvo.tipo, ativa: true } : {}),
        ...(desativar.has(e.id) ? { ativa: false } : {}),
      },
    });
  }
  if (plano.criar.length) {
    await tx.funnelStage.createMany({
      data: plano.criar.map((e) => ({
        funilId: funil.id,
        nome: e.nome,
        ordem: e.ordem,
        chave: e.chave,
        tipoEtapa: e.tipo,
        ativa: true,
      })),
    });
  }

  // Só a ordem mudou (etapa inativa empurrada para o fim) também conta como atualização.
  const soOrdem = existentes.filter(
    (e) => ordens.get(e.id) !== e.ordem && !atualizar.has(e.id) && !desativar.has(e.id),
  ).length;
  return {
    funilCriado: criado,
    etapasCriadas: plano.criar.length,
    etapasAtualizadas: plano.atualizar.length + plano.desativar.length + soOrdem,
  };
}

export async function sincronizarEstrutura(
  organizacaoId: string,
): Promise<{ funisCriados: number; etapasCriadas: number; etapasAtualizadas: number }> {
  return comOrganizacao(organizacaoId, () =>
    prisma.$transaction(
      async (tx) => {
        const total = { funisCriados: 0, etapasCriadas: 0, etapasAtualizadas: 0 };
        for (const operacao of ['TIM', 'STARLINK'] as const) {
          const r = await sincronizarOperacao(tx, operacao);
          total.funisCriados += r.funilCriado ? 1 : 0;
          total.etapasCriadas += r.etapasCriadas;
          total.etapasAtualizadas += r.etapasAtualizadas;
        }
        return total;
      },
      // Banco remoto (Neon): uma ida e volta por etapa estoura os 5 s padrão.
      { timeout: 60_000, maxWait: 15_000 },
    ),
  );
}
