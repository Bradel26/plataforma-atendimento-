/**
 * Gera os segredos de producao e escreve apps/api/.env.production.
 *
 * Existe porque "troque os segredos antes de subir" e um passo que se esquece,
 * e porque segredo escolhido a mao e fraco. Aqui todos saem de randomBytes.
 *
 * O arquivo gerado NAO vai para o git (.gitignore cobre .env*). As URLs de banco
 * e Redis ficam como placeholder: elas vem do provedor, nao daqui.
 *
 * Uso: npm run gerar:segredos [-- --forcar]
 */
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const destino = join(raiz, 'apps/api/.env.production');
const forcar = process.argv.includes('--forcar');

if (existsSync(destino) && !forcar) {
  console.error(`${relative(raiz, destino)} ja existe.`);
  console.error('Sobrescrever invalida as sessoes e torna ilegivel todo segredo de canal ja cifrado.');
  console.error('Se e isso mesmo que voce quer: npm run gerar:segredos -- --forcar');
  process.exit(1);
}

/** Senha legivel de digitar, com entropia de 96 bits. */
function senhaForte() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(20);
  const corpo = [...bytes].map((b) => alfabeto[b % alfabeto.length]).join('');
  // Garante os quatro tipos de caractere, para nao brigar com politica de senha.
  return `${corpo.slice(0, 18)}-${corpo.slice(18)}9aZ!`;
}

const segredos = {
  JWT_ACCESS_SECRET: randomBytes(48).toString('base64url'),
  JWT_REFRESH_SECRET: randomBytes(48).toString('base64url'),
  SECRETS_KEY: randomBytes(32).toString('hex'),
  SEED_ADMIN_PASSWORD: senhaForte(),
};

const conteudo = `# Gerado por npm run gerar:segredos. NAO comite este arquivo.
#
# Preencha as quatro linhas de infraestrutura abaixo com o que o provedor deu.
# O resto ja esta pronto e nao precisa ser editado.

NODE_ENV=production
PORT=3333

# Do provedor de banco (Neon, RDS, etc). DATABASE_URL e a pooled; DIRECT_URL a direta.
DATABASE_URL=""
DIRECT_URL=""

# Do provedor de Redis (Upstash usa rediss://).
REDIS_URL=""

# Dominio do frontend, com https. Sem isso o cookie de refresh nao fecha.
WEB_ORIGIN="https://"

# --- Gerados. Trocar qualquer um destes tem consequencia: ---
# JWT_*        -> desloga todo mundo.
# SECRETS_KEY  -> torna ilegivel todo segredo de canal e de voz ja cifrado.
JWT_ACCESS_SECRET="${segredos.JWT_ACCESS_SECRET}"
JWT_REFRESH_SECRET="${segredos.JWT_REFRESH_SECRET}"
JWT_ACCESS_TTL="15m"
JWT_REFRESH_TTL_DAYS=7
SECRETS_KEY="${segredos.SECRETS_KEY}"

# Admin criado pelo seed. Anote a senha: ela nao aparece em lugar nenhum depois.
SEED_ADMIN_EMAIL="admin@"
SEED_ADMIN_PASSWORD="${segredos.SEED_ADMIN_PASSWORD}"

# Proxy reverso na frente: ligue para o limite por IP ver o IP real do cliente.
TRUST_PROXY=true

# Worker da fila num processo proprio (systemd plataforma-worker). Deixe false
# quando o servico existir; true faz a API consumir a fila junto com o HTTP.
WORKER_EMBUTIDO=false

STORAGE_DIR="./storage"
UPLOAD_MAX_MB=10

# Expurgo automatico pela politica de retencao (LGPD). Desligado por padrao.
LGPD_EXPURGO_AUTOMATICO=false
`;

writeFileSync(destino, conteudo, { encoding: 'utf8', mode: 0o600 });

console.log(`Escrito: ${relative(raiz, destino)} (permissao 600)`);
console.log('');
console.log('Senha do admin:', segredos.SEED_ADMIN_PASSWORD);
console.log('Anote agora — ela e gravada como hash e nao da para recuperar depois.');
console.log('');
console.log('Falta preencher: DATABASE_URL, DIRECT_URL, REDIS_URL, WEB_ORIGIN, SEED_ADMIN_EMAIL.');
