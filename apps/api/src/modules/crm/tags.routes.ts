import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { param } from '../../http/params';
import { validateBody, validateQuery } from '../../http/middleware/validate';
import { badRequest } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { filtroDe, politicaContas, politicaContatos, politicaConversas } from '../../lib/politicas';
import { MAXIMO_POR_REGISTRO, TAMANHO_MAXIMO, normalizarTag } from '../../lib/tags';

/**
 * Catalogo de etiquetas em uso, e a gestao delas.
 *
 * Nao existe tabela de tags: a etiqueta e um valor dentro do registro. Isso e
 * proposital — tabela de tags exige cadastrar antes de usar, e etiqueta que
 * precisa de cadastro nao e usada. O preco e que o "catalogo" tem de ser
 * derivado dos registros, e e o que estas rotas fazem.
 */
export const tagsRoutes = Router();

tagsRoutes.use(requireAuth);

const listarSchema = z.object({
  /** Prefixo para o completar-enquanto-digita do campo de etiqueta. */
  busca: z.string().trim().max(TAMANHO_MAXIMO).optional(),
  limite: z.coerce.number().int().min(1).max(200).default(100),
});

/**
 * As etiquetas que a pessoa **pode ver**, com quantos registros cada uma tem.
 *
 * O escopo do passo 1.2 vale aqui igual: a lista sai dos registros visiveis, e
 * nao de um `SELECT DISTINCT` na tabela. Ignorar isso vazaria o vocabulario
 * comercial inteiro para um agente — nomes de segmento, de campanha, de
 * concorrente — sem ele ter acesso a um unico registro que os contenha.
 */
tagsRoutes.get(
  '/',
  validateQuery(listarSchema),
  asyncHandler(async (_req, res) => {
    const { busca, limite } = res.locals.query as z.infer<typeof listarSchema>;
    const prefixo = busca ? normalizarTag(busca) : '';

    const [contatos, contas, conversas] = await Promise.all([
      prisma.contact.findMany({
        where: { AND: [await filtroDe(politicaContatos), { tags: { isEmpty: false } }] },
        select: { tags: true },
      }),
      prisma.account.findMany({
        where: { AND: [await filtroDe(politicaContas), { tags: { isEmpty: false } }] },
        select: { tags: true },
      }),
      // Conversa entra no mesmo catalogo, e nao num separado: o vocabulario e um
      // so. "boleto" etiquetando uma conversa e "boleto" etiquetando um contato
      // sao a mesma palavra, e dois catalogos fariam a mesma etiqueta ser
      // renomeada num lugar e nao no outro.
      prisma.conversation.findMany({
        where: { AND: [await filtroDe(politicaConversas), { tags: { isEmpty: false } }] },
        select: { tags: true },
      }),
    ]);

    /*
     * A contagem e feita aqui, e nao no banco.
     *
     * Agrupar por elemento de array exige `unnest`, que em SQL cru perderia o
     * filtro de visibilidade — que e um objeto do Prisma, nao uma string que se
     * cole numa query. Trocar a garantia de escopo por desempenho numa lista de
     * etiquetas seria o pior negocio possivel; se um dia doer, o caminho e uma
     * view materializada por organizacao, nao SQL cru com filtro reescrito a mao.
     */
    const contagem = new Map<string, { contatos: number; contas: number; conversas: number }>();
    const somar = (tags: string[], campo: 'contatos' | 'contas' | 'conversas') => {
      for (const tag of tags) {
        const atual = contagem.get(tag) ?? { contatos: 0, contas: 0, conversas: 0 };
        atual[campo] += 1;
        contagem.set(tag, atual);
      }
    };
    for (const { tags } of contatos) somar(tags, 'contatos');
    for (const { tags } of contas) somar(tags, 'contas');
    for (const { tags } of conversas) somar(tags, 'conversas');

    const tags = [...contagem.entries()]
      .filter(([tag]) => !prefixo || tag.includes(prefixo))
      .map(([tag, { contatos: c, contas: a, conversas: v }]) => ({
        tag,
        contatos: c,
        contas: a,
        conversas: v,
        total: c + a + v,
      }))
      // Mais usadas primeiro: e o que serve tanto ao filtro quanto a gestao.
      // Empate pelo nome, para a ordem nao mudar entre duas chamadas iguais.
      .sort((x, y) => y.total - x.total || x.tag.localeCompare(y.tag, 'pt-BR'))
      .slice(0, limite);

    res.json({ tags });
  }),
);

const renomearSchema = z.object({
  de: z.string().trim().min(1).max(TAMANHO_MAXIMO),
  para: z.string().trim().min(1).max(TAMANHO_MAXIMO),
});

/**
 * Renomeia uma etiqueta em todos os registros da organizacao.
 *
 * Restrito a ADMIN e SUPERVISOR de proposito: renomear age sobre registros que
 * quem chama talvez nem veja, e aplicar so no escopo de quem pede deixaria a
 * base com as duas grafias — exatamente o problema que a normalizacao existe
 * para evitar. Perfil que ve tudo nao tem esse conflito.
 *
 * Renomear para uma etiqueta que ja existe **funde** as duas, e e o
 * comportamento certo: e assim que se conserta `revenda` e `revendas`.
 */
tagsRoutes.patch(
  '/',
  requireRole('ADMIN', 'SUPERVISOR'),
  validateBody(renomearSchema),
  asyncHandler(async (req, res) => {
    const de = normalizarTag((req.body as z.infer<typeof renomearSchema>).de);
    const para = normalizarTag((req.body as z.infer<typeof renomearSchema>).para);
    if (!de || !para) throw badRequest('Informe a etiqueta atual e a nova');
    if (de === para) throw badRequest('A etiqueta nova e igual a atual');

    const alterados = await aplicar(de, (tags) => {
      const semAntiga = tags.filter((t) => t !== de);
      // `includes` evita duplicar quando o registro ja tinha as duas etiquetas —
      // e o caso da fusao, e sem isso o registro ficaria com `para` repetido.
      return semAntiga.includes(para) ? semAntiga : [...semAntiga, para].slice(0, MAXIMO_POR_REGISTRO);
    });

    res.json({ de, para, ...alterados });
  }),
);

/**
 * Remove a etiqueta de todos os registros da organizacao.
 *
 * A etiqueta vem na URL, e nao no corpo: corpo em DELETE e aceito pelo Express
 * mas descartado por parte dos proxies, e a falha apareceria como "removeu zero
 * registros" sem erro nenhum. Espaco na etiqueta viaja como `%20`.
 */
tagsRoutes.delete(
  '/:tag',
  requireRole('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (req, res) => {
    const tag = normalizarTag(param(req, 'tag'));
    if (!tag) throw badRequest('Informe a etiqueta');

    const alterados = await aplicar(tag, (tags) => tags.filter((t) => t !== tag));
    res.json({ tag, ...alterados });
  }),
);

/**
 * Aplica uma transformacao na lista de etiquetas de todo registro que tenha a
 * etiqueta informada.
 *
 * Um `update` por registro, e nao `updateMany`: nao existe operacao SQL de
 * "substituir elemento de array" que o Prisma exponha, e a alternativa seria
 * `$executeRaw` com `array_replace` — que escaparia da extensao multi-tenant e
 * precisaria carregar a organizacao a mao. Trocar a fronteira estrutural por uma
 * consulta a menos e o tipo de atalho que a decisao 49 existe para recusar.
 */
async function aplicar(tag: string, transformar: (tags: string[]) => string[]) {
  const [contatos, contas, conversas] = await Promise.all([
    prisma.contact.findMany({ where: { tags: { has: tag } }, select: { id: true, tags: true } }),
    prisma.account.findMany({ where: { tags: { has: tag } }, select: { id: true, tags: true } }),
    prisma.conversation.findMany({ where: { tags: { has: tag } }, select: { id: true, tags: true } }),
  ]);

  await prisma.$transaction([
    ...contatos.map((c) =>
      prisma.contact.update({ where: { id: c.id }, data: { tags: transformar(c.tags) } }),
    ),
    ...contas.map((a) =>
      prisma.account.update({ where: { id: a.id }, data: { tags: transformar(a.tags) } }),
    ),
    ...conversas.map((v) =>
      prisma.conversation.update({ where: { id: v.id }, data: { tags: transformar(v.tags) } }),
    ),
  ]);

  /*
   * Conversa entra na mesma transacao dos outros dois, e nao numa segunda.
   *
   * Renomear e uma operacao de vocabulario: `revenda` -> `revendas` tem de
   * valer em todo lugar ou em lugar nenhum. Duas transacoes deixariam a base
   * com a etiqueta antiga nas conversas e a nova nos contatos se a segunda
   * falhasse — o estado exato que a normalizacao existe para impedir.
   *
   * Diferente das outras escritas de conversa, esta nao notifica o WebSocket:
   * renomear pode tocar milhares de conversas de uma vez, e um evento por
   * conversa afogaria o painel de todos os atendentes. Quem estiver com a tela
   * aberta ve o nome antigo ate recarregar, e isso e aceitavel para uma acao de
   * administracao que ADMIN e SUPERVISOR fazem raramente.
   */
  return { contatos: contatos.length, contas: contas.length, conversas: conversas.length };
}
