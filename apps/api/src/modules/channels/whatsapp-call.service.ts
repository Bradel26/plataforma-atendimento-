import type { CallStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { notificarChamada } from '../../realtime/hub';

export type EventoChamadaWhatsApp = {
  sessao: string;
  numeroDaLinha: string | null;
  idExterno: string;
  status: 'offer' | 'ringing' | 'preaccept' | 'transport' | 'relaylatency' | 'timeout' | 'reject' | 'accept' | 'terminate';
  de: string;
  telefoneDe: string | null;
  ocorreuEm: string;
  video: boolean;
  offline: boolean;
};

const FINAIS: CallStatus[] = ['COMPLETADA', 'NAO_ATENDIDA', 'OCUPADA', 'FALHOU', 'CANCELADA'];

function telefoneLimpo(valor: string | null): string | null {
  if (!valor || valor.endsWith('@lid')) return null;
  const digitos = valor.replace(/\D/g, '');
  return digitos.length >= 8 ? digitos : null;
}

async function contatoDoTelefone(numero: string | null) {
  const digitos = telefoneLimpo(numero);
  if (!digitos) return null;
  const canonico = (valor: string) => {
    const limpo = valor.replace(/\D/g, '');
    return limpo.startsWith('55') && (limpo.length === 12 || limpo.length === 13)
      ? limpo.slice(2)
      : limpo;
  };
  const candidatos = await prisma.contact.findMany({
    where: { telefone: { contains: digitos.slice(-8) } },
    select: { id: true, telefone: true },
    take: 20,
  });
  const exatos = candidatos.filter((c) => c.telefone && canonico(c.telefone) === canonico(digitos));
  if (exatos.length === 1) return { id: exatos[0]!.id };
  return null;
}

/** Persiste os eventos do Baileys como uma chamada entrante idempotente. */
export async function registrarEventoDeChamadaWhatsApp(
  evento: EventoChamadaWhatsApp,
  config: { donoId: string | null; filaId: string | null },
) {
  const idExterno = `whatsapp:${evento.sessao}:${evento.idExterno}`;
  const existente = await prisma.call.findUnique({ where: { idExterno } });
  const ocorreuEm = new Date(evento.ocorreuEm);

  if (evento.status === 'offer') {
    if (existente) return { chamada: existente, duplicado: true };

    const telefoneCliente = telefoneLimpo(evento.telefoneDe) ?? telefoneLimpo(evento.de);
    const contato = await contatoDoTelefone(telefoneCliente);
    const chamada = await prisma.call.create({
      data: {
        idExterno,
        direcao: 'ENTRANTE',
        status: 'CHAMANDO',
        numeroOrigem: telefoneCliente ?? 'WhatsApp (número não identificado)',
        numeroDestino: evento.numeroDaLinha ?? 'WhatsApp',
        contatoId: contato?.id ?? null,
        agenteId: config.donoId,
        filaId: config.filaId,
        iniciadoEm: ocorreuEm,
      },
    });
    await notificarChamada(chamada, { agenteId: chamada.agenteId, filaId: chamada.filaId });
    return { chamada, duplicado: false };
  }

  // O primeiro offer e o identificador da chamada. Eventos posteriores sem
  // offer correspondente (p.ex. historico recebido ao reconectar) nao inventam
  // uma chamada incompleta.
  if (!existente || FINAIS.includes(existente.status)) {
    return { chamada: existente, ignorado: true };
  }

  if (evento.status === 'accept') {
    if (existente.status === 'EM_ANDAMENTO') return { chamada: existente, duplicado: true };
    const chamada = await prisma.call.update({
      where: { id: existente.id },
      data: { status: 'EM_ANDAMENTO', atendidoEm: ocorreuEm },
    });
    await notificarChamada(chamada, { agenteId: chamada.agenteId, filaId: chamada.filaId });
    return { chamada, duplicado: false };
  }

  if (evento.status === 'reject' || evento.status === 'timeout' || evento.status === 'terminate') {
    const atendida = existente.atendidoEm !== null;
    // Um reject/timeout que chegue atrasado nunca pode desfazer um aceite.
    if (evento.status !== 'terminate' && atendida) {
      return { chamada: existente, ignorado: true };
    }
    const chamada = await prisma.call.update({
      where: { id: existente.id },
      data: {
        status: evento.status === 'terminate' ? (atendida ? 'COMPLETADA' : 'CANCELADA') : 'NAO_ATENDIDA',
        encerradoEm: ocorreuEm,
        duracao: existente.atendidoEm ? Math.max(0, Math.round((ocorreuEm.getTime() - existente.atendidoEm.getTime()) / 1000)) : 0,
      },
    });
    await notificarChamada(chamada, { agenteId: chamada.agenteId, filaId: chamada.filaId });
    return { chamada, duplicado: false };
  }

  return { chamada: existente, ignorado: true };
}
