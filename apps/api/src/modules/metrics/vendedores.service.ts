import { prisma } from '../../lib/prisma';
import { contextoVisibilidade } from '../../lib/visibilidade';
import { organizacaoAtual } from '../../lib/tenant';
import { notFound } from '../../lib/errors';
import { competencia, proximoMes } from '../crm/metas';
import { conversao } from './vendedores';
import { mediaSegundos } from './metrics.service';

/**
 * Resumo combinado do painel individual do vendedor (item §16 do modelo de CRM
 * auditado). Compoe consultas que ja existem em outros modulos (metas, conversas,
 * metricas) em vez de duplicar a regra de cada uma — ver a spec para o porque de cada
 * escolha de atribuicao (responsavelId vs agenteId, o que conta como "aberta", etc).
 */
export type ResumoVendedor = {
  vendedor: { id: string; nome: string };
  mes: string;
  clientesAtendidos: number;
  conversas: { total: number; abertas: number; encerradas: number };
  tempos: { tmeSegundos: number | null; tmaSegundos: number | null };
  oportunidades: { abertas: number; ganhas: number; perdidas: number };
  propostas: number;
  vendas: { quantidade: number; valor: number };
  conversao: number | null;
  meta: { valor: number; definida: boolean };
  whatsapp: Array<{ id: string; nome: string | null; ativo: boolean; modo: string | null }>;
};

/** Ids de vendedor que o requisitante pode escolher no seletor. */
async function idsVisiveis(): Promise<string[] | null> {
  const ctx = await contextoVisibilidade();
  if (ctx.veTudo) return null; // null = sem filtro, todo mundo
  if (ctx.veEquipe) return ctx.equipeIds;
  return [ctx.usuarioId];
}

/**
 * Lista { id, nome } dos vendedores visiveis. ADMIN/SUPERVISOR veem todos os usuarios
 * ativos; GESTOR ve a propria equipe (`equipeIds`); os demais, so a si mesmos.
 *
 * Existe porque `GET /usuarios` exige ADMIN/SUPERVISOR e nao serve GESTOR — criar este
 * endpoint pequeno e escopado e mais simples e mais seguro do que afrouxar aquela rota.
 */
export async function listarVendedoresVisiveis() {
  const ids = await idsVisiveis();
  return prisma.user.findMany({
    where: {
      ativo: true,
      ...(ids
        ? { id: { in: ids } }
        // ADMIN/SUPERVISOR (veTudo, sem `ids`): so os perfis que plausivelmente
        // sao `responsavelId` de uma oportunidade neste modelo de papeis. A
        // propria equipe do GESTOR e o "so eu mesmo" dos demais ficam como
        // estavam — sempre selecionaveis, qualquer que seja o perfil.
        : { perfil: { in: ['GESTOR', 'COMERCIAL'] } }),
    },
    select: { id: true, nome: true },
    orderBy: { nome: 'asc' },
  });
}

/** Se o requisitante pode ver o resumo do vendedor `vendedorId`. */
export async function podeVerVendedor(vendedorId: string): Promise<boolean> {
  const ids = await idsVisiveis();
  return ids === null || ids.includes(vendedorId);
}

export async function resumoDoVendedor(vendedorId: string, mes: Date): Promise<ResumoVendedor> {
  const inicio = competencia(mes);
  const fim = proximoMes(inicio);
  const periodo = { criadoEm: { gte: inicio, lt: fim } };

  const [
    vendedor,
    clientesAtendidosGrupos,
    conversasPorStatus,
    tme,
    tma,
    oportunidadesPorStatus,
    gruposDePropostas,
    metaRegistrada,
    canais,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: vendedorId }, select: { id: true, nome: true } }),
    prisma.conversation.groupBy({
      by: ['contatoId'],
      where: { agenteId: vendedorId, ...periodo },
    }),
    prisma.conversation.groupBy({
      by: ['status'],
      _count: { _all: true },
      where: { agenteId: vendedorId, ...periodo },
    }),
    mediaSegundos('criado_em', 'atribuido_em', 'conversas', inicio, vendedorId),
    mediaSegundos('atribuido_em', 'finalizado_em', 'conversas', inicio, vendedorId),
    prisma.opportunity.groupBy({
      by: ['status'],
      _count: { _all: true },
      _sum: { valor: true },
      where: {
        responsavelId: vendedorId,
        OR: [{ status: 'ABERTA' }, { fechadoEm: { gte: inicio, lt: fim } }],
      },
    }),
    /*
     * As propostas geradas (`PropostaGerada`) nao carregam `organizacaoId` — sao
     * filho de `Opportunity`, alcancado so por `oportunidadeId`, e por isso NAO
     * estao em `COM_ORGANIZACAO` (ver `lib/prisma.ts`). Um filtro aninhado em
     * relacao nao passa pela extensao — por isso `organizacaoId` entra aqui a
     * mao, explicitamente, dentro do `where.oportunidade`. Isso so e seguro
     * porque `Opportunity.responsavelId` agora e validado (`exigirUsuarioDaOrganizacao`
     * em `opportunities.service.ts`) para sempre pertencer a esta organizacao —
     * sem essa garantia um id de vendedor de outra organizacao poderia, em tese,
     * ter sido gravado aqui e vazar dados.
     *
     * `groupBy` por `oportunidadeId`, e nao `count`: a pergunta certa e "quantas
     * oportunidades distintas tiveram proposta gerada no periodo", nao "quantos
     * PDFs foram baixados" — um refresh ou retry no download nao pode inflar o
     * numero.
     */
    prisma.propostaGerada.groupBy({
      by: ['oportunidadeId'],
      where: {
        criadoEm: { gte: inicio, lt: fim },
        oportunidade: { responsavelId: vendedorId, organizacaoId: organizacaoAtual() },
      },
    }),
    prisma.meta.findFirst({ where: { usuarioId: vendedorId, escopo: 'INDIVIDUAL', mes: inicio } }),
    prisma.channelConfig.findMany({
      where: { donoId: vendedorId, canal: 'WHATSAPP' },
      select: { id: true, nome: true, ativo: true, modo: true },
    }),
  ]);

  if (!vendedor) throw notFound('Vendedor nao encontrado');

  const propostas = gruposDePropostas.length;

  const contarStatus = (grupos: Array<{ status: string; _count: { _all: number } }>, status: string) =>
    grupos.find((g) => g.status === status)?._count._all ?? 0;

  const abertas = contarStatus(conversasPorStatus, 'ATRIBUIDO') + contarStatus(conversasPorStatus, 'EM_ATENDIMENTO');
  const encerradas = contarStatus(conversasPorStatus, 'FINALIZADO');
  const totalConversas = conversasPorStatus.reduce((acc, g) => acc + g._count._all, 0);

  const oportunidadesAbertas = oportunidadesPorStatus.find((g) => g.status === 'ABERTA');
  const oportunidadesGanhas = oportunidadesPorStatus.find((g) => g.status === 'GANHA');
  const oportunidadesPerdidas = oportunidadesPorStatus.find((g) => g.status === 'PERDIDA');
  const ganhas = oportunidadesGanhas?._count._all ?? 0;
  const perdidas = oportunidadesPerdidas?._count._all ?? 0;

  return {
    vendedor,
    mes: inicio.toISOString().slice(0, 10),
    clientesAtendidos: clientesAtendidosGrupos.length,
    conversas: { total: totalConversas, abertas, encerradas },
    tempos: { tmeSegundos: tme, tmaSegundos: tma },
    oportunidades: { abertas: oportunidadesAbertas?._count._all ?? 0, ganhas, perdidas },
    propostas,
    vendas: { quantidade: ganhas, valor: Number(oportunidadesGanhas?._sum.valor ?? 0) },
    conversao: conversao(ganhas, perdidas),
    meta: { valor: metaRegistrada ? Number(metaRegistrada.valor) : 0, definida: metaRegistrada !== null },
    whatsapp: canais,
  };
}
