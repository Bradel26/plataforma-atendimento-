import { prisma } from '../../lib/prisma';
import { badRequest } from '../../lib/errors';
import { filtroDe, politicaContas } from '../../lib/politicas';
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

const COLUNAS_CONTATO = ['nome', 'email', 'telefone', 'conta', 'canal_origem', 'observacoes'] as const;

export const MODELO_CONTATOS_CSV = gerarCsv([...COLUNAS_CONTATO], [
  {
    nome: 'Joao Souza',
    email: 'joao@empresa.com',
    telefone: '11988880000',
    conta: 'Empresa Exemplo',
    canal_origem: 'WHATSAPP',
    observacoes: 'Indicado por cliente atual',
  },
]);

const COLUNAS_CONTA = ['nome', 'cnpj', 'segmento', 'site', 'telefone', 'email', 'observacoes'] as const;

export const MODELO_CONTAS_CSV = gerarCsv([...COLUNAS_CONTA], [
  {
    nome: 'Empresa Exemplo',
    cnpj: '12345678000199',
    segmento: 'Varejo',
    site: 'https://empresa.example.com',
    telefone: '1140000000',
    email: 'contato@empresa.com',
    observacoes: '',
  },
]);

const COLUNAS_OPORTUNIDADE = [
  'titulo',
  'conta',
  'funil',
  'estagio',
  'valor',
  'responsavel_email',
  'previsao_fechamento',
  'canal_origem',
] as const;

export const MODELO_OPORTUNIDADES_CSV = gerarCsv([...COLUNAS_OPORTUNIDADE], [
  {
    titulo: 'Venda de 3 splits',
    conta: 'Empresa Exemplo',
    funil: '',
    estagio: '',
    valor: '15000.00',
    responsavel_email: 'comercial@plataforma.local',
    previsao_fechamento: '2026-12-31',
    canal_origem: 'WHATSAPP',
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

/**
 * Roda a importacao linha a linha: cabecalho valido, teto de linhas, e cada
 * linha isolada num `try/catch` — a mesma forma de `importarLeads`, extraida
 * para nao repetir tres vezes a mesma contagem de criados/ignorados/erros.
 */
async function executarImportacao(
  texto: string,
  colunaObrigatoria: string,
  processarLinha: (linha: LinhaCsv, dryRun: boolean) => Promise<void>,
  dryRun: boolean,
): Promise<ResultadoImportacao> {
  const { colunas, linhas } = lerCsv(texto);
  if (linhas.length === 0) throw badRequest('CSV vazio ou sem linhas de dados');
  if (!colunas.includes(colunaObrigatoria)) {
    throw badRequest(`O CSV precisa da coluna "${colunaObrigatoria}". Colunas recebidas: ${colunas.join(', ') || 'nenhuma'}`);
  }
  if (linhas.length > 2000) throw badRequest('Importe no maximo 2000 linhas por vez');

  const resultado: ResultadoImportacao = { total: linhas.length, criados: 0, ignorados: 0, erros: [] };

  for (const [indice, linha] of linhas.entries()) {
    const numeroLinha = indice + 2;
    try {
      await processarLinha(linha, dryRun);
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

/**
 * Importa contatos de CSV. Reaproveita o contato existente por email ou
 * telefone em vez de duplicar — quem reenvia a mesma planilha corrigida nao
 * quer ver o cliente aparecer duas vezes.
 */
export async function importarContatos(texto: string, dryRun: boolean): Promise<ResultadoImportacao> {
  return executarImportacao(texto, 'nome', async (linha, dry) => {
    const nome = normalizar(linha.nome ?? '');
    if (nome.length < 2) throw new Error('Coluna "nome" vazia ou muito curta');

    const email = normalizar(linha.email ?? '').toLowerCase();
    const telefone = normalizar(linha.telefone ?? '');

    const existente = email
      ? await prisma.contact.findFirst({ where: { email } })
      : telefone
        ? await prisma.contact.findFirst({ where: { telefone } })
        : null;
    if (existente) throw new Error(`Contato ja existe (${email || telefone})`);

    const nomeConta = normalizar(linha.conta ?? '');
    const conta = nomeConta ? await prisma.account.findFirst({ where: { nome: nomeConta } }) : null;
    if (nomeConta && !conta) throw new Error(`Conta nao encontrada: ${nomeConta}`);

    if (dry) return;

    await prisma.contact.create({
      data: {
        nome,
        email: email || null,
        telefone: telefone || null,
        canalOrigem: enumOu(CANAIS, linha.canal_origem ?? '', 'EMAIL'),
        contaId: conta?.id ?? null,
        observacoes: normalizar(linha.observacoes ?? '') || null,
      },
    });
  }, dryRun);
}

/** Guarda apenas digitos, igual ao schema de conta usado no resto do CRM. */
const soDigitos = (valor: string) => valor.replace(/\D/g, '');

/**
 * Importa contas de CSV. Duplicidade e por nome OU CNPJ — a mesma planilha
 * reenviada nao cria uma segunda empresa igual.
 */
export async function importarContas(texto: string, dryRun: boolean): Promise<ResultadoImportacao> {
  return executarImportacao(texto, 'nome', async (linha, dry) => {
    const nome = normalizar(linha.nome ?? '');
    if (nome.length < 2) throw new Error('Coluna "nome" vazia ou muito curta');

    const cnpjDigitos = soDigitos(linha.cnpj ?? '');
    if (cnpjDigitos && cnpjDigitos.length !== 14) throw new Error('CNPJ precisa ter 14 digitos');

    const existente = await prisma.account.findFirst({
      where: cnpjDigitos ? { OR: [{ nome }, { cnpj: cnpjDigitos }] } : { nome },
    });
    if (existente) throw new Error(`Conta ja existe (${existente.nome})`);

    if (dry) return;

    await prisma.account.create({
      data: {
        nome,
        cnpj: cnpjDigitos || null,
        segmento: normalizar(linha.segmento ?? '') || null,
        site: normalizar(linha.site ?? '') || null,
        telefone: normalizar(linha.telefone ?? '') || null,
        email: normalizar(linha.email ?? '').toLowerCase() || null,
        observacoes: normalizar(linha.observacoes ?? '') || null,
      },
    });
  }, dryRun);
}

/**
 * Importa oportunidades de CSV. Conta e criada se nao existir (mesmo padrao
 * do lead); funil e estagio sao resolvidos por nome, e vazios caem no funil
 * ativo mais antigo e no primeiro estagio dele — o mesmo padrao de
 * `criarOportunidade` na tela, so que por nome em vez de id.
 */
export async function importarOportunidades(texto: string, dryRun: boolean): Promise<ResultadoImportacao> {
  return executarImportacao(texto, 'titulo', async (linha, dry) => {
    const titulo = normalizar(linha.titulo ?? '');
    if (titulo.length < 2) throw new Error('Coluna "titulo" vazia ou muito curta');

    const nomeFunil = normalizar(linha.funil ?? '');
    const funil = nomeFunil
      ? await prisma.funnel.findFirst({ where: { nome: nomeFunil }, include: { estagios: { orderBy: { ordem: 'asc' } } } })
      : await prisma.funnel.findFirst({
          where: { ativo: true },
          orderBy: { criadoEm: 'asc' },
          include: { estagios: { orderBy: { ordem: 'asc' } } },
        });
    if (!funil) throw new Error(nomeFunil ? `Funil nao encontrado: ${nomeFunil}` : 'Nenhum funil configurado');
    if (funil.estagios.length === 0) throw new Error('O funil nao tem estagios configurados');

    const nomeEstagio = normalizar(linha.estagio ?? '');
    const estagio = nomeEstagio ? funil.estagios.find((e) => e.nome === nomeEstagio) : funil.estagios[0];
    if (!estagio) throw new Error(nomeEstagio ? `Estagio nao encontrado no funil "${funil.nome}": ${nomeEstagio}` : 'Funil sem estagios');

    const emailResponsavel = normalizar(linha.responsavel_email ?? '').toLowerCase();
    const responsavel = emailResponsavel ? await prisma.user.findFirst({ where: { email: emailResponsavel } }) : null;
    if (emailResponsavel && !responsavel) throw new Error(`Responsavel nao encontrado: ${emailResponsavel}`);

    const nomeConta = normalizar(linha.conta ?? '');
    if (!nomeConta) throw new Error('Coluna "conta" e obrigatoria');

    if (dry) return;

    const conta =
      (await prisma.account.findFirst({ where: { nome: nomeConta } })) ??
      (await prisma.account.create({ data: { nome: nomeConta } }));

    const valor = numeroOuNulo(linha.valor ?? '') ?? 0;

    await prisma.opportunity.create({
      data: {
        titulo,
        contaId: conta.id,
        funilId: funil.id,
        estagioId: estagio.id,
        valor,
        valorUnico: valor,
        valorMensal: 0,
        valorInformado: valor,
        mesesRecorrencia: 12,
        responsavelId: responsavel?.id ?? null,
        previsaoFechamento: dataOuNula(linha.previsao_fechamento ?? ''),
        canalOrigem: linha.canal_origem?.trim() ? enumOu(CANAIS, linha.canal_origem, 'EMAIL') : null,
        historicoEstagio: { create: { paraEstagioId: estagio.id } },
      },
    });
  }, dryRun);
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

/**
 * Exportacao de contas. E a unica exportacao deste modulo que passa por
 * politica de visibilidade — as demais (leads, contatos, oportunidades,
 * protocolos, conversas) sao anteriores a este item e exportam tudo dentro da
 * organizacao, sem filtro de carteira; nao mexi nelas para nao mudar
 * comportamento existente por fora do que foi pedido, mas fica registrado
 * como inconsistencia a revisar.
 */
export async function exportarContas() {
  const contas = await prisma.account.findMany({
    where: await filtroDe(politicaContas),
    include: { responsavel: { select: { nome: true } }, _count: { select: { contatos: true, oportunidades: true } } },
    orderBy: { nome: 'asc' },
  });

  return gerarCsv(
    ['nome', 'cnpj', 'segmento', 'site', 'telefone', 'email', 'responsavel', 'contatos', 'oportunidades', 'criado_em'],
    contas.map((c) => ({
      nome: c.nome,
      cnpj: c.cnpj ?? '',
      segmento: c.segmento ?? '',
      site: c.site ?? '',
      telefone: c.telefone ?? '',
      email: c.email ?? '',
      responsavel: c.responsavel?.nome ?? '',
      contatos: c._count.contatos,
      oportunidades: c._count.oportunidades,
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
