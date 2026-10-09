import { Prisma } from '@prisma/client';

/**
 * True quando o erro e um P2002 (violacao de unicidade) cuja constraint e a de
 * `Message.idExterno`. Confere `meta.target` — mesmo padrao de
 * `comColisaoDeSessaoTratada` em channels.service.ts — para nunca mascarar um
 * conflito de outra origem.
 */
export function colidiuNoIdExterno(erro: unknown): boolean {
  if (!(erro instanceof Prisma.PrismaClientKnownRequestError) || erro.code !== 'P2002') return false;
  const alvo = erro.meta?.target;
  const texto = typeof alvo === 'string' ? alvo : Array.isArray(alvo) ? alvo.join(',') : '';
  return texto.includes('id_externo') || texto.includes('idExterno');
}
