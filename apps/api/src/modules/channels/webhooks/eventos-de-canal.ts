import { log } from '../../../lib/log';
import { prisma, prismaSemIsolamento } from '../../../lib/prisma';
import { semOrganizacao } from '../../../lib/tenant';
import { notificarStatusCanal } from '../../../realtime/hub';
import { registrarMensagemEntrante } from '../inbound.service';
import type { EventoDeCanal, SituacaoSessao } from '../providers/channel-provider';

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
  return semOrganizacao('webhook de provider: resolver organizacao pela sessao', async () => {
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
  if (situacao.estado === 'AGUARDANDO_QR' || situacao.estado === 'DESCONECTADO' || situacao.estado === 'FALHOU') {
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
  log.info('sessao', 'estado da sessao recebido', {
    ...contexto,
    canalConfigId: config.id,
    sessaoExterna,
    estado: situacao.estado,
    detalhe: situacao.detalhe,
  });
  if (!status) return 'processado';

  const em = new Date();
  await prisma.channelConfig.update({ where: { id: config.id }, data: { ponteStatus: status, ponteStatusEm: em } });
  notificarStatusCanal(
    { id: config.id, ponteSessao: config.ponteSessao, status, detalhe: situacao.detalhe, em: em.toISOString() },
    { agenteId: config.donoId },
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
      // Ainda nao ha onde gravar (a Message nao tem coluna de status): fica no
      // log, com o idExterno, para rastrear "o cliente recebeu?" desde ja.
      log.info('mensagem', 'status de entrega', {
        ...contexto,
        sessaoExterna: evento.sessaoExterna,
        idExterno: evento.idExterno,
        status: evento.status,
      });
      return 'processado';

    case 'mensagem.propria':
      // Mensagem digitada no proprio celular: ainda nao espelhada no historico.
      log.info('mensagem', 'mensagem enviada pelo celular (nao espelhada)', {
        ...contexto,
        sessaoExterna: evento.sessaoExterna,
        idExterno: evento.idExterno,
      });
      return 'ignorado';

    case 'ignorado':
      return 'ignorado';
  }
}
