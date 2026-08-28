import type { CallStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError, badRequest, notFound } from '../../lib/errors';
import { cifrar, decifrar } from '../../lib/crypto-box';
import { enfileirar } from '../../lib/fila';
import { apos, decodificarCursor, fatiar } from '../../lib/paginacao';
import { urlAssinada } from '../../lib/storage';
import { organizacaoAtual } from '../../lib/tenant';
import { notificarChamada } from '../../realtime/hub';
import type { Credenciais, EventoChamada, Provedor } from './voice.provider';
import { twilio } from './twilio.provider';

/** Drivers disponiveis. Provedor novo entra aqui e em nenhum outro lugar. */
const PROVEDORES: Record<string, Provedor> = { twilio };

/** Tipo do trabalho que baixa a gravacao (declarado aqui, ver campaigns.service). */
export const TIPO_GRAVACAO = 'voz:gravacao';

/** Status em que a chamada terminou — nao recebe mais evento util. */
const FINAIS: CallStatus[] = ['COMPLETADA', 'NAO_ATENDIDA', 'OCUPADA', 'FALHOU', 'CANCELADA'];

export async function obterConfig() {
  const config =
    (await prisma.voiceConfig.findFirst()) ?? (await prisma.voiceConfig.create({ data: {} }));

  // Segredo cifrado em repouso, como os canais da Meta.
  return { ...config, authToken: config.authToken ? decifrar(config.authToken) : null };
}

/** Mascara o token: a API nunca devolve credencial de voz em claro. */
export async function configPublica() {
  const { authToken, ...resto } = await obterConfig();
  const fila = resto.filaId
    ? await prisma.queue.findUnique({ where: { id: resto.filaId }, select: { id: true, nome: true } })
    : null;

  return {
    ...resto,
    fila,
    authTokenMascarado: authToken ? `${authToken.slice(0, 4)}${'*'.repeat(8)}${authToken.slice(-4)}` : null,
    configurado: Boolean(resto.contaSid && authToken),
    provedoresDisponiveis: Object.keys(PROVEDORES),
  };
}

export async function salvarConfig(input: {
  ativo?: boolean;
  provedor?: string;
  contaSid?: string | null;
  authToken?: string | null;
  numeroPadrao?: string | null;
  urlWebhook?: string | null;
  filaId?: string | null;
  guardarGravacao?: boolean;
}) {
  if (input.provedor && !PROVEDORES[input.provedor]) {
    throw badRequest(`Provedor de voz nao suportado: ${input.provedor}`);
  }
  if (input.filaId) {
    const fila = await prisma.queue.findUnique({ where: { id: input.filaId } });
    if (!fila) throw notFound('Fila nao encontrada');
  }

  const atual = await obterConfig();
  const futuro = { ...atual, ...input };
  if (futuro.ativo && !(futuro.contaSid && futuro.authToken && futuro.numeroPadrao)) {
    throw badRequest('Para ativar a voz informe contaSid, authToken e numeroPadrao');
  }
  // Sem URL publica o provedor nao consegue reportar nada: a chamada existiria
  // sem ninguem saber o que aconteceu com ela.
  if (futuro.ativo && !futuro.urlWebhook?.startsWith('https://')) {
    throw badRequest('A URL de webhook precisa ser publica e HTTPS para o provedor reportar os eventos');
  }

  const dados = { ...input, ...(input.authToken ? { authToken: cifrar(input.authToken) } : {}) };
  await prisma.voiceConfig.update({ where: { organizacaoId: organizacaoAtual() }, data: dados });
  return configPublica();
}

/** Provedor + credenciais prontos para uso, ou erro claro de configuracao. */
async function ativo(): Promise<{ provedor: Provedor; credenciais: Credenciais }> {
  const config = await obterConfig();
  const provedor = PROVEDORES[config.provedor];

  if (!provedor) throw badRequest(`Provedor de voz nao suportado: ${config.provedor}`);
  if (!config.ativo || !config.contaSid || !config.authToken) {
    throw new AppError(503, 'VOZ_INDISPONIVEL', 'Canal de voz nao esta configurado ou esta inativo');
  }

  return {
    provedor,
    credenciais: {
      contaSid: config.contaSid,
      authToken: config.authToken,
      numeroPadrao: config.numeroPadrao,
      urlWebhook: config.urlWebhook,
    },
  };
}

/** Driver em uso, para a rota de webhook normalizar o evento. */
export async function provedorAtual(): Promise<Provedor> {
  return (await ativo()).provedor;
}

/** Usado pela rota de webhook para validar a assinatura antes de confiar no corpo. */
export async function verificarAssinatura(entrada: {
  url: string;
  parametros: Record<string, string>;
  assinatura: string | undefined;
}) {
  const { provedor, credenciais } = await ativo();
  return provedor.assinaturaValida({ ...entrada, authToken: credenciais.authToken });
}

/**
 * Aplica um evento do provedor ao CDR.
 *
 * Idempotente por `idExterno`: o provedor reentrega evento quando nao recebe
 * 200, e o mesmo evento chegando duas vezes nao pode duplicar chamada nem
 * reabrir chamada encerrada.
 */
export async function aplicarEvento(evento: EventoChamada) {
  const config = await obterConfig();
  const existente = await prisma.call.findUnique({ where: { idExterno: evento.idExterno } });

  // Chamada ja encerrada so aceita o que chega depois do fim: a gravacao.
  if (existente && FINAIS.includes(existente.status) && !evento.gravacaoUrl) {
    return { chamada: existente, ignorado: true };
  }

  const agora = new Date();
  const encerrou = FINAIS.includes(evento.status as CallStatus);
  const atendeu = evento.status === 'EM_ANDAMENTO';

  const dados: Prisma.CallUncheckedUpdateInput = {
    status: evento.status as CallStatus,
    duracao: evento.duracao ?? existente?.duracao ?? null,
    custo: evento.custo ?? existente?.custo ?? null,
    motivoFalha: evento.motivoFalha ?? existente?.motivoFalha ?? null,
    gravacaoDuracao: evento.gravacaoDuracao ?? existente?.gravacaoDuracao ?? null,
    /**
     * Guarda a URL do provedor de imediato e deixa o worker substituir pela
     * interna. Se o download falhar, ao menos o operador sabe onde a gravacao
     * esta — melhor que perder a referencia inteira.
     */
    ...(evento.gravacaoUrl && !existente?.gravacaoUrl?.startsWith('/api/arquivos/')
      ? { gravacaoUrl: evento.gravacaoUrl }
      : {}),
    ...(atendeu && !existente?.atendidoEm ? { atendidoEm: agora } : {}),
    ...(encerrou && !existente?.encerradoEm ? { encerradoEm: agora } : {}),
  };

  const chamada = existente
    ? await prisma.call.update({ where: { id: existente.id }, data: dados })
    : await prisma.call.create({
        data: {
          // O spread vem primeiro: status e datas do evento nao devem
          // sobrescrever a identidade da chamada definida abaixo.
          ...(dados as Prisma.CallUncheckedCreateInput),
          idExterno: evento.idExterno,
          direcao: evento.direcao,
          numeroOrigem: evento.numeroOrigem,
          numeroDestino: evento.numeroDestino,
          // Chamada entrante cai na fila configurada; sainte nasce do agente.
          filaId: evento.direcao === 'ENTRANTE' ? config.filaId : null,
          contatoId: await contatoDoNumero(evento),
        },
      });

  /**
   * A gravacao vai para a fila, nao para dentro do webhook: o provedor espera
   * resposta rapida e desiste (com reentrega) se a rota demorar baixando audio.
   */
  if (evento.gravacaoUrl && config.guardarGravacao && !chamada.gravacaoUrl?.startsWith('/api/arquivos/')) {
    await enfileirar(TIPO_GRAVACAO, { chamadaId: chamada.id, url: evento.gravacaoUrl });
  }

  notificarChamada(serializar(chamada), { agenteId: chamada.agenteId, filaId: chamada.filaId });
  return { chamada, ignorado: false };
}

/** Liga a chamada ao contato pelo telefone, quando ja existe cadastro. */
async function contatoDoNumero(evento: EventoChamada) {
  const numero = evento.direcao === 'ENTRANTE' ? evento.numeroOrigem : evento.numeroDestino;
  const digitos = numero.replace(/\D/g, '').slice(-8);
  if (digitos.length < 8) return null;

  const contato = await prisma.contact.findFirst({
    where: { telefone: { contains: digitos } },
    select: { id: true },
  });
  return contato?.id ?? null;
}

/** Chamada originada pelo agente (clique-para-ligar). */
export async function originarChamada(agenteId: string, destino: string) {
  const { provedor, credenciais } = await ativo();
  if (!credenciais.numeroPadrao) throw badRequest('Configure o numero padrao de saida');

  // Fala com o provedor ANTES de gravar: chamada que o provedor recusou nao
  // pode aparecer no relatorio como tentativa realizada.
  const resultado = await provedor.originar(credenciais, { de: credenciais.numeroPadrao, para: destino });

  const chamada = await prisma.call.create({
    data: {
      idExterno: resultado.idExterno,
      direcao: 'SAINTE',
      status: resultado.status as CallStatus,
      numeroOrigem: credenciais.numeroPadrao,
      numeroDestino: destino,
      agenteId,
      contatoId: await contatoDoNumero({
        direcao: 'SAINTE',
        numeroOrigem: credenciais.numeroPadrao,
        numeroDestino: destino,
      } as EventoChamada),
    },
  });

  notificarChamada(serializar(chamada), { agenteId });
  return serializar(chamada);
}

export async function listarChamadas(query: {
  limite: number;
  cursor?: string;
  status?: CallStatus;
  agenteId?: string;
  direcao?: 'ENTRANTE' | 'SAINTE';
}) {
  const filtros: Prisma.CallWhereInput[] = [];
  if (query.status) filtros.push({ status: query.status });
  if (query.agenteId) filtros.push({ agenteId: query.agenteId });
  if (query.direcao) filtros.push({ direcao: query.direcao });

  const depois = apos('iniciadoEm', decodificarCursor(query.cursor));
  if (depois) filtros.push(depois);

  const registros = await prisma.call.findMany({
    where: filtros.length > 0 ? { AND: filtros } : {},
    include: inclusao,
    orderBy: [{ iniciadoEm: 'desc' }, { id: 'desc' }],
    take: query.limite + 1,
  });

  const { itens, proximoCursor } = fatiar(registros, query.limite, (c) => c.iniciadoEm);
  return { chamadas: itens.map(serializar), proximoCursor };
}

const inclusao = {
  contato: { select: { id: true, nome: true } },
  agente: { select: { id: true, nome: true } },
  fila: { select: { id: true, nome: true } },
} satisfies Prisma.CallInclude;

type ChamadaDb = Prisma.CallGetPayload<{ include: typeof inclusao }> | Prisma.CallGetPayload<object>;

/** Decimal do Prisma nao serializa em JSON; converte num lugar so. */
function serializar(c: ChamadaDb) {
  const relacoes = c as Prisma.CallGetPayload<{ include: typeof inclusao }>;
  return {
    id: c.id,
    idExterno: c.idExterno,
    direcao: c.direcao,
    status: c.status,
    numeroOrigem: c.numeroOrigem,
    numeroDestino: c.numeroDestino,
    iniciadoEm: c.iniciadoEm,
    atendidoEm: c.atendidoEm,
    encerradoEm: c.encerradoEm,
    duracao: c.duracao,
    // Gravacao interna precisa de URL assinada, como qualquer anexo.
    gravacaoUrl: c.gravacaoUrl ? urlAssinada(c.gravacaoUrl) : null,
    gravacaoDuracao: c.gravacaoDuracao,
    transcricao: c.transcricao,
    custo: c.custo === null ? null : Number(c.custo),
    motivoFalha: c.motivoFalha,
    contato: relacoes.contato ?? null,
    agente: relacoes.agente ?? null,
    fila: relacoes.fila ?? null,
  };
}

/** Indicadores de voz para o painel da gestao. */
export async function indicadoresVoz(desde: Date, ate: Date = new Date()) {
  const chamadas = await prisma.call.findMany({
    where: { iniciadoEm: { gte: desde, lte: ate } },
    select: { direcao: true, status: true, duracao: true },
  });

  const atendidas = chamadas.filter((c) => c.status === 'COMPLETADA' && (c.duracao ?? 0) > 0);
  const somaDuracao = atendidas.reduce((total, c) => total + (c.duracao ?? 0), 0);

  return {
    total: chamadas.length,
    entrantes: chamadas.filter((c) => c.direcao === 'ENTRANTE').length,
    saintes: chamadas.filter((c) => c.direcao === 'SAINTE').length,
    atendidas: atendidas.length,
    naoAtendidas: chamadas.filter((c) => c.status === 'NAO_ATENDIDA' || c.status === 'OCUPADA').length,
    /** Taxa de atendimento e o indicador que diz se a operacao esta perdendo chamada. */
    taxaAtendimento: chamadas.length === 0 ? null : Math.round((atendidas.length / chamadas.length) * 100),
    /** TMA de voz em segundos, so sobre chamadas que realmente conversaram. */
    tma: atendidas.length === 0 ? null : Math.round(somaDuracao / atendidas.length),
  };
}
