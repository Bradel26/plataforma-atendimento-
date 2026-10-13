import { Prisma, type Channel } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { enviarArquivoParaCanal, enviarParaCanal } from '../channels/outbound.service';
import { notificarConversaAtualizada, notificarMensagem } from '../../realtime/hub';
import { inclusaoDetalhe, semNotasInternas, toConversaDetalhe, toMensagem } from '../conversations/conversations.serializer';
import { enfileirar } from '../../lib/fila';
import { caminhoDe, remover, salvar, urlAssinada } from '../../lib/storage';
import { inicioDoFluxo, lerGrafo, minutos, obterNo, proximoNo, texto, validarGrafo, type GrafoFluxo, type NoFluxo } from './validacao';

const incluirCanal = {
  canalConfig: { select: { id: true, canal: true, modo: true, nome: true, ponteSessao: true, dono: { select: { nome: true } } } },
  canalConfigRascunho: { select: { id: true, canal: true, modo: true, nome: true, ponteSessao: true, dono: { select: { nome: true } } } },
} as const;
const MAX_PASSOS_AUTOMATICOS = 40;

export async function listarFluxos() {
  return prisma.fluxo.findMany({ include: incluirCanal, orderBy: { atualizadoEm: 'desc' } });
}

export async function obterFluxo(id: string) {
  const fluxo = await prisma.fluxo.findUnique({ where: { id }, include: incluirCanal });
  if (!fluxo) throw notFound('Fluxo não encontrado');
  return fluxo;
}

export async function recursosDosFluxos() {
  const [canais, filas, usuarios] = await Promise.all([
    prisma.channelConfig.findMany({
      where: { canal: 'WHATSAPP', modo: 'NAO_OFICIAL', ativo: true },
      select: { id: true, canal: true, modo: true, nome: true, ponteSessao: true, dono: { select: { id: true, nome: true } } },
      orderBy: [{ donoId: 'asc' }, { nome: 'asc' }],
    }),
    prisma.queue.findMany({ where: { ativa: true }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
    prisma.user.findMany({
      where: { ativo: true, perfil: { in: ['AGENTE', 'SUPORTE', 'COMERCIAL'] } },
      select: { id: true, nome: true, perfil: true }, orderBy: { nome: 'asc' },
    }),
  ]);
  return { canais, filas, usuarios };
}

export async function listarMidiasFluxo(fluxoId: string) {
  await obterFluxo(fluxoId);
  const midias = await prisma.midiaFluxo.findMany({ where: { fluxoId }, orderBy: { criadoEm: 'desc' } });
  return midias.map((midia) => ({ ...midia, url: urlAssinada(midia.url) }));
}

export async function criarMidiaFluxo(fluxoId: string, arquivo: { buffer: Buffer; nome: string; tipo: string }) {
  await obterFluxo(fluxoId);
  const salvo = await salvar(arquivo);
  try {
    const midia = await prisma.midiaFluxo.create({
      data: { fluxoId, nome: salvo.nome, tipo: salvo.tipo, url: salvo.url, tamanho: salvo.tamanho },
    });
    return { ...midia, url: urlAssinada(midia.url) };
  } catch (erro) {
    await remover(salvo.chave);
    throw erro;
  }
}

async function conferirCanal(canalConfigId: string | null) {
  if (!canalConfigId) return;
  const canal = await prisma.channelConfig.findUnique({ where: { id: canalConfigId } });
  if (!canal || canal.canal !== 'WHATSAPP' || canal.modo !== 'NAO_OFICIAL' || !canal.ativo) {
    throw badRequest('Selecione um número WhatsApp Web ativo e conectado à plataforma');
  }
}

export async function criarFluxo(input: { nome: string; canalConfigId: string | null }) {
  await conferirCanal(input.canalConfigId);
  return prisma.fluxo.create({
    data: {
      nome: input.nome,
      canalConfigRascunhoId: input.canalConfigId,
      rascunho: {
        nodes: [{ id: 'inicio', type: 'inicio', position: { x: 100, y: 220 }, data: { nome: 'Início' } }],
        edges: [],
      } as Prisma.InputJsonValue,
    },
    include: incluirCanal,
  });
}

export async function salvarRascunho(id: string, input: { nome: string; canalConfigId: string | null; grafo: unknown }) {
  const atual = await prisma.fluxo.findUnique({ where: { id } });
  if (!atual) throw notFound('Fluxo não encontrado');
  await conferirCanal(input.canalConfigId);
  if (input.canalConfigId) {
    const conflito = await prisma.fluxo.findFirst({ where: { canalConfigRascunhoId: input.canalConfigId, id: { not: id } } });
    if (conflito) throw conflict('Este número já está vinculado ao fluxo “' + conflito.nome + '”');
  }
  const grafo = lerGrafo(input.grafo);
  return prisma.fluxo.update({
    where: { id },
    data: { nome: input.nome, canalConfigRascunhoId: input.canalConfigId, rascunho: grafo as unknown as Prisma.InputJsonValue },
    include: incluirCanal,
  });
}

async function validarDestinos(grafo: GrafoFluxo) {
  for (const node of grafo.nodes) {
    if (node.type === 'equipe') {
      const filaId = texto(node.data.filaId);
      const fila = filaId ? await prisma.queue.findUnique({ where: { id: filaId } }) : null;
      if (!fila?.ativa) throw badRequest(`Escolha uma fila ativa no bloco ${node.data.nome || node.id}`);
    }
    if (node.type === 'usuario') {
      const usuarioId = texto(node.data.usuarioId);
      const usuario = usuarioId
        ? await prisma.user.findFirst({ where: { id: usuarioId, ativo: true, perfil: { in: ['AGENTE', 'SUPORTE', 'COMERCIAL'] } } })
        : null;
      if (!usuario) throw badRequest(`Escolha um atendente ativo no bloco ${node.data.nome || node.id}`);
    }
    if (['imagem', 'audio', 'documento', 'video'].includes(node.type)) {
      const midiaId = texto(node.data.midiaId);
      const midia = midiaId ? await prisma.midiaFluxo.findUnique({ where: { id: midiaId } }) : null;
      if (!midia) throw badRequest(`Selecione um arquivo válido no bloco ${node.data.nome || node.id}`);
      const prefixo = node.type === 'imagem' ? 'image/' : node.type === 'audio' ? 'audio/' : node.type === 'video' ? 'video/' : null;
      if (prefixo && !midia.tipo.startsWith(prefixo)) throw badRequest(`O arquivo do bloco ${node.data.nome || node.id} precisa ser ${prefixo.slice(0, -1)}`);
    }
  }
}

export async function publicarFluxo(id: string) {
  const fluxo = await prisma.fluxo.findUnique({ where: { id } });
  if (!fluxo) throw notFound('Fluxo não encontrado');
  if (!fluxo.canalConfigRascunhoId) throw badRequest('Escolha o número WhatsApp Web que vai usar este fluxo');
  await conferirCanal(fluxo.canalConfigRascunhoId);
  const conflito = await prisma.fluxo.findFirst({
    where: { canalConfigId: fluxo.canalConfigRascunhoId, id: { not: id } },
  });
  if (conflito) throw conflict('Este número já está vinculado ao fluxo "' + conflito.nome + '"');
  const grafo = lerGrafo(fluxo.rascunho);
  validarGrafo(grafo);
  await validarDestinos(grafo);
  return prisma.fluxo.update({
    where: { id },
    data: {
      publicado: grafo as unknown as Prisma.InputJsonValue,
      canalConfigId: fluxo.canalConfigRascunhoId,
      ativo: true,
      versao: { increment: 1 },
      publicadoEm: new Date(),
    },
    include: incluirCanal,
  });
}

export async function desativarFluxo(id: string) {
  const fluxo = await prisma.fluxo.findUnique({ where: { id } });
  if (!fluxo) throw notFound('Fluxo não encontrado');
  // Libera o número para receber outro fluxo publicado; o snapshot continua
  // guardado na execução de cada conversa que já estava em andamento.
  return prisma.fluxo.update({ where: { id }, data: { ativo: false, canalConfigId: null }, include: incluirCanal });
}

export async function excluirFluxo(id: string) {
  const fluxo = await prisma.fluxo.findUnique({ where: { id } });
  if (!fluxo) throw notFound('Fluxo não encontrado');
  await prisma.fluxo.delete({ where: { id } });
}

type ConversaFluxo = {
  id: string;
  canal: Channel;
  canalConfigId: string | null;
  contatoId: string;
  enderecoExterno: string | null;
  agenteId: string | null;
  filaId: string | null;
  status: string;
  protocolo: string | null;
  nomeContato?: string | null;
  telefoneContato?: string | null;
};

async function enviarTexto(conversa: ConversaFluxo, conteudo: string) {
  if (!conteudo.trim()) return;
  const idExterno = (await enviarParaCanal(conversa.canal, conversa.enderecoExterno, conteudo, conversa.canalConfigId)).idExterno;
  const mensagem = await prisma.message.create({ data: { conversaId: conversa.id, autor: 'BOT', conteudo, idExterno } });
  const atualizada = await prisma.conversation.update({
    where: { id: conversa.id }, data: { ultimaMensagemEm: mensagem.criadoEm }, include: inclusaoDetalhe,
  });
  const destinos = { conversaId: conversa.id, filaId: atualizada.filaId, agenteId: atualizada.agenteId };
  notificarMensagem({ conversaId: conversa.id, mensagem: toMensagem(mensagem) }, destinos);
  notificarConversaAtualizada(semNotasInternas(toConversaDetalhe(atualizada)), destinos);
}

async function enviarMidia(conversa: ConversaFluxo, node: NoFluxo) {
  const midiaId = texto(node.data.midiaId);
  const midia = midiaId ? await prisma.midiaFluxo.findUnique({ where: { id: midiaId } }) : null;
  if (!midia) throw badRequest(`Selecione um arquivo no bloco ${node.data.nome || node.id}`);
  const chave = midia.url.replace(/^\/api\/arquivos\//, '');
  const buffer = await readFile(caminhoDe(chave));
  const legenda = renderizarVariaveis(texto(node.data.legenda), conversa);
  const envio = await enviarArquivoParaCanal(conversa.canal, conversa.enderecoExterno, {
    buffer,
    nome: midia.nome,
    tipo: midia.tipo,
    ...(legenda ? { legenda } : {}),
  }, conversa.canalConfigId);
  const tipoAnexo = midia.tipo.startsWith('image/') ? 'IMAGEM'
    : midia.tipo.startsWith('audio/') ? 'AUDIO'
      : midia.tipo.startsWith('video/') ? 'VIDEO' : 'ARQUIVO';
  const mensagem = await prisma.message.create({
    data: {
      conversaId: conversa.id,
      autor: 'BOT',
      conteudo: legenda || midia.nome,
      tipoAnexo,
      anexoUrl: midia.url,
      idExterno: envio.idExterno,
    },
  });
  const atualizada = await prisma.conversation.update({
    where: { id: conversa.id }, data: { ultimaMensagemEm: mensagem.criadoEm }, include: inclusaoDetalhe,
  });
  const destinos = { conversaId: conversa.id, filaId: atualizada.filaId, agenteId: atualizada.agenteId };
  notificarMensagem({ conversaId: conversa.id, mensagem: toMensagem(mensagem) }, destinos);
  notificarConversaAtualizada(semNotasInternas(toConversaDetalhe(atualizada)), destinos);
}

function renderizarVariaveis(valor: string, conversa: ConversaFluxo) {
  return valor
    .replaceAll('{{nome}}', conversa.nomeContato ?? '')
    .replaceAll('{{telefone}}', conversa.telefoneContato ?? '')
    .replaceAll('{{protocolo}}', conversa.protocolo ?? '');
}

function normalizar(valor: string) {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');
}

async function encerrarExecucao(runId: string) {
  await prisma.execucaoFluxo.update({
    where: { id: runId }, data: { estado: 'ENCERRADA', expiraEm: null, encerradaEm: new Date() },
  });
}

async function encerrarConversa(conversaId: string, runId: string) {
  const atualizada = await prisma.conversation.update({
    where: { id: conversaId }, data: { status: 'FINALIZADO', finalizadoEm: new Date() }, include: inclusaoDetalhe,
  });
  const evento = await prisma.message.create({ data: { conversaId, autor: 'SISTEMA', evento: 'ENCERRAMENTO', conteudo: 'Atendimento finalizado pelo fluxo.' } });
  const destinos = { conversaId, filaId: atualizada.filaId, agenteId: atualizada.agenteId };
  notificarMensagem({ conversaId, mensagem: toMensagem(evento) }, destinos);
  notificarConversaAtualizada(semNotasInternas(toConversaDetalhe(atualizada)), destinos);
  await encerrarExecucao(runId);
}

async function agendarEspera(runId: string, fluxoId: string | null, versao: number, node: NoFluxo, minutosEspera: number, estado: 'AGUARDANDO_RESPOSTA' | 'AGUARDANDO_TIMEOUT') {
  const expiraEm = new Date(Date.now() + minutosEspera * 60_000);
  await prisma.execucaoFluxo.update({ where: { id: runId }, data: { noAtualId: node.id, estado, expiraEm } });
  await enfileirar('fluxo:timeout', { runId, fluxoId, versao, noId: node.id }, { atrasoMs: minutosEspera * 60_000 });
}

async function executarAteParada(run: { id: string; fluxoId: string | null; versao: number; grafo: Prisma.JsonValue }, conversaId: string, nodeId: string) {
  const grafo = lerGrafo(run.grafo);
  const conversas = await prisma.conversation.findUnique({ where: { id: conversaId } });
  if (!conversas) return;
  const contato = await prisma.contact.findUnique({ where: { id: conversas.contatoId }, select: { nome: true, telefone: true } });
  const conversa: ConversaFluxo = { ...conversas, nomeContato: contato?.nome, telefoneContato: contato?.telefone };
  let atualId: string | null = nodeId;

  for (let passos = 0; atualId && passos < MAX_PASSOS_AUTOMATICOS; passos++) {
    const node = obterNo(grafo, atualId);
    if (!node) { await encerrarExecucao(run.id); return; }
    if (node.type === 'inicio') {
      atualId = proximoNo(grafo, node.id);
      continue;
    }
    if (node.type === 'texto') {
      const conteudo = texto(node.data.texto);
      await enviarTexto(conversa, renderizarVariaveis(conteudo, conversa));
      atualId = proximoNo(grafo, node.id);
      continue;
    }
    if (node.type === 'imagem' || node.type === 'audio' || node.type === 'documento' || node.type === 'video') {
      await enviarMidia(conversa, node);
      atualId = proximoNo(grafo, node.id);
      continue;
    }
    if (node.type === 'menu') {
      await enviarTexto(conversa, renderizarVariaveis(texto(node.data.texto), conversa));
      await prisma.execucaoFluxo.update({ where: { id: run.id }, data: { noAtualId: node.id, estado: 'AGUARDANDO_RESPOSTA', tentativas: 0 } });
      const timeoutMin = minutos(node.data.timeoutMin);
      if (timeoutMin > 0) await agendarEspera(run.id, run.fluxoId, run.versao, node, timeoutMin, 'AGUARDANDO_RESPOSTA');
      return;
    }
    if (node.type === 'equipe') {
      const filaId = texto(node.data.filaId);
      const fila = await prisma.queue.findUnique({ where: { id: filaId } });
      if (!fila?.ativa) { await encerrarExecucao(run.id); return; }
      const atualizada = await prisma.conversation.update({
        where: { id: conversaId }, data: { filaId, agenteId: null, status: 'EM_ESPERA', atribuidoEm: null }, include: inclusaoDetalhe,
      });
      const destinos = { conversaId, filaId, agenteId: null };
      const evento = await prisma.message.create({ data: { conversaId, autor: 'SISTEMA', evento: 'TRANSFERENCIA', conteudo: `Fluxo encaminhou o atendimento para a equipe ${fila.nome}.` } });
      notificarMensagem({ conversaId, mensagem: toMensagem(evento) }, destinos);
      notificarConversaAtualizada(semNotasInternas(toConversaDetalhe(atualizada)), destinos);
      const timeoutMin = minutos(node.data.timeoutMin);
      if (timeoutMin > 0 && proximoNo(grafo, node.id, 'timeout')) {
        await agendarEspera(run.id, run.fluxoId, run.versao, node, timeoutMin, 'AGUARDANDO_TIMEOUT');
        const estadoAtual = await prisma.conversation.findUnique({ where: { id: conversaId }, select: { agenteId: true, status: true } });
        if (!estadoAtual || estadoAtual.status === 'FINALIZADO') await encerrarExecucao(run.id);
        else if (estadoAtual.agenteId) await registrarAceiteFluxo(conversaId);
      } else {
        await prisma.execucaoFluxo.update({ where: { id: run.id }, data: { noAtualId: node.id, estado: 'AGUARDANDO_TIMEOUT', expiraEm: null } });
      }
      return;
    }
    if (node.type === 'usuario') {
      const usuarioId = texto(node.data.usuarioId);
      const usuario = await prisma.user.findFirst({ where: { id: usuarioId, ativo: true, perfil: { in: ['AGENTE', 'SUPORTE', 'COMERCIAL'] } } });
      if (!usuario) { await encerrarExecucao(run.id); return; }
      const atualizada = await prisma.conversation.update({
        where: { id: conversaId },
        data: { agenteId: usuario.id, filaId: null, status: 'ATRIBUIDO', atribuidoEm: new Date(), atendenteInicialId: usuario.id },
        include: inclusaoDetalhe,
      });
      const evento = await prisma.message.create({ data: { conversaId, autor: 'SISTEMA', evento: 'ACEITE', conteudo: `Aceito por: ${usuario.nome}` } });
      const destinos = { conversaId, filaId: null, agenteId: usuario.id };
      notificarMensagem({ conversaId, mensagem: toMensagem(evento) }, destinos);
      notificarConversaAtualizada(semNotasInternas(toConversaDetalhe(atualizada)), destinos);
      atualId = proximoNo(grafo, node.id, 'next');
      if (!atualId) { await encerrarExecucao(run.id); return; }
      continue;
    }
    if (node.type === 'espera') {
      const delay = minutos(node.data.minutos);
      if (delay < 1) { await encerrarExecucao(run.id); return; }
      await agendarEspera(run.id, run.fluxoId, run.versao, node, delay, 'AGUARDANDO_TIMEOUT');
      return;
    }
    if (node.type === 'finalizar') {
      await encerrarConversa(conversaId, run.id);
      return;
    }
  }
  if (atualId) {
    console.error(`[fluxo] limite de passos automáticos excedido na conversa ${conversaId}`);
    await encerrarExecucao(run.id);
  }
}

async function criarExecucao(conversaId: string, fluxoId: string, versao: number, grafo: unknown) {
  const lido = lerGrafo(grafo);
  const inicio = inicioDoFluxo(lido);
  return prisma.execucaoFluxo.create({
    data: {
      conversaId, fluxoId, versao, grafo: lido as unknown as Prisma.InputJsonValue,
      noAtualId: inicio.id, estado: 'AGUARDANDO_RESPOSTA',
    },
  });
}

export async function processarMensagemDeFluxo(conversaId: string, textoCliente: string) {
  const conversa = await prisma.conversation.findUnique({ where: { id: conversaId } });
  if (!conversa || conversa.status === 'FINALIZADO' || conversa.agenteId) return { tratada: false };

  let execucao = await prisma.execucaoFluxo.findUnique({ where: { conversaId } });
  if (!execucao) {
    if (!conversa.canalConfigId) return { tratada: false };
    const fluxo = await prisma.fluxo.findFirst({ where: { canalConfigId: conversa.canalConfigId, ativo: true } });
    if (!fluxo?.publicado) return { tratada: false };
    try {
      execucao = await criarExecucao(conversaId, fluxo.id, fluxo.versao, fluxo.publicado);
    } catch (erro) {
      if (!(erro instanceof Prisma.PrismaClientKnownRequestError) || erro.code !== 'P2002') throw erro;
      execucao = await prisma.execucaoFluxo.findUnique({ where: { conversaId } });
      if (!execucao) throw erro;
    }
    if (execucao.estado !== 'AGUARDANDO_RESPOSTA') return { tratada: true };
    const reivindicada = await prisma.execucaoFluxo.updateMany({
      where: { id: execucao.id, estado: 'AGUARDANDO_RESPOSTA', tentativas: 0 },
      data: { tentativas: { increment: 1 } },
    });
    if (reivindicada.count !== 1) return { tratada: true };
    const primeiro = proximoNo(lerGrafo(execucao.grafo), execucao.noAtualId);
    if (!primeiro) { await encerrarExecucao(execucao.id); return { tratada: true }; }
    await executarAteParada(execucao, conversaId, primeiro);
    return { tratada: true };
  }

  if (execucao.estado === 'ENCERRADA') return { tratada: false };
  if (execucao.estado === 'AGUARDANDO_TIMEOUT') return { tratada: true };
  const grafo = lerGrafo(execucao.grafo);
  const node = obterNo(grafo, execucao.noAtualId);
  if (!node || node.type !== 'menu') return { tratada: true };

  const reivindicada = await prisma.execucaoFluxo.updateMany({
    where: { id: execucao.id, estado: 'AGUARDANDO_RESPOSTA', tentativas: execucao.tentativas },
    data: { tentativas: { increment: 1 } },
  });
  if (reivindicada.count !== 1) return { tratada: true };

  const opcoes = Array.isArray(node.data.opcoes) ? node.data.opcoes as Array<{ id: string; label: string }> : [];
  const resposta = normalizar(textoCliente);
  const escolhida = opcoes.find((opcao, indice) => {
    const rotulo = normalizar(opcao.label);
    return resposta === String(indice + 1) || resposta === rotulo;
  });
  if (!escolhida) {
    const tentativas = execucao.tentativas + 1;
    const limite = Math.max(1, Math.min(5, minutos(node.data.limiteTentativas) || 3));
    if (tentativas < limite) {
      const contato = await prisma.contact.findUnique({ where: { id: conversa.contatoId }, select: { nome: true, telefone: true } });
      const contexto = { ...conversa, nomeContato: contato?.nome, telefoneContato: contato?.telefone };
      await enviarTexto(contexto, renderizarVariaveis(texto(node.data.texto), contexto));
      return { tratada: true };
    }
    const destino = proximoNo(grafo, node.id, 'timeout');
    if (destino) await executarAteParada(execucao, conversaId, destino);
    else await encerrarExecucao(execucao.id);
    return { tratada: true };
  }

  const destino = proximoNo(grafo, node.id, escolhida.id);
  if (destino) await executarAteParada(execucao, conversaId, destino);
  else await encerrarExecucao(execucao.id);
  return { tratada: true };
}

export async function processarTimeoutFluxo(input: { runId: string; fluxoId: string | null; versao: number; noId: string }) {
  const run = await prisma.execucaoFluxo.findUnique({ where: { id: input.runId } });
  if (!run || run.estado === 'ENCERRADA' || !['AGUARDANDO_TIMEOUT', 'AGUARDANDO_RESPOSTA'].includes(run.estado) || run.noAtualId !== input.noId || run.versao !== input.versao) return;
  if (!run.expiraEm || run.expiraEm.getTime() > Date.now()) return;
  const conversa = await prisma.conversation.findUnique({ where: { id: run.conversaId } });
  if (!conversa || conversa.status === 'FINALIZADO') {
    await encerrarExecucao(run.id);
    return;
  }
  if (conversa.agenteId) {
    await registrarAceiteFluxo(conversa.id);
    return;
  }
  const grafo = lerGrafo(run.grafo);
  const node = obterNo(grafo, run.noAtualId);
  if (run.estado === 'AGUARDANDO_RESPOSTA' && node?.type !== 'menu') return;
  const destino = node ? proximoNo(grafo, node.id, 'timeout') : null;
  if (!destino) { await encerrarExecucao(run.id); return; }
  const reivindicada = await prisma.execucaoFluxo.updateMany({
    where: { id: run.id, estado: run.estado, noAtualId: run.noAtualId, expiraEm: run.expiraEm },
    data: { estado: 'ENCERRADA', expiraEm: null, encerradaEm: new Date() },
  });
  if (reivindicada.count !== 1) return;
  await executarAteParada(run, run.conversaId, destino);
}

export async function registrarAceiteFluxo(conversaId: string) {
  const run = await prisma.execucaoFluxo.findUnique({ where: { conversaId } });
  if (!run || run.estado === 'ENCERRADA') return;
  const grafo = lerGrafo(run.grafo);
  const node = obterNo(grafo, run.noAtualId);
  if (node?.type === 'equipe' && run.estado === 'AGUARDANDO_TIMEOUT') {
    const reivindicada = await prisma.execucaoFluxo.updateMany({
      where: { id: run.id, estado: 'AGUARDANDO_TIMEOUT', noAtualId: run.noAtualId, expiraEm: run.expiraEm },
      data: { estado: 'ENCERRADA', expiraEm: null, encerradaEm: new Date() },
    });
    if (reivindicada.count !== 1) return;
    const destino = proximoNo(grafo, node.id, 'next');
    if (destino) await executarAteParada(run, conversaId, destino);
    return;
  }
  await encerrarExecucao(run.id);
}
