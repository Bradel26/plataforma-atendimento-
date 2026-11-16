import { describe, expect, it, vi } from 'vitest';

/*
 * Regressao do defeito achado so com Postgres real: a consulta do Prisma e uma
 * promessa PREGUICOSA (executa no primeiro `.then`). Se `consultarNoBanco` a
 * devolvesse de dentro de `comOrganizacao` sem aguarda-la ali, ela executaria fora
 * do AsyncLocalStorage, sem organizacao, e a extensao de isolamento recusaria.
 *
 * Aqui o `prisma` simulado reproduz essa preguica e, como a extensao real, exige o
 * contexto de organizacao NO MOMENTO em que a consulta executa. O modulo `tenant`
 * e o validador sao os reais.
 */

const consultaSemContexto = vi.fn();

vi.mock('./prisma', () => ({
  prisma: {
    user: {
      findUnique: (args: { where: { id: string } }) => {
        // PrismaPromise: nada acontece ate alguem chamar `.then`.
        return {
          then(ok: (v: unknown) => unknown, falha: (e: unknown) => unknown) {
            return Promise.resolve()
              .then(async () => {
                const { contextoAtual } = await import('./tenant');
                const ctx = contextoAtual();
                if (!ctx || ctx.irrestrito) {
                  consultaSemContexto();
                  throw new Error('SEM_CONTEXTO_ORGANIZACAO');
                }
                return args.where.id === 'u1' && ctx.organizacaoId === 'org-a'
                  ? { sessaoVersao: 2, ativo: true }
                  : null;
              })
              .then(ok, falha);
          },
        };
      },
    },
  },
}));

import { validarSessao } from './sessao';

describe('consultarNoBanco — a consulta preguicosa executa DENTRO do contexto da organizacao', () => {
  it('versao igual: resolve (e nao vira 503 por falta de contexto)', async () => {
    await expect(validarSessao({ sub: 'u1', org: 'org-a', sv: 2 })).resolves.toBeUndefined();
    expect(consultaSemContexto).not.toHaveBeenCalled();
  });

  it('versao diferente: 401, e nao 503', async () => {
    await expect(validarSessao({ sub: 'u1', org: 'org-a', sv: 1 })).rejects.toMatchObject({ status: 401 });
  });

  it('organizacao do token diferente da do usuario: 401 (o filtro devolve nulo), e nao 503', async () => {
    await expect(validarSessao({ sub: 'u1', org: 'org-b', sv: 2 })).rejects.toMatchObject({ status: 401 });
  });
});
