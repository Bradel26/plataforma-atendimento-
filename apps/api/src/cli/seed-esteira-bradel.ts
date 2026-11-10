/**
 * Cria a estrutura das esteiras (funis tipo ESTEIRA) da Bradel — uma por
 * operacao, TIM e Starlink —, com as etapas e chaves do catalogo
 * (`modules/esteira/catalogo.ts`). So estrutura: nunca cria parceiros.
 *
 * Idempotente: usa a mesma sincronizacao da CLI `esteira:estrutura` — funil e
 * etapas existentes sao reaproveitados, renomeacao do ADMIN e preservada e
 * nada e apagado. Para migrar cards de uma base antiga, use `esteira:estrutura`.
 *
 * Uso:
 *   npm run esteira:seed -- <organizacaoId>
 */
import { prisma } from '../lib/prisma';
import { sincronizarEstrutura } from '../modules/esteira/estrutura.service';

async function main(organizacaoId: string) {
  try {
    const r = await sincronizarEstrutura(organizacaoId);
    console.log(
      `Esteiras: ${r.funisCriados} funil(is) criado(s), ${r.etapasCriadas} etapa(s) criada(s), ${r.etapasAtualizadas} atualizada(s).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

const organizacaoId = process.argv[2];
if (!organizacaoId) {
  console.error('Uso: npm run esteira:seed -- <organizacaoId>');
  process.exit(1);
}

void main(organizacaoId).catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
