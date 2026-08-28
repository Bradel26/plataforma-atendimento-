/**
 * Reaplica as anonimizacoes da LGPD depois de restaurar um backup.
 *
 * Restaurar um snapshot ressuscita o dado que o titular pediu para apagar. A
 * trilha de auditoria sobrevive ao titular de proposito, e e ela que diz quem
 * precisa ser anonimizado de novo.
 *
 * Uso:
 *   npm run lgpd:reaplicar               (simulacao: diz o que faria)
 *   npm run lgpd:reaplicar:executar      (aplica de verdade)
 */
import { prisma } from '../lib/prisma';
import { ORGANIZACAO_INICIAL, comOrganizacao } from '../lib/tenant';
import { redis } from '../lib/redis';
import { reaplicarAnonimizacoes } from '../modules/lgpd/lgpd.service';

// Aceita a flag ou a variavel: 'npm run -- --flag' nao atravessa duas camadas
// de workspace, e o comando precisa funcionar dos dois jeitos.
const executar = process.argv.includes('--executar') || process.env.LGPD_EXECUTAR === 'true';

// Funcao em vez de await no topo: o modulo compilado do projeto e CommonJS.
async function main() {
  const resumo = await reaplicarAnonimizacoes({ simulacao: !executar });

  console.log(executar ? 'Reaplicacao executada:' : 'Simulacao — nada foi alterado:');
  console.log(`  titulares na trilha de auditoria: ${resumo.registrados}`);
  console.log(`  ja removidos pelo expurgo:        ${resumo.ausentes}`);
  console.log(`  ${executar ? 'reanonimizados agora' : 'a reanonimizar'}: ${executar ? resumo.reaplicados : resumo.pendentes}`);
  if (executar && resumo.pendentes > 0) console.log(`  continuam pendentes: ${resumo.pendentes}`);
  if (resumo.falhas?.length) console.log(`  falharam: ${resumo.falhas.join(', ')}`);
  if (!executar && resumo.pendentes > 0) console.log('\nRode com --executar para aplicar.');

  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
}

// Roda na organizacao inicial. Ferramenta de operacao e por organizacao: com
// mais de uma, ela passa a receber o slug como argumento — e melhor pedir do que
// reanonimizar a base de quem nao pediu.
void comOrganizacao(ORGANIZACAO_INICIAL, () => main());
