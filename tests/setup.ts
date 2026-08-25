/**
 * Variaveis minimas para os modulos que importam `env`.
 *
 * `env.ts` valida no import e encerra o processo se algo faltar — por isso os
 * valores precisam existir antes de qualquer import de codigo da API. Nao ha
 * conexao com banco nem Redis: os testes de unidade cobrem funcao pura.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://teste:teste@localhost:5432/teste';
process.env.DIRECT_URL ??= process.env.DATABASE_URL;
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET = 'segredo-de-acesso-para-teste-de-unidade';
process.env.JWT_REFRESH_SECRET = 'segredo-de-refresh-para-teste-de-unidade';
process.env.SECRETS_KEY = '11'.repeat(32);
process.env.STORAGE_DIR = './storage-teste';
// Front compilado, para o teste do modo em que a propria API serve o site.
process.env.STATIC_DIR = 'apps/web/dist';
