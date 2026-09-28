/**
 * Cria as esteiras (funis tipo ESTEIRA) da Bradel — uma por operacao, TIM e
 * Starlink —, com os 5 estagios do processo de credenciamento.
 *
 * Idempotente: funil que ja existe (mesmo nome) e pulado — seguro de rodar
 * mais de uma vez. Um funil antigo com outro nome continua como esta.
 *
 * Uso:
 *   npm run esteira:seed -- <organizacaoId>
 */
import { prisma } from '../lib/prisma';
import { comOrganizacao } from '../lib/tenant';

const NOMES_FUNIL = ['Credenciamento TIM', 'Credenciamento Starlink'];
const ESTAGIOS = ['Novo cadastro', 'Pendencia', 'Aprovacao', 'Credenciado', 'Ativo'];

async function main(_organizacaoId: string) {
  try {
    for (const nome of NOMES_FUNIL) {
      const existente = await prisma.funnel.findFirst({ where: { nome } });
      if (existente) {
        console.log(`Funil "${nome}" ja existe (id ${existente.id}) — pulado.`);
        continue;
      }
      const criado = await prisma.funnel.create({
        data: {
          nome,
          tipo: 'ESTEIRA',
          estagios: {
            createMany: { data: ESTAGIOS.map((e, indice) => ({ nome: e, ordem: indice + 1 })) },
          },
        },
        include: { estagios: { orderBy: { ordem: 'asc' } } },
      });
      console.log(`Funil "${criado.nome}" criado (id ${criado.id}) com ${criado.estagios.length} estagios.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

const organizacaoId = process.argv[2];
if (!organizacaoId) {
  console.error('Uso: npm run esteira:seed -- <organizacaoId>');
  process.exit(1);
}

void comOrganizacao(organizacaoId, () => main(organizacaoId));
