import { notFound } from './errors';
import { prismaSemIsolamento } from './prisma';
import { ORGANIZACAO_INICIAL, semOrganizacao } from './tenant';

/**
 * Resolve a organizacao das rotas publicas, pelo `slug`.
 *
 * Tres rotas existem antes de haver sessao, e cada uma precisa saber de que
 * empresa e o atendimento: a marca da tela de login (`GET /branding`), o script
 * do widget (`GET /widget.js`) e a abertura de sessao do webchat.
 *
 * Ausente, cai na organizacao inicial. Nao e comodidade: e o que mantem o
 * webchat e o widget que estao instalados hoje funcionando sem mexer no site do
 * cliente. Quando houver subdominio por empresa, ele passa a ser a fonte e este
 * parametro vira o caminho de excecao.
 *
 * O slug **identifica, nao autoriza**. Saber o slug de outra empresa permite ver
 * a cor da marca dela e abrir uma conversa — exatamente como saber o endereco do
 * site dela permite — e nao da acesso a nada que ja exista lá dentro.
 */
export async function organizacaoPorSlug(slug: string | undefined): Promise<string> {
  if (!slug) return ORGANIZACAO_INICIAL;

  const org = await semOrganizacao('rota publica: resolve a organizacao pelo slug', () =>
    prismaSemIsolamento.organizacao.findFirst({
      where: { slug, ativa: true },
      select: { id: true },
    }),
  );
  if (!org) throw notFound('Organizacao nao encontrada');
  return org.id;
}

/** Le o `?org=` da query sem confiar no tipo que vem do Express. */
export const slugDaQuery = (valor: unknown): string | undefined =>
  typeof valor === 'string' && valor.trim() ? valor.trim() : undefined;
