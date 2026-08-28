import { PrismaClient } from '@prisma/client';
import { env } from '../env';
import { AppError } from './errors';
import { contextoAtual } from './tenant';

/**
 * Tabelas com coluna de organizacao — as unicas que a extensao filtra.
 *
 * A lista e explicita, e nao derivada em tempo de execucao, por dois motivos:
 * o Prisma nao expoe o schema no cliente sem custo, e uma lista escrita e o que
 * permite o teste contra erosao (`tenant.schema.test.ts`) comparar com o
 * `schema.prisma` e falhar quando uma tabela nova nao decidir de que lado esta.
 */
const COM_ORGANIZACAO = new Set([
  'User',
  'IntegrationToken',
  'Contact',
  'Conversation',
  'Queue',
  'ChannelConfig',
  'Account',
  'Lead',
  'Funnel',
  'Opportunity',
  'Product',
  'PriceCatalog',
  'Ticket',
  'Campaign',
  'Bot',
  'WorkShift',
  'Branding',
  'RetentionPolicy',
  'VoiceConfig',
  'Message',
  'Call',
  'Survey',
  'LgpdLog',
  'Activity',
]);

/** Operacoes que leem ou alteram por filtro: ganham `where`. */
const FILTRADAS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

/** Operacoes que criam: ganham `data`. */
const CRIACAO = new Set(['create', 'createMany', 'createManyAndReturn']);

const erroSemContexto = () =>
  new AppError(
    500,
    'SEM_CONTEXTO_ORGANIZACAO',
    'Consulta ao banco sem organizacao ativa. Abra o contexto com comOrganizacao, ou declare a excecao com semOrganizacao.',
  );

/** Poe `organizacaoId` em cada objeto de `data`, sem apagar valor explicito. */
function marcarData(data: unknown, organizacaoId: string): unknown {
  if (Array.isArray(data)) return data.map((d: unknown) => marcarData(d, organizacaoId));
  if (!data || typeof data !== 'object') return data;
  const atual = (data as Record<string, unknown>).organizacaoId;
  // Valor explicito diferente do contexto e tentativa de escrever na
  // organizacao alheia — recusa, nao sobrescreve em silencio.
  if (typeof atual === 'string' && atual && atual !== organizacaoId) {
    throw new AppError(
      403,
      'ORGANIZACAO_CRUZADA',
      'Tentativa de gravar em outra organizacao.',
    );
  }
  return { ...(data as Record<string, unknown>), organizacaoId };
}

/** Recusa `data` que aponte para outra organizacao. Nao acrescenta nada. */
function conferirData(data: unknown, organizacaoId: string) {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const atual = (data as Record<string, unknown>).organizacaoId;
    if (typeof atual === 'string' && atual && atual !== organizacaoId) {
      throw new AppError(403, 'ORGANIZACAO_CRUZADA', 'Tentativa de gravar em outra organizacao.');
    }
  }
  return data;
}

/** `Contact` -> `contact`. O cliente expoe os modelos em minuscula inicial. */
const minuscula = (model: string) => model.charAt(0).toLowerCase() + model.slice(1);

const base = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

/**
 * Cliente do Prisma com isolamento por organizacao injetado.
 *
 * Nenhum service menciona organizacao e todos estao isolados: a extensao
 * acrescenta `where: { organizacaoId }` em toda leitura, atualizacao e exclusao
 * das tabelas da lista, e preenche `data.organizacaoId` em toda criacao.
 *
 * A decisao que sustenta tudo: **sem contexto, lanca**. O jeito classico de
 * vazar em multi-tenancy e um filtro opcional que, sem valor, devolve a base
 * inteira. Aqui a consulta nem sai.
 *
 * `findUnique` merece nota: o Prisma exige que o `where` seja uma chave unica,
 * entao acrescentar `organizacaoId` ali seria recusado pelo cliente. Por isso o
 * `findUnique` e reescrito como `findFirst` — mesma semantica de resultado, com
 * a diferenca de que o registro de outra organizacao volta como **nulo**, e o
 * servico responde 404. E o comportamento pedido: 403 confirmaria que o
 * registro existe.
 */
export const prisma = base.$extends({
  name: 'isolamento-por-organizacao',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!COM_ORGANIZACAO.has(model)) return query(args);

        const ctx = contextoAtual();
        if (!ctx) throw erroSemContexto();
        if (ctx.irrestrito) return query(args);

        const organizacaoId = ctx.organizacaoId;

        if (FILTRADAS.has(operation)) {
          const a = args as Record<string, unknown>;
          const where = { ...((a.where as Record<string, unknown>) ?? {}), organizacaoId };

          // Chave unica composta nao aceita campo extra; vira findFirst.
          if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
            const alvo = operation === 'findUnique' ? 'findFirst' : 'findFirstOrThrow';
            return (base as unknown as Record<string, Record<string, (x: unknown) => unknown>>)[
              minuscula(model)
            ]![alvo]!({ ...a, where });
          }

          return query({ ...a, where } as typeof args);
        }

        if (CRIACAO.has(operation)) {
          const a = args as Record<string, unknown>;
          return query({ ...a, data: marcarData(a.data, organizacaoId) } as typeof args);
        }

        // `upsert` e o unico caso em que o `where` fica intocado: ele exige
        // chave unica, e a partir da migration `organizacao_unicidades` toda
        // chave relevante passa a ter `organizacaoId` dentro — ou seja, quem
        // chama ja nomeia a organizacao e o TypeScript cobra. Aqui so o `create`
        // e marcado, e o `update` e conferido contra escrita cruzada.
        if (operation === 'upsert') {
          const a = args as Record<string, unknown>;
          return query({
            ...a,
            create: marcarData(a.create, organizacaoId),
            update: conferirData(a.update, organizacaoId),
          } as typeof args);
        }

        return query(args);
      },
    },
  },
});

/** Cliente sem a extensao. Uso restrito: migrations de dados e o proprio teste. */
export const prismaSemIsolamento = base;
