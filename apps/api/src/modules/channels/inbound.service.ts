import { Prisma, type Channel } from '@prisma/client';
import { baixarAnexo } from './media.service';
import { configDoDestino } from './channels.service';
import { promoverPrevia } from './chat-previews.service';
import { prisma } from '../../lib/prisma';
import { ufDoTelefone } from '../../lib/ddd';
import { colidiuNoIdExterno } from '../../lib/erros-prisma';
import { redigirTexto } from '../../lib/redacao';
import { notificarConversaAtualizada, notificarConversaNova, notificarMensagem } from '../../realtime/hub';
import { responderAutomaticamente } from '../bots/bots.service';
import { entregarParaIa } from '../bots/ia.service';
import { processarMensagemDeFluxo } from '../fluxos/fluxos.service';
import { inclusaoDetalhe, toConversaDetalhe, toMensagem } from '../conversations/conversations.serializer';
import { reservarProtocolo } from '../conversations/protocolo';
import type { MensagemNormalizada } from './meta.types';
import { numeroNormalizado } from './whatsapp.modo';

type DestinoConversa = { canalConfigId: string | null; filaId: string | null; agenteId: string | null };

/**
 * Parte PURA de `destinoDaMensagem`: dada uma config ja resolvida, decide
 * fila-vs-dono sem tocar em banco. Extraida para ser reaproveitada por
 * `iniciarConversa` (conversations.service.ts) — o vendedor que abre uma
 * conversa a partir da ficha do contato resolve a config de outro jeito
 * (linha pessoal do RESPONSAVEL do contato, nao do identificador da mensagem),
 * mas a regra de "linha pessoal atribui, linha comum cai na fila dela" e a
 * mesma e nao pode ser duplicada.
 */
export function decidirDestino(
  config: { id: string; donoId: string | null; filaId: string | null } | null,
): DestinoConversa {
  if (config?.donoId) {
    return { canalConfigId: config.id, filaId: null, agenteId: config.donoId };
  }
  if (config?.filaId) {
    return { canalConfigId: config?.id ?? null, filaId: config.filaId, agenteId: null };
  }
  return { canalConfigId: config?.id ?? null, filaId: null, agenteId: null };
}

/**
 * Fila para uma conversa sem linha pessoal e sem fila propria configurada:
 * a fila ativa do canal, ou a primeira fila ativa que houver.
 *
 * Existe para NUNCA deixar uma conversa sem fila e sem agente ao mesmo tempo
 * — esse estado ("EM_ESPERA" com `filaId: null`) fica invisivel para todo
 * mundo, porque a politica de visibilidade so mostra espera de uma fila em
 * que a pessoa atua. Uma conversa assim nao aparece nem para quem a criou.
 */
export async function filaPadraoDoCanal(canal: Channel): Promise<string | null> {
  const fila =
    (await prisma.queue.findFirst({ where: { ativa: true, canalPadrao: canal }, orderBy: { criadoEm: 'asc' } })) ??
    (await prisma.queue.findFirst({ where: { ativa: true }, orderBy: { criadoEm: 'asc' } }));
  return fila?.id ?? null;
}

/**
 * Destino de uma conversa nova, a partir de uma config JA resolvida.
 *
 * Linha pessoal (`donoId` preenchido — o vendedor com WhatsApp proprio): a
 * conversa nasce ja atribuida a ele, sem fila — o cliente que fala com o
 * numero dele nao devia esperar em espera compartilhada por algo que ja tem
 * dono. Linha comum: cai na fila configurada, ou na primeira fila ativa do
 * canal, como sempre foi.
 *
 * Extraida de `destinoDaMensagem` para `registrarMensagemEntrante` poder
 * reaproveitar a MESMA config que ja buscou para filtrar a conversa aberta
 * por `canalConfigId` (ver comentario la) — chamar `configDoDestino` de novo
 * aqui duplicaria a consulta.
 */
async function destinoParaConfig(
  canal: Channel,
  config: { id: string; donoId: string | null; filaId: string | null } | null,
): Promise<DestinoConversa> {
  const decidido = decidirDestino(config);
  if (decidido.filaId || decidido.agenteId) return decidido;

  return { ...decidido, filaId: await filaPadraoDoCanal(canal) };
}

/** Destino de uma conversa nova: a linha que recebeu a mensagem decide (ver `destinoParaConfig`). */
export async function destinoDaMensagem(canal: Channel, identificadorDestino: string | null): Promise<DestinoConversa> {
  const config = await configDoDestino(canal, identificadorDestino);
  return destinoParaConfig(canal, config);
}

/**
 * Grava uma mensagem recebida de canal externo.
 *
 * Idempotente: o webhook da Meta reentrega quando nao recebe 200, e `idExterno`
 * e unico — reentrega devolve `duplicada: true` sem criar nada.
 * Reaproveita a conversa aberta do mesmo interlocutor; se a ultima foi
 * finalizada, abre uma nova conversa (novo protocolo) no mesmo contato.
 */
export async function registrarMensagemEntrante(dados: MensagemNormalizada) {
  const jaExiste = await prisma.message.findUnique({ where: { idExterno: dados.idExterno } });
  if (jaExiste) return { duplicada: true as const };

  /*
   * A linha que recebeu esta mensagem tem de ser resolvida ANTES de procurar
   * uma conversa aberta, e entrar no filtro da busca. Sem isso, um contato
   * com conversa aberta na linha PESSOAL de um vendedor que escreve para a
   * linha COMPARTILHADA da empresa (ou vice-versa, ou para a linha pessoal de
   * outro vendedor) reaproveitaria a conversa da linha errada: a mensagem
   * cairia no atendimento de quem nao deveria ve-la, e a resposta sairia pelo
   * numero errado (auditoria de 23/09/2026, achado critico #1).
   */
  const config = await configDoDestino(dados.canal, dados.identificadorDestino);
  const canalConfigId = config?.id ?? null;
  const contato = await encontrarOuCriarContato(dados, canalConfigId);

  const emAberto = await prisma.conversation.findFirst({
    where: {
      contatoId: contato.id,
      canal: dados.canal,
      canalConfigId,
      status: { not: 'FINALIZADO' },
    },
    orderBy: { ultimaMensagemEm: 'desc' },
  });

  const nova = !emAberto;
  const destino = emAberto
    ? { canalConfigId: emAberto.canalConfigId, filaId: emAberto.filaId, agenteId: null }
    : await destinoParaConfig(dados.canal, config);

  const conversa =
    emAberto ??
    (await prisma.conversation.create({
      data: {
        canal: dados.canal,
        // Linha pessoal ja nasce atribuida: nao ha "esperando na fila" para
        // quem tem numero proprio, o cliente ja falou com o dono.
        status: destino.agenteId ? 'ATRIBUIDO' : 'EM_ESPERA',
        contatoId: contato.id,
        filaId: destino.filaId,
        agenteId: destino.agenteId,
        atribuidoEm: destino.agenteId ? new Date() : null,
        canalConfigId: destino.canalConfigId,
        enderecoExterno: dados.enderecoExterno,
        origem: 'RECEPTIVO',
        protocolo: await reservarProtocolo(),
        atendenteInicialId: destino.agenteId,
      },
    }));

  // So promove previa quando a conversa acabou de nascer -- uma ja aberta ou
  // ja foi promovida antes, ou nasceu por `iniciarConversa` (que promove no
  // proprio caminho, Task 6). `dados.telefone` e o mesmo numero usado para
  // gravar a previa (`salvarPrevia`, Task 3).
  if (nova && destino.canalConfigId && dados.telefone) {
    await promoverPrevia(conversa.id, destino.canalConfigId, dados.telefone);
  }

  // Traz a midia para o storage proprio. Se falhar, guarda a URL da Meta como
  // ela veio: expira em pouco tempo, mas e melhor que anexo nenhum, e o motivo
  // fica no log para quem for investigar.
  const anexo = await baixarAnexo(dados.canal, dados);
  if (anexo.motivo) {
    console.warn(`[anexo] ${dados.canal} ${dados.idExterno}: ${redigirTexto(anexo.motivo)}`);
  }

  const mensagem = await criarMensagemOuDetectarCorrida(conversa.id, dados, anexo);
  if (mensagem === null) return { duplicada: true as const };

  // Linha pessoal: a conversa ja nasce do dono, como o "Aceito por" automatico
  // da PCM quando o roteamento manda direto ao vendedor.
  if (nova && destino.agenteId) {
    const dono = await prisma.user.findUnique({ where: { id: destino.agenteId }, select: { nome: true } });
    await prisma.message.create({
      data: { conversaId: conversa.id, autor: 'SISTEMA', evento: 'ACEITE', conteudo: `Aceito por: ${dono?.nome ?? 'responsável do número'}` },
    });
  }

  /*
   * Compare-and-set atomico, nao o status lido antes de `baixarAnexo` (que
   * pode levar segundos): nesse intervalo a conversa pode ter sido
   * transferida para fila (EM_ESPERA) ou finalizada por outro agente.
   * Escrever de volta `aoReceberDoCliente(conversa.status)` direto no update
   * principal reabriria uma conversa encerrada ou desfaria a transferencia --
   * o WHERE aqui exige que o status AINDA seja AGUARDANDO_CLIENTE no banco no
   * instante da escrita, mesma garantia que `assumirConversa` ja usa.
   */
  await prisma.conversation.updateMany({
    where: { id: conversa.id, status: 'AGUARDANDO_CLIENTE' },
    data: { status: 'EM_ATENDIMENTO' },
  });

  const atualizada = await prisma.conversation.update({
    where: { id: conversa.id },
    data: {
      ultimaMensagemEm: mensagem.criadoEm,
      naoLidas: { increment: 1 },
      // Endereco pode mudar de forma (ex.: numero reportado com/sem prefixo).
      enderecoExterno: dados.enderecoExterno,
      // Mensagem do cliente sempre desarquiva (Fase 11.9-B) -- uma conversa
      // arquivada nao pode ficar recebendo mensagem sem que ninguem veja: a
      // mesma garantia que `filaPadraoDoCanal` ja da para fila/agente.
      // Incondicional (sem checar se ja era false) -- e mais barato escrever
      // sempre do que ler o valor atual so para decidir se escreve.
      arquivada: false,
    },
    include: inclusaoDetalhe,
  });

  const detalhe = toConversaDetalhe(atualizada);
  const destinos = { conversaId: conversa.id, filaId: atualizada.filaId, agenteId: atualizada.agenteId };

  notificarMensagem({ conversaId: conversa.id, mensagem: toMensagem(mensagem) }, destinos);
  if (nova) notificarConversaNova(detalhe, destinos);
  else notificarConversaAtualizada(detalhe, destinos);

  // Motor de IA externo tem precedencia sobre o bot de arvore local: dois bots
  // respondendo a mesma mensagem e pior que nenhum. Entregar nao lanca — canal
  // com IA fora do ar cai no bot local, e a mensagem do cliente ja esta gravada.
  const ia = await entregarParaIa(mensagem, atualizada);
  if (!ia.entregue) {
    try {
      const fluxo = await processarMensagemDeFluxo(conversa.id, dados.conteudo);
      if (!fluxo.tratada) await responderAutomaticamente(conversa.id, dados.conteudo);
    } catch (erro) {
      // Nao falhe o webhook apos gravar a mensagem do cliente: o provedor pode
      // repetir a entrega e disparar duas acoes. Tambem nao caia no bot legado
      // depois de um fluxo parcialmente executado.
      console.error(`[fluxo] falha ao processar conversa ${conversa.id}`, erro);
    }
  }

  return { duplicada: false as const, conversaId: conversa.id, mensagemId: mensagem.id };
}

/**
 * Mensagem que o DONO do numero digitou no celular ou no WhatsApp Web
 * ("Mensagem enviada por outro dispositivo", PCM 04:00).
 *
 * Diferente da entrante em quatro pontos, todos de proposito:
 * - respeita `espelharCelular` da linha (decisao de 09/10/2026);
 * - nao conta como nao lida — foi a propria equipe que escreveu;
 * - nao aciona IA nem bot;
 * - conversa nova nasce ATIVA (a empresa falou primeiro).
 */
export async function registrarMensagemPropria(dados: MensagemNormalizada) {
  const jaExiste = await prisma.message.findUnique({ where: { idExterno: dados.idExterno } });
  if (jaExiste) return { duplicada: true as const };

  const config = await configDoDestino(dados.canal, dados.identificadorDestino);
  if (config && config.espelharCelular === false) return { ignorada: true as const };

  // WPPConnect/WWebJS pode devolver no envio o ID curto (ex.: `3EB0...`), mas
  // publicar no webhook o ID serializado (`true_<chat>_3EB0...`). Sem esta
  // equivalencia, a mesma mensagem enviada pelo painel voltava como uma nova
  // mensagem "enviada por outro dispositivo". Só reconciliamos pelo sufixo
  // aleatório do ID e pela mesma linha de WhatsApp.
  const partesId = dados.idExterno.split('_');
  const idCurto = dados.canal !== 'WHATSAPP'
    ? null
    : partesId[0] === 'true' && partesId.length >= 3
      ? partesId.at(-1) ?? null
      : /^[a-f0-9]{16,}$/i.test(dados.idExterno)
        ? dados.idExterno
        : null;
  if (idCurto) {
    const ecoDoEnvio = await prisma.message.findFirst({
      where: {
        autor: 'AGENTE',
        enviadaPorDispositivo: false,
        conversa: { is: { canal: dados.canal, canalConfigId: config?.id ?? null } },
        OR: [
          { idExterno: idCurto },
          { idExterno: { startsWith: 'true_', endsWith: `_${idCurto}` } },
        ],
      },
      select: { id: true },
    });
    if (ecoDoEnvio) return { duplicada: true as const };
  }

  // Sem nome de exibicao: o pushName de mensagem propria e o do dono do numero.
  const canalConfigId = config?.id ?? null;
  const contato = await encontrarOuCriarContato({ ...dados, nomeExibicao: null }, canalConfigId);

  const emAberto = await prisma.conversation.findFirst({
    where: { contatoId: contato.id, canal: dados.canal, canalConfigId, status: { not: 'FINALIZADO' } },
    orderBy: { ultimaMensagemEm: 'desc' },
  });

  const nova = !emAberto;
  let conversa = emAberto;
  if (!conversa) {
    const destino = await destinoParaConfig(dados.canal, config);
    conversa = await prisma.conversation.create({
      data: {
        canal: dados.canal,
        // O dono falou primeiro pelo celular -- ja nasce aguardando o cliente,
        // nao "em atendimento" (que implicaria uma troca ja rolando).
        status: destino.agenteId ? 'AGUARDANDO_CLIENTE' : 'EM_ESPERA',
        contatoId: contato.id,
        filaId: destino.filaId,
        agenteId: destino.agenteId,
        atribuidoEm: destino.agenteId ? new Date() : null,
        atendenteInicialId: destino.agenteId,
        canalConfigId: destino.canalConfigId,
        enderecoExterno: dados.enderecoExterno,
        origem: 'ATIVO',
        protocolo: await reservarProtocolo(),
      },
    });
  }

  const anexo = await baixarAnexo(dados.canal, dados);
  if (anexo.motivo) {
    console.warn(`[anexo] ${dados.canal} ${dados.idExterno}: ${redigirTexto(anexo.motivo)}`);
  }

  const mensagem = await criarMensagemOuDetectarCorrida(conversa.id, dados, anexo, {
    autor: 'AGENTE',
    enviadaPorDispositivo: true,
  });
  if (mensagem === null) return { duplicada: true as const };

  /*
   * Compare-and-set atomico, nao o status lido antes de `baixarAnexo` (que
   * pode levar segundos): nesse intervalo a conversa pode ter sido
   * transferida para fila (EM_ESPERA) ou finalizada por outro agente. Gravar
   * 'AGUARDANDO_CLIENTE' direto no update principal com base no status antigo
   * desfaria essa transferencia/encerramento -- o WHERE aqui exige que o
   * status AINDA seja ATRIBUIDO ou EM_ATENDIMENTO no banco no instante da
   * escrita, mesma garantia que `assumirConversa` ja usa.
   */
  await prisma.conversation.updateMany({
    where: { id: conversa.id, status: { in: ['ATRIBUIDO', 'EM_ATENDIMENTO'] } },
    data: { status: 'AGUARDANDO_CLIENTE' },
  });

  const atualizada = await prisma.conversation.update({
    where: { id: conversa.id },
    data: {
      ultimaMensagemEm: mensagem.criadoEm,
      arquivada: false,
    },
    include: inclusaoDetalhe,
  });

  const detalhe = toConversaDetalhe(atualizada);
  const destinos = { conversaId: conversa.id, filaId: atualizada.filaId, agenteId: atualizada.agenteId };
  notificarMensagem({ conversaId: conversa.id, mensagem: toMensagem(mensagem) }, destinos);
  if (nova) notificarConversaNova(detalhe, destinos);
  else notificarConversaAtualizada(detalhe, destinos);

  return { duplicada: false as const, conversaId: conversa.id, mensagemId: mensagem.id };
}

/**
 * Cria a Message, tratando a corrida entre o `findUnique` de topo de
 * `registrarMensagemEntrante` e este `create`: duas requisicoes com o mesmo
 * `idExterno` podem passar as duas pelo `findUnique` (nenhuma via ainda
 * existir) antes de qualquer commit. So a constraint `@unique` em
 * `idExterno` (schema.prisma) pega esse caso.
 *
 * Confirma que o P2002 pertence mesmo a essa constraint (via `meta.target`,
 * mesmo padrao de `comColisaoDeSessaoTratada` em channels.service.ts) antes
 * de tratar como duplicata — nunca mascara um conflito de outra origem.
 *
 * Devolve `null` quando a corrida foi detectada e a Message vencedora foi
 * confirmada (chamador trata como duplicata, sem repetir efeitos colaterais
 * que ainda nao rodaram: Conversation.update, realtime, IA/bot).
 *
 * NAO cobre efeitos colaterais que JA rodaram antes deste ponto (Contact,
 * Conversation.create, ChatPreview) — numa corrida real, ambas as
 * requisicoes os executam antes de uma perder aqui. Resolver isso exigiria
 * mover a checagem de idempotencia para antes desses passos, fora do escopo
 * desta correcao.
 */
async function criarMensagemOuDetectarCorrida(
  conversaId: string,
  dados: MensagemNormalizada,
  anexo: { url?: string | null },
  autoria: { autor: 'CLIENTE' | 'AGENTE'; enviadaPorDispositivo?: boolean } = { autor: 'CLIENTE' },
) {
  try {
    return await prisma.message.create({
      data: {
        conversaId,
        autor: autoria.autor,
        enviadaPorDispositivo: autoria.enviadaPorDispositivo ?? false,
        conteudo: dados.conteudo,
        tipoAnexo: dados.tipoAnexo,
        anexoUrl: anexo.url ?? dados.anexoUrl,
        idExterno: dados.idExterno,
      },
    });
  } catch (erro) {
    if (!colidiuNoIdExterno(erro)) throw erro;

    // Mesmo `findUnique` do topo da funcao: tenant-scoped pela extensao do
    // Prisma. Se a Message vencedora for de outra organizacao (idExterno e
    // @unique global, nao @@unique([organizacaoId, idExterno])), este
    // findUnique nao a enxerga — nao mascara: relanca o erro original.
    const vencedora = await prisma.message.findUnique({ where: { idExterno: dados.idExterno } });
    if (!vencedora) throw erro;
    return null;
  }
}

/**
 * O nono digito movel do Brasil pode aparecer de forma diferente entre um
 * cadastro legado e o JID que o WhatsApp devolve. So tratamos os dois formatos
 * como candidatos aqui; a associacao so ocorre se houver uma unica conversa
 * aberta, na mesma linha, aguardando resposta nas ultimas 24 horas.
 */
function numeroBrAlternativo(numero: string): string | null {
  if (!numero.startsWith('55')) return null;
  const ddd = numero.slice(2, 4);
  const local = numero.slice(4);
  if (local.length === 8) return `55${ddd}9${local}`;
  if (local.length === 9 && local.startsWith('9')) return `55${ddd}${local.slice(1)}`;
  return null;
}

async function encontrarOuCriarContato(dados: MensagemNormalizada, canalConfigId: string | null) {
  // O endereco externo e a chave estavel; o telefone e a forma legivel dele no WhatsApp.
  const porConversa = await prisma.conversation.findFirst({
    where: {
      enderecoExterno: dados.enderecoExterno,
      canal: dados.canal,
      canalConfigId,
      // O protocolo pertence a cada Conversation, mas o contato precisa ser
      // estavel entre atendimentos. Localiza tambem conversas finalizadas;
      // contato anonimizado fica fora para respeitar o fluxo de exclusao LGPD.
      contato: { excluidoEm: null },
    },
    orderBy: { ultimaMensagemEm: 'desc' },
    select: { contatoId: true, ultimaMensagemEm: true },
  });
  const alternativo = numeroBrAlternativo(dados.enderecoExterno);
  if (alternativo) {
    const candidatos = await prisma.conversation.findMany({
      where: {
        canal: dados.canal,
        canalConfigId,
        status: { not: 'FINALIZADO' },
        enderecoExterno: alternativo,
        ultimaMensagemEm: { gte: new Date(Date.now() - 24 * 60 * 60_000) },
      },
      orderBy: { ultimaMensagemEm: 'desc' },
      take: 3,
      select: {
        contatoId: true,
        ultimaMensagemEm: true,
        mensagens: { orderBy: { criadoEm: 'desc' }, take: 1, select: { autor: true, interno: true } },
      },
    });
    const aguardandoResposta = candidatos.filter(
      (c) => c.mensagens[0]?.autor === 'AGENTE' && !c.mensagens[0].interno,
    );
    const candidata = aguardandoResposta[0];
    if (
      aguardandoResposta.length === 1 &&
      candidata &&
      (!porConversa || candidata.ultimaMensagemEm > porConversa.ultimaMensagemEm)
    ) {
      return prisma.contact.findUniqueOrThrow({ where: { id: candidata.contatoId } });
    }
  }

  if (porConversa) {
    const contato = await prisma.contact.findUniqueOrThrow({ where: { id: porConversa.contatoId } });
    // Contatos criados antes da normalizacao podem ter telefone nulo, embora
    // o JID atual ja traga o numero. Completa o cadastro uma vez para que as
    // proximas mensagens recebidas por outras caixas encontrem este contato.
    if (contato.telefone === null && dados.telefone) {
      return prisma.contact.update({
        where: { id: contato.id },
        data: { telefone: dados.telefone, uf: contato.uf ?? ufDoTelefone(dados.telefone) },
      });
    }
    return contato;
  }

  if (dados.telefone) {
    const normalizado = numeroNormalizado(dados.telefone);
    const porTelefone = await prisma.contact.findFirst({
      where: normalizado ? { telefoneNormalizado: normalizado, excluidoEm: null } : { telefone: dados.telefone, excluidoEm: null },
      orderBy: { criadoEm: 'asc' },
    });
    if (porTelefone) return porTelefone;
  }

  return prisma.contact.create({
    data: {
      nome: dados.nomeExibicao ?? `Contato ${dados.enderecoExterno.slice(-4)}`,
      telefone: dados.telefone,
      uf: ufDoTelefone(dados.telefone),
      canalOrigem: dados.canal,
    },
  });
}
