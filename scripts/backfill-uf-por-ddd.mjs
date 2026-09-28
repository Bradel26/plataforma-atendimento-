/**
 * Preenche a UF dos contatos existentes que tem telefone mas nao tem UF,
 * inferindo do DDD (mesma tabela e mesma logica do backend — ver
 * apps/api/src/lib/ddd.ts). Sem isto, so os contatos criados DEPOIS do deploy
 * do preenchimento automatico ganham UF; quem ja existia continua sem, e o
 * filtro por UF/DDD do CRM some vazio para eles.
 *
 * Roda em modo simulacao por padrao — so mostra o que faria. `--aplicar` grava
 * de verdade.
 *
 *   node scripts/backfill-uf-por-ddd.mjs              # simula
 *   node scripts/backfill-uf-por-ddd.mjs --aplicar     # grava
 */
import { PrismaClient } from '@prisma/client';

const UF_POR_DDD = {
  '11': 'SP', '12': 'SP', '13': 'SP', '14': 'SP', '15': 'SP', '16': 'SP', '17': 'SP', '18': 'SP', '19': 'SP',
  '21': 'RJ', '22': 'RJ', '24': 'RJ',
  '27': 'ES', '28': 'ES',
  '31': 'MG', '32': 'MG', '33': 'MG', '34': 'MG', '35': 'MG', '37': 'MG', '38': 'MG',
  '41': 'PR', '42': 'PR', '43': 'PR', '44': 'PR', '45': 'PR', '46': 'PR',
  '47': 'SC', '48': 'SC', '49': 'SC',
  '51': 'RS', '53': 'RS', '54': 'RS', '55': 'RS',
  '61': 'DF',
  '62': 'GO', '64': 'GO',
  '63': 'TO',
  '65': 'MT', '66': 'MT',
  '67': 'MS',
  '68': 'AC',
  '69': 'RO',
  '71': 'BA', '73': 'BA', '74': 'BA', '75': 'BA', '77': 'BA',
  '79': 'SE',
  '81': 'PE', '87': 'PE',
  '82': 'AL',
  '83': 'PB',
  '84': 'RN',
  '85': 'CE', '88': 'CE',
  '86': 'PI', '89': 'PI',
  '91': 'PA', '93': 'PA', '94': 'PA',
  '92': 'AM', '97': 'AM',
  '95': 'RR',
  '96': 'AP',
  '98': 'MA', '99': 'MA',
};

function ufDoTelefone(telefone) {
  if (!telefone) return null;
  let digitos = telefone.replace(/\D/g, '');
  if (digitos.length === 12 || digitos.length === 13) digitos = digitos.slice(2);
  if (digitos.length !== 10 && digitos.length !== 11) return null;
  return UF_POR_DDD[digitos.slice(0, 2)] ?? null;
}

const APLICAR = process.argv.includes('--aplicar');
const prisma = new PrismaClient();

const contatos = await prisma.contact.findMany({
  where: { uf: null, telefone: { not: null } },
  select: { id: true, nome: true, telefone: true },
});

let atualizados = 0;
let semDdd = 0;

for (const c of contatos) {
  const uf = ufDoTelefone(c.telefone);
  if (!uf) {
    semDdd++;
    console.log(`  sem DDD reconhecivel: ${c.nome} (${c.telefone})`);
    continue;
  }
  console.log(`  ${APLICAR ? 'gravando' : 'gravaria'} ${c.nome} (${c.telefone}) -> ${uf}`);
  if (APLICAR) {
    await prisma.contact.update({ where: { id: c.id }, data: { uf } });
  }
  atualizados++;
}

console.log(
  `\n${contatos.length} contato(s) sem UF encontrados. ` +
    `${atualizados} ${APLICAR ? 'atualizados' : 'seriam atualizados'}, ${semDdd} sem DDD reconhecivel.`,
);
if (!APLICAR && contatos.length > 0) {
  console.log('Simulacao — rode com --aplicar para gravar de verdade.');
}

await prisma.$disconnect();
