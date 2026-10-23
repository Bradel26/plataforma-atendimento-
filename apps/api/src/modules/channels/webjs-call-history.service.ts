import type { CallStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { salvar } from '../../lib/storage';
import { notificarChamada } from '../../realtime/hub';

export type RegistroChamadaWebJs = {
  callId: string;
  sessao: string;
  direcao: 'ENTRANTE' | 'SAINTE';
  telefone: string;
  status: CallStatus;
  iniciadoEm?: string;
  atendidoEm?: string | null;
  encerradoEm?: string | null;
  duracao?: number | null;
  transcricao?: string | null;
  resumo?: string | null;
  analisadoPor?: string | null;
  gravacao?: { buffer: Buffer; nome: string };
  canalConfig: {
    id: string;
    donoId: string | null;
    filaId: string | null;
    nome: string | null;
  };
  agenteId: string;
};

const digitos = (value: string) => value.replace(/\D/g, '');

async function contatoPorTelefone(telefone: string) {
  const numero = digitos(telefone);
  if (numero.length < 8) return null;
  const candidatos = await prisma.contact.findMany({
    where: { telefone: { contains: numero.slice(-8) } },
    select: { id: true, telefone: true },
    take: 20,
  });
  const canonico = (value: string) => {
    const limpo = digitos(value);
    return limpo.startsWith('55') && [12, 13].includes(limpo.length) ? limpo.slice(2) : limpo;
  };
  const exatos = candidatos.filter((item) => item.telefone && canonico(item.telefone) === canonico(numero));
  return exatos.length === 1 ? exatos[0]!.id : null;
}

/** Cria/atualiza o CDR da chamada local e guarda os artefatos no storage da plataforma. */
export async function salvarRegistroChamadaWebJs(input: RegistroChamadaWebJs) {
  const idExterno = `webjs:${input.sessao}:${input.callId}`;
  const existente = await prisma.call.findFirst({ where: { idExterno }, select: { id: true, gravacaoUrl: true } });
  const telefone = digitos(input.telefone) || 'WhatsApp';
  const linha = input.canalConfig.nome || 'WhatsApp';
  const dados = {
    status: input.status,
    ...(input.atendidoEm ? { atendidoEm: new Date(input.atendidoEm) } : {}),
    ...(input.encerradoEm ? { encerradoEm: new Date(input.encerradoEm) } : {}),
    ...(input.duracao != null ? { duracao: input.duracao } : {}),
    ...(input.transcricao !== undefined ? { transcricao: input.transcricao } : {}),
    ...(input.resumo !== undefined ? { resumo: input.resumo } : {}),
    ...(input.analisadoPor ? { analisadoPor: input.analisadoPor, analisadoEm: new Date() } : {}),
  };

  const chamada = existente
    ? await prisma.call.update({ where: { id: existente.id }, data: dados })
    : await prisma.call.create({
        data: {
          idExterno,
          direcao: input.direcao,
          numeroOrigem: input.direcao === 'ENTRANTE' ? telefone : linha,
          numeroDestino: input.direcao === 'ENTRANTE' ? linha : telefone,
          contatoId: await contatoPorTelefone(telefone),
          agenteId: input.canalConfig.donoId ?? input.agenteId,
          filaId: input.canalConfig.filaId,
          canalConfigId: input.canalConfig.id,
          iniciadoEm: input.iniciadoEm ? new Date(input.iniciadoEm) : new Date(),
          ...dados,
        },
      });

  let gravacaoUrl = existente?.gravacaoUrl ?? null;
  if (input.gravacao && !gravacaoUrl?.startsWith('/api/arquivos/')) {
    const arquivo = await salvar({ buffer: input.gravacao.buffer, nome: input.gravacao.nome, tipo: 'audio/wav', limiteBytesMaximo: 100 * 1024 * 1024 });
    gravacaoUrl = arquivo.url;
    await prisma.call.update({ where: { id: chamada.id }, data: { gravacaoUrl, gravacaoDuracao: input.duracao ?? null } });
  }

  const atualizada = await prisma.call.findUnique({ where: { id: chamada.id } });
  if (atualizada) await notificarChamada(atualizada, { agenteId: atualizada.agenteId, filaId: atualizada.filaId });
  return { chamadaId: chamada.id, gravacaoUrl };
}
