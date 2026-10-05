import type { Role } from '@prisma/client';
import type { Server } from 'socket.io';
import { PERFIS_ACOMPANHADOS_PELO_SUPERVISOR } from '../lib/politicas';
import { prisma } from '../lib/prisma';
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

export type Destinos = {
  filaId?: string | null;
  agenteId?: string | null;
  conversaId?: string | null;
  /** Agente que deixou de ser responsavel (transferencia) — precisa remover da lista dele. */
  agenteAnteriorId?: string | null;
  /**
   * Por padrao a sala da conversa (`salas.conversa`) entra nos alvos — e ela que o
   * visitante do Webchat escuta. Uma nota interna (`interno: true`) nao pode chegar
   * la: quem chama passa `false` para excluir essa sala e falar so com a equipe
   * (fila/agente/supervisao).
   */
  incluirSalaDaConversa?: boolean;
};

/** Dono do numero que recebeu a conversa — decide se a supervisao a enxerga. */
export type DonoDaConversa = { donoId: string | null; donoPerfil: Role | null };

/** Fila, responsavel, responsavel anterior e sala da conversa — comum a todo evento. */
function salasOperacionais(org: string, destinos: Destinos): string[] {
  const alvos: string[] = [];
  if (destinos.filaId) alvos.push(salas.fila(org, destinos.filaId));
  if (destinos.agenteId) alvos.push(salas.usuario(org, destinos.agenteId));
  if (destinos.agenteAnteriorId) alvos.push(salas.usuario(org, destinos.agenteAnteriorId));
  if (destinos.conversaId && destinos.incluirSalaDaConversa !== false) {
    alvos.push(salas.conversa(org, destinos.conversaId));
  }
  return alvos;
}

/**
 * Salas de um evento de CONVERSA, pela mesma regra de `politicaConversas`:
 * ADMIN sempre; SUPERVISOR so para Numero da empresa e numeros de Comercial e
 * Suporte; o dono do numero sempre (e o que mantem "Minhas" ao vivo depois de
 * uma transferencia). `dono` nulo = nao deu para saber: so o ADMIN, nunca a
 * supervisao — perder um evento e melhor que entregar o que a lista esconde.
 */
export function salasDaConversa(org: string, destinos: Destinos, dono: DonoDaConversa | null): string[] {
  const alvos = new Set<string>([salas.admin(org)]);
  if (dono) {
    const supervisaoVe =
      dono.donoId === null ||
      (dono.donoPerfil !== null && PERFIS_ACOMPANHADOS_PELO_SUPERVISOR.includes(dono.donoPerfil));
    if (supervisaoVe) alvos.add(salas.supervisao(org));
    if (dono.donoId) alvos.add(salas.usuario(org, dono.donoId));
  }
  for (const s of salasOperacionais(org, destinos)) alvos.add(s);
  return [...alvos];
}

/**
 * Evento que nao e de conversa (protocolo, chamada, status de canal): vai para
 * a gestao inteira e para as salas operacionais.
 *
 * A organizacao vem do contexto, e nao de um parametro novo em cada funcao
 * abaixo: quem chama ja esta dentro de um contexto, e passar o id a mao seria
 * mais um lugar de onde esquecer.
 */
function emitir(evento: string, payload: unknown, destinos: Destinos) {
  if (!io) return;
  const org = organizacaoDoContexto();
  if (!org) return;
  io.to([salas.admin(org), salas.supervisao(org), ...salasOperacionais(org, destinos)]).emit(evento, payload);
}

async function donoDaConversa(conversaId: string): Promise<DonoDaConversa | null> {
  try {
    const c = await prisma.conversation.findUnique({
      where: { id: conversaId },
      select: { canalConfig: { select: { donoId: true, dono: { select: { perfil: true } } } } },
    });
    if (!c) return null;
    return { donoId: c.canalConfig?.donoId ?? null, donoPerfil: c.canalConfig?.dono?.perfil ?? null };
  } catch (erro) {
    console.warn('[realtime] dono da conversa indisponivel; evento so para ADMIN', erro);
    return null;
  }
}

/** O id da conversa: dos destinos, ou do proprio payload (detalhe tem `id`, mensagem tem `conversaId`). */
function idDaConversa(payload: unknown, destinos: Destinos): string | null {
  if (destinos.conversaId) return destinos.conversaId;
  const p = payload as { id?: unknown; conversaId?: unknown } | null;
  if (typeof p?.conversaId === 'string') return p.conversaId;
  if (typeof p?.id === 'string') return p.id;
  return null;
}

/**
 * Evento de conversa. Consulta o dono do numero aqui, e nao nos sete lugares
 * que notificam: a regra fica num lugar so. Melhor-esforco, como o resto do
 * tempo real — nunca lanca para quem chamou, que pode ignorar a promessa.
 */
async function emitirDaConversa(evento: string, payload: unknown, destinos: Destinos): Promise<void> {
  if (!io) return;
  const org = organizacaoDoContexto();
  if (!org) return;
  const id = idDaConversa(payload, destinos);
  const dono = id ? await donoDaConversa(id) : null;
  io?.to(salasDaConversa(org, destinos, dono)).emit(evento, payload);
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
    console.warn('[realtime] evento descartado: sem organização no contexto');
    return null;
  }
  return ctx.organizacaoId;
}

export const notificarConversaNova = (conversa: unknown, destinos: Destinos): Promise<void> =>
  emitirDaConversa(EVENTOS.conversaNova, conversa, destinos);

export const notificarConversaAtualizada = (conversa: unknown, destinos: Destinos): Promise<void> =>
  emitirDaConversa(EVENTOS.conversaAtualizada, conversa, destinos);

export const notificarMensagem = (payload: unknown, destinos: Destinos): Promise<void> =>
  emitirDaConversa(EVENTOS.mensagemNova, payload, destinos);

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
 * Nao usa `emitir()` de proposito: aquela funcao inclui a gestao (admin e
 * supervisao), correto para os demais recursos da organizacao, mas errado aqui — uma previa e o espelho do celular pessoal do
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
  io?.to([salas.admin(org), salas.supervisao(org)]).emit(EVENTOS.agenteStatus, payload);
};
