import type { Server } from 'socket.io';
import { contextoAtual } from '../lib/tenant';
import { EVENTOS, salas } from './events';

/**
 * Ponte entre os services (que nao conhecem o Socket.IO) e o servidor de sockets.
 * O servidor registra a instancia no bootstrap; antes disso os emits sao no-op,
 * o que mantem os services testaveis sem WebSocket.
 */
let io: Server | null = null;

export const registrarIo = (instancia: Server) => {
  io = instancia;
};

type Destinos = {
  filaId?: string | null;
  agenteId?: string | null;
  conversaId?: string | null;
  /** Agente que deixou de ser responsavel (transferencia) — precisa remover da lista dele. */
  agenteAnteriorId?: string | null;
};

/**
 * Emite para todos os interessados numa conversa: a fila dela, o agente
 * responsavel, quem esta com a conversa aberta e a gestao.
 */
function emitir(evento: string, payload: unknown, destinos: Destinos) {
  if (!io) return;

  // A organizacao vem do contexto, e nao de um parametro novo em cada uma das
  // oito funcoes abaixo: quem chama ja esta dentro de um contexto, e passar o
  // id a mao seria mais um lugar de onde esquecer.
  const org = organizacaoDoContexto();
  if (!org) return;

  const alvos = new Set<string>([salas.supervisao(org)]);
  if (destinos.filaId) alvos.add(salas.fila(org, destinos.filaId));
  if (destinos.agenteId) alvos.add(salas.usuario(org, destinos.agenteId));
  if (destinos.agenteAnteriorId) alvos.add(salas.usuario(org, destinos.agenteAnteriorId));
  if (destinos.conversaId) alvos.add(salas.conversa(org, destinos.conversaId));

  io.to([...alvos]).emit(evento, payload);
}

/**
 * Organizacao do contexto, ou nulo.
 *
 * Nao lanca de proposito, ao contrario do resto do isolamento: tempo real e
 * melhor-esforco — o painel busca de novo quando reconecta. Derrubar uma
 * requisicao que ja gravou no banco porque o aviso nao pode sair seria trocar
 * um problema pequeno por um grande. O aviso no log e o que torna o caso
 * visivel em vez de silencioso.
 */
function organizacaoDoContexto(): string | null {
  const ctx = contextoAtual();
  if (!ctx || ctx.irrestrito || !ctx.organizacaoId) {
    console.warn('[realtime] evento descartado: sem organizacao no contexto');
    return null;
  }
  return ctx.organizacaoId;
}

export const notificarConversaNova = (conversa: unknown, destinos: Destinos) =>
  emitir(EVENTOS.conversaNova, conversa, destinos);

export const notificarConversaAtualizada = (conversa: unknown, destinos: Destinos) =>
  emitir(EVENTOS.conversaAtualizada, conversa, destinos);

export const notificarMensagem = (payload: unknown, destinos: Destinos) =>
  emitir(EVENTOS.mensagemNova, payload, destinos);

/** Chamados: interessa ao responsavel, a fila e a gestao. */
export const notificarProtocolo = (
  protocolo: unknown,
  destinos: { responsavelId?: string | null; filaId?: string | null },
) => emitir(EVENTOS.protocoloAtualizado, protocolo, { agenteId: destinos.responsavelId, filaId: destinos.filaId });

/** Chamada de voz: interessa ao agente envolvido, a fila dela e a supervisao. */
export const notificarChamada = (
  chamada: unknown,
  destinos: { agenteId?: string | null; filaId?: string | null },
) => emitir(EVENTOS.chamadaAtualizada, chamada, destinos);

/** Status de conexao da ponte (WhatsApp pessoal): interessa ao dono da linha e a gestao. */
export const notificarStatusCanal = (payload: unknown, destinos: { agenteId?: string | null }) =>
  emitir(EVENTOS.canalStatus, payload, destinos);

/**
 * ChatPreview criada ou atualizada: interessa SO ao dono da linha pessoal.
 *
 * Nao usa `emitir()` de proposito: aquela funcao sempre inclui
 * `salas.supervisao(org)`, correto para `Conversation` (recurso da
 * organizacao) mas errado aqui — uma previa e o espelho do celular pessoal do
 * vendedor, e `listarPrevias` (REST) ja restringe a leitura so ao dono
 * (`donoId = solicitante.sub`, sem excecao para ADMIN/SUPERVISOR). Mandar
 * para supervisao pelo socket vazaria em tempo real o que o REST nunca expos.
 */
export const notificarPreviaAtualizada = (previa: unknown, destinos: { agenteId: string }) => {
  if (!io) return;
  const org = organizacaoDoContexto();
  if (!org) return;
  io.to(salas.usuario(org, destinos.agenteId)).emit(EVENTOS.previaAtualizada, previa);
};

export const notificarStatusAgente = (payload: unknown) => {
  const org = organizacaoDoContexto();
  if (!org) return;
  io?.to(salas.supervisao(org)).emit(EVENTOS.agenteStatus, payload);
};
