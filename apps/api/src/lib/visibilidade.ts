import type { Role } from '@prisma/client';
import { prisma } from './prisma';
import { memoizado, usuarioAtual } from './tenant';

/**
 * Escopo de visibilidade: quais registros da **propria** organizacao o usuario
 * enxerga.
 *
 * Tres camadas que nao se confundem, e a confusao entre elas e o defeito
 * classico deste tipo de codigo:
 *
 *   - **organizacao** decide de quem sao os dados. E uma *fronteira*: aplicada
 *     estruturalmente pela extensao do Prisma, e o banco recusa o que atravessa.
 *     Nada neste arquivo menciona organizacao.
 *   - **perfil** decide o que a pessoa pode *fazer*. Vive em `requireRole` e no
 *     `NAV` do front. Tambem nao esta aqui.
 *   - **escopo** decide o que ela pode *enxergar* dentro da propria organizacao.
 *     E o que este arquivo faz.
 *
 * Por que escopo nao entrou na extensao do Prisma junto com organizacao: porque
 * ele **nao e uniforme**. Organizacao e a mesma regra em 24 tabelas; escopo e
 * uma regra por dominio — conversa depende de fila, contato do agente depende de
 * conversa, atividade depende do registro-pai. Uma funcao unica capaz de tudo
 * isso seria uma funcao unica cheia de excecoes, e a primeira excecao esquecida
 * seria um vazamento silencioso. Entao: um contexto compartilhado, e uma
 * politica por dominio.
 *
 * O contrato de cada politica e uma funcao `filtro(ctx)` que devolve um
 * `WhereInput`. Listagem e acesso por id usam **o mesmo filtro** — nunca duas
 * regras que possam divergir. Ver `apenasVisivel`.
 */

export type ContextoVisibilidade = {
  usuarioId: string;
  perfil: Role;
  /** Filas em que atua. Vazio para quem nao atende. */
  filaIds: string[];
  /** Equipe direta (`gestorId` = ele) mais ele proprio. Um nivel, sem recursao. */
  equipeIds: string[];
  /** ADMIN e SUPERVISOR: enxergam toda a organizacao. */
  veTudo: boolean;
  /** GESTOR: enxerga a equipe direta. */
  veEquipe: boolean;
  /**
   * Enxerga registro sem responsavel como carteira aberta.
   *
   * Todos menos AGENTE. Para ele, `responsavelId = null` **nao** abre nada por
   * si: contato sem dono so aparece se houver vinculo operacional (conversa ou
   * protocolo que ele possa atender). Sem essa distincao, uma base onde ninguem
   * atribuiu responsavel — que e a base real hoje — deixaria todo contato
   * visivel para todo agente, e o escopo nao teria escopo nenhum.
   */
  carteiraAberta: boolean;
};

const VE_TUDO: Role[] = ['ADMIN', 'SUPERVISOR'];

/**
 * Monta o contexto do usuario da requisicao.
 *
 * Memoizado por requisicao: custa duas consultas, e uma tela que lista contatos,
 * contas e atividades pediria o contexto tres vezes.
 */
export function contextoVisibilidade(): Promise<ContextoVisibilidade> {
  return memoizado('visibilidade', async () => {
    const { id: usuarioId, perfil } = usuarioAtual();
    const papel = perfil as Role;
    const veTudo = VE_TUDO.includes(papel);

    // Quem ve tudo nao precisa de fila nem de equipe: as duas consultas
    // existiriam para montar um filtro que nao vai ser usado.
    if (veTudo) {
      return {
        usuarioId,
        perfil: papel,
        filaIds: [],
        equipeIds: [],
        veTudo: true,
        veEquipe: false,
        carteiraAberta: true,
      };
    }

    const [vinculos, equipe] = await Promise.all([
      prisma.queueAgent.findMany({ where: { usuarioId }, select: { filaId: true } }),
      papel === 'GESTOR'
        ? prisma.user.findMany({ where: { gestorId: usuarioId }, select: { id: true } })
        : Promise.resolve([]),
    ]);

    return {
      usuarioId,
      perfil: papel,
      filaIds: vinculos.map((v) => v.filaId),
      // O proprio gestor entra na equipe: o que e dele tambem e "da equipe
      // dele", e sem isso um gestor sem subordinados nao veria nem os proprios
      // registros.
      equipeIds: [usuarioId, ...equipe.map((u) => u.id)],
      veTudo: false,
      veEquipe: papel === 'GESTOR',
      carteiraAberta: papel !== 'AGENTE',
    };
  });
}

/**
 * Os ids de responsavel que este usuario alcanca.
 *
 * GESTOR alcanca a equipe; os demais, so a si. Existe para as politicas nao
 * repetirem o `veEquipe ? equipeIds : [usuarioId]` seis vezes — e para o dia em
 * que "equipe" mudar de definicao ter um lugar so para mudar.
 */
export const responsaveisNoEscopo = (ctx: ContextoVisibilidade): string[] =>
  ctx.veEquipe ? ctx.equipeIds : [ctx.usuarioId];

/**
 * Filtro de carteira: proprios (ou da equipe) mais os sem responsavel.
 *
 * A forma de "sem responsavel" fica explicita — `responsavelId: null` —, e nao
 * implicita na ausencia de condicao. `carteiraAberta` falso remove esse termo em
 * vez de transformar o filtro inteiro em nada.
 */
export function filtroCarteira(ctx: ContextoVisibilidade): { OR: Array<Record<string, unknown>> } {
  const alternativas: Array<Record<string, unknown>> = [
    { responsavelId: { in: responsaveisNoEscopo(ctx) } },
  ];
  if (ctx.carteiraAberta) alternativas.push({ responsavelId: null });
  return { OR: alternativas };
}

/**
 * Acesso por id com a mesma regra da listagem.
 *
 * O padrao existe para impedir a divergencia mais comum deste tipo de mudanca:
 * a listagem filtra, o `/registro/:id` busca por `findUnique` e devolve o que
 * nao deveria. Aqui id e politica entram no mesmo `where`, e o resultado nulo
 * vira 404 — nunca 403, que confirmaria a existencia do registro.
 */
export function apenasVisivel<F extends Record<string, unknown>>(
  id: string,
  filtro: F,
): { AND: [{ id: string }, F] } {
  return { AND: [{ id }, filtro] };
}
