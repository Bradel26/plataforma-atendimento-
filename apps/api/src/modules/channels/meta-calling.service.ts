import type { CallStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, forbidden, notFound, serviceUnavailable } from '../../lib/errors';
import { decifrar } from '../../lib/crypto-box';
import { env } from '../../env';
import { limiteBytes, salvar, tipoAceito, urlAssinada } from '../../lib/storage';
import { enfileirar } from '../../lib/fila';
import { notificarChamada } from '../../realtime/hub';
import type { MetaWebhook } from './meta.types';

type AcaoChamadaMeta = 'accept' | 'reject' | 'terminate';
export const TIPO_TRANSCRICAO_CHAMADA_WHATSAPP = 'voz:transcricao-whatsapp';

/** Busca uma chamada Cloud API apenas para o dono da linha (ou gestão). */
async function chamadaDaLinha(chamadaId: string, usuarioId: string, gestor: boolean) {
  const chamada = await prisma.call.findFirst({
    where: {
      id: chamadaId,
      canalConfigId: { not: null },
      ...(gestor ? {} : { canalConfig: { donoId: usuarioId } }),
    },
    include: { canalConfig: true },
  });
  if (!chamada) throw notFound('Chamada WhatsApp não encontrada');
  const canalConfig = chamada.canalConfig;
  if (!canalConfig) throw notFound('Chamada WhatsApp não encontrada');
  if (!gestor && canalConfig.donoId !== usuarioId) throw forbidden();
  if (!canalConfig.phoneNumberId || !canalConfig.accessToken) {
    throw serviceUnavailable('A linha não tem credenciais Cloud API ativas.');
  }
  return { ...chamada, canalConfig };
}

export async function obterOfertaDaChamada(chamadaId: string, usuarioId: string, gestor: boolean) {
  const chamada = await chamadaDaLinha(chamadaId, usuarioId, gestor);
  if (!['CHAMANDO', 'EM_ANDAMENTO'].includes(chamada.status)) {
    throw badRequest('Esta chamada não está ativa.');
  }
  if (!chamada.sdpRemoto) throw serviceUnavailable('A Meta ainda não enviou a oferta de áudio desta chamada.');
  return { sdp: chamada.sdpRemoto };
}

/** Aceita, recusa ou encerra uma chamada usando a credencial da linha proprietária. */
export async function controlarChamadaMeta(input: {
  chamadaId: string;
  usuarioId: string;
  gestor: boolean;
  acao: AcaoChamadaMeta;
  sdp?: string;
}) {
  const chamada = await chamadaDaLinha(input.chamadaId, input.usuarioId, input.gestor);
  const callId = chamada.idExterno.split(':').slice(2).join(':');
  if (!callId) throw badRequest('Identificador da chamada inválido.');
  if (input.acao === 'accept' && (chamada.direcao !== 'ENTRANTE' || chamada.status !== 'CHAMANDO')) {
    throw badRequest('Só é possível atender uma chamada recebida que ainda está tocando.');
  }
  if (input.acao === 'reject' && (chamada.direcao !== 'ENTRANTE' || chamada.status !== 'CHAMANDO')) {
    throw badRequest('Só é possível recusar uma chamada recebida que ainda está tocando.');
  }
  if (input.acao === 'terminate' && !['CHAMANDO', 'EM_ANDAMENTO'].includes(chamada.status)) {
    throw badRequest('Esta chamada já foi encerrada.');
  }
  if (input.acao === 'accept' && (!input.sdp || input.sdp.length > 100_000)) {
    throw badRequest('A resposta de áudio do navegador está ausente ou inválida.');
  }

  const accessToken = chamada.canalConfig.accessToken;
  const phoneNumberId = chamada.canalConfig.phoneNumberId;
  if (!accessToken || !phoneNumberId) throw serviceUnavailable('A linha não tem credenciais Cloud API ativas.');
  const token = decifrar(accessToken);
  const enviar = async (acao: AcaoChamadaMeta | 'pre_accept') => {
    const resposta = await fetch(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${encodeURIComponent(phoneNumberId)}/calls`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        call_id: callId,
        action: acao,
        ...(input.acao === 'accept' ? { session: { sdp_type: 'answer', sdp: input.sdp } } : {}),
      }),
    });
    const corpo = await resposta.json().catch(() => ({})) as { error?: { message?: string } };
    if (!resposta.ok) throw serviceUnavailable(`A Meta não completou a ação da chamada${corpo.error?.message ? `: ${corpo.error.message}` : ` (HTTP ${resposta.status})`}.`);
  };

  if (input.acao === 'accept') {
    await enviar('pre_accept');
    await enviar('accept');
  } else {
    await enviar(input.acao);
  }

  const agora = new Date();
  const atualizada = await prisma.call.update({
    where: { id: chamada.id },
    data: input.acao === 'accept'
      ? { status: 'EM_ANDAMENTO', atendidoEm: chamada.atendidoEm ?? agora }
      : input.acao === 'reject'
        ? { status: 'NAO_ATENDIDA', encerradoEm: agora, duracao: 0 }
        : {
            status: chamada.atendidoEm ? 'COMPLETADA' : 'CANCELADA',
            encerradoEm: agora,
            duracao: chamada.atendidoEm
              ? Math.max(0, Math.round((agora.getTime() - chamada.atendidoEm.getTime()) / 1000))
              : 0,
          },
  });
  await notificarChamada(atualizada, { agenteId: atualizada.agenteId, filaId: atualizada.filaId });
  return atualizada;
}

export async function originarChamadaMeta(input: {
  usuarioId: string;
  destino: string;
  sdp: string;
}) {
  const destino = input.destino.replace(/\D/g, '');
  if (destino.length < 10 || destino.length > 15) throw badRequest('Informe um telefone válido com DDD e código do país.');
  if (!input.sdp || input.sdp.length > 100_000) throw badRequest('A oferta de áudio do navegador está ausente ou inválida.');

  const linha = await prisma.channelConfig.findFirst({
    where: { canal: 'WHATSAPP', donoId: input.usuarioId, ativo: true, whatsappCallingHabilitado: true },
  });
  if (!linha?.phoneNumberId || !linha.accessToken) {
    throw serviceUnavailable('Conecte seu número WhatsApp Cloud e habilite chamadas antes de ligar.');
  }

  const resposta = await fetch(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${encodeURIComponent(linha.phoneNumberId)}/calls`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${decifrar(linha.accessToken)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: destino,
      action: 'connect',
      session: { sdp_type: 'offer', sdp: input.sdp },
    }),
  });
  const corpo = await resposta.json().catch(() => ({})) as {
    calls?: Array<{ id?: string; call_id?: string; status?: string }>;
    call_id?: string;
    id?: string;
    error?: { message?: string };
  };
  if (!resposta.ok) {
    throw serviceUnavailable(`A Meta não iniciou a chamada${corpo.error?.message ? `: ${corpo.error.message}` : ` (HTTP ${resposta.status})`}.`);
  }
  const callId = corpo.calls?.[0]?.id ?? corpo.calls?.[0]?.call_id ?? corpo.call_id ?? corpo.id;
  if (!callId) throw serviceUnavailable('A Meta aceitou a solicitação, mas não retornou o identificador da chamada.');

  const contatoId = await contatoDoTelefone(destino);
  const chamada = await prisma.call.upsert({
    where: { idExterno: `whatsapp-cloud:${linha.phoneNumberId}:${callId}` },
    update: {},
    create: {
      organizacaoId: linha.organizacaoId,
      idExterno: `whatsapp-cloud:${linha.phoneNumberId}:${callId}`,
      direcao: 'SAINTE',
      status: 'CHAMANDO',
      numeroOrigem: linha.nome ?? linha.phoneNumberId,
      numeroDestino: destino,
      sdpRemoto: null,
      contatoId,
      agenteId: input.usuarioId,
      filaId: linha.filaId,
      canalConfigId: linha.id,
    },
  });
  await notificarChamada(chamada, { agenteId: chamada.agenteId, filaId: chamada.filaId });
  return chamada;
}

/** Persiste a gravação feita pelo navegador e transcreve quando há chave configurada. */
export async function guardarGravacaoDaChamada(input: {
  chamadaId: string;
  usuarioId: string;
  gestor: boolean;
  buffer: Buffer;
  tipo: string;
}) {
  const chamada = await chamadaDaLinha(input.chamadaId, input.usuarioId, input.gestor);
  if (!chamada.canalConfig.gravarChamadasWhatsapp) {
    throw forbidden('A gravação está desativada para esta linha WhatsApp.');
  }
  const tipo = input.tipo.split(';')[0]!.trim().toLowerCase();
  if (!tipoAceito(tipo) || !tipo.startsWith('audio/')) throw badRequest('Envie uma gravação de áudio compatível.');
  if (input.buffer.length === 0 || input.buffer.length > limiteBytes) throw badRequest('A gravação está vazia ou excede o limite de armazenamento.');

  let url = chamada.gravacaoUrl;
  if (!url?.startsWith('/api/arquivos/')) {
    const arquivo = await salvar({ buffer: input.buffer, nome: `chamada-${chamada.id}.webm`, tipo });
    url = arquivo.url;
    await prisma.call.update({ where: { id: chamada.id }, data: { gravacaoUrl: url } });
  }

  let transcricao = chamada.transcricao;
  let transcricaoPendente = false;
  if (chamada.canalConfig.transcreverChamadasWhatsapp && !transcricao) {
    if (!env.OPENAI_API_KEY) {
      transcricaoPendente = true;
    } else {
      await enfileirar(TIPO_TRANSCRICAO_CHAMADA_WHATSAPP, { chamadaId: chamada.id, url });
      transcricaoPendente = true;
    }
  }

  await notificarChamada(
    { id: chamada.id, contatoId: chamada.contatoId, gravacaoUrl: url, transcricao },
    { agenteId: chamada.agenteId, filaId: chamada.filaId },
  );

  return {
    chamadaId: chamada.id,
    gravacaoUrl: url ? urlAssinada(url) : null,
    transcricao,
    transcricaoSolicitada: chamada.canalConfig.transcreverChamadasWhatsapp,
    transcricaoPendente,
  };
}

/** Registra os eventos e a sinalização de chamada da Cloud API na linha correta. */
export async function registrarChamadasMeta(payload: MetaWebhook) {
  let processadas = 0;
  let ignoradas = 0;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value.calls?.length) continue;

      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) {
        ignoradas += value.calls.length;
        continue;
      }

      const linha = await prisma.channelConfig.findFirst({
        where: { canal: 'WHATSAPP', phoneNumberId, ativo: true },
        select: {
          id: true,
          donoId: true,
          filaId: true,
          nome: true,
          phoneNumberId: true,
          whatsappCallingHabilitado: true,
        },
      });
      if (!linha || !linha.whatsappCallingHabilitado) {
        ignoradas += value.calls.length;
        continue;
      }

      for (const event of value.calls) {
        const callId = event.id ?? event.call_id ?? event.callId;
        const nomeEvento = normalizarEvento(event.event);
        if (!callId || !nomeEvento) {
          ignoradas += 1;
          continue;
        }

        const idExterno = `whatsapp-cloud:${phoneNumberId}:${callId}`;
        const existente = await prisma.call.findUnique({ where: { idExterno } });
        const timestamp = event.timestamp
          ? /^\d+(\.\d+)?$/.test(String(event.timestamp))
            ? new Date(Number(event.timestamp) * 1000)
            : new Date(String(event.timestamp))
          : new Date();
        const ocorridoEm = Number.isNaN(timestamp.getTime()) ? new Date() : timestamp;
        const numeroOrigem = event.from ?? '';
        const numeroDestino = event.to ?? linha.nome ?? linha.phoneNumberId ?? phoneNumberId;

        if (!existente) {
          // O primeiro webhook de chamadas recebidas é `connect`. Outras
          // notificações sem chamada inicial podem ser reentregas tardias.
          if (nomeEvento !== 'connect') {
            ignoradas += 1;
            continue;
          }

          const direcao = direcaoDoEvento(event.direction);
          const numeroContato = direcao === 'ENTRANTE' ? numeroOrigem : (event.to ?? '');
          const contatoId = await contatoDoTelefone(numeroContato);
          const chamada = await prisma.call.create({
            data: {
              idExterno,
              direcao,
              status: 'CHAMANDO',
              numeroOrigem: numeroOrigem || 'WhatsApp (número não identificado)',
              numeroDestino: event.to ?? numeroDestino,
              sdpRemoto: event.session?.sdp ?? null,
              contatoId,
              agenteId: linha.donoId,
              filaId: linha.filaId,
              canalConfigId: linha.id,
              iniciadoEm: ocorridoEm,
            },
          });
          await notificarChamada(chamada, { agenteId: chamada.agenteId, filaId: chamada.filaId });
          processadas += 1;
          continue;
        }

        if (nomeEvento === 'connect' && event.session?.sdp && event.session.sdp.length <= 100_000) {
          const atualizada = await prisma.call.update({
            where: { id: existente.id },
            data: { sdpRemoto: event.session.sdp },
          });
          await notificarChamada(atualizada, { agenteId: atualizada.agenteId, filaId: atualizada.filaId });
          processadas += 1;
          continue;
        }

        const novoStatus = statusDoEvento(nomeEvento, event.status, Boolean(existente.atendidoEm));
        if (!novoStatus || existente.status === novoStatus || statusFinal(existente.status)) {
          ignoradas += 1;
          continue;
        }

        const chamada = await prisma.call.update({
          where: { id: existente.id },
          data: {
            status: novoStatus,
            ...(novoStatus === 'EM_ANDAMENTO' && !existente.atendidoEm ? { atendidoEm: ocorridoEm } : {}),
            ...(['COMPLETADA', 'NAO_ATENDIDA', 'CANCELADA', 'FALHOU'].includes(novoStatus) && !existente.encerradoEm
              ? {
                  encerradoEm: ocorridoEm,
                  duracao: existente.atendidoEm
                    ? Math.max(0, Math.round((ocorridoEm.getTime() - existente.atendidoEm.getTime()) / 1000))
                    : 0,
                }
              : {}),
          },
        });
        await notificarChamada(chamada, { agenteId: chamada.agenteId, filaId: chamada.filaId });
        processadas += 1;
      }
    }
  }

  return { processadas, ignoradas };
}

async function contatoDoTelefone(numero: string) {
  const digitos = numero.replace(/\D/g, '');
  if (digitos.length < 8) return null;
  const candidatos = await prisma.contact.findMany({
    where: { telefone: { contains: digitos.slice(-8) } },
    select: { id: true, telefone: true },
    take: 20,
  });
  const exatos = candidatos.filter((contato) => contato.telefone?.replace(/\D/g, '') === digitos);
  if (exatos.length === 1) return exatos[0]!.id;
  return candidatos.length === 1 ? candidatos[0]!.id : null;
}

function direcaoDoEvento(direcao?: string): 'ENTRANTE' | 'SAINTE' {
  const valor = (direcao ?? '').toLowerCase().replaceAll('-', '_');
  return ['business_initiated', 'outbound', 'outgoing', 'sainte'].includes(valor) ? 'SAINTE' : 'ENTRANTE';
}

function statusDoEvento(evento: string, status?: string, jaAtendida = false): CallStatus | null {
  const estado = (status ?? '').toLowerCase().replaceAll('-', '_');
  if (evento === 'terminate') {
    if (['no_answer', 'not_answered', 'rejected', 'declined'].includes(estado)) return 'NAO_ATENDIDA';
    if (['failed', 'error'].includes(estado)) return 'FALHOU';
    if (['cancelled', 'canceled', 'cancel'].includes(estado)) return 'CANCELADA';
    return jaAtendida ? 'COMPLETADA' : 'CANCELADA';
  }
  switch (evento.toLowerCase()) {
    case 'ringing':
    case 'initiated':
      return 'CHAMANDO';
    case 'accepted':
    case 'accept':
      return 'EM_ANDAMENTO';
    case 'terminate':
    case 'completed':
      return 'COMPLETADA';
    case 'reject':
    case 'timeout':
    case 'no_answer':
      return 'NAO_ATENDIDA';
    case 'failed':
      return 'FALHOU';
    default:
      return null;
  }
}

function normalizarEvento(evento?: string) {
  if (!evento) return null;
  const normalizado = evento.toLowerCase().replace(/^call(status)?::/, '').replace(/^call_/, '');
  return normalizado || null;
}

function statusFinal(status: CallStatus) {
  return ['COMPLETADA', 'NAO_ATENDIDA', 'OCUPADA', 'FALHOU', 'CANCELADA'].includes(status);
}
