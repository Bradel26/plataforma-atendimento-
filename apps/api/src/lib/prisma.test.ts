import { beforeEach, describe, expect, it, vi } from 'vitest';
import { comOrganizacao } from './tenant';
import { prisma } from './prisma';

/*
 * Testa a extensao de isolamento por organizacao (`prisma.ts`) sem banco real.
 *
 * `@prisma/client` e mockado com um cliente minimo que reimplementa o
 * suficiente de `$extends` para exercitar `$allOperations` de verdade: cada
 * "modelo" fake tem metodos (`findFirst`, `findFirstOrThrow`, ...) que uma
 * consulta encadeada acaba chamando, e o teste inspeciona o `where` que
 * chegou neles -- e exatamente o que expõe o bug do Cenario 6.2 (chave
 * composta virando `Unknown argument` ao passar por `findFirst`).
 */

const { chatPreviewFindFirst, chatPreviewFindFirstOrThrow, userFindFirst } = vi.hoisted(() => {
  const REGISTROS_CHAT_PREVIEW = new Map([
    ['previa-org-a', { id: 'previa-org-a', organizacaoId: 'org-a', canalConfigId: 'canal-1', numero: '5511999999999' }],
    ['previa-org-b', { id: 'previa-org-b', organizacaoId: 'org-b', canalConfigId: 'canal-1', numero: '5511999999999' }],
  ]);
  const REGISTROS_USER = new Map([['user-org-a', { id: 'user-org-a', organizacaoId: 'org-a', email: 'a@x.com' }]]);

  function filtrarLocal<T extends { organizacaoId: string; id?: string }>(
    registros: Map<string, T>,
    where: Record<string, unknown>,
  ): T | null {
    for (const registro of registros.values()) {
      const bate = Object.entries(where).every(([campo, valor]) => (registro as Record<string, unknown>)[campo] === valor);
      if (bate) return registro;
    }
    return null;
  }

  return {
    chatPreviewFindFirst: vi.fn((args: { where: Record<string, unknown> }) => filtrarLocal(REGISTROS_CHAT_PREVIEW, args.where)),
    chatPreviewFindFirstOrThrow: vi.fn((args: { where: Record<string, unknown> }) => {
      const r = filtrarLocal(REGISTROS_CHAT_PREVIEW, args.where);
      if (!r) throw new Error('NotFoundError');
      return r;
    }),
    userFindFirst: vi.fn((args: { where: Record<string, unknown> }) => filtrarLocal(REGISTROS_USER, args.where)),
  };
});

vi.mock('@prisma/client', () => {
  const MODELO_PASCAL: Record<string, string> = { chatPreview: 'ChatPreview', user: 'User' };

  class PrismaClient {
    chatPreview = { findFirst: chatPreviewFindFirst, findFirstOrThrow: chatPreviewFindFirstOrThrow };
    user = { findFirst: userFindFirst };

    $extends(config: { query: { $allModels: { $allOperations: (input: unknown) => unknown } } }) {
      const handler = config.query.$allModels.$allOperations;
      const base = this as unknown as Record<string, Record<string, (x: unknown) => unknown>>;
      const proxy: Record<string, unknown> = {};
      for (const nomeMinusculo of Object.keys(MODELO_PASCAL)) {
        const nomeModelo = MODELO_PASCAL[nomeMinusculo]!;
        proxy[nomeMinusculo] = new Proxy(
          {},
          {
            get: (_t, operation: string) => (args: unknown) =>
              handler({
                model: nomeModelo,
                operation,
                args,
                query: (finalArgs: unknown) => base[nomeMinusculo]![operation]!(finalArgs),
              }),
          },
        );
      }
      return proxy;
    }
  }
  return { PrismaClient };
});

describe('extensao de isolamento por organizacao — findUnique/findUniqueOrThrow', () => {
  beforeEach(() => {
    chatPreviewFindFirst.mockClear();
    chatPreviewFindFirstOrThrow.mockClear();
    userFindFirst.mockClear();
  });

  it('findUnique com chave simples: funciona e aplica organizacaoId', async () => {
    const resultado = await comOrganizacao('org-a', () => prisma.user.findUnique({ where: { id: 'user-org-a' } }));

    expect(resultado).toMatchObject({ id: 'user-org-a' });
    expect(userFindFirst).toHaveBeenCalledWith({ where: { id: 'user-org-a', organizacaoId: 'org-a' } });
  });

  it('findUnique com chave composta: desembrulha os campos reais em vez de mandar o nome sintetico', async () => {
    const resultado = await comOrganizacao('org-a', () =>
      prisma.chatPreview.findUnique({
        where: { canalConfigId_numero: { canalConfigId: 'canal-1', numero: '5511999999999' } },
      }),
    );

    expect(resultado).toMatchObject({ id: 'previa-org-a' });
    // O `where` que chega no findFirst NAO pode conter a chave sintetica
    // `canalConfigId_numero` — e exatamente isso que o Prisma rejeitava.
    expect(chatPreviewFindFirst).toHaveBeenCalledWith({
      where: { canalConfigId: 'canal-1', numero: '5511999999999', organizacaoId: 'org-a' },
    });
  });

  it('findUniqueOrThrow com chave composta: mesmo desembrulho, via findFirstOrThrow', async () => {
    const resultado = await comOrganizacao('org-a', () =>
      prisma.chatPreview.findUniqueOrThrow({
        where: { canalConfigId_numero: { canalConfigId: 'canal-1', numero: '5511999999999' } },
      }),
    );

    expect(resultado).toMatchObject({ id: 'previa-org-a' });
    expect(chatPreviewFindFirstOrThrow).toHaveBeenCalledWith({
      where: { canalConfigId: 'canal-1', numero: '5511999999999', organizacaoId: 'org-a' },
    });
  });

  it('organizacao A nao acessa registro da organizacao B, mesmo com a MESMA chave composta', async () => {
    // Mesma canalConfigId+numero existe nas duas organizacoes (dados de teste
    // de proposito iguais) — só o organizacaoId do contexto decide.
    const resultado = await comOrganizacao('org-b', () =>
      prisma.chatPreview.findUnique({
        where: { canalConfigId_numero: { canalConfigId: 'canal-1', numero: '5511999999999' } },
      }),
    );

    expect(resultado).toMatchObject({ id: 'previa-org-b' });

    const cruzado = await comOrganizacao('org-a', async () => {
      // Simula uma tentativa de acessar o registro que pertence a org-b,
      // usando a MESMA chave composta: o filtro de organizacaoId deve
      // devolver o registro de org-a (nao o de org-b) ou null, nunca vazar.
      const r = await prisma.chatPreview.findUnique({
        where: { canalConfigId_numero: { canalConfigId: 'canal-1', numero: '5511999999999' } },
      });
      return r;
    });
    expect(cruzado).toMatchObject({ id: 'previa-org-a' });
    expect(cruzado?.organizacaoId).not.toBe('org-b');
  });

  it('sem contexto de organizacao, lanca em vez de consultar sem filtro', async () => {
    await expect(prisma.chatPreview.findUnique({ where: { id: 'previa-org-a' } })).rejects.toThrow();
    expect(chatPreviewFindFirst).not.toHaveBeenCalled();
  });
});
