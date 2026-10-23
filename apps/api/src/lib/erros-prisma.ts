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

/**
 * True quando o erro e um P2002 de um dos indices unicos parciais de vinculo
 * (`credenciamentos_vinculo_conta_key` / `credenciamentos_vinculo_contato_key`).
 * Indice parcial nao esta no schema, entao o `target` pode vir como nome do
 * indice ou como lista de colunas — aceita os dois, e nada alem deles.
 */
export function colidiuNoVinculoDeCredenciamento(erro: unknown): boolean {
  if (!(erro instanceof Prisma.PrismaClientKnownRequestError) || erro.code !== 'P2002') return false;
  const alvo = erro.meta?.target;
  if (typeof alvo === 'string') return alvo.includes('credenciamentos_vinculo_');
  if (!Array.isArray(alvo)) return false;
  const colunas = alvo.map(String);
  return (
    colunas.includes('operacao') &&
    (colunas.some((c) => c === 'conta_id' || c === 'contaId') ||
      colunas.some((c) => c === 'contato_id' || c === 'contatoId'))
  );
}
