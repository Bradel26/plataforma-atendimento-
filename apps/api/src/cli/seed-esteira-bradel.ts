/**
 * Cria o funil "Esteira de Credenciamento" (tipo ESTEIRA) para a organizacao
 * da Bradel, com os 5 estagios do processo de credenciamento TIM/Starlink.
 *
 * Idempotente: se o funil ja existir (mesmo nome), nao faz nada — seguro de
 * rodar mais de uma vez.
 *
 * Uso:
 *   npm run esteira:seed -- <organizacaoId>
 */
import { prisma } from '../lib/prisma';
import { comOrganizacao } from '../lib/tenant';

const NOME_FUNIL = 'Esteira de Credenciamento';
const ESTAGIOS = ['Novo cadastro', 'Pendencia', 'Aprovacao', 'Credenciado', 'Ativo'];

async function main(organizacaoId: string) {
  const existente = await prisma.funnel.findFirst({ where: { nome: NOME_FUNIL } });
  if (existente) {
    console.log(`Funil "${NOME_FUNIL}" ja existe (id ${existente.id}) — nada a fazer.`);
    return;
  }

  const criado = await prisma.funnel.create({
    data: {
      nome: NOME_FUNIL,
      tipo: 'ESTEIRA',
      estagios: {
        createMany: { data: ESTAGIOS.map((nome, indice) => ({ nome, ordem: indice + 1 })) },
      },
    },
    include: { estagios: { orderBy: { ordem: 'asc' } } },
  });

  console.log(`Funil "${criado.nome}" criado (id ${criado.id}) com ${criado.estagios.length} estagios:`);
  for (const e of criado.estagios) console.log(`  ${e.ordem}. ${e.nome}`);

  await prisma.$disconnect();
}

const organizacaoId = process.argv[2];
if (!organizacaoId) {
  console.error('Uso: npm run esteira:seed -- <organizacaoId>');
  process.exit(1);
}

void comOrganizacao(organizacaoId, () => main(organizacaoId));
