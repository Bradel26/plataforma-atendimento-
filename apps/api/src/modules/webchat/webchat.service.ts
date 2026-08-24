import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';
import { signWebchatToken } from '../../lib/tokens';
import { notificarConversaAtualizada, notificarConversaNova, notificarMensagem } from '../../realtime/hub';
import { inclusaoDetalhe, toConversaDetalhe, toMensagem } from '../conversations/conversations.serializer';

type IniciarInput = { nome: string; email?: string; telefone?: string; filaId?: string; assunto?: string };

/** Fila de destino: a informada, ou a primeira fila ativa de Webchat. */
async function resolverFila(filaId?: string) {
  if (filaId) {
    const fila = await prisma.queue.findUnique({ where: { id: filaId } });
    if (!fila) throw notFound('Fila nao encontrada');
    if (!fila.ativa) throw badRequest('Fila indisponivel');
    return fila;
  }

  const fila = await prisma.queue.findFirst({
    where: { ativa: true, canalPadrao: 'WEBCHAT' },
    orderBy: { criadoEm: 'asc' },
  });
  if (!fila) throw badRequest('Nenhuma fila de Webchat configurada — fale com o administrador');
  return fila;
}

/**
 * Abre uma sessao de webchat: reaproveita o contato pelo email/telefone quando
 * possivel e cria a conversa em espera na fila.
 */
export async function iniciarSessao(input: IniciarInput) {
  const fila = await resolverFila(input.filaId);

  const existente = input.email
    ? await prisma.contact.findFirst({ where: { email: input.email } })
    : input.telefone
      ? await prisma.contact.findFirst({ where: { telefone: input.telefone } })
      : null;

  const contato =
    existente ??
    (await prisma.contact.create({
      data: {
        nome: input.nome,
        email: input.email ?? null,
        telefone: input.telefone ?? null,
        canalOrigem: 'WEBCHAT',
      },
    }));

  const conversa = await prisma.conversation.create({
    data: {
      canal: 'WEBCHAT',
      status: 'EM_ESPERA',
      contatoId: contato.id,
      filaId: fila.id,
      assunto: input.assunto ?? null,
    },
  });

  await prisma.message.create({
    data: {
      conversaId: conversa.id,
      autor: 'SISTEMA',
      conteudo: `${contato.nome} iniciou um atendimento pelo Webchat na fila ${fila.nome}.`,
    },
  });

  const detalhe = toConversaDetalhe(
    await prisma.conversation.findUniqueOrThrow({ where: { id: conversa.id }, include: inclusaoDetalhe }),
  );
  notificarConversaNova(detalhe, { filaId: fila.id, conversaId: conversa.id });

  return {
    sessaoToken: signWebchatToken({ conversaId: conversa.id, contatoId: contato.id }),
    conversa: detalhe,
  };
}

export async function historico(conversaId: string) {
  const conversa = await prisma.conversation.findUnique({
    where: { id: conversaId },
    include: inclusaoDetalhe,
  });
  if (!conversa) throw notFound('Conversa nao encontrada');
  return toConversaDetalhe(conversa);
}

/** Mensagem enviada pelo visitante: incrementa nao lidas para o agente. */
export async function mensagemDoCliente(conversaId: string, conteudo: string) {
  const conversa = await prisma.conversation.findUnique({ where: { id: conversaId } });
  if (!conversa) throw notFound('Conversa nao encontrada');
  if (conversa.status === 'FINALIZADO') throw badRequest('Este atendimento foi finalizado');

  const mensagem = await prisma.message.create({
    data: { conversaId, autor: 'CLIENTE', conteudo },
  });

  const atualizada = await prisma.conversation.update({
    where: { id: conversaId },
    data: { ultimaMensagemEm: mensagem.criadoEm, naoLidas: { increment: 1 } },
    include: inclusaoDetalhe,
  });

  const detalhe = toConversaDetalhe(atualizada);
  const destinos = { conversaId, filaId: atualizada.filaId, agenteId: atualizada.agenteId };
  notificarMensagem({ conversaId, mensagem: toMensagem(mensagem) }, destinos);
  // A conversa sobe na lista e o contador de nao lidas muda para quem estiver vendo.
  notificarConversaAtualizada(detalhe, destinos);

  return toMensagem(mensagem);
}
