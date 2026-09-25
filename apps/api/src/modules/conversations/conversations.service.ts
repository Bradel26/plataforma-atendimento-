import type { AttachmentType, Prisma, Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { filtroDe, politicaContatos, politicaConversas } from '../../lib/politicas';
import { apenasVisivel } from '../../lib/visibilidade';
import { salvar } from '../../lib/storage';
import { apos, decodificarCursor, fatiar } from '../../lib/paginacao';
import { normalizarTags } from '../../lib/tags';
import { AppError, badRequest, forbidden, notFound } from '../../lib/errors';
import { notificarConversaAtualizada, notificarConversaNova, notificarMensagem } from '../../realtime/hub';
import { enviarArquivoParaCanal, enviarParaCanal, exigeEnvioExterno } from '../channels/outbound.service';
import { obterConfig } from '../channels/channels.service';
import { decidirDestino, filaPadraoDoCanal } from '../channels/inbound.service';
import { impedimentoDeEnvio } from '../channels/whatsapp.modo';
import { getWhatsAppProvider } from '../channels/whatsapp-provider.factory';
import { promoverPrevia } from '../channels/chat-previews.service';
import { entregarParaIa } from '../bots/ia.service';
import { TIPO_CONVITE_PESQUISA, criarPesquisa, entregarPesquisa } from '../surveys/surveys.service';
import { enfileirar } from '../../lib/fila';
import {
  inclusaoDetalhe,
  inclusaoResumo,
  semNotasInternas,
  toConversaDetalhe,
  toConversaResumo,
  toMensagem,
} from './conversations.serializer';
import type { ListarConversasQuery, TransferirInput } from './conversations.schemas';

export type Solicitante = { sub: string; perfil: Role; nome: string };

/**
 * O escopo de visibilidade saiu daqui.
 *
 * Era uma funcao privada deste modulo, o que bastava enquanto conversa era o
 * unico dominio com escopo. Com contato, conta, lead, oportunidade, atividade e
 * protocolo entrando na mesma conversa, a regra virou infraestrutura
 * compartilhada em `lib/politicas.ts` — e, mais importante, **listagem e acesso
 * por id passaram a usar o mesmo filtro**. Antes eram duas implementacoes da
 * mesma regra (`escopoVisivel` e `garantirAcesso`), que e exatamente a forma de
 * uma delas ficar para tras numa mudanca futura.
 */
const escopoVisivel = () => filtroDe(politicaConversas);

export async function listarConversas(solicitante: Solicitante, query: ListarConversasQuery) {
  const filtros: Prisma.ConversationWhereInput[] = [await escopoVisivel()];

  if (query.status) filtros.push({ status: query.status });
  if (query.minhas === 'true') filtros.push({ agenteId: solicitante.sub });
  // Padrao: so as nao arquivadas — arquivar so faz sentido se a conversa sai
  // da experiencia do dia a dia. `arquivadas=true` inverte para a lista de
  // arquivadas; nunca as duas junto (Fase 11.9-A, item 5).
  filtros.push({ arquivada: query.arquivadas === 'true' });
  if (query.busca) {
    filtros.push({
      OR: [
        { contato: { nome: { contains: query.busca, mode: 'insensitive' } } },
        { contato: { email: { contains: query.busca, mode: 'insensitive' } } },
        { contato: { telefone: { contains: query.busca } } },
        { assunto: { contains: query.busca, mode: 'insensitive' } },
      ],
    });
  }

  // `hasEvery` com lista vazia nao restringe nada, entao dispensa condicional —
  // mesma forma usada no filtro de contato e conta.
  filtros.push({ tags: { hasEvery: query.tags } });

  const cursor = decodificarCursor(query.cursor);
  const limiteCursor = apos('ultimaMensagemEm', cursor);
  if (limiteCursor) filtros.push(limiteCursor);

  const registros = await prisma.conversation.findMany({
    where: { AND: filtros },
    include: inclusaoResumo,
    // O id entra na ordenacao junto com a data: sem o desempate, duas conversas
    // no mesmo milissegundo fariam a paginacao pular uma delas.
    orderBy: [{ ultimaMensagemEm: 'desc' }, { id: 'desc' }],
    take: query.limite + 1,
  });

  const { itens, proximoCursor } = fatiar(registros, query.limite, (c) => c.ultimaMensagemEm);
  return { conversas: itens.map(toConversaResumo), proximoCursor };
}

/**
 * Mensagens de uma conversa, da mais recente para a mais antiga.
 *
 * O detalhe da conversa devolve apenas as ultimas; um atendimento de WhatsApp
 * com dois anos de historico nao pode chegar inteiro em cada abertura do painel.
 */
export async function listarMensagens(
  solicitante: Solicitante,
  id: string,
  query: { limite: number; cursor?: string },
) {
  const conversa = await carregarOuFalhar(id);

  const cursor = decodificarCursor(query.cursor);
  const registros = await prisma.message.findMany({
    where: { conversaId: id, ...(apos('criadoEm', cursor) ?? {}) },
    orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
    take: query.limite + 1,
  });

  const { itens, proximoCursor } = fatiar(registros, query.limite, (m) => m.criadoEm);
  // Devolve em ordem cronologica: quem consome so precisa colar no inicio da lista.
  return { mensagens: itens.reverse().map(toMensagem), proximoCursor };
}

/**
 * Contadores por aba do painel.
 *
 * So conta as nao arquivadas — os mesmos numeros que `listarConversas` sem
 * `arquivadas=true` devolveria, senao o contador da aba mostraria um numero
 * que a lista embaixo dele nunca bate (Fase 11.9-A, item 8).
 */
export async function contarPorStatus(solicitante: Solicitante) {
  const grupos = await prisma.conversation.groupBy({
    by: ['status'],
    where: { AND: [await escopoVisivel(), { arquivada: false }] },
    _count: { _all: true },
  });

  const base = { EM_ESPERA: 0, ATRIBUIDO: 0, EM_ATENDIMENTO: 0, FINALIZADO: 0 };
  for (const g of grupos) base[g.status] = g._count._all;
  return base;
}

/**
 * Previas de chat da linha PESSOAL do proprio solicitante -- nunca lista
 * previa de outro vendedor, e nao passa pela politica de visibilidade de
 * `Conversation` (previa e o celular do dono, nao um recurso compartilhado).
 */
export async function listarPrevias(solicitante: Solicitante) {
  const config = await prisma.channelConfig.findFirst({
    where: { canal: 'WHATSAPP', donoId: solicitante.sub },
    select: { id: true },
  });
  if (!config) return { previas: [] };

  const previas = await prisma.chatPreview.findMany({
    where: { canalConfigId: config.id },
    orderBy: { ultimaMensagemEm: 'desc' },
  });

  return {
    previas: previas.map((p) => ({
      id: p.id,
      numero: p.numero,
      nome: p.nome,
      ultimaMensagem: p.ultimaMensagem,
      ultimaMensagemEm: p.ultimaMensagemEm,
      naoLidas: p.naoLidas,
    })),
  };
}

/** Motivo pelo qual um contato sem telefone nao pode receber conversa de WhatsApp, ou nulo se pode. Pura, sem banco. */
export function motivoSemTelefone(contato: { telefone: string | null }): string | null {
  if (!contato.telefone) return 'Contato sem telefone cadastrado — nao e possivel iniciar conversa por WhatsApp';
  return null;
}

/**
 * Config de WhatsApp que atenderia uma conversa iniciada por este usuario: a
 * linha PESSOAL dele, se tiver uma conectada; senao a config compartilhada do
 * canal (mesma regra de `obterConfig`).
 *
 * E a linha de QUEM CLICOU em "Iniciar conversa", nao a do responsavel
 * cadastrado no contato — o mesmo comportamento do WhatsApp Web: conectando o
 * proprio numero, a pessoa fala com qualquer contato por ele, nao so com os
 * que ja tinha vinculo previo. Um contato importado do celular do vendedor,
 * por exemplo, nao tem "responsavel" formal nenhum ate alguem definir um na
 * ficha — mas o vendedor que importou continua podendo falar com ele.
 *
 * Diferente de `configDoDestino` (channels.service): aquela resolve pelo
 * identificador que a MENSAGEM trouxe (phoneNumberId, sessao da ponte); aqui
 * nao existe mensagem nenhuma ainda.
 */
async function configWhatsappDoSolicitante(solicitante: Solicitante) {
  const pessoal = await prisma.channelConfig.findFirst({ where: { canal: 'WHATSAPP', donoId: solicitante.sub } });
  if (pessoal) return pessoal;
  return obterConfig('WHATSAPP');
}

/**
 * Abre uma conversa de WhatsApp com um Contato do CRM que ainda nao escreveu
 * — botao "Iniciar conversa" na ficha do contato.
 *
 * Idempotente: se ja existe uma conversa ABERTA (nao finalizada) com este
 * contato no WhatsApp, devolve ela em vez de criar outra — reabrir a ficha e
 * clicar de novo nao pode duplicar o atendimento.
 */
export async function iniciarConversa(solicitante: Solicitante, contatoId: string): Promise<{ id: string }> {
  const contato = await prisma.contact.findFirst({
    where: apenasVisivel(contatoId, await filtroDe(politicaContatos)),
  });
  if (!contato) throw notFound('Contato nao encontrado');

  const motivo = motivoSemTelefone(contato);
  if (motivo) throw badRequest(motivo);

  const existente = await prisma.conversation.findFirst({
    where: { contatoId, canal: 'WHATSAPP', status: { not: 'FINALIZADO' } },
    orderBy: { criadoEm: 'desc' },
  });
  if (existente) {
    // Reabrir pela ficha uma conversa que estava arquivada tem que tira-la do
    // arquivo — senao "Iniciar conversa" devolveria um id que a lista de
    // ninguem mostra (Fase 11.9-A, item 6).
    if (existente.arquivada) {
      await prisma.conversation.update({ where: { id: existente.id }, data: { arquivada: false } });
      await publicar(existente.id, { filaAnteriorId: existente.filaId });
    }
    return { id: existente.id };
  }

  const config = await configWhatsappDoSolicitante(solicitante);
  const impedimento = config
    ? impedimentoDeEnvio(
        config.modo,
        {
          ativo: config.ativo,
          accessToken: config.accessToken,
          phoneNumberId: config.phoneNumberId,
          ponteUrl: config.ponteUrl,
          ponteToken: config.ponteToken,
          ponteSessao: config.ponteSessao,
        },
        { credenciaisPorLinha: getWhatsAppProvider().credenciaisPorLinha },
      )
    : 'Canal WhatsApp nao configurado';
  if (impedimento) throw new AppError(503, 'CANAL_INDISPONIVEL', impedimento);

  const decidido = decidirDestino(config);
  const destino = decidido.filaId || decidido.agenteId
    ? decidido
    : { ...decidido, filaId: await filaPadraoDoCanal('WHATSAPP') };
  const conversa = await prisma.conversation.create({
    data: {
      canal: 'WHATSAPP',
      status: destino.agenteId ? 'ATRIBUIDO' : 'EM_ESPERA',
      contatoId: contato.id,
      filaId: destino.filaId,
      agenteId: destino.agenteId,
      atribuidoEm: destino.agenteId ? new Date() : null,
      canalConfigId: destino.canalConfigId,
      enderecoExterno: contato.telefone,
    },
  });

  if (destino.canalConfigId) {
    await promoverPrevia(conversa.id, destino.canalConfigId, contato.telefone!);
  }

  await publicarNova(conversa.id);

  return { id: conversa.id };
}

/**
 * Carrega a conversa **dentro do escopo de quem pediu**.
 *
 * O id entra no mesmo `where` da politica, e nao numa checagem depois da carga.
 * Consequencia deliberada: conversa fora do escopo responde **404**, nao 403.
 * "Proibido" contaria que a conversa existe e a quem ela pertence — e a regra da
 * casa, desde a fundacao de organizacao, e nao confirmar existencia do que nao e
 * seu. 403 continua sendo a resposta certa para o outro caso: **acao** que o
 * perfil nao pode executar, que e assunto de `requireRole`.
 */
async function carregarOuFalhar(id: string) {
  const conversa = await prisma.conversation.findFirst({
    where: apenasVisivel(id, await filtroDe(politicaConversas)),
    include: inclusaoDetalhe,
  });
  if (!conversa) throw notFound('Conversa nao encontrada');
  return conversa;
}

export async function obterConversa(solicitante: Solicitante, id: string) {
  const conversa = await carregarOuFalhar(id);
  return toConversaDetalhe(conversa);
}

/**
 * Substitui as etiquetas da conversa.
 *
 * Tres decisoes que valem registro:
 *
 * **Conversa finalizada aceita etiqueta.** `enviarMensagem` recusa finalizada, e
 * esta funcao nao — classificar acontece justamente ao encerrar, e um relatorio
 * por assunto que nao pudesse ser corrigido depois seria um relatorio que erra
 * para sempre. Etiqueta descreve o atendimento; nao fala com o cliente.
 *
 * **Nao exige ser o dono.** Qualquer perfil que veja a conversa pode
 * classifica-la, pela politica de visibilidade e nada mais. Supervisor
 * reclassificando atendimento que nao atendeu e o caso normal de quem cuida do
 * relatorio, nao uma excecao.
 *
 * **Nao grava evento no historico.** As outras acoes gravam (`assumiu`,
 * `transferiu`, `finalizou`) porque mudam **de quem e** o atendimento, e isso
 * pertence a leitura da conversa. Etiqueta nao muda responsavel, e um evento por
 * ajuste de chip encheria de ruido justamente a transcricao que o atendente le
 * para entender o cliente.
 */
export async function definirTags(solicitante: Solicitante, id: string, tags: readonly string[]) {
  const conversa = await carregarOuFalhar(id);
  const novas = normalizarTags(tags);

  // Sem mudanca, sem escrita e sem notificacao. Salvar a mesma lista faria o
  // painel de todo mundo repintar a conversa por nada — e a tela salva ao
  // fechar o editor, inclusive quando ninguem mexeu em nada.
  const iguais =
    novas.length === conversa.tags.length && novas.every((t, i) => t === conversa.tags[i]);
  if (iguais) return toConversaDetalhe(conversa);

  await prisma.conversation.update({ where: { id }, data: { tags: novas } });
  return publicar(id, { filaAnteriorId: conversa.filaId });
}

/**
 * Arquiva/desarquiva — sai (ou volta) das listas padrao (Minhas/Nao
 * atribuidas/Todas) e dos contadores, sem tocar status, agente, fila ou
 * historico (Fase 11.9-B).
 *
 * Mesmas duas decisoes de `definirTags`, e pelo mesmo motivo: arquivar e
 * organizacao de tela, nao mudanca de responsavel — **nao exige ser o dono**
 * (qualquer perfil que ve a conversa pode arquivar/desarquivar) e **nao grava
 * evento no historico** (nao e algo que aconteceu NO atendimento, e algo que
 * aconteceu na lista de quem administra).
 *
 * Funciona em qualquer status, inclusive `FINALIZADO` — arquivamento e
 * ortogonal ao ciclo de vida do atendimento, nunca um status a mais.
 */
async function definirArquivada(id: string, arquivada: boolean) {
  const conversa = await carregarOuFalhar(id);
  if (conversa.arquivada === arquivada) return toConversaDetalhe(conversa);

  await prisma.conversation.update({ where: { id }, data: { arquivada } });
  return publicar(id, { filaAnteriorId: conversa.filaId });
}

export const arquivarConversa = (solicitante: Solicitante, id: string) => definirArquivada(id, true);
export const desarquivarConversa = (solicitante: Solicitante, id: string) => definirArquivada(id, false);

/** Registra evento do sistema no historico (atribuicao, transferencia, encerramento). */
async function registrarEventoSistema(conversaId: string, texto: string) {
  return prisma.message.create({ data: { conversaId, autor: 'SISTEMA', conteudo: texto } });
}

export async function assumirConversa(solicitante: Solicitante, id: string) {
  const conversa = await carregarOuFalhar(id);
  if (conversa.status === 'FINALIZADO') throw badRequest('Conversa ja finalizada');
  if (conversa.agenteId && conversa.agenteId !== solicitante.sub) {
    throw badRequest('Conversa ja atribuida a outro agente');
  }

  await prisma.conversation.update({
    where: { id },
    data: { agenteId: solicitante.sub, status: 'ATRIBUIDO', atribuidoEm: new Date() },
  });
  await registrarEventoSistema(id, `${solicitante.nome} assumiu o atendimento.`);

  return publicar(id, { agenteAnteriorId: conversa.agenteId, filaAnteriorId: conversa.filaId });
}

export async function enviarMensagem(
  solicitante: Solicitante,
  id: string,
  conteudo: string,
  interno = false,
) {
  const conversa = await carregarOuFalhar(id);
  if (conversa.status === 'FINALIZADO') throw badRequest('Conversa finalizada — nao aceita novas mensagens');

  // Responder sem ter assumido atribui a conversa ao agente automaticamente.
  const assumir = conversa.agenteId ? {} : { agenteId: solicitante.sub, atribuidoEm: new Date() };

  // Nota interna nunca sai pelo canal externo nem alimenta o motor de IA —
  // e uma anotacao entre a equipe, nao parte da conversa com o cliente.
  const envio =
    !interno && exigeEnvioExterno(conversa.canal)
      ? await enviarParaCanal(conversa.canal, conversa.enderecoExterno, conteudo, conversa.canalConfigId)
      : { idExterno: null };

  const mensagem = await prisma.message.create({
    data: {
      conversaId: id,
      autor: 'AGENTE',
      autorId: solicitante.sub,
      conteudo,
      idExterno: envio.idExterno,
      interno,
    },
  });

  await prisma.conversation.update({
    where: { id },
    data: { ...assumir, status: 'EM_ATENDIMENTO', ultimaMensagemEm: mensagem.criadoEm },
  });

  const atualizada = await publicar(id, { filaAnteriorId: conversa.filaId });
  notificarMensagem(
    { conversaId: id, mensagem: toMensagem(mensagem) },
    {
      conversaId: id,
      filaId: atualizada.fila?.id,
      agenteId: atualizada.agente?.id,
      // Nota interna nao pode chegar na sala da conversa: e la que o visitante
      // do Webchat escuta.
      incluirSalaDaConversa: !interno,
    },
  );

  // Nota interna nao entra em contexto de IA (ver acima) — so agenda quando
  // a mensagem realmente saiu pro cliente.
  if (!interno) {
    void entregarParaIa(mensagem, { ...conversa, agenteId: conversa.agenteId ?? solicitante.sub });
  }

  return { mensagem: toMensagem(mensagem), conversa: atualizada };
}

/**
 * Anexo enviado pelo agente.
 *
 * Fala com o canal a partir do buffer e so depois grava: se a Meta recusar, nao
 * fica nem mensagem fantasma no historico nem arquivo orfao no disco.
 */
export async function enviarArquivo(
  solicitante: Solicitante,
  id: string,
  arquivo: { buffer: Buffer; nome: string; tipo: string },
  legenda?: string,
  interno = false,
) {
  const conversa = await carregarOuFalhar(id);
  if (conversa.status === 'FINALIZADO') throw badRequest('Conversa finalizada — nao aceita novas mensagens');

  const envio =
    !interno && exigeEnvioExterno(conversa.canal)
      ? await enviarArquivoParaCanal(conversa.canal, conversa.enderecoExterno, { ...arquivo, legenda }, conversa.canalConfigId)
      : { idExterno: null };

  const salvo = await salvar(arquivo);
  const assumir = conversa.agenteId ? {} : { agenteId: solicitante.sub, atribuidoEm: new Date() };

  const mensagem = await prisma.message.create({
    data: {
      conversaId: id,
      autor: 'AGENTE',
      autorId: solicitante.sub,
      conteudo: legenda?.trim() || salvo.nome,
      tipoAnexo: tipoAnexoDe(salvo.tipo),
      anexoUrl: salvo.url,
      idExterno: envio.idExterno,
      interno,
    },
  });

  await prisma.conversation.update({
    where: { id },
    data: { ...assumir, status: 'EM_ATENDIMENTO', ultimaMensagemEm: mensagem.criadoEm },
  });

  const atualizada = await publicar(id, { filaAnteriorId: conversa.filaId });
  notificarMensagem(
    { conversaId: id, mensagem: toMensagem(mensagem) },
    {
      conversaId: id,
      filaId: atualizada.fila?.id,
      agenteId: atualizada.agente?.id,
      incluirSalaDaConversa: !interno,
    },
  );

  return { mensagem: toMensagem(mensagem), conversa: atualizada };
}

/** MIME -> classificacao do anexo usada no painel. */
function tipoAnexoDe(mime: string): AttachmentType {
  const grupo = mime.split('/')[0];
  if (grupo === 'image') return 'IMAGEM';
  if (grupo === 'audio') return 'AUDIO';
  if (grupo === 'video') return 'VIDEO';
  return 'ARQUIVO';
}

export async function transferirConversa(solicitante: Solicitante, id: string, input: TransferirInput) {
  const conversa = await carregarOuFalhar(id);
  if (conversa.status === 'FINALIZADO') throw badRequest('Conversa ja finalizada');

  const sufixo = input.motivo ? ` Motivo: ${input.motivo}` : '';

  if (input.agenteId) {
    const destino = await prisma.user.findUnique({ where: { id: input.agenteId } });
    if (!destino) throw notFound('Agente de destino nao encontrado');
    if (!destino.ativo) throw badRequest('Agente de destino esta desativado');
    if (destino.perfil === 'ADMIN') throw badRequest('Administradores nao recebem atendimento');
    if (destino.id === conversa.agenteId) throw badRequest('A conversa ja esta com este agente');

    await prisma.conversation.update({
      where: { id },
      data: { agenteId: destino.id, status: 'ATRIBUIDO', atribuidoEm: new Date() },
    });
    await registrarEventoSistema(id, `${solicitante.nome} transferiu o atendimento para ${destino.nome}.${sufixo}`);
  } else {
    const fila = await prisma.queue.findUnique({ where: { id: input.filaId! } });
    if (!fila) throw notFound('Fila de destino nao encontrada');
    if (!fila.ativa) throw badRequest('Fila de destino esta inativa');

    await prisma.conversation.update({
      where: { id },
      data: { filaId: fila.id, agenteId: null, status: 'EM_ESPERA', atribuidoEm: null },
    });
    await registrarEventoSistema(id, `${solicitante.nome} devolveu o atendimento para a fila ${fila.nome}.${sufixo}`);
  }

  return publicar(id, { agenteAnteriorId: conversa.agenteId, filaAnteriorId: conversa.filaId });
}

export async function finalizarConversa(solicitante: Solicitante, id: string) {
  const conversa = await carregarOuFalhar(id);
  if (conversa.status === 'FINALIZADO') throw badRequest('Conversa ja finalizada');

  await prisma.conversation.update({
    where: { id },
    data: { status: 'FINALIZADO', finalizadoEm: new Date() },
  });
  await registrarEventoSistema(id, `${solicitante.nome} finalizou o atendimento.`);
  // Pesquisa de satisfacao pos-atendimento (Fase 3): cria e entrega o link ao
  // cliente. entregarPesquisa nao lanca — finalizar o atendimento nao pode
  // falhar porque o canal recusou o convite.
  await criarPesquisa(id);
  const convite = await entregarPesquisa(id, { anotarFalha: false });

  if (!convite.entregue) {
    // Falha que pode passar (rede, canal ainda sem configuracao) vai para a
    // fila; recusa definitiva fica registrada na hora e para ali.
    const texto = convite.permanente
      ? `Pesquisa de satisfacao nao enviada: ${convite.motivo}`
      : `Pesquisa de satisfacao nao enviada (${convite.motivo}). Nova tentativa automatica em instantes.`;
    await registrarEventoSistema(id, texto);
    if (!convite.permanente) {
      await enfileirar(TIPO_CONVITE_PESQUISA, { conversaId: id }, { atrasoMs: 5_000 });
    }
  }

  return publicar(id, { agenteAnteriorId: conversa.agenteId, filaAnteriorId: conversa.filaId });
}

/** Zera o contador de nao lidas ao abrir a conversa no painel. */
export async function marcarComoLida(solicitante: Solicitante, id: string) {
  const conversa = await carregarOuFalhar(id);
  if (conversa.naoLidas === 0) return toConversaDetalhe(conversa);

  await prisma.conversation.update({ where: { id }, data: { naoLidas: 0 } });
  return publicar(id, { filaAnteriorId: conversa.filaId });
}

/**
 * Avisa quem deveria ver uma conversa RECEM-CRIADA — mesmos destinatarios de
 * `publicar` (fila, agente, quem tem a conversa aberta, supervisao), mas pelo
 * evento `conversa:nova`. Sem "anterior": conversa nova nao tira ninguem de
 * lugar nenhum, so entra numa lista.
 *
 * Espelha o que `inbound.service.ts` ja faz para conversa criada por mensagem
 * de cliente (`if (nova) notificarConversaNova(...)`) — `iniciarConversa` e o
 * outro lugar que cria `Conversation` e, ate aqui, nao avisava ninguem.
 */
async function publicarNova(id: string) {
  const detalhe = toConversaDetalhe(await carregarOuFalhar(id));

  // A sala da conversa (`conversaId` nos destinos) e a mesma que o visitante
  // do Webchat escuta — o payload nunca leva notas internas para ela nem para
  // ninguem mais: quem precisa da mensagem em si ja recebe pelo evento
  // `mensagem:nova` (`notificarMensagem`), que tem essa mesma garantia.
  notificarConversaNova(semNotasInternas(detalhe), {
    conversaId: id,
    filaId: detalhe.fila?.id,
    agenteId: detalhe.agente?.id,
  });

  return detalhe;
}

/**
 * Recarrega a conversa e avisa os interessados — incluindo a fila e o agente
 * ANTERIORES, que precisam remover o item das listas deles.
 */
async function publicar(
  id: string,
  anterior: { agenteAnteriorId?: string | null; filaAnteriorId?: string | null },
) {
  const detalhe = toConversaDetalhe(await carregarOuFalhar(id));

  // Mesmo cuidado de `publicarNova`: a sala da conversa e compartilhada com o
  // visitante do Webchat, entao o payload nunca leva notas internas.
  const semNotas = semNotasInternas(detalhe);
  notificarConversaAtualizada(semNotas, {
    conversaId: id,
    filaId: detalhe.fila?.id,
    agenteId: detalhe.agente?.id,
    agenteAnteriorId: anterior.agenteAnteriorId,
  });
  if (anterior.filaAnteriorId && anterior.filaAnteriorId !== detalhe.fila?.id) {
    notificarConversaAtualizada(semNotas, { filaId: anterior.filaAnteriorId });
  }

  return detalhe;
}
