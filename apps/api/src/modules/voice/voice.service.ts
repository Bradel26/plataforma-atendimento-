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
import { resumirSentimento } from './analise';
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
  // Quem classificou entra na leitura (item 6.6): "nota 2" sem autor nao se
  // discute com ninguem.
  classificadoPor: { select: { id: true, nome: true } },
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
    /*
     * Resumo e sentimento da ligacao (item E.2), com a procedencia deles.
     *
     * `analisadoPor` vai para a tela junto: resumo sem autor nao se discute, e
     * trocar de motor sem registro faria duas analises incomparaveis parecerem a
     * mesma coisa. Sentimento nulo e "ninguem analisou", nunca NEUTRO.
     */
    resumo: c.resumo,
    sentimento: c.sentimento,
    analisadoPor: c.analisadoPor,
    analisadoEm: c.analisadoEm,
    custo: c.custo === null ? null : Number(c.custo),
    /*
     * Nulo em classificacao e "ninguem ouviu ainda", nao "ruim" (item 6.6).
     *
     * A tela mostra travessao, e nao zero nem tres estrelas: um valor padrao
     * faria a plataforma emitir opiniao no lugar de quem ouviu a ligacao.
     */
    classificacao: c.classificacao,
    classificadoEm: c.classificadoEm,
    motivoFalha: c.motivoFalha,
    contato: relacoes.contato ?? null,
    agente: relacoes.agente ?? null,
    fila: relacoes.fila ?? null,
    classificadoPor: relacoes.classificadoPor ?? null,
  };
}

/**
 * Classifica uma ligacao de 1 a 5 (item 6.6).
 *
 * `null` limpa a nota. Voltar para "nao classificada" precisa existir: nota
 * lancada por engano ficaria para sempre, e nao ha valor que signifique "retiro
 * o que eu disse" — zero seria uma nota, nao a ausencia dela.
 */
export async function classificarChamada(id: string, classificacao: number | null, usuarioId: string) {
  const chamada = await prisma.call.findFirst({ where: { id }, select: { id: true } });
  if (!chamada) throw notFound('Chamada nao encontrada');

  return serializar(
    await prisma.call.update({
      where: { id: chamada.id },
      data: {
        classificacao,
        // Limpar a nota limpa o autor e a data junto: manter "classificado por"
        // de uma nota que nao existe mais faria o registro mentir.
        classificadoPorId: classificacao === null ? null : usuarioId,
        classificadoEm: classificacao === null ? null : new Date(),
      },
      include: inclusao,
    }),
  );
}

/**
 * Custo e classificacao agregados de um periodo (item 6.6).
 *
 * Funcao pura na conta, consulta fina no banco: o mesmo padrao dos relatorios
 * comerciais. As duas medias sao calculadas sobre bases DIFERENTES de proposito
 * — custo medio sobre as chamadas que tem custo, nota media sobre as que tem
 * nota — porque misturar as bases produziria um numero que nao descreve nem uma
 * coisa nem outra.
 */
export function resumirCustoEClassificacao(
  chamadas: Array<{ custo: number | null; classificacao: number | null }>,
) {
  const comCusto = chamadas.filter((c) => c.custo !== null);
  const comNota = chamadas.filter((c) => c.classificacao !== null);

  const soma = comCusto.reduce((a, c) => a + (c.custo ?? 0), 0);
  const somaNota = comNota.reduce((a, c) => a + (c.classificacao ?? 0), 0);

  return {
    total: chamadas.length,
    /** Nulo quando NENHUMA chamada tem custo — zero afirmaria que foi de graca. */
    custoTotal: comCusto.length === 0 ? null : Math.round(soma * 10000) / 10000,
    custoMedio: comCusto.length === 0 ? null : Math.round((soma / comCusto.length) * 10000) / 10000,
    /** Quantas chamadas o custo cobre: sem isso a media parece ser do todo. */
    chamadasComCusto: comCusto.length,
    notaMedia: comNota.length === 0 ? null : Math.round((somaNota / comNota.length) * 100) / 100,
    chamadasComNota: comNota.length,
    /** O que falta ouvir. E a fila de trabalho de quem classifica. */
    semNota: chamadas.length - comNota.length,
  };
}

/** Indicadores de voz para o painel da gestao. */
export async function indicadoresVoz(desde: Date, ate: Date = new Date()) {
  const chamadas = await prisma.call.findMany({
    where: { iniciadoEm: { gte: desde, lte: ate } },
    select: {
      direcao: true,
      status: true,
      duracao: true,
      custo: true,
      classificacao: true,
      sentimento: true,
    },
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
    /*
     * Custo e nota do periodo (item 6.6).
     *
     * Entram nos MESMOS indicadores em vez de numa rota propria: quem abre a
     * telefonia para ver se a operacao esta perdendo chamada e quem quer saber
     * quanto isso custou — duas chamadas para responder uma pergunta so seriam
     * duas idas ao servidor e duas versoes do periodo.
     */
    // `total` sai do espalhamento: os dois falam da mesma contagem, e deixar os
    // dois faria o TypeScript escolher em silencio qual sobrevive.
    /*
     * Sentimento do periodo (item E.2).
     *
     * `semAnalise` vem junto e nao e detalhe: sem ele, "70% neutro" pode ser 7
     * de 10 chamadas ou 7 de 700 nao analisadas, e as duas frases pedem decisoes
     * opostas. Chamada sem analise NAO entra em NEUTRO.
     */
    sentimento: resumirSentimento(chamadas.map((c) => ({ sentimento: c.sentimento }))),
    ...(({ total: _ignorado, ...resto }) => resto)(
      resumirCustoEClassificacao(
        chamadas.map((c) => ({ custo: c.custo === null ? null : Number(c.custo), classificacao: c.classificacao })),
      ),
    ),
  };
}
