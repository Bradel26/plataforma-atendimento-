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
