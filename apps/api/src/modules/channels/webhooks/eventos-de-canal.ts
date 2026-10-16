import { log } from '../../../lib/log';
import { prisma, prismaSemIsolamento } from '../../../lib/prisma';
import { semOrganizacao } from '../../../lib/tenant';
import { notificarMensagemStatus, notificarStatusCanal } from '../../../realtime/hub';
import { registrarMensagemEntrante } from '../inbound.service';
import type { EventoDeCanal, SituacaoSessao, StatusDeEntrega } from '../providers/channel-provider';

/**
 * O que o CRM faz com cada evento que um provider entregou — o lado de
 * DOMINIO do webhook. Aqui ja nao existe payload de engine nenhuma: so
 * `EventoDeCanal`.
 */

export type ResultadoDoEvento = 'processado' | 'duplicado' | 'ignorado';

/**
 * Organizacao dona de uma sessao, fora de qualquer contexto de tenant — o
 * evento so traz o nome da sessao. `null` quando nenhuma linha de WhatsApp
 * tem essa `ponteSessao`: sessao desconhecida nunca cai numa organizacao
 * "padrao" (mesmo padrao do webhook do WPPConnect).
 */
export async function organizacaoDaSessao(sessaoExterna: string): Promise<string | null> {
  return semOrganizacao('webhook de provider: resolver organização pela sessão', async () => {
    const config = await prismaSemIsolamento.channelConfig.findFirst({
      where: { canal: 'WHATSAPP', ponteSessao: sessaoExterna },
      select: { organizacaoId: true },
    });
    return config?.organizacaoId ?? null;
  });
}

/**
 * Estado novo -> `ponteStatus`, o vocabulario que a tela de Canais ja mostra.
 * `null` = nao grava: sessao subindo nao e nem conectada nem caida.
 */
function statusDaLinha(situacao: SituacaoSessao): 'CONECTADO' | 'DESCONECTADO' | null {
  if (situacao.estado === 'CONECTADO') return 'CONECTADO';
  if (situacao.estado === 'DESCONECTADO' || situacao.estado === 'FALHOU') {
    return 'DESCONECTADO';
  }
  return null;
}

/**
 * Mudanca de estado da sessao: grava na linha e avisa a tela em tempo real —
 * a mesma escrita e o mesmo evento Socket.IO que a Ponte usa
 * (`ponte.routes.ts`), para as telas atuais nao precisarem saber de onde veio.
 */
async function registrarEstadoDaSessao(
  sessaoExterna: string,
  situacao: SituacaoSessao,
  contexto: { provider: string; organizacaoId: string },
): Promise<ResultadoDoEvento> {
  // Busca EXATA pela sessao — `configDoDestino` cairia na linha compartilhada
  // quando nao achasse, e gravaria o estado de uma sessao na linha errada.
  const config = await prisma.channelConfig.findFirst({ where: { canal: 'WHATSAPP', ponteSessao: sessaoExterna } });
  if (!config) return 'ignorado';

  const status = statusDaLinha(situacao);
  log.info('sessao', 'estado da sessão recebido', {
    ...contexto,
    canalConfigId: config.id,
    sessaoExterna,
    estado: situacao.estado,
    detalhe: situacao.detalhe,
  });
  if (!status) return 'processado';

  const em = new Date();
  const statusEfetivo = status === 'DESCONECTADO' && !config.ponteConectadoEm ? 'AGUARDANDO_QR' : status;
  await prisma.channelConfig.update({
    where: { id: config.id },
    data: {
      ponteStatus: statusEfetivo,
      ponteStatusEm: em,
      ...(status === 'CONECTADO' ? { ponteConectadoEm: em } : {}),
    },
  });
  notificarStatusCanal(
    { id: config.id, ponteSessao: config.ponteSessao, status: statusEfetivo, detalhe: situacao.detalhe, em: em.toISOString() },
    { agenteId: config.donoId },
  );
  return 'processado';
}

/**
 * Ordem de progressao do ack — um `message.ack` fora de ordem (comum em
 * reentregas de webhook) nunca pode voltar a mensagem de LIDA para ENTREGUE.
 * FALHOU fica no mesmo nivel de ENVIADA: so e informativo antes de alguma
 * confirmacao de entrega chegar, nunca sobrescreve uma mensagem ja entregue.
 */
const RANK_DO_STATUS: Record<StatusDeEntrega, number> = {
  PENDENTE: 0,
  FALHOU: 0,
  ENVIADA: 1,
  ENTREGUE: 2,
  LIDA: 3,
};

/**
 * Grava o ack na mensagem (por `idExterno`, unico entre providers) e avisa o
 * painel em tempo real. `idExterno` desconhecido = mensagem que o CRM nunca
 * registrou como propria (ex.: ack de uma mensagem enviada direto no celular,
 * ainda nao espelhada) — ignora, nao e erro.
 */
export async function registrarStatusDeEntrega(
  idExterno: string,
  status: StatusDeEntrega,
  contexto: { provider: string; organizacaoId: string },
): Promise<ResultadoDoEvento> {
  const mensagem = await prisma.message.findUnique({
    where: { idExterno },
    select: { id: true, conversaId: true, status: true, interno: true },
  });
  if (!mensagem) {
    log.info('mensagem', 'status de entrega para idExterno desconhecido', { ...contexto, idExterno, status });
    return 'ignorado';
  }

  const rankAtual = mensagem.status ? RANK_DO_STATUS[mensagem.status] : -1;
  if (mensagem.status === status) {
    return 'duplicado';
  }
  if (RANK_DO_STATUS[status] < rankAtual) {
    log.info('mensagem', 'status de entrega fora de ordem, ignorado', {
      ...contexto,
      idExterno,
      statusAtual: mensagem.status,
      statusRecebido: status,
    });
    return 'ignorado';
  }

  await prisma.message.update({ where: { id: mensagem.id }, data: { status } });
  log.info('mensagem', 'status de entrega', { ...contexto, idExterno, status });

  const conversa = await prisma.conversation.findUnique({
    where: { id: mensagem.conversaId },
    select: { filaId: true, agenteId: true },
  });
  notificarMensagemStatus(
    { conversaId: mensagem.conversaId, mensagemId: mensagem.id, idExterno, status },
    {
      conversaId: mensagem.conversaId,
      filaId: conversa?.filaId,
      agenteId: conversa?.agenteId,
      incluirSalaDaConversa: !mensagem.interno,
    },
  );
  return 'processado';
}

/**
 * Entrega um evento ao dominio. Roda DENTRO do contexto da organizacao ja
 * aberto por quem chama. Lanca quando a gravacao falha — a rota responde 5xx
 * e o provider reentrega, o que e seguro porque a entrada e idempotente por
 * `idExterno`.
 */
export async function processarEventoDeCanal(
  evento: EventoDeCanal,
  contexto: { provider: string; organizacaoId: string },
): Promise<ResultadoDoEvento> {
  switch (evento.tipo) {
    case 'mensagem.recebida': {
      const resultado = await registrarMensagemEntrante(evento.mensagem);
      log.info('mensagem', resultado.duplicada ? 'mensagem recebida duplicada' : 'mensagem recebida', {
        ...contexto,
        sessaoExterna: evento.sessaoExterna,
        idExterno: evento.mensagem.idExterno,
        conversaId: resultado.duplicada ? null : resultado.conversaId,
        mensagemId: resultado.duplicada ? null : resultado.mensagemId,
      });
      return resultado.duplicada ? 'duplicado' : 'processado';
    }

    case 'sessao.estado':
      return registrarEstadoDaSessao(evento.sessaoExterna, evento.situacao, contexto);

    case 'mensagem.status':
      return registrarStatusDeEntrega(evento.idExterno, evento.status, contexto);

    case 'mensagem.propria':
      // Mensagem digitada no proprio celular: ainda nao espelhada no historico.
      log.info('mensagem', 'mensagem enviada pelo celular (não espelhada)', {
        ...contexto,
        sessaoExterna: evento.sessaoExterna,
        idExterno: evento.idExterno,
      });
      return 'ignorado';

    case 'ignorado':
      return 'ignorado';
  }
}
