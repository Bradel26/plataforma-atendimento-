import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';
import { enviarParaCanal, exigeEnvioExterno } from '../channels/outbound.service';

const inclusao = {
  fila: { select: { id: true, nome: true } },
  criadoPor: { select: { id: true, nome: true } },
  _count: { select: { itens: true } },
} satisfies Prisma.CampaignInclude;

type CampanhaDb = Prisma.CampaignGetPayload<{ include: typeof inclusao }>;

async function serialize(c: CampanhaDb) {
  const porStatus = await prisma.campaignItem.groupBy({
    by: ['status'],
    where: { campanhaId: c.id },
    _count: { _all: true },
  });

  const contagens = porStatus.reduce<Record<string, number>>((acc, g) => {
    acc[g.status] = g._count._all;
    return acc;
  }, {});

  return {
    id: c.id,
    nome: c.nome,
    canal: c.canal,
    mensagem: c.mensagem,
    status: c.status,
    fila: c.fila,
    criadoPor: c.criadoPor,
    agendadaPara: c.agendadaPara,
    iniciadaEm: c.iniciadaEm,
    concluidaEm: c.concluidaEm,
    criadoEm: c.criadoEm,
    total: c._count.itens,
    contagens: {
      PENDENTE: contagens.PENDENTE ?? 0,
      ENVIADO: contagens.ENVIADO ?? 0,
      FALHOU: contagens.FALHOU ?? 0,
      RESPONDIDO: contagens.RESPONDIDO ?? 0,
      IGNORADO: contagens.IGNORADO ?? 0,
    },
  };
}

async function carregar(id: string) {
  const campanha = await prisma.campaign.findUnique({ where: { id }, include: inclusao });
  if (!campanha) throw notFound('Campanha nao encontrada');
  return campanha;
}

export async function listarCampanhas() {
  const campanhas = await prisma.campaign.findMany({ include: inclusao, orderBy: { criadoEm: 'desc' } });
  return Promise.all(campanhas.map(serialize));
}

export async function obterCampanha(id: string) {
  const campanha = await carregar(id);
  const itens = await prisma.campaignItem.findMany({
    where: { campanhaId: id },
    include: { contato: { select: { id: true, nome: true, telefone: true, email: true } } },
    orderBy: { status: 'asc' },
    take: 200,
  });

  return { campanha: await serialize(campanha), itens };
}

export async function criarCampanha(input: {
  nome: string;
  canal: 'WEBCHAT' | 'WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK' | 'EMAIL' | 'VOZ';
  mensagem: string;
  filaId?: string | null;
  agendadaPara?: Date | null;
}, criadoPorId: string) {
  const campanha = await prisma.campaign.create({
    data: { ...input, criadoPorId },
    include: inclusao,
  });
  return serialize(campanha);
}

/** Adiciona contatos. Repetir a operacao nao duplica o item (unique por campanha+contato). */
export async function adicionarContatos(id: string, contatoIds: string[]) {
  const campanha = await carregar(id);
  if (campanha.status === 'CONCLUIDA') throw badRequest('Campanha concluida nao aceita novos contatos');

  const existem = await prisma.contact.findMany({ where: { id: { in: contatoIds } }, select: { id: true } });
  if (existem.length === 0) throw notFound('Nenhum contato valido informado');

  await prisma.campaignItem.createMany({
    data: existem.map((c) => ({ campanhaId: id, contatoId: c.id })),
    skipDuplicates: true,
  });

  return serialize(await carregar(id));
}

export async function alterarStatus(id: string, status: 'RASCUNHO' | 'ATIVA' | 'PAUSADA' | 'CONCLUIDA') {
  const campanha = await carregar(id);

  if (status === 'ATIVA' && campanha._count.itens === 0) {
    throw badRequest('Adicione contatos antes de ativar a campanha');
  }

  await prisma.campaign.update({
    where: { id },
    data: {
      status,
      iniciadaEm: status === 'ATIVA' ? (campanha.iniciadaEm ?? new Date()) : campanha.iniciadaEm,
      concluidaEm: status === 'CONCLUIDA' ? new Date() : null,
    },
  });

  return serialize(await carregar(id));
}

/** Substitui {{nome}}, {{email}} e {{telefone}} no template. */
export function renderizar(template: string, contato: { nome: string; email: string | null; telefone: string | null }) {
  return template
    .replace(/\{\{\s*nome\s*\}\}/gi, contato.nome)
    .replace(/\{\{\s*email\s*\}\}/gi, contato.email ?? '')
    .replace(/\{\{\s*telefone\s*\}\}/gi, contato.telefone ?? '');
}

/**
 * Dispara os itens pendentes, em lote.
 *
 * Cada item e independente: falha de um nao interrompe os outros — o motivo fica
 * gravado em `erro` para o operador corrigir e reprocessar. Itens ja ENVIADO
 * nunca sao reenviados, entao chamar o disparo de novo e seguro.
 *
 * Canal de VOZ nao dispara: exige integracao de telefonia, que nao existe.
 */
export async function dispararCampanha(id: string, limite = 100) {
  const campanha = await carregar(id);
  if (campanha.status !== 'ATIVA') throw badRequest('Ative a campanha antes de disparar');

  if (campanha.canal === 'VOZ') {
    throw badRequest('Campanha de voz exige integracao de telefonia (PABX/SIP), ainda nao disponivel');
  }
  if (!exigeEnvioExterno(campanha.canal)) {
    throw badRequest(
      `Canal ${campanha.canal} nao suporta contato ativo — o cliente precisa iniciar a conversa`,
    );
  }

  const pendentes = await prisma.campaignItem.findMany({
    where: { campanhaId: id, status: 'PENDENTE' },
    include: { contato: true },
    take: limite,
  });

  let enviados = 0;
  let falhas = 0;

  for (const item of pendentes) {
    const destino = item.contato.telefone;
    const texto = renderizar(campanha.mensagem, item.contato);

    if (!destino) {
      await prisma.campaignItem.update({
        where: { id: item.id },
        data: { status: 'IGNORADO', erro: 'Contato sem telefone' },
      });
      continue;
    }

    try {
      await enviarParaCanal(campanha.canal, destino, texto);
      await prisma.campaignItem.update({
        where: { id: item.id },
        data: { status: 'ENVIADO', enviadoEm: new Date(), erro: null },
      });
      enviados += 1;
    } catch (err) {
      await prisma.campaignItem.update({
        where: { id: item.id },
        data: { status: 'FALHOU', erro: err instanceof Error ? err.message : 'Erro desconhecido' },
      });
      falhas += 1;
    }
  }

  const restantes = await prisma.campaignItem.count({ where: { campanhaId: id, status: 'PENDENTE' } });
  if (restantes === 0) {
    await prisma.campaign.update({ where: { id }, data: { status: 'CONCLUIDA', concluidaEm: new Date() } });
  }

  return { processados: pendentes.length, enviados, falhas, restantes };
}

/** Reenfileira os itens que falharam, para tentar de novo depois de corrigir. */
export async function reprocessarFalhas(id: string) {
  await carregar(id);
  const { count } = await prisma.campaignItem.updateMany({
    where: { campanhaId: id, status: { in: ['FALHOU', 'IGNORADO'] } },
    data: { status: 'PENDENTE', erro: null },
  });
  return { reenfileirados: count };
}
