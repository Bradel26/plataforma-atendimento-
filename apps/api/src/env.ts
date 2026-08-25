import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET precisa de pelo menos 16 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET precisa de pelo menos 16 caracteres'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  /** Pasta do driver local de storage, relativa ao cwd da API. */
  STORAGE_DIR: z.string().default('./storage'),
  UPLOAD_MAX_MB: z.coerce.number().int().positive().max(100).default(10),
  /** Ligue quando houver proxy reverso na frente (Nginx, Caddy, load balancer). */
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** Chave de 32 bytes em hex para cifrar segredos de canal em repouso. */
  SECRETS_KEY: z.string().regex(/^[0-9a-f]{64}$/, 'SECRETS_KEY precisa ser 64 caracteres hex').optional(),
  SEED_ADMIN_EMAIL: z.string().email().default('admin@plataforma.local'),
  SEED_ADMIN_PASSWORD: z.string().min(8).default('Admin@123'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`Variaveis de ambiente invalidas:\n${issues}\n\nCopie apps/api/.env.example para apps/api/.env`);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';

/**
 * Producao nao sobe com os valores de exemplo.
 *
 * O .env.example existe para o dia 1 e a chance de ele virar producao por
 * descuido e real — e um segredo de JWT publicado no repositorio permite forjar
 * token de administrador. Melhor recusar o arranque do que atender com ele.
 */
if (isProd) {
  const suspeito = (valor: string) => /troque|exemplo|dev-|change-?me|secret123/i.test(valor);
  const problemas: string[] = [];

  if (suspeito(env.JWT_ACCESS_SECRET)) problemas.push('JWT_ACCESS_SECRET ainda e um valor de exemplo');
  if (suspeito(env.JWT_REFRESH_SECRET)) problemas.push('JWT_REFRESH_SECRET ainda e um valor de exemplo');
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    problemas.push('JWT_ACCESS_SECRET e JWT_REFRESH_SECRET precisam ser diferentes');
  }
  if (env.SEED_ADMIN_PASSWORD === 'Admin@123') problemas.push('SEED_ADMIN_PASSWORD ainda e a senha de exemplo');
  if (env.WEB_ORIGIN.includes('localhost')) problemas.push('WEB_ORIGIN aponta para localhost');

  if (problemas.length > 0) {
    console.error(
      `Configuracao insegura para producao:\n${problemas.map((p) => `  - ${p}`).join('\n')}\n\n` +
        'Gere segredos com: openssl rand -hex 32',
    );
    process.exit(1);
  }
}
