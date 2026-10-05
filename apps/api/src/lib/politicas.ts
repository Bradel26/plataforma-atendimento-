import type { Prisma, Role } from '@prisma/client';
import { notFound } from './errors';
import { prisma } from './prisma';
import {
  apenasVisivel,
  contextoVisibilidade,
  filtroCarteira,
  responsaveisNoEscopo,
  type ContextoVisibilidade,
} from './visibilidade';

/**
 * Uma politica de visibilidade por dominio.
 *
 * Ficam todas neste arquivo de proposito, e nao uma em cada modulo: a politica
 * de contato do AGENTE **compoe** as de conversa e protocolo, e a de conta
 * compoe a de contato. Espalhadas por modulo, isso seria dependencia circular
 * entre dominios. Juntas, tem um efeito colateral bom — as sete regras que
 * decidem quem ve o que cabem numa leitura, o que para codigo de acesso vale
 * mais do que a arrumacao por pasta.
 *
 * Nenhuma delas menciona organizacao: isso e fronteira, aplicada pela extensao
 * do Prisma. Nenhuma delas decide o que a pessoa pode *fazer*: isso e perfil,
 * aplicado por `requireRole`.
 */

/**
 * Filtro que nao casa com nada.
 *
 * Usado onde o perfil nao deveria nem ter chegado — AGENTE em lead e
 * oportunidade, barrados por `requireRole`. Devolver `{}` ali seria "sem
 * filtro", ou seja: se alguem um dia removesse o `requireRole` da rota, o agente
 * passaria a ver o funil inteiro. Duas travas para a mesma porta, porque a
 * consequencia de a primeira cair em silencio e grande.
 */
const NADA = { id: { in: [] as string[] } };

/**
 * Perfis dos donos de numero que o SUPERVISOR acompanha.
 *
 * "Setor Comercial e Suporte" e o perfil do dono do numero — nao existe
 * entidade de setor (decisao de 2026-10-05). Se alguem mudar de perfil, a
 * visibilidade muda junto.
 */
export const PERFIS_ACOMPANHADOS_PELO_SUPERVISOR: Role[] = ['COMERCIAL', 'SUPORTE'];

/** Quem tem a aba Acompanhar e o seletor de usuario. */
export const podeAcompanhar = (perfil: string): boolean => perfil === 'ADMIN' || perfil === 'SUPERVISOR';

/**
 * Conversa do Numero da empresa: sem linha registrada, ou numa linha sem dono
 * (a compartilhada, Instagram, Facebook). Nao e de nenhuma pessoa.
 */
export const DO_NUMERO_DA_EMPRESA: Prisma.ConversationWhereInput = {
  OR: [{ canalConfigId: null }, { canalConfig: { donoId: null } }],
};

export const politicaConversas = {
  /**
   * Atendimento organizado por NUMERO (`canalConfig.donoId`), nao por
   * responsavel (2026-10-05):
   *
   * - ADMIN ve todas, inclusive numero pessoal de outra pessoa. Reverte a
   *   decisao de 2026-09-25, que escondia linha pessoal ate do ADMIN.
   * - SUPERVISOR ve o Numero da empresa e os numeros cujo dono e COMERCIAL ou
   *   SUPORTE — nao o de ADMIN, nem o de outro SUPERVISOR. Vale em toda a
   *   plataforma: lista, abrir por id, ficha do contato, etiquetas.
   * - Os demais: as atribuidas a ele (de qualquer numero — e assim que uma
   *   transferencia chega) e as em espera nas filas em que atua.
   *
   * Para todos, as conversas do proprio numero ficam sempre visiveis, mesmo
   * transferidas: "Minhas" e o meu numero.
   */
  filtro(ctx: ContextoVisibilidade): Prisma.ConversationWhereInput {
    if (ctx.perfil === 'ADMIN') return {};

    const doMeuNumero: Prisma.ConversationWhereInput = { canalConfig: { donoId: ctx.usuarioId } };
    const atribuidaAMim: Prisma.ConversationWhereInput = { agenteId: ctx.usuarioId };

    if (ctx.perfil === 'SUPERVISOR') {
      return {
        OR: [
          DO_NUMERO_DA_EMPRESA,
          { canalConfig: { dono: { perfil: { in: PERFIS_ACOMPANHADOS_PELO_SUPERVISOR } } } },
          doMeuNumero,
          atribuidaAMim,
        ],
      };
    }

    if (ctx.veEquipe) {
      return {
        OR: [
          doMeuNumero,
          atribuidaAMim,
          { AND: [DO_NUMERO_DA_EMPRESA, { OR: [{ agenteId: { in: ctx.equipeIds } }, { status: 'EM_ESPERA' }] }] },
        ],
      };
    }

    return {
      OR: [
        doMeuNumero,
        atribuidaAMim,
        // `filaIds` vazio produz `in: []`, que nao casa com nada. E o
        // comportamento certo: quem nao esta em fila nenhuma nao ve espera
        // nenhuma. Um `if` que omitisse este termo transformaria "nenhuma
        // fila" em "sem filtro".
        { status: 'EM_ESPERA', filaId: { in: ctx.filaIds } },
      ],
    };
  },
};

/**
 * O solicitante pode ver esta conversa? Mesma politica da lista e do acesso por
 * id — usada pelo socket antes de deixar alguem entrar na sala da conversa.
 */
export async function conversaVisivel(id: string): Promise<boolean> {
  const achada = await prisma.conversation.findFirst({
    where: apenasVisivel(id, await filtroDe(politicaConversas)),
    select: { id: true },
  });
  return achada !== null;
}

export const politicaProtocolos = {
  /**
   * Proprios (ou da equipe), mais os sem responsavel nas filas em que atua.
   *
   * `Ticket` nao tem status de espera: "em espera" aqui e `responsavelId = null`
   * com fila. Por isso a regra de "sem responsavel" deste dominio e a **fila**,
   * e nao carteira aberta — protocolo sem dono numa fila que nao e sua nao e seu.
   */
  filtro(ctx: ContextoVisibilidade): Prisma.TicketWhereInput {
    if (ctx.veTudo) return {};
    return {
      OR: [
        { responsavelId: { in: responsaveisNoEscopo(ctx) } },
        { responsavelId: null, filaId: { in: ctx.filaIds } },
      ],
    };
  },
};

export const politicaContatos = {
  /**
   * Gestao e comercial: carteira (proprios/equipe + sem responsavel).
   *
   * AGENTE: **vinculo operacional**. Contato sem responsavel nao fica visivel
   * para ele por ser sem responsavel — fica visivel se houver conversa ou
   * protocolo que ele possa atender. Sem essa distincao, numa base onde ninguem
   * atribuiu responsavel (a base real hoje) todo contato apareceria para todo
   * agente, e o escopo nao escoparia nada.
   */
  filtro(ctx: ContextoVisibilidade): Prisma.ContactWhereInput {
    if (ctx.veTudo) return {};
    if (ctx.carteiraAberta) return filtroCarteira(ctx) as Prisma.ContactWhereInput;
    return {
      OR: [
        { responsavelId: ctx.usuarioId },
        { conversas: { some: politicaConversas.filtro(ctx) } },
        { protocolos: { some: politicaProtocolos.filtro(ctx) } },
      ],
    };
  },
};

export const politicaContas = {
  /**
   * Gestao e comercial: carteira. AGENTE: so pela tabela — cliente aparece se
   * ele tiver acesso a algum contato dele. Agente nao tem carteira comercial.
   */
  filtro(ctx: ContextoVisibilidade): Prisma.AccountWhereInput {
    if (ctx.veTudo) return {};
    if (ctx.carteiraAberta) return filtroCarteira(ctx) as Prisma.AccountWhereInput;
    return { contatos: { some: politicaContatos.filtro(ctx) } };
  },
};

export const politicaProdutosDoCliente = {
  /**
   * Acessorio a conta: base instalada (item 5.1) nao tem regra propria de
   * carteira — quem enxerga a conta enxerga o equipamento dela, no mesmo
   * espirito de `politicaAtividades` derivar do registro-pai.
   */
  filtro(ctx: ContextoVisibilidade): Prisma.ProdutoDoClienteWhereInput {
    if (ctx.veTudo) return {};
    return { conta: politicaContas.filtro(ctx) };
  },
};

export const politicaLeads = {
  /** Processo comercial: AGENTE nao participa. */
  filtro(ctx: ContextoVisibilidade): Prisma.LeadWhereInput {
    if (ctx.veTudo) return {};
    if (!ctx.carteiraAberta) return NADA;
    return filtroCarteira(ctx) as Prisma.LeadWhereInput;
  },
};

export const politicaOportunidades = {
  /** Processo comercial: AGENTE nao participa. */
  filtro(ctx: ContextoVisibilidade): Prisma.OpportunityWhereInput {
    if (ctx.veTudo) return {};
    if (!ctx.carteiraAberta) return NADA;
    return filtroCarteira(ctx) as Prisma.OpportunityWhereInput;
  },
};

export const politicaCredenciamentos = {
  /** Processo operacional: AGENTE nao participa, mesmo corte de Oportunidades. */
  filtro(ctx: ContextoVisibilidade): Prisma.CredenciamentoWhereInput {
    if (ctx.veTudo) return {};
    if (!ctx.carteiraAberta) return NADA;
    return filtroCarteira(ctx) as Prisma.CredenciamentoWhereInput;
  },
};

export const politicaAtividades = {
  /**
   * Atividade e acessoria: a visibilidade dela **deriva**.
   *
   * Responsavel, autor, ou registro-pai visivel. Nao existe "atividade sem
   * responsavel visivel para todos": uma nota escrita numa ficha nao pode ser
   * mais aberta do que a ficha onde foi escrita.
   */
  filtro(ctx: ContextoVisibilidade): Prisma.ActivityWhereInput {
    if (ctx.veTudo) return {};
    return {
      OR: [
        { responsavelId: { in: responsaveisNoEscopo(ctx) } },
        { criadoPorId: ctx.usuarioId },
        { contato: politicaContatos.filtro(ctx) },
        { conta: politicaContas.filtro(ctx) },
        { oportunidade: politicaOportunidades.filtro(ctx) },
      ],
    };
  },
};

/**
 * Atalho para o caso comum: pega o contexto e devolve o filtro do dominio.
 *
 * Existe para o servico nao repetir `const ctx = await contextoVisibilidade()`
 * antes de cada consulta — e para nao haver a tentacao de guardar o contexto em
 * variavel de modulo, que entre requisicoes seria o usuario errado.
 */
export async function filtroDe<T>(politica: { filtro(ctx: ContextoVisibilidade): T }): Promise<T> {
  return politica.filtro(await contextoVisibilidade());
}

/**
 * Confere que todo vinculo informado esta no escopo de quem escreve.
 *
 * Existe porque a classe de falha "escrita que referencia registro por id" foi
 * encontrada em **nove** endpoints diferentes na varredura do passo 1.2, sempre
 * com a mesma forma: a listagem esconde o registro, mas o corpo da requisicao o
 * alcanca por id e o vincula. Repetir o bloco em nove lugares e garantir que o
 * decimo vai esquecer.
 *
 * Nao e abstracao nova: e exatamente a politica de cada dominio, chamada de um
 * lugar so. Campo ausente ou nulo nao e conferido — nulo significa "desvincular",
 * e desvincular o que ja e seu e legitimo.
 *
 * Responde 404, e nao 403: vale a mesma razao do acesso por id — "proibido"
 * confirmaria que o registro existe.
 */
export async function exigirVinculosVisiveis(dados: {
  contatoId?: string | null;
  contaId?: string | null;
  oportunidadeId?: string | null;
  protocoloId?: string | null;
  conversaId?: string | null;
  leadId?: string | null;
}): Promise<void> {
  const ctx = await contextoVisibilidade();
  // Quem ve tudo nao precisa de nenhuma consulta: as politicas devolveriam
  // filtro vazio e as buscas confirmariam o obvio.
  if (ctx.veTudo) return;

  const conferencias: Array<[string | null | undefined, () => Promise<unknown>]> = [
    [dados.contatoId, () => prisma.contact.findFirst({ where: apenasVisivel(dados.contatoId!, politicaContatos.filtro(ctx)), select: { id: true } })],
    [dados.contaId, () => prisma.account.findFirst({ where: apenasVisivel(dados.contaId!, politicaContas.filtro(ctx)), select: { id: true } })],
    [dados.oportunidadeId, () => prisma.opportunity.findFirst({ where: apenasVisivel(dados.oportunidadeId!, politicaOportunidades.filtro(ctx)), select: { id: true } })],
    [dados.protocoloId, () => prisma.ticket.findFirst({ where: apenasVisivel(dados.protocoloId!, politicaProtocolos.filtro(ctx)), select: { id: true } })],
    [dados.conversaId, () => prisma.conversation.findFirst({ where: apenasVisivel(dados.conversaId!, politicaConversas.filtro(ctx)), select: { id: true } })],
    [dados.leadId, () => prisma.lead.findFirst({ where: apenasVisivel(dados.leadId!, politicaLeads.filtro(ctx)), select: { id: true } })],
  ];

  for (const [valor, buscar] of conferencias) {
    if (!valor) continue;
    if (!(await buscar())) throw notFound('Registro vinculado não encontrado');
  }
}

/**
 * Confere que o usuario referenciado existe **nesta** organizacao.
 *
 * Para campos que apontam para gente — `responsavelId`, `gestorId` —, e nao para
 * registro do CRM. Nao ha politica de visibilidade sobre usuario: atribuir um
 * registro a um colega e legitimo em qualquer perfil que possa atribuir, e quem
 * decide *se* pode e o `requireRole`. O que nao pode e apontar para usuario de
 * outra organizacao: a extensao do Prisma isola as consultas, mas nao confere
 * chave estrangeira, entao a conferencia e esta busca.
 *
 * Ausente ou nulo passa: nulo significa "sem responsavel", que e estado valido.
 */
export async function exigirUsuarioDaOrganizacao(usuarioId?: string | null): Promise<void> {
  if (!usuarioId) return;
  const existe = await prisma.user.findFirst({ where: { id: usuarioId }, select: { id: true } });
  if (!existe) throw notFound('Usuário não encontrado');
}
