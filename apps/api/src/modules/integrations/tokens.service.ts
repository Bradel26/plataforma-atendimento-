import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { EscopoIntegracao } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/errors';

/**
 * Tokens de servico: credencial de maquina, nao de gente.
 *
 * Guardados como SHA-256 e nunca como texto. Nao ha bcrypt aqui de proposito:
 * bcrypt existe para senha escolhida por humano, que e curta e adivinhavel, e
 * custa ~100ms — o que num token conferido a cada mensagem recebida viraria o
 * gargalo do canal. Este token e 32 bytes aleatorios: nao ha dicionario que o
 * alcance, e SHA-256 sobre ele nao tem o que quebrar.
 */
const PREFIXO_VISIVEL = 8;

const hashDe = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex');

export type TokenResumo = {
  id: string;
  nome: string;
  prefixo: string;
  escopo: EscopoIntegracao;
  ativo: boolean;
  criadoEm: Date;
  ultimoUsoEm: Date | null;
  revogadoEm: Date | null;
};

const resumir = (t: TokenResumo): TokenResumo => ({
  id: t.id,
  nome: t.nome,
  prefixo: t.prefixo,
  escopo: t.escopo,
  ativo: t.ativo,
  criadoEm: t.criadoEm,
  ultimoUsoEm: t.ultimoUsoEm,
  revogadoEm: t.revogadoEm,
});

export async function listarTokens() {
  const tokens = await prisma.integrationToken.findMany({ orderBy: { criadoEm: 'desc' } });
  return tokens.map(resumir);
}

/**
 * Cria um token e devolve o valor em claro — a unica vez que ele existe fora do
 * hash. Mostrar de novo depois exigiria guardar reversivel, que e o que este
 * desenho evita.
 */
export async function criarToken(input: { nome: string; escopo?: EscopoIntegracao }, criadoPorId?: string) {
  // `pi_` marca de onde o token veio quando aparece num log de terceiro.
  const valor = `pi_${randomBytes(32).toString('base64url')}`;

  const token = await prisma.integrationToken.create({
    data: {
      nome: input.nome,
      escopo: input.escopo ?? 'IA',
      hash: hashDe(valor),
      prefixo: valor.slice(0, PREFIXO_VISIVEL),
      criadoPorId: criadoPorId ?? null,
    },
  });

  return { token: resumir(token), valor };
}

/** Revoga sem apagar: o registro e a trilha de que aquele token existiu. */
export async function revogarToken(id: string) {
  const token = await prisma.integrationToken.findUnique({ where: { id } });
  if (!token) throw notFound('Token nao encontrado');

  return resumir(
    await prisma.integrationToken.update({
      where: { id },
      data: { ativo: false, revogadoEm: token.revogadoEm ?? new Date() },
    }),
  );
}

/**
 * Resolve um token em claro para o registro, ou null.
 *
 * A busca e por hash com indice unico — nao percorre a tabela comparando um a
 * um. O `timingSafeEqual` no fim guarda contra o caso em que dois registros
 * colidissem no indice: mesmo desnecessario hoje, custa nada e documenta a
 * intencao.
 */
export async function resolverToken(valor: string, escopo: EscopoIntegracao) {
  const hash = hashDe(valor);
  const token = await prisma.integrationToken.findUnique({ where: { hash } });
  if (!token || !token.ativo || token.escopo !== escopo) return null;

  const a = Buffer.from(token.hash, 'utf8');
  const b = Buffer.from(hash, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  // Ultimo uso e o que responde "esse token ainda esta em producao?" na hora de
  // limpar. Falha aqui nao pode derrubar a requisicao que estava autenticada.
  prisma.integrationToken
    .update({ where: { id: token.id }, data: { ultimoUsoEm: new Date() } })
    .catch((erro) => console.warn('[integracao] nao foi possivel marcar ultimo uso:', erro));

  return token;
}
