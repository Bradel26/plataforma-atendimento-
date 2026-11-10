/**
 * Sincroniza a estrutura das esteiras TIM e Starlink e reposiciona os cards
 * migrados — o passo da migração (spec 7) que a SQL não consegue fazer, porque
 * as etapas novas só existem depois da sincronização.
 *
 * Pré-requisito: migration `20261023130000_esteiras_dados` aplicada (a CLI se
 * recusa a rodar sem ela). Idempotente: cada movimento deixa um histórico com
 * motivo fixo, e quem já tem esse histórico não é movido de novo.
 *
 * Uso:
 *   npm run esteira:estrutura -w @plataforma/api -- <organizacaoId>
 *   npm run esteira:estrutura -w @plataforma/api -- --todas
 *     (ou ESTEIRA_TODAS=true: '--flag' nem sempre atravessa o npm de workspace)
 */
import 'dotenv/config';
import type { TipoHistoricoEsteira } from '@prisma/client';
import { prisma, prismaSemIsolamento } from '../lib/prisma';
import { comOrganizacao } from '../lib/tenant';
import { etapa, type ChaveEtapa } from '../modules/esteira/catalogo';
import { sincronizarEstrutura } from '../modules/esteira/estrutura.service';
import { saidaDaExcecaoAntiga } from '../modules/esteira/migracao';
import { reposicionarStarlink } from '../modules/esteira/reposicionarStarlink';

const MIGRATION_DE_DADOS = '20261023130000_esteiras_dados';
export const MOTIVO_MIGRACAO_CICLO = 'Migração: já tinha ciclo do parceiro';
export const MOTIVO_MIGRACAO_SAIDA = 'Migração: situação de exceção antiga';

/** Quando a migration de dados terminou; nulo se ainda não foi aplicada. */
async function momentoDaMigracao(): Promise<Date | null> {
  const linhas = await prismaSemIsolamento.$queryRaw<Array<{ finished_at: Date | null }>>`
    SELECT finished_at FROM _prisma_migrations
    WHERE migration_name = ${MIGRATION_DE_DADOS} AND rolled_back_at IS NULL AND finished_at IS NOT NULL
    LIMIT 1`;
  return linhas[0]?.finished_at ?? null;
}

/** Etapas do funil ESTEIRA da operação, por chave. */
async function etapasPorChave(operacao: 'TIM' | 'STARLINK') {
  const funil = await prisma.funnel.findFirst({
    where: { tipo: 'ESTEIRA', operacao },
    include: { estagios: true },
  });
  if (!funil) throw new Error(`Funil ESTEIRA ${operacao} não encontrado depois da sincronização`);
  return new Map(funil.estagios.filter((e) => e.chave).map((e) => [e.chave as ChaveEtapa, e]));
}

type CardParaMover = { id: string; operacao: 'TIM' | 'STARLINK'; estagioId: string; estagioDesde: Date };

/** Move o card de etapa e grava o histórico, na mesma transação. */
async function mover(
  card: CardParaMover,
  paraEstagioId: string,
  historico: { tipo: TipoHistoricoEsteira; motivo: string; observacao?: string | null },
  extra: { estagioAntesDaSaidaId?: string } = {},
) {
  const agora = new Date();
  await prisma.$transaction(
    async (tx) => {
      await tx.credenciamento.update({
        where: { id: card.id },
        data: { estagioId: paraEstagioId, estagioDesde: agora, ...extra },
      });
      await tx.credenciamentoHistorico.create({
        data: {
          credenciamentoId: card.id,
          operacao: card.operacao,
          deEstagioId: card.estagioId,
          paraEstagioId,
          segundosNoEstagio: Math.max(0, Math.round((agora.getTime() - card.estagioDesde.getTime()) / 1000)),
          tipo: historico.tipo,
          motivo: historico.motivo,
          observacao: historico.observacao ?? null,
        },
      });
    },
    { timeout: 20_000 },
  );
}

/**
 * TIM em "Apto para venda" (agora TIM_VENDA_LIBERADA) que já tinha ciclo do
 * parceiro antes da migração → Acompanhamento. O corte pela data da migração
 * impede mover, numa reexecução, quem chegou a Venda liberada depois.
 */
async function reposicionarTimComCiclo(migradoEm: Date) {
  const etapas = await etapasPorChave('TIM');
  const destino = etapas.get('TIM_ACOMPANHAMENTO')!;
  const cards = await prisma.credenciamento.findMany({
    where: {
      operacao: 'TIM',
      arquivadoEm: null,
      situacaoExcecao: null,
      estagio: { chave: 'TIM_VENDA_LIBERADA' },
      cicloParceiro: { is: { criadoEm: { lt: migradoEm } } },
      historico: { none: { motivo: MOTIVO_MIGRACAO_CICLO } },
    },
    select: { id: true, operacao: true, estagioId: true, estagioDesde: true },
  });
  for (const card of cards) {
    await mover(card, destino.id, { tipo: 'CORRECAO', motivo: MOTIVO_MIGRACAO_CICLO });
    await prisma.credenciamentoTim.upsert({
      where: { credenciamentoId: card.id },
      update: { statusParceria: 'ATIVO' },
      create: { credenciamentoId: card.id, statusParceria: 'ATIVO' },
    });
  }
  return cards.length;
}

/** TIM com a situação de exceção antiga → etapa de saída (spec 7). */
async function reposicionarTimComExcecao() {
  const etapas = await etapasPorChave('TIM');
  const cards = await prisma.credenciamento.findMany({
    where: {
      operacao: 'TIM',
      arquivadoEm: null,
      situacaoExcecao: { not: null },
      motivoSituacao: { startsWith: 'Migrado de:' },
      estagio: { tipoEtapa: { not: 'SAIDA' } },
      historico: { none: { motivo: MOTIVO_MIGRACAO_SAIDA } },
    },
    select: {
      id: true,
      operacao: true,
      estagioId: true,
      estagioDesde: true,
      situacaoExcecao: true,
      motivoSituacao: true,
      estagio: { select: { chave: true } },
    },
  });
  for (const card of cards) {
    const chaveAtual = card.estagio.chave as ChaveEtapa | null;
    const trilho = chaveAtual && chaveAtual.startsWith('TIM_') ? etapa(chaveAtual).trilho : null;
    const saida = saidaDaExcecaoAntiga('TIM', card.situacaoExcecao!, trilho);
    await mover(
      card,
      etapas.get(saida.chave)!.id,
      { tipo: 'SAIDA', motivo: MOTIVO_MIGRACAO_SAIDA, observacao: card.motivoSituacao },
      { estagioAntesDaSaidaId: card.estagioId },
    );
    await prisma.credenciamentoTim.upsert({
      where: { credenciamentoId: card.id },
      update: { statusParceria: saida.statusParceria },
      create: { credenciamentoId: card.id, statusParceria: saida.statusParceria },
    });
  }
  return cards.length;
}

/** Cards que ficaram em etapa inativa (nome antigo sem equivalente): só avisa. */
async function cardsEmEtapaInativa() {
  return prisma.credenciamento.groupBy({
    by: ['operacao', 'estagioId'],
    where: { arquivadoEm: null, estagio: { ativa: false } },
    _count: { _all: true },
  });
}

async function processarOrganizacao(organizacaoId: string, migradoEm: Date) {
  const estrutura = await sincronizarEstrutura(organizacaoId);
  await comOrganizacao(organizacaoId, async () => {
    const comCiclo = await reposicionarTimComCiclo(migradoEm);
    const comExcecao = await reposicionarTimComExcecao();
    const starlink = await reposicionarStarlink(prisma, await etapasPorChave('STARLINK'), mover);
    const inativas = await cardsEmEtapaInativa();

    console.log(`Organização ${organizacaoId}:`);
    console.log(
      `  estrutura: ${estrutura.funisCriados} funil(is) criado(s), ${estrutura.etapasCriadas} etapa(s) criada(s), ${estrutura.etapasAtualizadas} atualizada(s)`,
    );
    console.log(`  TIM → Acompanhamento (já tinha ciclo): ${comCiclo}`);
    console.log(`  TIM → saída (exceção antiga): ${comExcecao}`);
    console.log(`  Starlink → etapa derivada dos campos: ${starlink}`);
    for (const linha of inativas) {
      console.warn(`  AVISO: ${linha._count._all} card(s) ${linha.operacao} na etapa inativa ${linha.estagioId}`);
    }
  });
}

// Funcao em vez de await no topo: o modulo compilado do projeto e CommonJS.
async function main() {
  const todas = process.argv.includes('--todas') || process.env.ESTEIRA_TODAS === 'true';
  const organizacaoId = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!todas && !organizacaoId) {
    console.error('Uso: npm run esteira:estrutura -w @plataforma/api -- <organizacaoId|--todas>');
    process.exitCode = 1;
    return;
  }

  const migradoEm = await momentoDaMigracao();
  if (!migradoEm) {
    console.error(`A migration ${MIGRATION_DE_DADOS} ainda não foi aplicada. Rode "npx prisma migrate deploy" antes.`);
    process.exitCode = 1;
    return;
  }

  const organizacoes = todas
    ? await prismaSemIsolamento.organizacao.findMany({ select: { id: true }, orderBy: { nome: 'asc' } })
    : [{ id: organizacaoId! }];
  for (const { id } of organizacoes) await processarOrganizacao(id, migradoEm);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => void prismaSemIsolamento.$disconnect());
