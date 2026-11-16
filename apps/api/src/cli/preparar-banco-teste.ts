import { spawnSync } from 'node:child_process';
import { validarUrlDeBancoDeTeste } from '../lib/banco-teste';

/**
 * Aplica as migrations no banco de TESTE (local/descartavel) e em nenhum outro.
 *
 *   $env:TEST_DATABASE_URL = 'postgresql://teste:teste@127.0.0.1:55432/plataforma_teste'
 *   npm run test:integracao:preparar
 *
 * O Prisma le DATABASE_URL e DIRECT_URL; aqui as duas sao SOBRESCRITAS com a URL de
 * teste, para que um .env apontando para o Neon nunca seja usado por engano.
 */
const guarda = validarUrlDeBancoDeTeste(process.env.TEST_DATABASE_URL);
if (!guarda.ok) {
  console.error(`Recusado: ${guarda.motivo}.`);
  console.error('Este comando so aplica migrations em um banco local e descartavel (127.0.0.1/localhost, nome com "teste").');
  process.exit(1);
}

const url = new URL(guarda.url);
console.log(`Aplicando migrations em ${url.hostname}:${url.port || '5432'}${url.pathname} ...`);

const r = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, DATABASE_URL: guarda.url, DIRECT_URL: guarda.url },
});
process.exit(r.status ?? 1);
