import { prisma } from '../../lib/prisma';
import { badRequest } from '../../lib/errors';
import { gerarCsv, lerCsv, type LinhaCsv } from './csv';
import { FASES, MOTIVOS_PERDA, TIPOS } from '../crm/leads.schemas';

const CANAIS = ['WEBCHAT', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'EMAIL', 'VOZ'] as const;

const COLUNAS_LEAD = [
  'nome',
  'email',
  'telefone',
  'conta',
  'fase',
  'tipo',
  'canal_origem',
  'responsavel_email',
  'prazo',
  'valor_estimado',
  'motivo_perda',
  'observacoes',
] as const;

export const MODELO_LEADS_CSV = gerarCsv([...COLUNAS_LEAD], [
  {
    nome: 'Maria Silva',
    email: 'maria@empresa.com',
    telefone: '11999990000',
    conta: 'Empresa Exemplo',
    fase: 'NOVO',
    tipo: 'INBOUND',
    canal_origem: 'WEBCHAT',
    responsavel_email: 'agente1@plataforma.local',
    prazo: '2026-12-31',
    valor_estimado: '15000.00',
    motivo_perda: '',
    observacoes: 'Pediu proposta',
  },
]);

type ResultadoImportacao = {
  total: number;
  criados: number;
  ignorados: number;
  erros: Array<{ linha: number; motivo: string }>;
};

const normalizar = (valor: string) => valor.trim();
const enumOu = <T extends readonly string[]>(lista: T, valor: string, padrao: T[number]): T[number] => {
  const alvo = valor.trim().toUpperCase();
  return (lista as readonly string[]).includes(alvo) ? (alvo as T[number]) : padrao;
};

function dataOuNula(valor: string): Date | null {
  if (!valor.trim()) return null;
  const data = new Date(valor.trim());
  return Number.isNaN(data.getTime()) ? null : data;
}

function numeroOuNulo(valor: string): number | null {
  if (!valor.trim()) return null;
  // Aceita "15.000,50" (pt-BR) e "15000.50".
  const limpo = valor.trim().replace(/\./g, '').replace(',', '.');
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : null;
}

/**
 * Importa leads de CSV. Cada linha vira (ou reaproveita) um contato e opcionalmente
 * uma conta. Linhas invalidas nao abortam a importacao — sao devolvidas em `erros`,
 * para o usuario corrigir a planilha sem perder o que ja entrou.
 */
export async function importarLeads(texto: string, dryRun: boolean): Promise<ResultadoImportacao> {
  const { colunas, linhas } = lerCsv(texto);
  if (linhas.length === 0) throw badRequest('CSV vazio ou sem linhas de dados');
  if (!colunas.includes('nome')) {
    throw badRequest(`O CSV precisa da coluna "nome". Colunas recebidas: ${colunas.join(', ') || 'nenhuma'}`);
  }
  if (linhas.length > 2000) throw badRequest('Importe no maximo 2000 linhas por vez');

  const resultado: ResultadoImportacao = { total: linhas.length, criados: 0, ignorados: 0, erros: [] };

  for (const [indice, linha] of linhas.entries()) {
    const numeroLinha = indice + 2; // +1 do cabecalho, +1 para base 1
    try {
      await importarLinha(linha, dryRun);
      resultado.criados += 1;
    } catch (err) {
      resultado.ignorados += 1;
      resultado.erros.push({
        linha: numeroLinha,
        motivo: err instanceof Error ? err.message : 'Erro desconhecido',
      });
    }
  }

  return resultado;
}

async function importarLinha(linha: LinhaCsv, dryRun: boolean) {
  const nome = normalizar(linha.nome ?? '');
  if (nome.length < 2) throw new Error('Coluna "nome" vazia ou muito curta');

  const email = normalizar(linha.email ?? '').toLowerCase();
  const telefone = normalizar(linha.telefone ?? '');
  const fase = enumOu(FASES, linha.fase ?? '', 'NOVO');
  const motivoTexto = normalizar(linha.motivo_perda ?? '').toUpperCase();
  const motivoPerda = (MOTIVOS_PERDA as readonly string[]).includes(motivoTexto)
    ? (motivoTexto as (typeof MOTIVOS_PERDA)[number])
    : null;

  if (fase === 'PERDIDO' && !motivoPerda) {
    throw new Error('Fase PERDIDO exige motivo_perda valido');
  }

  // Toda validacao que depende do banco acontece ANTES do corte de dryRun —
  // senao o dry run aprovaria linhas que a importacao real recusaria.
  const emailResponsavel = normalizar(linha.responsavel_email ?? '').toLowerCase();
  const responsavel = emailResponsavel
    ? await prisma.user.findFirst({ where: { email: emailResponsavel } })
    : null;
  if (emailResponsavel && !responsavel) throw new Error(`Responsavel nao encontrado: ${emailResponsavel}`);

  if (dryRun) return;

  // Reaproveita o contato por email ou telefone — importacao repetida nao duplica.
  const existente = email
    ? await prisma.contact.findFirst({ where: { email } })
    : telefone
      ? await prisma.contact.findFirst({ where: { telefone } })
      : null;

  const canalOrigem = enumOu(CANAIS, linha.canal_origem ?? '', 'EMAIL');

  const contato =
    existente ??
    (await prisma.contact.create({
      data: {
        nome,
        email: email || null,
        telefone: telefone || null,
        canalOrigem,
      },
    }));

  const nomeConta = normalizar(linha.conta ?? '');
  let contaId: string | null = null;
  if (nomeConta) {
    const conta =
      (await prisma.account.findFirst({ where: { nome: nomeConta } })) ??
      (await prisma.account.create({ data: { nome: nomeConta } }));
    contaId = conta.id;
  }

  await prisma.lead.create({
    data: {
      contatoId: contato.id,
      contaId,
      fase,
      tipo: enumOu(TIPOS, linha.tipo ?? '', 'OUTBOUND'),
      canalOrigem,
      responsavelId: responsavel?.id ?? null,
      prazo: dataOuNula(linha.prazo ?? ''),
      valorEstimado: numeroOuNulo(linha.valor_estimado ?? ''),
      motivoPerda,
      observacoes: normalizar(linha.observacoes ?? '') || null,
      fechadoEm: fase === 'GANHO' || fase === 'PERDIDO' ? new Date() : null,
    },
  });
}

const dataBr = (valor: Date | null) => (valor ? valor.toLocaleString('pt-BR') : '');

/** Exportacao de leads com os campos que interessam ao acompanhamento comercial. */
export async function exportarLeads() {
  const leads = await prisma.lead.findMany({
    include: {
      contato: true,
      conta: { select: { nome: true } },
      responsavel: { select: { nome: true, email: true } },
    },
    orderBy: { criadoEm: 'desc' },
  });

  const colunas = [
    'nome',
    'email',
    'telefone',
    'conta',
    'fase',
    'tipo',
    'canal_origem',
    'responsavel',
    'prazo',
    'valor_estimado',
    'motivo_perda',
    'criado_em',
    'fechado_em',
    'observacoes',
  ];

  return gerarCsv(
    colunas,
    leads.map((l) => ({
      nome: l.contato.nome,
      email: l.contato.email ?? '',
      telefone: l.contato.telefone ?? '',
      conta: l.conta?.nome ?? '',
      fase: l.fase,
      tipo: l.tipo,
      canal_origem: l.canalOrigem,
      responsavel: l.responsavel?.nome ?? '',
      prazo: dataBr(l.prazo),
      valor_estimado: l.valorEstimado ? Number(l.valorEstimado).toFixed(2).replace('.', ',') : '',
      motivo_perda: l.motivoPerda ?? '',
      criado_em: dataBr(l.criadoEm),
      fechado_em: dataBr(l.fechadoEm),
      observacoes: l.observacoes ?? '',
    })),
  );
}

export async function exportarContatos() {
  const contatos = await prisma.contact.findMany({
    include: { conta: { select: { nome: true } }, _count: { select: { conversas: true } } },
    orderBy: { nome: 'asc' },
  });

  return gerarCsv(
    ['nome', 'email', 'telefone', 'conta', 'canal_origem', 'conversas', 'criado_em'],
    contatos.map((c) => ({
      nome: c.nome,
      email: c.email ?? '',
      telefone: c.telefone ?? '',
      conta: c.conta?.nome ?? '',
      canal_origem: c.canalOrigem,
      conversas: c._count.conversas,
      criado_em: dataBr(c.criadoEm),
    })),
  );
}

export async function exportarOportunidades() {
  const oportunidades = await prisma.opportunity.findMany({
    include: {
      conta: { select: { nome: true } },
      funil: { select: { nome: true } },
      estagio: { select: { nome: true, probabilidade: true } },
      responsavel: { select: { nome: true } },
    },
    orderBy: { criadoEm: 'desc' },
  });

  return gerarCsv(
    ['titulo', 'conta', 'funil', 'estagio', 'probabilidade', 'valor', 'status', 'motivo_perda', 'responsavel', 'criado_em', 'fechado_em'],
    oportunidades.map((o) => ({
      titulo: o.titulo,
      conta: o.conta.nome,
      funil: o.funil.nome,
      estagio: o.estagio.nome,
      probabilidade: o.estagio.probabilidade,
      valor: Number(o.valor).toFixed(2).replace('.', ','),
      status: o.status,
      motivo_perda: o.motivoPerda ?? '',
      responsavel: o.responsavel?.nome ?? '',
      criado_em: dataBr(o.criadoEm),
      fechado_em: dataBr(o.fechadoEm),
    })),
  );
}

export async function exportarProtocolos() {
  const tickets = await prisma.ticket.findMany({
    include: {
      contato: { select: { nome: true } },
      conta: { select: { nome: true } },
      responsavel: { select: { nome: true } },
      fila: { select: { nome: true } },
      _count: { select: { comentarios: true, anexos: true } },
    },
    orderBy: { numero: 'asc' },
  });

  return gerarCsv(
    ['numero', 'titulo', 'status', 'prioridade', 'contato', 'conta', 'responsavel', 'fila', 'prazo_sla', 'criado_em', 'resolvido_em', 'fechado_em', 'comentarios', 'anexos'],
    tickets.map((t) => ({
      numero: t.numero,
      titulo: t.titulo,
      status: t.status,
      prioridade: t.prioridade,
      contato: t.contato?.nome ?? '',
      conta: t.conta?.nome ?? '',
      responsavel: t.responsavel?.nome ?? '',
      fila: t.fila?.nome ?? '',
      prazo_sla: dataBr(t.prazoSla),
      criado_em: dataBr(t.criadoEm),
      resolvido_em: dataBr(t.resolvidoEm),
      fechado_em: dataBr(t.fechadoEm),
      comentarios: t._count.comentarios,
      anexos: t._count.anexos,
    })),
  );
}

export async function exportarConversas() {
  const conversas = await prisma.conversation.findMany({
    include: {
      contato: { select: { nome: true, email: true } },
      agente: { select: { nome: true } },
      fila: { select: { nome: true } },
      _count: { select: { mensagens: true } },
    },
    orderBy: { criadoEm: 'desc' },
  });

  return gerarCsv(
    ['contato', 'email', 'canal', 'status', 'fila', 'agente', 'mensagens', 'criado_em', 'atribuido_em', 'finalizado_em'],
    conversas.map((c) => ({
      contato: c.contato.nome,
      email: c.contato.email ?? '',
      canal: c.canal,
      status: c.status,
      fila: c.fila?.nome ?? '',
      agente: c.agente?.nome ?? '',
      mensagens: c._count.mensagens,
      criado_em: dataBr(c.criadoEm),
      atribuido_em: dataBr(c.atribuidoEm),
      finalizado_em: dataBr(c.finalizadoEm),
    })),
  );
}
