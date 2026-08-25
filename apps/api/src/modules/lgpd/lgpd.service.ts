import type { AcaoLgpd, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/errors';
import { apagarArquivosDeMensagens, apagarArquivosDeProtocolos } from './arquivos';

/**
 * Politica de retencao e direitos do titular (LGPD).
 *
 * Duas ideias guiam o modulo:
 *   - **Anonimizar em vez de excluir a linha.** Apagar a conversa levaria embora
 *     o tempo de espera e o volume por canal daquele mes: metrica de operacao
 *     nao e dado pessoal e nao precisa ser destruida junto. Some o conteudo e a
 *     identidade; ficam as datas e os contadores.
 *   - **Toda operacao deixa registro.** A plataforma tem de conseguir provar o
 *     que apagou, quando e a pedido de quem.
 */

const PADRAO = { id: 'default' } as const;

export async function obterPolitica() {
  return (
    (await prisma.retentionPolicy.findUnique({ where: PADRAO })) ??
    prisma.retentionPolicy.create({ data: PADRAO })
  );
}

export async function salvarPolitica(input: {
  ativa?: boolean;
  diasConversas?: number;
  diasProtocolos?: number;
  diasPresenca?: number;
}) {
  await obterPolitica();
  return prisma.retentionPolicy.update({ where: PADRAO, data: input });
}

export function registrar(
  acao: AcaoLgpd,
  detalhe: Prisma.InputJsonValue,
  opcoes: { autorId?: string | null; contatoId?: string | null } = {},
) {
  return prisma.lgpdLog.create({
    data: {
      acao,
      detalhe,
      autorId: opcoes.autorId ?? null,
      contatoId: opcoes.contatoId ?? null,
    },
  });
}

export async function listarRegistros(limite = 50) {
  const registros = await prisma.lgpdLog.findMany({
    take: limite,
    orderBy: { criadoEm: 'desc' },
    include: { autor: { select: { id: true, nome: true } } },
  });

  return registros.map((r) => ({
    id: r.id,
    acao: r.acao,
    contatoId: r.contatoId,
    detalhe: r.detalhe,
    autor: r.autor?.nome ?? 'Expurgo automatico',
    criadoEm: r.criadoEm,
  }));
}

/**
 * Portabilidade (art. 18, V): tudo o que a plataforma sabe sobre o titular, num
 * JSON. A exportacao tambem entra na trilha de auditoria — copia de dado pessoal
 * saindo do sistema e evento que precisa de rastro.
 */
export async function exportarTitular(contatoId: string, autorId: string) {
  const contato = await prisma.contact.findUnique({
    where: { id: contatoId },
    include: {
      conta: { select: { id: true, nome: true } },
      conversas: {
        orderBy: { criadoEm: 'asc' },
        include: {
          mensagens: { orderBy: { criadoEm: 'asc' } },
          pesquisa: true,
          fila: { select: { nome: true } },
          agente: { select: { nome: true } },
        },
      },
      protocolos: {
        orderBy: { criadoEm: 'asc' },
        include: { comentarios: { orderBy: { criadoEm: 'asc' } }, anexos: true },
      },
      leads: { orderBy: { criadoEm: 'asc' } },
      itensCampanha: { include: { campanha: { select: { nome: true } } } },
    },
  });
  if (!contato) throw notFound('Contato nao encontrado');

  await registrar(
    'EXPORTACAO',
    { conversas: contato.conversas.length, protocolos: contato.protocolos.length },
    { autorId, contatoId },
  );

  return {
    geradoEm: new Date(),
    titular: {
      id: contato.id,
      nome: contato.nome,
      email: contato.email,
      telefone: contato.telefone,
      tags: contato.tags,
      observacoes: contato.observacoes,
      canalOrigem: contato.canalOrigem,
      conta: contato.conta,
      consentimentoEm: contato.consentimentoEm,
      anonimizadoEm: contato.anonimizadoEm,
      criadoEm: contato.criadoEm,
    },
    conversas: contato.conversas.map((c) => ({
      canal: c.canal,
      status: c.status,
      fila: c.fila?.nome ?? null,
      atendente: c.agente?.nome ?? null,
      criadoEm: c.criadoEm,
      finalizadoEm: c.finalizadoEm,
      avaliacao: c.pesquisa ? { nota: c.pesquisa.nota, comentario: c.pesquisa.comentario } : null,
      mensagens: c.mensagens.map((m) => ({
        autor: m.autor,
        conteudo: m.conteudo,
        tipoAnexo: m.tipoAnexo,
        temAnexo: Boolean(m.anexoUrl),
        criadoEm: m.criadoEm,
      })),
    })),
    protocolos: contato.protocolos.map((p) => ({
      numero: p.numero,
      titulo: p.titulo,
      descricao: p.descricao,
      status: p.status,
      criadoEm: p.criadoEm,
      comentarios: p.comentarios.map((c) => ({ conteudo: c.conteudo, interno: c.interno, criadoEm: c.criadoEm })),
      anexos: p.anexos.map((a) => ({ nome: a.nome, tipo: a.tipo, tamanho: a.tamanho, criadoEm: a.criadoEm })),
    })),
    leads: contato.leads.map((l) => ({
      fase: l.fase,
      tipo: l.tipo,
      observacoes: l.observacoes,
      criadoEm: l.criadoEm,
      fechadoEm: l.fechadoEm,
    })),
    campanhas: contato.itensCampanha.map((i) => ({
      campanha: i.campanha.nome,
      status: i.status,
      enviadoEm: i.enviadoEm,
    })),
  };
}

/**
 * Eliminacao (art. 18, VI): tira do sistema o que identifica o titular e o
 * texto livre onde dado pessoal se esconde — mensagem, comentario, descricao de
 * protocolo, observacao de lead — e apaga os arquivos correspondentes.
 *
 * O que fica: a conversa sem conteudo, com canal, fila, agente e datas. Isso
 * sustenta o relatorio do mes passado sem apontar para ninguem.
 *
 * Nao e reversivel de proposito. Anonimizacao que se desfaz nao e anonimizacao.
 */
export async function anonimizarTitular(
  contatoId: string,
  opcoes: { autorId?: string | null; motivo?: string } = {},
) {
  const contato = await prisma.contact.findUnique({ where: { id: contatoId } });
  if (!contato) throw notFound('Contato nao encontrado');

  const conversas = await prisma.conversation.findMany({ where: { contatoId }, select: { id: true } });
  const protocolos = await prisma.ticket.findMany({ where: { contatoId }, select: { id: true } });
  const conversaIds = conversas.map((c) => c.id);
  const protocoloIds = protocolos.map((p) => p.id);

  const arquivos =
    (await apagarArquivosDeMensagens(conversaIds)) + (await apagarArquivosDeProtocolos(protocoloIds));

  const mensagens = await prisma.message.deleteMany({ where: { conversaId: { in: conversaIds } } });
  const comentarios = await prisma.ticketComment.deleteMany({ where: { ticketId: { in: protocoloIds } } });
  await prisma.ticketAttachment.deleteMany({ where: { ticketId: { in: protocoloIds } } });

  await prisma.conversation.updateMany({
    where: { contatoId },
    data: { enderecoExterno: null, assunto: null, naoLidas: 0 },
  });
  // Nota da pesquisa fica (e metrica); o comentario, texto livre, sai.
  await prisma.survey.updateMany({ where: { conversaId: { in: conversaIds } }, data: { comentario: null } });
  await prisma.ticket.updateMany({
    where: { contatoId },
    data: { titulo: 'Protocolo anonimizado', descricao: '[removido a pedido do titular]' },
  });
  await prisma.lead.updateMany({ where: { contatoId }, data: { observacoes: null } });

  const anonimizado = await prisma.contact.update({
    where: { id: contatoId },
    data: {
      // Sufixo do proprio id: duas linhas anonimizadas continuam distinguiveis
      // numa lista sem revelar nada de quem eram.
      nome: `Titular anonimizado ${contatoId.slice(0, 8)}`,
      email: null,
      telefone: null,
      observacoes: null,
      tags: [],
      anonimizadoEm: new Date(),
    },
  });

  const detalhe = {
    motivo: opcoes.motivo ?? 'pedido do titular',
    conversas: conversaIds.length,
    protocolos: protocoloIds.length,
    mensagensApagadas: mensagens.count,
    comentariosApagados: comentarios.count,
    arquivosApagados: arquivos,
  };
  await registrar('ANONIMIZACAO', detalhe, { autorId: opcoes.autorId ?? null, contatoId });

  return { contato: { id: anonimizado.id, nome: anonimizado.nome }, ...detalhe };
}

/**
 * Reaplica a anonimizacao registrada na trilha de auditoria.
 *
 * Restaurar um backup ressuscita o dado que o titular pediu para apagar: o
 * snapshot foi tirado antes do pedido, e o provedor de banco nao sabe da LGPD.
 * A trilha de auditoria e o que sobra — ela guarda quais contatos foram
 * anonimizados, e sem chave estrangeira de proposito, justamente para sobreviver
 * ao titular.
 *
 * Entao o procedimento de restauracao tem dois passos: restaure, e rode isto.
 * Roda em simulacao por padrao — ninguem devia descobrir o alcance da operacao
 * depois de executa-la.
 */
export async function reaplicarAnonimizacoes(opcoes: { simulacao?: boolean } = {}) {
  const simulacao = opcoes.simulacao ?? true;

  const registros = await prisma.lgpdLog.findMany({
    where: { acao: 'ANONIMIZACAO', contatoId: { not: null } },
    select: { contatoId: true },
    distinct: ['contatoId'],
  });
  const ids = registros.map((r) => r.contatoId!).filter(Boolean);

  // Quem ja esta anonimizado nao entra: a operacao apaga mensagem, e repetir
  // gastaria escrita sem mudar nada.
  const pendentes = await prisma.contact.findMany({
    where: { id: { in: ids }, anonimizadoEm: null },
    select: { id: true, nome: true },
  });

  // Registro cujo contato nao existe mais: o expurgo levou a linha inteira, que
  // e um resultado melhor que a anonimizacao. Nao e pendencia.
  const ausentes = ids.length - (await prisma.contact.count({ where: { id: { in: ids } } }));

  if (simulacao) {
    return { simulacao: true, registrados: ids.length, ausentes, reaplicados: 0, pendentes: pendentes.length };
  }

  let reaplicados = 0;
  const falhas: string[] = [];
  for (const contato of pendentes) {
    try {
      await anonimizarTitular(contato.id, { motivo: 'reaplicacao apos restauracao de backup' });
      reaplicados++;
    } catch {
      falhas.push(contato.id);
    }
  }

  return {
    simulacao: false,
    registrados: ids.length,
    ausentes,
    reaplicados,
    pendentes: pendentes.length - reaplicados,
    falhas,
  };
}
