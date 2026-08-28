import { createHmac } from 'node:crypto';
import type { AttachmentType, Channel, Contact, Conversation, Message } from '@prisma/client';
import { env } from '../../env';
import { AppError, badRequest, conflict, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { cifrar } from '../../lib/crypto-box';
import { limiteBytes, salvar, tipoAceito, urlAssinada } from '../../lib/storage';
import { organizacaoAtual } from '../../lib/tenant';
import { notificarConversaAtualizada, notificarMensagem } from '../../realtime/hub';
import { obterConfig } from '../channels/channels.service';
import { enviarArquivoParaCanal, enviarParaCanal, exigeEnvioExterno } from '../channels/outbound.service';
import { inclusaoDetalhe, toConversaDetalhe, toMensagem } from '../conversations/conversations.serializer';

/**
 * Ponte com o motor de IA externo (plugin `plataforma` do whatsbot-pro).
 *
 * A divisao: a plataforma e dona do canal, da fila, da conversa e do CRM; o
 * motor externo so pensa. Duas direcoes independentes:
 *
 *   saida   `entregarParaIa`        — mensagem recebida vai assinada ao webhook
 *   volta   `registrarRespostaDaIa` — resposta do agente entra como mensagem BOT
 *
 * A saida nunca lanca: o motor de IA e opcional, e um webhook fora do ar nao
 * pode impedir a mensagem do cliente de ser gravada e aparecer no painel.
 * A volta lanca com codigo proprio, porque quem chama e o plugin — e ele mostra
 * a mensagem de erro no painel de quem configurou.
 */

/**
 * Janela em que o canal aceita texto livre, em horas. Ausente = sem janela.
 *
 * Conferimos deste lado tambem, embora o plugin tenha a propria janela: quem
 * sabe a hora exata da ultima mensagem do cliente e a plataforma. Sem esta
 * conferencia a resposta entraria no historico e seria recusada pela Meta
 * depois — o operador veria "enviada" para algo que o cliente nunca recebeu.
 */
const JANELA_HORAS: Partial<Record<Channel, number>> = {
  WHATSAPP: 24,
  // Messenger e Instagram Direct: 7 dias na politica de mensagem padrao.
  FACEBOOK: 24 * 7,
  INSTAGRAM: 24 * 7,
};

const CANAIS = ['WEBCHAT', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'EMAIL', 'VOZ'] as const;

/**
 * O `canalId` do plugin pode ser o nome do canal (`WHATSAPP`) ou o id do
 * registro de configuracao.
 *
 * Aceita os dois porque o nome e o que existe em todo canal — `canais_config`
 * so tem linha para canal externo ja configurado — e o uuid e o que alguem
 * copia da tela sem pensar duas vezes.
 */
export async function resolverCanal(canalId: string): Promise<Channel> {
  const bruto = canalId.trim();
  const nome = bruto.toUpperCase();
  if ((CANAIS as readonly string[]).includes(nome)) return nome as Channel;

  const config = await prisma.channelConfig.findUnique({ where: { id: bruto } });
  if (!config) {
    throw notFound(`Canal ${bruto} nao encontrado — informe o nome (ex.: WHATSAPP) ou o id da configuracao`);
  }
  return config.canal;
}

/**
 * Conversa em que a IA pode falar.
 *
 * Tres recusas, cada uma com codigo proprio para o plugin poder explicar:
 * conversa nenhuma (a IA nao abre atendimento por conta propria), atendimento
 * humano em curso (a IA nunca fala em cima do atendente) e janela fechada.
 */
async function conversaParaResposta(canal: Channel, contatoId: string) {
  const contato = await prisma.contact.findUnique({ where: { id: contatoId } });
  if (!contato) throw notFound('Contato nao encontrado');

  const conversa = await prisma.conversation.findFirst({
    where: { contatoId, canal, status: { not: 'FINALIZADO' } },
    orderBy: { ultimaMensagemEm: 'desc' },
  });

  if (!conversa) {
    throw new AppError(
      409,
      'SEM_CONVERSA_ABERTA',
      `Nao ha conversa aberta com este contato no canal ${canal}. A IA responde a atendimento em curso; ` +
        'para iniciar contato, use campanha.',
    );
  }

  if (conversa.agenteId) {
    throw new AppError(
      409,
      'ATENDIMENTO_HUMANO',
      'Um atendente assumiu esta conversa — a IA nao responde em cima do humano.',
    );
  }

  await garantirJanela(conversa);
  return { conversa, contato };
}

async function garantirJanela(conversa: Conversation) {
  const horas = JANELA_HORAS[conversa.canal];
  if (!horas) return;

  const ultimaDoCliente = await prisma.message.findFirst({
    where: { conversaId: conversa.id, autor: 'CLIENTE' },
    orderBy: { criadoEm: 'desc' },
    select: { criadoEm: true },
  });

  const referencia = ultimaDoCliente?.criadoEm ?? conversa.criadoEm;
  const decorridas = (Date.now() - referencia.getTime()) / 3_600_000;
  if (decorridas <= horas) return;

  throw new AppError(
    409,
    'JANELA_FECHADA',
    `Fora da janela de ${horas}h — a ultima mensagem do cliente foi ha ${Math.floor(decorridas)}h. ` +
      'Fora dela o canal so aceita template aprovado, que e enviado pela propria plataforma.',
  );
}

export type RespostaDaIa = {
  canalId: string;
  contatoId: string;
  texto?: string;
  respondendoA?: string | null;
  anexo?: { tipo?: string; url: string; nome?: string | null } | null;
};

/**
 * Grava a resposta do agente de IA como mensagem `BOT` e entrega ao canal.
 *
 * Envia ao canal ANTES de gravar, igual ao caminho do atendente humano: se a
 * Meta recusar, a mensagem nao entra no historico — nao existe "enviada" que o
 * cliente nunca recebeu.
 */
export async function registrarRespostaDaIa(entrada: RespostaDaIa) {
  const canal = await resolverCanal(entrada.canalId);
  const { conversa } = await conversaParaResposta(canal, entrada.contatoId);

  const texto = entrada.texto?.trim() ?? '';
  if (!texto && !entrada.anexo) throw badRequest('Informe texto ou anexo');

  if (entrada.anexo) {
    const baixado = await baixarParaEnvio(entrada.anexo.url, entrada.anexo.nome ?? null);
    return gravarAnexo(conversa, { ...baixado, legenda: texto }, entrada.respondendoA ?? null);
  }

  const envio = exigeEnvioExterno(canal)
    ? await enviarParaCanal(canal, conversa.enderecoExterno, texto)
    : { idExterno: null };

  return gravar(conversa, {
    conteudo: texto,
    idExterno: envio.idExterno,
    respondendoA: entrada.respondendoA ?? null,
  });
}

/** Anexo que o agente produziu e subiu por multipart. */
export async function registrarAnexoDaIa(
  entrada: { canalId: string; contatoId: string; texto?: string; respondendoA?: string | null },
  arquivo: { buffer: Buffer; nome: string; tipo: string },
) {
  const canal = await resolverCanal(entrada.canalId);
  const { conversa } = await conversaParaResposta(canal, entrada.contatoId);

  return gravarAnexo(conversa, { ...arquivo, legenda: entrada.texto?.trim() ?? '' }, entrada.respondendoA ?? null);
}

/**
 * Traz o binario de uma URL informada pelo agente.
 *
 * A URL vem de quem tem token de integracao, mas token nao e o mesmo que rede
 * confiavel: sem o bloqueio de host interno, o agente poderia pedir
 * `http://169.254.169.254/...` e a plataforma buscaria o metadado da nuvem para
 * ele. Por isso: so http(s), so host publico, so tipo da lista de aceitos, e
 * corte no limite de upload.
 */
async function baixarParaEnvio(url: string, nome: string | null) {
  let destino: URL;
  try {
    destino = new URL(url);
  } catch {
    throw badRequest('anexo.url invalida');
  }
  if (destino.protocol !== 'https:' && destino.protocol !== 'http:') {
    throw badRequest('anexo.url precisa ser http ou https');
  }
  if (hostInterno(destino.hostname)) throw badRequest('anexo.url aponta para um host interno');

  // `redirect: error` de proposito: um 302 para 127.0.0.1 contornaria a
  // checagem de host feita acima.
  const resposta = await fetch(destino, { redirect: 'error', signal: AbortSignal.timeout(15_000) }).catch(
    (err: unknown) => {
      throw new AppError(
        502,
        'ANEXO_INACESSIVEL',
        `Nao foi possivel baixar o anexo: ${err instanceof Error ? err.message : 'erro de rede'}`,
      );
    },
  );
  if (!resposta.ok) throw new AppError(502, 'ANEXO_INACESSIVEL', `O anexo respondeu HTTP ${resposta.status}`);

  const tipo = (resposta.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (!tipoAceito(tipo)) throw badRequest(`Tipo de anexo nao aceito: ${tipo || 'desconhecido'}`);

  const buffer = Buffer.from(await resposta.arrayBuffer());
  if (buffer.length > limiteBytes) throw badRequest(`Anexo acima do limite de ${env.UPLOAD_MAX_MB} MB`);

  const doCaminho = decodeURIComponent(destino.pathname.split('/').pop() ?? '');
  return { buffer, tipo, nome: nome || doCaminho || 'anexo' };
}

/** Bloqueio de SSRF: loopback, link-local e as faixas privadas da RFC 1918. */
function hostInterno(host: string) {
  const nome = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (nome === 'localhost' || nome.endsWith('.localhost') || nome.endsWith('.internal')) return true;
  if (nome === '::1' || nome.startsWith('fe80:') || nome.startsWith('fc') || nome.startsWith('fd')) return true;

  const octetos = nome.split('.').map(Number);
  if (octetos.length !== 4 || octetos.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = octetos as [number, number, number, number];
  return (
    a === 0 ||
    a === 127 ||
    a === 10 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 169 && b === 254)
  );
}

async function gravarAnexo(
  conversa: Conversation,
  arquivo: { buffer: Buffer; nome: string; tipo: string; legenda: string },
  respondendoA: string | null,
) {
  const envio = exigeEnvioExterno(conversa.canal)
    ? await enviarArquivoParaCanal(conversa.canal, conversa.enderecoExterno, arquivo)
    : { idExterno: null };

  const salvo = await salvar(arquivo);
  return gravar(conversa, {
    conteudo: arquivo.legenda || salvo.nome,
    tipoAnexo: tipoAnexoDe(salvo.tipo),
    anexoUrl: salvo.url,
    idExterno: envio.idExterno,
    respondendoA,
  });
}

/** Grava, atualiza a conversa e avisa o painel. Um caminho para texto e anexo. */
async function gravar(
  conversa: Conversation,
  dados: {
    conteudo: string;
    tipoAnexo?: AttachmentType;
    anexoUrl?: string;
    idExterno: string | null;
    respondendoA: string | null;
  },
) {
  const mensagem = await prisma.message.create({
    data: {
      conversaId: conversa.id,
      autor: 'BOT',
      conteudo: dados.conteudo,
      tipoAnexo: dados.tipoAnexo,
      anexoUrl: dados.anexoUrl,
      idExterno: dados.idExterno,
    },
  });

  const atualizada = await prisma.conversation.update({
    where: { id: conversa.id },
    data: { ultimaMensagemEm: mensagem.criadoEm },
    include: inclusaoDetalhe,
  });

  const destinos = { conversaId: conversa.id, filaId: atualizada.filaId, agenteId: atualizada.agenteId };
  notificarMensagem({ conversaId: conversa.id, mensagem: toMensagem(mensagem) }, destinos);
  notificarConversaAtualizada(toConversaDetalhe(atualizada), destinos);

  // `respondendoA` nao vira coluna: o modelo de mensagem nao tem thread, e
  // inventar uma para guardar um id que ninguem le seria migracao sem leitor.
  // Volta no retorno para o plugin correlacionar do lado dele.
  return { mensagem: toMensagem(mensagem), respondendoA: dados.respondendoA, conversaId: conversa.id };
}

const tipoAnexoDe = (mime: string): AttachmentType => {
  const grupo = mime.split('/')[0];
  if (grupo === 'image') return 'IMAGEM';
  if (grupo === 'audio') return 'AUDIO';
  if (grupo === 'video') return 'VIDEO';
  return 'ARQUIVO';
};

// ---------------------------------------------------------------------------
// Saida: plataforma -> motor de IA
// ---------------------------------------------------------------------------

/**
 * Assinatura da entrega.
 *
 * Cobre `"{timestamp}.{corpo}"` e nao so o corpo: assinando apenas o corpo, uma
 * requisicao legitima capturada poderia ser reenviada para sempre e o agente
 * responderia de novo a cada vez.
 */
export const assinarEntrega = (segredo: string, timestamp: number, corpo: string) =>
  `sha256=${createHmac('sha256', segredo).update(`${timestamp}.${corpo}`).digest('hex')}`;

/** URL absoluta e assinada — o motor de IA baixa o anexo de fora da rede. */
const anexoPublico = (url: string) => new URL(urlAssinada(url), env.PUBLIC_URL || env.WEB_ORIGIN).toString();

const TIPO_PARA_PLUGIN: Record<AttachmentType, string> = {
  TEXTO: 'TEXTO',
  IMAGEM: 'IMAGEM',
  AUDIO: 'AUDIO',
  VIDEO: 'VIDEO',
  ARQUIVO: 'DOCUMENTO',
};

export type MensagemParaIa = Pick<
  Message,
  'id' | 'autor' | 'conteudo' | 'tipoAnexo' | 'anexoUrl' | 'criadoEm'
>;

/**
 * Monta o corpo da entrega. Separado do envio para poder ser testado sem rede —
 * e este e o formato que o plugin le, entao mudar aqui quebra o outro lado.
 */
export function corpoDaEntrega(
  mensagem: MensagemParaIa,
  conversa: Pick<Conversation, 'id' | 'canal' | 'agenteId' | 'status'>,
  contato: Pick<Contact, 'id' | 'nome' | 'telefone' | 'email'>,
) {
  // So mensagem do cliente aciona o agente, e so enquanto nenhum humano
  // assumiu: a decisao e daqui, porque quem sabe o estado da conversa e a
  // plataforma. O plugin obedece este campo.
  const acionarIa = mensagem.autor === 'CLIENTE' && !conversa.agenteId && conversa.status !== 'FINALIZADO';

  return {
    evento: 'mensagem',
    conversaId: conversa.id,
    mensagemId: mensagem.id,
    canal: conversa.canal,
    autor: mensagem.autor === 'CLIENTE' ? 'CONTATO' : mensagem.autor,
    acionarIa,
    contato: { id: contato.id, nome: contato.nome, telefone: contato.telefone, email: contato.email },
    texto: mensagem.conteudo,
    anexo:
      mensagem.anexoUrl && mensagem.tipoAnexo !== 'TEXTO'
        ? { tipo: TIPO_PARA_PLUGIN[mensagem.tipoAnexo], url: anexoPublico(mensagem.anexoUrl), nome: null }
        : null,
    criadoEm: mensagem.criadoEm.toISOString(),
  };
}

/**
 * Entrega uma mensagem ao motor de IA.
 *
 * Nunca lanca e nunca deve ser aguardada pelo caminho critico: e chamada depois
 * de a mensagem estar gravada, e o pior caso e o agente perder um turno.
 *
 * Manda tambem o que o atendente humano escreveu. Sem isso o agente perde
 * metade do dialogo e repete o que a pessoa ja respondeu — mas vai com
 * `acionarIa: false`, porque contexto nao e gatilho.
 */
export async function entregarParaIa(
  mensagem: MensagemParaIa,
  conversa: Pick<Conversation, 'id' | 'canal' | 'agenteId' | 'status' | 'contatoId'> & { contato?: Contact | null },
) {
  try {
    const config = await obterConfig(conversa.canal);
    if (!config?.iaAtiva || !config.iaUrlWebhook || !config.iaSegredo) return { entregue: false as const };

    const contato = conversa.contato ?? (await prisma.contact.findUnique({ where: { id: conversa.contatoId } }));
    if (!contato) return { entregue: false as const };

    const corpo = JSON.stringify(corpoDaEntrega(mensagem, conversa, contato));
    const timestamp = Math.floor(Date.now() / 1000);

    const resposta = await fetch(config.iaUrlWebhook, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Plataforma-Timestamp': String(timestamp),
        'X-Plataforma-Assinatura': assinarEntrega(config.iaSegredo, timestamp, corpo),
      },
      body: corpo,
      signal: AbortSignal.timeout(10_000),
    });

    if (!resposta.ok) {
      console.warn(`[ia] webhook recusou a entrega (HTTP ${resposta.status}) — canal ${conversa.canal}`);
      return { entregue: false as const };
    }
    return { entregue: true as const };
  } catch (err) {
    // Log e segue: o motor de IA e opcional e a mensagem do cliente ja esta
    // gravada. Lancar aqui perderia o webhook da Meta por um 500 nosso.
    console.warn(`[ia] falha ao entregar ao motor de IA: ${err instanceof Error ? err.message : 'erro desconhecido'}`);
    return { entregue: false as const };
  }
}

/** Estado da ponte de um canal. Nunca devolve o segredo — so se existe. */
export async function estadoDaIa(canal: Channel) {
  const config = await obterConfig(canal);
  return {
    canal,
    ativa: Boolean(config?.iaAtiva),
    webhook: config?.iaUrlWebhook ?? null,
    assinado: Boolean(config?.iaSegredo),
    janelaHoras: JANELA_HORAS[canal] ?? 0,
  };
}

/** Liga, desliga ou reconfigura a ponte de um canal. */
export async function salvarIa(
  canal: Channel,
  input: { iaAtiva?: boolean; iaUrlWebhook?: string | null; iaSegredo?: string | null },
) {
  const atual = await obterConfig(canal);
  const futuro = { ...atual, ...input };

  if (futuro.iaAtiva && !(futuro.iaUrlWebhook && futuro.iaSegredo)) {
    throw conflict('Para ligar a IA informe o webhook e o segredo de assinatura');
  }

  // Cifra so o que veio nesta requisicao; campo ausente nao e reescrito, e
  // campo enviado como null continua sendo limpeza explicita.
  const paraGravar = { ...input, ...(input.iaSegredo ? { iaSegredo: cifrar(input.iaSegredo) } : {}) };

  await prisma.channelConfig.upsert({
    where: { organizacaoId_canal: { organizacaoId: organizacaoAtual(), canal } },
    update: paraGravar,
    create: { canal, ...paraGravar },
  });

  return estadoDaIa(canal);
}
