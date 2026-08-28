import { prisma } from '../../lib/prisma';
import { organizacaoAtual } from '../../lib/tenant';
import type { z } from 'zod';
import type { updateBrandingSchema } from './branding.schemas';

const ID = 'default';

/** Registro unico de White Label — criado sob demanda com os valores padrao. */
export async function getBranding() {
  // Chaveada pela organizacao, e nao pelo id fixo "default": a tabela nasceu como
  // registro unico da instalacao, e com duas empresas o id colidiria — pior, o
  // upsert de uma atualizaria a marca da outra, porque `where` de upsert nao
  // recebe o filtro da extensao (ele precisa ser chave unica).
  return prisma.branding.upsert({
    where: { organizacaoId: organizacaoAtual() },
    update: {},
    create: {},
  });
}

export async function updateBranding(input: z.infer<typeof updateBrandingSchema>) {
  return prisma.branding.upsert({
    where: { organizacaoId: organizacaoAtual() },
    update: input,
    create: input,
  });
}
