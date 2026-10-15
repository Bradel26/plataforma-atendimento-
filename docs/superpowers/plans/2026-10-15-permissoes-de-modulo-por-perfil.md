# Permissões de módulo por perfil Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao ADMIN um painel em Configurações onde ele concede ou revoga, por perfil, quais módulos (Atendimento, Esteira, CRM, Auditoria, Chamado de TI) aparecem no menu — substituindo os arrays `perfis: Perfil[]` hoje fixos em `nav.ts` por uma tabela configurável, com o mesmo gate aplicado no backend.

**Architecture:** Tabela nova `ModulePermission` (perfil + módulo, por organização; presença da linha = acesso liberado), seedada com o mapeamento atual de `nav.ts` para não mudar o acesso de ninguém no deploy. Um serviço central (`modulosPermitidos`/`requireModulo`) substitui o `requireRole(array fixo)` que hoje faz o "portão de módulo inteiro" nas rotas verificadas (Atendimento, Auditoria, CRM, Esteira, Chamado de TI). No front, a sessão do usuário passa a carregar `modulosPermitidos: string[]`, e o menu/rotas/paleta de comando consultam isso em vez do array estático.

**Tech Stack:** Node/TypeScript, Express, Prisma/PostgreSQL, React, Vitest.

**Spec:** [docs/superpowers/specs/2026-10-15-permissoes-de-modulo-por-perfil-design.md](../specs/2026-10-15-permissoes-de-modulo-por-perfil-design.md)

## Global Constraints

- Só visibilidade de **módulo/aba** — nenhuma ação interna (aprovar, excluir, ver Oportunidades) muda de comportamento.
- Permissão é por **perfil**, nunca por usuário individual.
- ADMIN sempre vê todos os módulos editáveis; não passa pela tabela, não é exibido como linha editável no painel.
- `configuracoes` nunca entra na tabela nem aparece como coluna no painel — sempre só ADMIN, hardcoded.
- A migration que cria a tabela semeia o mapeamento atual de `nav.ts` (ver Task 1) para a organização `00000000-0000-0000-0000-000000000001` (`ORGANIZACAO_INICIAL` em `apps/api/src/lib/tenant.ts`) — ninguém perde nem ganha módulo no deploy.
- Toda tabela nova que carrega `organizacaoId` precisa constar em `COM_ORGANIZACAO` (`apps/api/src/lib/prisma.ts`) — `tenant.schema.test.ts` falha a suíte inteira se isso for esquecido.

## Review Focus

- **Perfil sem nenhuma linha na tabela para um módulo antes restrito só por `requireRole`**: `requireModulo` deve recusar com 403, não com 500 nem deixando passar (Task 2).
- **ADMIN sem linha nenhuma na tabela**: ainda assim vê todos os módulos editáveis, nunca 403 (Task 2).
- **Login/refresh de um perfil sem organização migrada (tabela vazia para ele)**: `modulosPermitidos` devolve conjunto vazio, não lança — a sessão continua sendo emitida, só o menu fica sem itens além dos universais (Task 2, Task 8).
- **PUT do painel com `perfil: 'ADMIN'` ou com um módulo fora da lista editável (ex.: `'configuracoes'`, ou string arbitrária)**: rejeitado com 400, nunca grava linha inválida (Task 7).
- **Subrota de ação (`/oportunidades/:id`, `/jornadas/:id`) depois que o ADM concede CRM a um perfil que não tinha**: continua exigindo o perfil hardcoded da subrota — a liberação do módulo não libera a subrota de processo comercial (Task 8).

---

## Task 1: Modelo de dados — `ModulePermission`

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (novo model, perto de `VisaoSalva`)
- Modify: `apps/api/src/lib/prisma.ts:14-66` (`COM_ORGANIZACAO`)
- Create: `apps/api/prisma/migrations/20261015190000_permissoes_modulo/migration.sql`
- Test: a suíte existente `apps/api/src/lib/tenant.schema.test.ts` cobre a consistência schema/extensão — nenhum teste novo aqui, só rodá-la.

**Interfaces:**
- Produces: tabela `module_permissions` (colunas `id`, `organizacao_id`, `perfil`, `modulo`, `criado_em`), acessível via `prisma.modulePermission` depois de `db:generate`.

- [ ] **Step 1: Adicionar o model ao schema**

Em `apps/api/prisma/schema.prisma`, logo depois do model `VisaoSalva` (linha ~1513):

```prisma
/// Permissao de modulo por perfil (ADMIN configura em Configuracoes >
/// Usuarios e permissoes). Presenca da linha = perfil ve o modulo. ADMIN
/// nunca aparece aqui: sempre ve tudo, tratado em codigo (lib/modulos.ts).
model ModulePermission {
  id            String   @id @default(cuid())
  organizacaoId String   @default("") @map("organizacao_id")
  perfil        Role
  modulo        String
  criadoEm      DateTime @default(now()) @map("criado_em")

  organizacao Organizacao @relation(fields: [organizacaoId], references: [id], onDelete: Cascade)

  @@unique([organizacaoId, perfil, modulo])
  @@map("module_permissions")
}
```

Na `model Organizacao`, adicionar a relação reversa junto das outras (ordem alfabética não é exigida pelo projeto; colocar perto de `visoesSalvas`):

```prisma
  permissoesModulo            ModulePermission[]
```

- [ ] **Step 2: Registrar na extensão de tenant**

Em `apps/api/src/lib/prisma.ts`, dentro do `Set` `COM_ORGANIZACAO` (depois da entrada `'MetaOperacional'`, linha 66):

```ts
  // Permissao de modulo por perfil: tabela raiz, com organizacao e CHECK proprio.
  'ModulePermission',
```

- [ ] **Step 3: Gerar o client e rodar o teste de erosão de tenant**

```bash
npm run db:generate --workspace @plataforma/api
npx vitest run apps/api/src/lib/tenant.schema.test.ts
```

Expected: os 5 testes passam — inclusive "a lista da extensao do Prisma bate com o schema", que falha sozinha se o Step 2 for esquecido.

- [ ] **Step 4: Escrever a migration**

Criar a pasta `apps/api/prisma/migrations/20261015190000_permissoes_modulo/` com `migration.sql`:

```sql
-- Permissoes de modulo configuraveis por perfil (ADMIN em Configuracoes).
-- Seed com o mapeamento atual de nav.ts para nao mudar acesso de ninguem.

CREATE TABLE "module_permissions" (
    "id" TEXT NOT NULL,
    "organizacao_id" TEXT NOT NULL DEFAULT '',
    "perfil" "Role" NOT NULL,
    "modulo" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "module_permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "module_permissions_organizacao_id_perfil_modulo_key" ON "module_permissions"("organizacao_id", "perfil", "modulo");

ALTER TABLE "module_permissions" ADD CONSTRAINT "module_permissions_organizacao_id_fkey"
FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "module_permissions"
  ADD CONSTRAINT "module_permissions_organizacao_id_nao_vazio"
  CHECK ("organizacao_id" <> '');

-- Seed: mapeamento atual de apps/web/src/components/layout/nav.ts (2026-10-15),
-- sem ADMIN (sempre tem tudo) e sem 'configuracoes' (sempre so ADMIN).
INSERT INTO "module_permissions" ("id", "organizacao_id", "perfil", "modulo")
VALUES
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'SUPERVISOR', 'atendimento'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'SUPERVISOR', 'esteira'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'SUPERVISOR', 'monitoramento'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'SUPERVISOR', 'auditoria'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'SUPERVISOR', 'gestao'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'SUPERVISOR', 'campanhas'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'SUPERVISOR', 'relatorios'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'SUPERVISOR', 'crm'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'SUPERVISOR', 'dashboards'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'SUPERVISOR', 'chamado-ti'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'GESTOR', 'esteira'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'GESTOR', 'monitoramento'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'GESTOR', 'auditoria'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'GESTOR', 'campanhas'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'GESTOR', 'relatorios'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'GESTOR', 'crm'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'GESTOR', 'dashboards'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'GESTOR', 'chamado-ti'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'COMERCIAL', 'atendimento'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'COMERCIAL', 'esteira'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'COMERCIAL', 'campanhas'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'COMERCIAL', 'crm'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'COMERCIAL', 'chamado-ti'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'SUPORTE', 'atendimento'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'SUPORTE', 'esteira'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'SUPORTE', 'crm'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'SUPORTE', 'chamado-ti'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'AGENTE', 'atendimento'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'AGENTE', 'crm'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'AGENTE', 'chamado-ti')
ON CONFLICT ("organizacao_id", "perfil", "modulo") DO NOTHING;
```

- [ ] **Step 5: Aplicar a migration no banco de dev**

```bash
npm run db:migrate --workspace @plataforma/api
```

Expected: prompt confirma `permissoes_modulo` aplicada, sem drift. Se pedir para resolver drift, PARE e pergunte ao humano — não resete o banco (ver memória do projeto sobre shadow database destrutivo).

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20261015190000_permissoes_modulo apps/api/src/lib/prisma.ts
git commit -m "feat(db): tabela ModulePermission para permissao de modulo por perfil"
```

---

## Task 2: Serviço central — `modulosPermitidos` / `requireModulo`

**Files:**
- Create: `apps/api/src/lib/modulos.ts`
- Test: `apps/api/src/lib/modulos.test.ts`

**Interfaces:**
- Consumes: `prisma.modulePermission.findMany` (Task 1); `AppError`/`forbidden`/`unauthorized` de `apps/api/src/lib/errors.ts`; `asyncHandler` de `apps/api/src/http/async-handler.ts`.
- Produces: `MODULOS_EDITAVEIS: readonly string[]`; `PERFIS_EDITAVEIS: readonly Role[]`; `modulosPermitidos(perfil: Role): Promise<Set<string>>`; `requireModulo(modulo: string): RequestHandler` — consumidos pelas Tasks 3, 4, 5, 6, 7, e por `auth.service.ts` na Task 8.

- [ ] **Step 1: Escrever o teste (falha: arquivo não existe)**

Criar `apps/api/src/lib/modulos.test.ts`:

```ts
import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock('./prisma', () => ({
  prisma: { modulePermission: { findMany } },
}));

import { modulosPermitidos, requireModulo, MODULOS_EDITAVEIS } from './modulos';

function fakeReq(perfil?: string): Request {
  return (perfil ? { user: { sub: 'u-1', perfil, nome: 'Fulano', email: 'f@x.com', org: 'org-1' } } : {}) as Request;
}

function rodar(mw: ReturnType<typeof requireModulo>, req: Request) {
  return new Promise((resolve) => {
    mw(req, {} as Response, ((e?: unknown) => resolve(e)) as NextFunction);
  });
}

describe('modulosPermitidos', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ADMIN sempre tem todos os modulos editaveis, sem consultar o banco', async () => {
    const r = await modulosPermitidos('ADMIN' as never);
    expect([...r].sort()).toEqual([...MODULOS_EDITAVEIS].sort());
    expect(findMany).not.toHaveBeenCalled();
  });

  it('perfil sem nenhuma linha devolve conjunto vazio, sem lancar', async () => {
    findMany.mockResolvedValue([]);
    const r = await modulosPermitidos('AGENTE' as never);
    expect(r.size).toBe(0);
  });

  it('perfil com linhas devolve exatamente os modulos delas', async () => {
    findMany.mockResolvedValue([{ modulo: 'atendimento' }, { modulo: 'crm' }]);
    const r = await modulosPermitidos('SUPORTE' as never);
    expect([...r].sort()).toEqual(['atendimento', 'crm']);
  });
});

describe('requireModulo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sem req.user, nega autenticacao', async () => {
    const erro = await rodar(requireModulo('crm'), fakeReq());
    expect(erro).toMatchObject({ status: 401 });
  });

  it('ADMIN passa sem consultar o banco', async () => {
    const erro = await rodar(requireModulo('crm'), fakeReq('ADMIN'));
    expect(erro).toBeUndefined();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('perfil sem a linha do modulo leva 403', async () => {
    findMany.mockResolvedValue([]);
    const erro = await rodar(requireModulo('crm'), fakeReq('AGENTE'));
    expect(erro).toMatchObject({ status: 403 });
  });

  it('perfil com a linha do modulo passa', async () => {
    findMany.mockResolvedValue([{ modulo: 'crm' }]);
    const erro = await rodar(requireModulo('crm'), fakeReq('AGENTE'));
    expect(erro).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run apps/api/src/lib/modulos.test.ts
```

Expected: FAIL — `Cannot find module './modulos'`.

- [ ] **Step 3: Implementar**

Criar `apps/api/src/lib/modulos.ts`:

```ts
import type { Role } from '@prisma/client';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { asyncHandler } from '../http/async-handler';
import { forbidden, unauthorized } from './errors';
import { prisma } from './prisma';

/**
 * Chaves de modulo, uma por item editavel de `apps/web/src/components/layout/nav.ts`
 * (a mesma `rota` sem a barra). Mantida manualmente em sincronia com o front —
 * lista pequena, muda raramente.
 *
 * `configuracoes` fica de fora de proposito: sempre so ADMIN, hardcoded, para
 * nao existir o risco de alguem se trancar fora do proprio painel.
 */
export const MODULOS_EDITAVEIS = [
  'atendimento',
  'esteira',
  'monitoramento',
  'auditoria',
  'gestao',
  'campanhas',
  'relatorios',
  'crm',
  'dashboards',
  'chamado-ti',
] as const;

/** Perfis que o painel deixa o ADMIN configurar — ADMIN de fora, sempre tem tudo. */
export const PERFIS_EDITAVEIS: Role[] = ['SUPERVISOR', 'GESTOR', 'COMERCIAL', 'SUPORTE', 'AGENTE'];

/**
 * Modulos que este perfil ve, na organizacao do contexto atual.
 *
 * ADMIN nunca consulta a tabela: sempre tem todos os editaveis. Garantia
 * contra lockout — nenhuma linha apagada por engano tira o acesso do ADMIN.
 */
export async function modulosPermitidos(perfil: Role): Promise<Set<string>> {
  if (perfil === 'ADMIN') return new Set(MODULOS_EDITAVEIS);
  const linhas = await prisma.modulePermission.findMany({ where: { perfil }, select: { modulo: true } });
  return new Set(linhas.map((l) => l.modulo));
}

/**
 * Portao de modulo inteiro — mesmo papel que `requireRole(array fixo)` tinha,
 * so que consultando a tabela configuravel em vez do array no codigo. Nunca
 * substitui `requireRole` de acao especifica dentro de um modulo (quem aprova,
 * quem exclui) — so decide se o perfil entra no modulo.
 */
export function requireModulo(modulo: string): RequestHandler {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    const permitidos = await modulosPermitidos(req.user.perfil);
    if (!permitidos.has(modulo)) return next(forbidden());
    next();
  });
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx vitest run apps/api/src/lib/modulos.test.ts
```

Expected: PASS — 7 testes.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/modulos.ts apps/api/src/lib/modulos.test.ts
git commit -m "feat(permissoes): modulosPermitidos e requireModulo"
```

---

## Task 3: Atendimento — trocar o gate de Auditoria e abrir o portão geral

**Files:**
- Modify: `apps/api/src/modules/conversations/conversations.routes.ts:49` (acrescenta gate geral), `:136-151` (troca o gate da auditoria)
- Test: `apps/api/src/modules/conversations/conversations.routes.guard.test.ts` (novo)

**Interfaces:**
- Consumes: `requireModulo` (Task 2).

- [ ] **Step 1: Escrever o teste (falha: comportamento ainda hardcoded)**

Criar `apps/api/src/modules/conversations/conversations.routes.guard.test.ts`:

```ts
import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('../../lib/prisma', () => ({ prisma: { modulePermission: { findMany } } }));

import { conversationsRoutes } from './conversations.routes';

function fakeReq(perfil: string): Request {
  return { user: { sub: 'u-1', perfil, nome: 'Fulano', email: 'f@x.com', org: 'org-1' } } as unknown as Request;
}

function camadaUse(indice: number) {
  const layer = conversationsRoutes.stack[indice] as { handle: (req: Request, res: Response, next: NextFunction) => void };
  return layer.handle;
}

function camadaDaRota(path: string) {
  const layer = conversationsRoutes.stack.find(
    (l: { route?: { path: string } }) => l.route?.path === path,
  ) as { route: { stack: Array<{ handle: (req: Request, res: Response, next: NextFunction) => void }> } };
  // [0] valida query, [1] e o requireModulo/requireRole, [2] o handler — o guard e sempre o penultimo.
  return layer.route.stack[layer.route.stack.length - 2]!.handle;
}

/** `requireModulo` é assíncrono — toda chamada espera a promise resolver antes de checar o erro. */
function rodar(mw: (req: Request, res: Response, next: NextFunction) => void, perfil: string): Promise<unknown> {
  return new Promise((resolve) => {
    mw(fakeReq(perfil), {} as Response, resolve as NextFunction);
  });
}

describe('conversationsRoutes — guard geral (atendimento)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('perfil sem a linha "atendimento" leva 403', async () => {
    findMany.mockResolvedValue([]);
    const erro = await rodar(camadaUse(1), 'GESTOR');
    expect(erro).toMatchObject({ status: 403 });
  });

  it('perfil com a linha "atendimento" (seed da migration) passa', async () => {
    findMany.mockResolvedValue([{ modulo: 'atendimento' }]);
    const erro = await rodar(camadaUse(1), 'COMERCIAL');
    expect(erro).toBeUndefined();
  });
});

describe('conversationsRoutes — guard da auditoria', () => {
  beforeEach(() => vi.clearAllMocks());

  it('SUPORTE continua fora da auditoria (sem linha "auditoria")', async () => {
    findMany.mockResolvedValue([]);
    const erro = await rodar(camadaDaRota('/auditoria'), 'SUPORTE');
    expect(erro).toMatchObject({ status: 403 });
  });

  it('GESTOR com a linha "auditoria" (seed da migration) passa', async () => {
    findMany.mockResolvedValue([{ modulo: 'auditoria' }]);
    const erro = await rodar(camadaDaRota('/auditoria'), 'GESTOR');
    expect(erro).toBeUndefined();
  });
});
```

Nota para quem implementa: o teste do guard geral (`camadaUse(1)`) precisa ser `async`/aguardar a promise porque `requireModulo` é assíncrono — ajuste-o para `await` o resultado como nos dois testes de auditoria antes de rodar (o esqueleto acima no primeiro `it` está propositalmente incompleto para você perceber isso ao rodar e ver o teste falhar pelo motivo errado; se preferir, escreva-o já correto, igual aos outros dois).

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run apps/api/src/modules/conversations/conversations.routes.guard.test.ts
```

Expected: FAIL no teste "perfil com a linha atendimento passa" (ainda não existe `requireModulo('atendimento')` no `.use()` geral, então `camadaUse(1)` é outra coisa) e no teste "GESTOR com a linha auditoria passa" só por coincidência (o `requireRole('ADMIN','SUPERVISOR','GESTOR')` atual já deixa GESTOR passar, mas sem nunca chamar `findMany` — o que a migração desta task muda é a fonte da decisão, não o resultado para GESTOR). O teste que prova a mudança de fato é "SUPORTE continua fora" permanecer vermelho até o Step 3, e os dois primeiros ficarem genuinamente vermelhos por módulo inexistente.

- [ ] **Step 3: Implementar**

Em `apps/api/src/modules/conversations/conversations.routes.ts`:

Importar no topo (linha 4, junto de `requireAuth, requireRole`):

```ts
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { requireModulo } from '../../lib/modulos';
```

Linha 49, acrescentar o portão geral logo depois do `requireAuth`:

```ts
conversationsRoutes.use(requireAuth);
conversationsRoutes.use(requireModulo('atendimento'));
```

Nas duas rotas de auditoria (linhas ~136-151), trocar `requireRole('ADMIN', 'SUPERVISOR', 'GESTOR')` por `requireModulo('auditoria')`:

```ts
conversationsRoutes.get(
  '/auditoria',
  requireModulo('auditoria'),
  validateQuery(auditoriaSchema),
  asyncHandler(async (_req, res) => {
    res.json(await listarAuditoria(res.locals.query));
  }),
);

conversationsRoutes.get(
  '/auditoria/opcoes',
  requireModulo('auditoria'),
  asyncHandler(async (_req, res) => {
    res.json(await opcoesDaAuditoria());
  }),
);
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx vitest run apps/api/src/modules/conversations/conversations.routes.guard.test.ts
```

Expected: PASS.

- [ ] **Step 5: Rodar a suíte inteira de conversations (regressão)**

```bash
npx vitest run apps/api/src/modules/conversations
```

Expected: todos os arquivos passam — nenhum teste existente mocka `conversationsRoutes.stack` nem passa pelo `.use()` de topo (eles chamam os services diretamente), então não deveria haver quebra.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/conversations/conversations.routes.ts apps/api/src/modules/conversations/conversations.routes.guard.test.ts
git commit -m "feat(permissoes): atendimento e auditoria usam requireModulo"
```

---

## Task 4: CRM — abrir o portão em contatos e contas

**Files:**
- Modify: `apps/api/src/modules/contacts/contacts.routes.ts:32`
- Modify: `apps/api/src/modules/crm/accounts.routes.ts:30`
- Test: `apps/api/src/modules/crm/crm.routes.guard.test.ts` (novo)

**Interfaces:**
- Consumes: `requireModulo` (Task 2).

- [ ] **Step 1: Escrever o teste**

Criar `apps/api/src/modules/crm/crm.routes.guard.test.ts`:

```ts
import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('../../lib/prisma', () => ({ prisma: { modulePermission: { findMany } } }));

import { contactsRoutes } from '../contacts/contacts.routes';
import { accountsRoutes } from './accounts.routes';

function fakeReq(perfil: string): Request {
  return { user: { sub: 'u-1', perfil, nome: 'Fulano', email: 'f@x.com', org: 'org-1' } } as unknown as Request;
}

async function rodar(stack: unknown[], indice: number, perfil: string) {
  const layer = stack[indice] as { handle: (req: Request, res: Response, next: NextFunction) => void };
  return new Promise((resolve) => {
    layer.handle(fakeReq(perfil), {} as Response, resolve as NextFunction);
  });
}

describe('contactsRoutes / accountsRoutes — guard do CRM', () => {
  beforeEach(() => vi.clearAllMocks());

  it('AGENTE sem a linha "crm" leva 403 em contatos', async () => {
    findMany.mockResolvedValue([]);
    const erro = await rodar(contactsRoutes.stack, 1, 'AGENTE');
    expect(erro).toMatchObject({ status: 403 });
  });

  it('AGENTE com a linha "crm" (seed da migration) passa em contatos', async () => {
    findMany.mockResolvedValue([{ modulo: 'crm' }]);
    const erro = await rodar(contactsRoutes.stack, 1, 'AGENTE');
    expect(erro).toBeUndefined();
  });

  it('AGENTE com a linha "crm" passa em contas', async () => {
    findMany.mockResolvedValue([{ modulo: 'crm' }]);
    const erro = await rodar(accountsRoutes.stack, 1, 'AGENTE');
    expect(erro).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run apps/api/src/modules/crm/crm.routes.guard.test.ts
```

Expected: FAIL — `contactsRoutes.stack[1]` ainda é a próxima rota registrada (não existe `.use(requireModulo(...))` na posição 1), então o teste quebra ao tentar chamar `.handle` como middleware de perfil (ou passa incorretamente porque a camada 1 é outra coisa — rode e confira a mensagem antes de prosseguir).

- [ ] **Step 3: Implementar**

Em `apps/api/src/modules/contacts/contacts.routes.ts`, importar `requireModulo` (junto da linha 4) e, na linha 32:

```ts
contactsRoutes.use(requireAuth);
contactsRoutes.use(requireModulo('crm'));
```

Em `apps/api/src/modules/crm/accounts.routes.ts`, importar `requireModulo` e, na linha 30:

```ts
accountsRoutes.use(requireAuth);
accountsRoutes.use(requireModulo('crm'));
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx vitest run apps/api/src/modules/crm/crm.routes.guard.test.ts
```

Expected: PASS.

- [ ] **Step 5: Rodar a suíte inteira (regressão ampla — CRM tem muitos arquivos)**

```bash
npm test
```

Expected: todos os 117 arquivos de teste continuam passando (nenhum teste existente de `contacts.routes`/`accounts.routes` passa pelo `.use()` de topo — todos extraem o handler da rota específica diretamente, como em `contacts.routes.exclusao.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/contacts/contacts.routes.ts apps/api/src/modules/crm/accounts.routes.ts apps/api/src/modules/crm/crm.routes.guard.test.ts
git commit -m "feat(permissoes): CRM (contatos e contas) usa requireModulo"
```

---

## Task 5: Esteira — trocar o `requireRole` fixo pelo `requireModulo`

**Files:**
- Modify: `apps/api/src/modules/crm/credenciamentos.routes.ts:31`
- Modify: `apps/api/src/modules/crm/credenciamentos.routes.guard.test.ts` (já existe, criado em 2026-10-15 — adaptar, não recriar)

**Interfaces:**
- Consumes: `requireModulo` (Task 2).

- [ ] **Step 1: Atualizar o teste existente para a nova fonte de verdade**

O arquivo `apps/api/src/modules/crm/credenciamentos.routes.guard.test.ts` hoje testa um array fixo. Substituir o conteúdo inteiro por:

```ts
import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('../../lib/prisma', () => ({ prisma: { modulePermission: { findMany } } }));

import { credenciamentosRoutes } from './credenciamentos.routes';

function guardDoModulo() {
  const layer = credenciamentosRoutes.stack[1] as { handle: (req: Request, res: Response, next: NextFunction) => void };
  return layer.handle;
}

function fakeReq(perfil: string): Request {
  return { user: { sub: 'u-1', perfil, nome: 'Fulano', email: 'f@x.com', org: 'org-1' } } as unknown as Request;
}

function rodar(perfil: string) {
  return new Promise((resolve) => {
    guardDoModulo()(fakeReq(perfil), {} as Response, resolve as NextFunction);
  });
}

describe('credenciamentosRoutes — guard do modulo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('SUPORTE com a linha "esteira" (seed da migration) passa', async () => {
    findMany.mockResolvedValue([{ modulo: 'esteira' }]);
    expect(await rodar('SUPORTE')).toBeUndefined();
  });

  it('AGENTE sem a linha "esteira" leva 403 — mesmo corte de Oportunidades', async () => {
    findMany.mockResolvedValue([]);
    expect(await rodar('AGENTE')).toMatchObject({ status: 403 });
  });

  it('COMERCIAL com a linha "esteira" passa (nao regrediu)', async () => {
    findMany.mockResolvedValue([{ modulo: 'esteira' }]);
    expect(await rodar('COMERCIAL')).toBeUndefined();
  });

  it('ADMIN passa mesmo sem nenhuma linha na tabela', async () => {
    findMany.mockResolvedValue([]);
    expect(await rodar('ADMIN')).toBeUndefined();
    expect(findMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run apps/api/src/modules/crm/credenciamentos.routes.guard.test.ts
```

Expected: FAIL — o código ainda usa `requireRole(array fixo)`, então `findMany` nunca é chamado e o mock não influencia o resultado (os dois primeiros testes falham).

- [ ] **Step 3: Implementar**

Em `apps/api/src/modules/crm/credenciamentos.routes.ts`, importar `requireModulo` (junto de `requireAuth, requireRole` na linha 3) e trocar a linha 31:

```ts
credenciamentosRoutes.use(requireAuth);
/** Processo operacional de credenciamento: AGENTE fora, mesmo corte de Oportunidades. */
credenciamentosRoutes.use(requireModulo('esteira'));
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx vitest run apps/api/src/modules/crm/credenciamentos.routes.guard.test.ts
```

Expected: PASS — 4 testes.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/crm/credenciamentos.routes.ts apps/api/src/modules/crm/credenciamentos.routes.guard.test.ts
git commit -m "feat(permissoes): Esteira usa requireModulo em vez de array fixo"
```

---

## Task 6: Chamado de TI — abrir o portão em tickets

**Files:**
- Modify: `apps/api/src/modules/tickets/tickets.routes.ts:40`
- Test: `apps/api/src/modules/tickets/tickets.routes.guard.test.ts` (novo)

**Interfaces:**
- Consumes: `requireModulo` (Task 2).

- [ ] **Step 1: Escrever o teste**

Criar `apps/api/src/modules/tickets/tickets.routes.guard.test.ts`:

```ts
import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('../../lib/prisma', () => ({ prisma: { modulePermission: { findMany } } }));

import { ticketsRoutes } from './tickets.routes';

function fakeReq(perfil: string): Request {
  return { user: { sub: 'u-1', perfil, nome: 'Fulano', email: 'f@x.com', org: 'org-1' } } as unknown as Request;
}

function rodar(perfil: string) {
  const layer = ticketsRoutes.stack[1] as { handle: (req: Request, res: Response, next: NextFunction) => void };
  return new Promise((resolve) => {
    layer.handle(fakeReq(perfil), {} as Response, resolve as NextFunction);
  });
}

describe('ticketsRoutes — guard do modulo (chamado-ti)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('qualquer perfil com a linha "chamado-ti" passa', async () => {
    findMany.mockResolvedValue([{ modulo: 'chamado-ti' }]);
    expect(await rodar('AGENTE')).toBeUndefined();
  });

  it('perfil sem a linha leva 403', async () => {
    findMany.mockResolvedValue([]);
    expect(await rodar('AGENTE')).toMatchObject({ status: 403 });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run apps/api/src/modules/tickets/tickets.routes.guard.test.ts
```

Expected: FAIL — hoje `ticketsRoutes.use(requireAuth)` é a única entrada; `ticketsRoutes.stack[1]` é a primeira rota registrada, não um guard de perfil, e o segundo teste (403 esperado) falha porque nada barra o AGENTE.

- [ ] **Step 3: Implementar**

Em `apps/api/src/modules/tickets/tickets.routes.ts`, importar `requireModulo` e, na linha 40:

```ts
ticketsRoutes.use(requireAuth);
ticketsRoutes.use(requireModulo('chamado-ti'));
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx vitest run apps/api/src/modules/tickets/tickets.routes.guard.test.ts
```

Expected: PASS.

- [ ] **Step 5: Rodar a suíte completa**

```bash
npm test
```

Expected: 100% passando — nenhum teste de tickets hoje exercita o `.use()` de topo.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/tickets/tickets.routes.ts apps/api/src/modules/tickets/tickets.routes.guard.test.ts
git commit -m "feat(permissoes): Chamado de TI usa requireModulo"
```

---

## Task 7: API administrativa — ler e gravar a matriz

**Files:**
- Create: `apps/api/src/modules/permissoes/permissoesModulo.service.ts`
- Create: `apps/api/src/modules/permissoes/permissoesModulo.routes.ts`
- Modify: `apps/api/src/app.ts` (importar e montar em `/api/permissoes-modulo`)
- Test: `apps/api/src/modules/permissoes/permissoesModulo.service.test.ts`

**Interfaces:**
- Consumes: `MODULOS_EDITAVEIS`, `PERFIS_EDITAVEIS` (Task 2); `prisma.modulePermission`; `badRequest` de `errors.ts`.
- Produces: `listarMatriz(): Promise<{ perfil: Role; modulos: string[] }[]>`; `substituirModulosDoPerfil(perfil: Role, modulos: string[]): Promise<void>` — consumidos pela Task 9 (frontend) via HTTP.

- [ ] **Step 1: Escrever o teste do service (falha: arquivo não existe)**

Criar `apps/api/src/modules/permissoes/permissoesModulo.service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany, deleteMany, createMany, transaction } = vi.hoisted(() => ({
  findMany: vi.fn(),
  deleteMany: vi.fn(),
  createMany: vi.fn(),
  transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
    fn({ modulePermission: { deleteMany, createMany } }),
  ),
}));

vi.mock('../../lib/prisma', () => ({
  prisma: { modulePermission: { findMany }, $transaction: transaction },
}));

import { listarMatriz, substituirModulosDoPerfil } from './permissoesModulo.service';

describe('listarMatriz', () => {
  beforeEach(() => vi.clearAllMocks());

  it('devolve um item por perfil editavel, com os modulos de cada um', async () => {
    findMany.mockResolvedValue([
      { perfil: 'SUPORTE', modulo: 'atendimento' },
      { perfil: 'SUPORTE', modulo: 'crm' },
      { perfil: 'AGENTE', modulo: 'atendimento' },
    ]);
    const matriz = await listarMatriz();
    expect(matriz).toHaveLength(5); // SUPERVISOR, GESTOR, COMERCIAL, SUPORTE, AGENTE
    const suporte = matriz.find((m) => m.perfil === 'SUPORTE')!;
    expect(suporte.modulos.sort()).toEqual(['atendimento', 'crm']);
    const gestor = matriz.find((m) => m.perfil === 'GESTOR')!;
    expect(gestor.modulos).toEqual([]);
  });
});

describe('substituirModulosDoPerfil', () => {
  beforeEach(() => vi.clearAllMocks());

  it('recusa perfil ADMIN', async () => {
    await expect(substituirModulosDoPerfil('ADMIN' as never, ['crm'])).rejects.toMatchObject({ status: 400 });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('recusa modulo fora da lista editavel', async () => {
    await expect(substituirModulosDoPerfil('SUPORTE' as never, ['configuracoes'])).rejects.toMatchObject({
      status: 400,
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('substitui o conjunto inteiro do perfil numa transacao', async () => {
    await substituirModulosDoPerfil('SUPORTE' as never, ['atendimento', 'crm']);
    expect(deleteMany).toHaveBeenCalledWith({ where: { perfil: 'SUPORTE' } });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        { perfil: 'SUPORTE', modulo: 'atendimento' },
        { perfil: 'SUPORTE', modulo: 'crm' },
      ],
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run apps/api/src/modules/permissoes/permissoesModulo.service.test.ts
```

Expected: FAIL — `Cannot find module './permissoesModulo.service'`.

- [ ] **Step 3: Implementar o service**

Criar `apps/api/src/modules/permissoes/permissoesModulo.service.ts`:

```ts
import type { Role } from '@prisma/client';
import { badRequest } from '../../lib/errors';
import { MODULOS_EDITAVEIS, PERFIS_EDITAVEIS } from '../../lib/modulos';
import { prisma } from '../../lib/prisma';

/** Matriz inteira da organizacao: um item por perfil editavel, com seus modulos. */
export async function listarMatriz(): Promise<{ perfil: Role; modulos: string[] }[]> {
  const linhas = await prisma.modulePermission.findMany({ select: { perfil: true, modulo: true } });
  return PERFIS_EDITAVEIS.map((perfil) => ({
    perfil,
    modulos: linhas.filter((l) => l.perfil === perfil).map((l) => l.modulo),
  }));
}

/**
 * Substitui o conjunto inteiro de modulos de um perfil. ADMIN nunca passa por
 * aqui (sempre tem tudo, fora da tabela) — a rota que chama isto ja e
 * `requireRole('ADMIN')` fixo, entao esta checagem e defesa redundante contra
 * um corpo malformado, nao a primeira trava.
 */
export async function substituirModulosDoPerfil(perfil: Role, modulos: string[]): Promise<void> {
  if (perfil === 'ADMIN') throw badRequest('ADMIN sempre tem todos os módulos — não é configurável.');
  const invalidos = modulos.filter((m) => !(MODULOS_EDITAVEIS as readonly string[]).includes(m));
  if (invalidos.length > 0) throw badRequest(`Módulo(s) inválido(s): ${invalidos.join(', ')}`);

  await prisma.$transaction(async (tx) => {
    await tx.modulePermission.deleteMany({ where: { perfil } });
    if (modulos.length > 0) {
      await tx.modulePermission.createMany({ data: modulos.map((modulo) => ({ perfil, modulo })) });
    }
  });
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx vitest run apps/api/src/modules/permissoes/permissoesModulo.service.test.ts
```

Expected: PASS — 5 testes.

- [ ] **Step 5: Criar a rota**

Criar `apps/api/src/modules/permissoes/permissoesModulo.routes.ts`:

```ts
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth, requireRole } from '../../http/middleware/auth';
import { validateBody } from '../../http/middleware/validate';
import { param } from '../../http/params';
import { listarMatriz, substituirModulosDoPerfil } from './permissoesModulo.service';

export const permissoesModuloRoutes = Router();

// ADMIN fixo, nunca via requireModulo: a rota que administra a tabela nao pode
// depender da propria tabela que ela administra.
permissoesModuloRoutes.use(requireAuth, requireRole('ADMIN'));

permissoesModuloRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ permissoes: await listarMatriz() });
  }),
);

const substituirSchema = z.object({ modulos: z.array(z.string()) });

permissoesModuloRoutes.put(
  '/:perfil',
  validateBody(substituirSchema),
  asyncHandler(async (req, res) => {
    await substituirModulosDoPerfil(param(req, 'perfil') as never, req.body.modulos);
    res.json(await listarMatriz());
  }),
);
```

- [ ] **Step 6: Montar no app**

Em `apps/api/src/app.ts`, importar junto dos outros módulos (perto de `usersRoutes`):

```ts
import { permissoesModuloRoutes } from './modules/permissoes/permissoesModulo.routes';
```

E montar perto de `/api/usuarios` (linha 142):

```ts
app.use('/api/usuarios', usersRoutes);
app.use('/api/permissoes-modulo', permissoesModuloRoutes);
```

- [ ] **Step 7: Typecheck e suíte completa**

```bash
npm run typecheck
npm test
```

Expected: typecheck limpo, todos os testes passando.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/permissoes apps/api/src/app.ts
git commit -m "feat(permissoes): API administrativa GET/PUT /api/permissoes-modulo"
```

---

## Task 8: Sessão e menu — `modulosPermitidos` na sessão, `temModulo` no front

**Files:**
- Modify: `apps/api/src/modules/users/users.serializer.ts` (NÃO muda — ver Step 1)
- Modify: `apps/api/src/modules/auth/auth.service.ts:1-10,100-110` (`buildSession`)
- Modify: `apps/web/src/lib/types.ts:23-34` (`Usuario`)
- Modify: `apps/web/src/features/auth/AuthProvider.tsx` (`temModulo`)
- Modify: `apps/web/src/components/layout/nav.ts` (remove `perfis` do `NavItem`; mantém em `SubRota`)
- Modify: `apps/web/src/App.tsx:71`, `apps/web/src/components/layout/Sidebar.tsx:24,41`, `apps/web/src/components/layout/paleta.ts:44-49,60-66`
- Modify: `apps/web/src/components/layout/nav.test.ts`
- Test: `apps/api/src/modules/auth/auth.service.test.ts` (se não existir, criar; ver Step 2)

**Interfaces:**
- Consumes: `modulosPermitidos` (Task 2), `comOrganizacao` (`apps/api/src/lib/tenant.ts`).
- Produces: `Usuario.modulosPermitidos: string[]` na sessão; `temModulo(modulo: string): boolean` em `useAuth()`.

- [ ] **Step 1: Por que `toPublicUser` não muda**

`toPublicUser` ([users.serializer.ts](../../../apps/api/src/modules/users/users.serializer.ts)) é síncrono e usado em todo retorno de usuário — inclusive listagens de vários usuários de uma vez (`GET /usuarios`). Buscar módulos ali faria uma consulta ao banco por usuário listado, à toa. `modulosPermitidos` só é relevante para a própria sessão (login/refresh), então entra só em `buildSession`, como campo adicional no retorno — não dentro de `toPublicUser`. Nenhuma mudança neste arquivo.

- [ ] **Step 2: Escrever o teste do backend (sessão carrega os módulos)**

Verificar se existe `apps/api/src/modules/auth/auth.service.test.ts`:

```bash
ls apps/api/src/modules/auth/
```

Se não existir, criar com:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { userFindMany, userUpdate, modulePermissionFindMany, registrarPresenca } = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  userUpdate: vi.fn(),
  modulePermissionFindMany: vi.fn().mockResolvedValue([{ modulo: 'atendimento' }]),
  registrarPresenca: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    user: { findMany: userFindMany, update: userUpdate },
    modulePermission: { findMany: modulePermissionFindMany },
  },
}));
vi.mock('../metrics/metrics.service', () => ({ registrarPresenca }));
vi.mock('./tentativas', () => ({
  garantirNaoBloqueado: vi.fn().mockResolvedValue(undefined),
  limparFalhas: vi.fn().mockResolvedValue(undefined),
  registrarFalha: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../lib/password', () => ({ verifyPassword: vi.fn().mockResolvedValue(true) }));

import { login } from './auth.service';

const USUARIO_BASE = {
  id: 'u-1',
  email: 'f@x.com',
  senhaHash: 'hash',
  ativo: true,
  senhaPendente: false,
  status: 'OFFLINE',
  organizacaoId: 'org-1',
  perfil: 'SUPORTE',
  nome: 'Fulano',
  ultimoLogin: null,
  criadoEm: new Date(),
  filialId: null,
};

describe('login — sessao carrega modulosPermitidos', () => {
  beforeEach(() => vi.clearAllMocks());

  it('perfil nao-ADMIN recebe so os modulos da tabela', async () => {
    userFindMany.mockResolvedValue([USUARIO_BASE]);
    userUpdate.mockResolvedValue(USUARIO_BASE);
    modulePermissionFindMany.mockResolvedValue([{ modulo: 'atendimento' }, { modulo: 'crm' }]);

    const sessao = await login({ email: 'f@x.com', senha: 'x' });

    expect(sessao.usuario.modulosPermitidos?.sort()).toEqual(['atendimento', 'crm']);
  });

  it('ADMIN recebe todos os modulos editaveis, sem consultar a tabela', async () => {
    userFindMany.mockResolvedValue([{ ...USUARIO_BASE, perfil: 'ADMIN' }]);
    userUpdate.mockResolvedValue({ ...USUARIO_BASE, perfil: 'ADMIN' });

    const sessao = await login({ email: 'f@x.com', senha: 'x' });

    expect(sessao.usuario.modulosPermitidos).toContain('crm');
    expect(sessao.usuario.modulosPermitidos).toContain('esteira');
    expect(modulePermissionFindMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

```bash
npx vitest run apps/api/src/modules/auth/auth.service.test.ts
```

Expected: FAIL — `sessao.usuario.modulosPermitidos` é `undefined` hoje.

- [ ] **Step 4: Implementar no backend**

Em `apps/api/src/modules/auth/auth.service.ts`, acrescentar os imports:

```ts
import { comOrganizacao } from '../../lib/tenant';
import { modulosPermitidos } from '../../lib/modulos';
```

Trocar `buildSession` (linha 100-110):

```ts
async function buildSession(user: Awaited<ReturnType<typeof prisma.user.findUniqueOrThrow>>) {
  const accessToken = signAccessToken({
    sub: user.id,
    nome: user.nome,
    email: user.email,
    perfil: user.perfil,
    org: user.organizacaoId,
  });
  const refreshToken = await issueRefreshToken(user.id, user.organizacaoId);
  // Login roda sob `semOrganizacao` ate aqui: o contexto so abre agora, que e
  // quando a organizacao do usuario ja e conhecida.
  const modulos = await comOrganizacao(user.organizacaoId, () => modulosPermitidos(user.perfil));
  return { accessToken, refreshToken, usuario: { ...toPublicUser(user), modulosPermitidos: [...modulos] } };
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

```bash
npx vitest run apps/api/src/modules/auth/auth.service.test.ts
```

Expected: PASS — 2 testes.

- [ ] **Step 6: Tipar no frontend**

Em `apps/web/src/lib/types.ts`, no `type Usuario` (linha 23-34), acrescentar:

```ts
export type Usuario = {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  status: AgentStatus;
  ativo: boolean;
  ultimoLogin: string | null;
  criadoEm: string;
  filialId?: string | null;
  /** Só presente na própria sessão (login/refresh) — nunca em listagens de outros usuários. */
  modulosPermitidos?: string[];
};
```

- [ ] **Step 7: `temModulo` no AuthProvider**

Em `apps/web/src/features/auth/AuthProvider.tsx`, acrescentar ao tipo do contexto (depois de `temPerfil`):

```ts
  temModulo: (modulo: string) => boolean;
```

E, depois da definição de `temPerfil` (linha 66-69):

```ts
  const temModulo = useCallback(
    (modulo: string) =>
      usuario ? usuario.perfil === 'ADMIN' || (usuario.modulosPermitidos ?? []).includes(modulo) : false,
    [usuario],
  );
```

No `useMemo` final, incluir `temModulo` na lista e no array de dependências:

```ts
  const valor = useMemo(
    () => ({ usuario, carregando, entrar, sair, alterarStatus, temPerfil, temModulo }),
    [usuario, carregando, entrar, sair, alterarStatus, temPerfil, temModulo],
  );
```

- [ ] **Step 8: Remover `perfis` do `NavItem` (mantém em `SubRota`)**

Em `apps/web/src/components/layout/nav.ts`, no `type NavItem` (linha 16-37), remover a linha `perfis: Perfil[];`. O tipo `SubRota` (linha 39-43) e `perfisDaSubrota` (linha 46) não mudam — a restrição de subrota continua hardcoded e independente do módulo.

Em cada item de `NAV` (linhas 88-136), remover o campo `perfis: [...]` de cada objeto (os itens ficam só com `rota`, `label`, `icone`, `fase`, e `subrotas` quando houver — `/crm` mantém `subrotas` com os `perfis` DELES intactos, que não mudam).

- [ ] **Step 9: Trocar os três consumidores de `item.perfis`**

Em `apps/web/src/App.tsx`, linha 53 e 71:

```ts
  const { usuario, carregando, temPerfil, temModulo } = useAuth();
  // ...
  const permitidos = NAV.filter((item) => temModulo(item.rota.slice(1)));
```

Em `apps/web/src/components/layout/Sidebar.tsx`, linha 24 e 41:

```ts
  const { temPerfil, temModulo } = useAuth();
  // ...
  const itens = NAV.filter((item) => temModulo(item.rota.slice(1))).filter(
    (item) => item.rota !== '/esteira' || temEsteira,
  );
```

Em `apps/web/src/components/layout/paleta.ts`:

```ts
import { NAV } from './nav';

// ...

export function comandosDeNavegacao(modulosPermitidos: string[], termo: string): Comando[] {
  const t = termo.trim().toLowerCase();
  return NAV.filter((item) => modulosPermitidos.includes(item.rota.slice(1)))
    .filter((item) => t === '' || item.label.toLowerCase().includes(t))
    .map((item) => ({ tipo: 'NAVEGAR' as const, rota: item.rota, label: item.label }));
}

export function montarPaleta(
  modulosPermitidos: string[],
  termo: string,
  registros: Array<{ tipo: 'CONTATO' | 'CONTA' | 'OPORTUNIDADE' | 'PROTOCOLO'; rota: string; titulo: string; detalhe: string | null }>,
): ItemDaPaleta[] {
  return [
    ...comandosDeNavegacao(modulosPermitidos, termo),
    ...registros.map((r) => ({ tipo: r.tipo, rota: r.rota, label: r.titulo, detalhe: r.detalhe })),
  ];
}
```

Remover o import `type { Perfil }` do topo de `paleta.ts` se ficar sem uso (`montarPaleta`/`comandosDeNavegacao` não recebem mais `Perfil`).

E em `apps/web/src/components/layout/PaletaDeComando.tsx`, linha 38:

```ts
  const { usuario } = useAuth();
  const modulosDoUsuario =
    usuario?.perfil === 'ADMIN' ? NAV.map((i) => i.rota.slice(1)) : (usuario?.modulosPermitidos ?? []);
  const itens: ItemDaPaleta[] = usuario ? montarPaleta(modulosDoUsuario, termo, resultados) : [];
```

(Import `NAV` já deve existir ali; se não existir, acrescentar `import { NAV } from './nav';`.)

- [ ] **Step 10: Adaptar `nav.test.ts`**

Os testes que comparam contra `item.perfis` (linhas 25-31, 33-48, 50-55, 77-84 do arquivo atual) deixam de compilar porque `NavItem` não tem mais `perfis`. Substituir o arquivo inteiro por:

```ts
import { describe, expect, it } from 'vitest';
import { NAV, itemDaRota, perfisDaSubrota, subrotaDaRota } from './nav';

describe('navegacao', () => {
  it('a rota do modulo resolve para o próprio modulo', () => {
    expect(itemDaRota('/crm')?.rota).toBe('/crm');
    expect(itemDaRota('/configuracoes')?.rota).toBe('/configuracoes');
  });

  it('a rota de registro resolve para o modulo dono', () => {
    for (const caminho of ['/contatos/abc', '/clientes/abc', '/jornadas/abc', '/oportunidades/abc']) {
      expect(itemDaRota(caminho)?.rota).toBe('/crm');
    }
  });

  it('subrota sem perfis proprios herda os perfis declarados nela (vazio = nenhuma restricao extra)', () => {
    const crm = NAV.find((i) => i.rota === '/crm')!;
    for (const caminho of ['/contatos/abc', '/clientes/abc']) {
      const achado = subrotaDaRota(caminho)!;
      expect(achado.item.rota).toBe(crm.rota);
      expect(achado.sub.perfis).toBeUndefined();
    }
  });

  it('oportunidade e jornada continuam restritas ao processo comercial, sem AGENTE nem SUPORTE', () => {
    const crm = NAV.find((i) => i.rota === '/crm')!;
    for (const rota of ['/oportunidades/:id', '/jornadas/:id']) {
      const sub = crm.subrotas!.find((s) => s.rota === rota)!;
      const perfis = perfisDaSubrota(crm, sub);
      expect(perfis).not.toContain('AGENTE');
      expect(perfis).not.toContain('SUPORTE');
    }
  });

  it('toda subrota declarada resolve de volta para quem a declarou', () => {
    for (const item of NAV) {
      for (const subrota of item.subrotas ?? []) {
        const exemplo = subrota.rota.replace(/\/:[^/]+/g, '/exemplo');
        expect(itemDaRota(exemplo)?.rota, `${subrota.rota} deveria pertencer a ${item.rota}`).toBe(item.rota);
      }
    }
  });

  it('a rota de registro sem id não e rota de registro', () => {
    expect(itemDaRota('/contatos')).toBeUndefined();
    expect(itemDaRota('/clientes')).toBeUndefined();
    expect(itemDaRota('/oportunidades')).toBeUndefined();
  });

  it('rota desconhecida não resolve para modulo nenhum', () => {
    expect(itemDaRota('/inventado')).toBeUndefined();
    expect(itemDaRota('/crm-antigo')).toBeUndefined();
    expect(itemDaRota('/configuracoes-old')).toBeUndefined();
  });

  it('nenhuma subrota colide com a rota de outro modulo', () => {
    const rotas = new Set(NAV.map((i) => i.rota));
    for (const item of NAV) {
      for (const subrota of item.subrotas ?? []) {
        const base = subrota.rota.slice(0, subrota.rota.indexOf('/:'));
        expect(rotas.has(base), `${subrota.rota} colide com o modulo ${base}`).toBe(false);
      }
    }
  });
});
```

Nota: a garantia "subrota restringe, nunca amplia" deixa de ser testável estaticamente porque o módulo não tem mais um array fixo de perfis para comparar — o acesso ao módulo agora é dado em tempo de execução pela tabela. A proteção equivalente passa a viver no backend: `/oportunidades`/`/jornadas` continuam atrás de `requireRole` hardcoded em `opportunities.routes.ts` (fora do escopo desta mudança), que é quem realmente barra a ação mesmo que o front mostrasse o link por engano.

- [ ] **Step 11: Rodar typecheck e a suíte completa do front**

```bash
npm run typecheck
npm test
```

Expected: typecheck limpo (nenhum consumidor de `item.perfis` sobrando — se o typecheck apontar algum, é um arquivo não listado aqui; localize com `grep -rn "\.perfis" apps/web/src` e aplique a mesma troca por `temModulo`), suíte completa passando.

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/modules/auth/auth.service.ts apps/api/src/modules/auth/auth.service.test.ts apps/web/src/lib/types.ts apps/web/src/features/auth/AuthProvider.tsx apps/web/src/components/layout/nav.ts apps/web/src/components/layout/nav.test.ts apps/web/src/App.tsx apps/web/src/components/layout/Sidebar.tsx apps/web/src/components/layout/paleta.ts apps/web/src/components/layout/PaletaDeComando.tsx
git commit -m "feat(permissoes): sessao carrega modulosPermitidos; menu e paleta usam temModulo"
```

---

## Task 9: Painel no Admin

**Files:**
- Create: `apps/web/src/pages/configuracoes/PermissoesModuloPanel.tsx`
- Modify: `apps/web/src/pages/configuracoes/UsuariosTab.tsx` (renderiza o painel)

**Interfaces:**
- Consumes: `GET /api/permissoes-modulo`, `PUT /api/permissoes-modulo/:perfil` (Task 7); `NAV` (para rótulos); `api`, `ApiError`, `LABEL_PERFIL` (já existentes).

- [ ] **Step 1: Criar o componente**

Criar `apps/web/src/pages/configuracoes/PermissoesModuloPanel.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Alerta, Card } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import { LABEL_PERFIL, type Perfil } from '../../lib/types';
import { NAV } from '../../components/layout/nav';

type LinhaMatriz = { perfil: Perfil; modulos: string[] };

const PERFIS_EDITAVEIS: Perfil[] = ['SUPERVISOR', 'GESTOR', 'COMERCIAL', 'SUPORTE', 'AGENTE'];

/** Módulos editáveis = todo item do menu, exceto Configurações (sempre só ADMIN). */
const MODULOS = NAV.filter((item) => item.rota !== '/configuracoes').map((item) => ({
  chave: item.rota.slice(1),
  label: item.label,
}));

export function PermissoesModuloPanel() {
  const [matriz, setMatriz] = useState<LinhaMatriz[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<Perfil | null>(null);

  const carregar = async () => {
    const { permissoes } = await api.get<{ permissoes: LinhaMatriz[] }>('/permissoes-modulo');
    setMatriz(permissoes);
  };

  useEffect(() => {
    void carregar().catch((e) => setErro(e instanceof ApiError ? e.message : 'Falha ao carregar permissões'));
  }, []);

  const alternar = async (perfil: Perfil, chaveModulo: string, marcado: boolean) => {
    const linha = matriz.find((m) => m.perfil === perfil);
    if (!linha) return;
    const modulos = marcado ? [...linha.modulos, chaveModulo] : linha.modulos.filter((m) => m !== chaveModulo);

    // Otimista: a tela responde na hora, e volta ao estado anterior se a API recusar.
    setMatriz((atual) => atual.map((m) => (m.perfil === perfil ? { ...m, modulos } : m)));
    setErro(null);
    setSalvando(perfil);
    try {
      await api.put(`/permissoes-modulo/${perfil}`, { modulos });
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao salvar permissão');
      await carregar();
    } finally {
      setSalvando(null);
    }
  };

  return (
    <Card>
      <h3 className="mb-1 text-sm font-medium text-slate-800">Permissões de módulo por perfil</h3>
      <p className="mb-4 text-sm text-slate-500">
        Administrador sempre vê todos os módulos. Configurações é sempre restrita a Administrador.
      </p>
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Perfil</th>
              {MODULOS.map((m) => (
                <th key={m.chave} className="px-3 py-2 text-center font-medium text-slate-600">
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-100 text-slate-400">
              <td className="px-3 py-2">{LABEL_PERFIL.ADMIN}</td>
              {MODULOS.map((m) => (
                <td key={m.chave} className="px-3 py-2 text-center">
                  <input type="checkbox" checked disabled aria-label={`${LABEL_PERFIL.ADMIN} sempre vê ${m.label}`} />
                </td>
              ))}
            </tr>
            {PERFIS_EDITAVEIS.map((perfil) => {
              const linha = matriz.find((m) => m.perfil === perfil);
              return (
                <tr key={perfil} className="border-t border-slate-100">
                  <td className="px-3 py-2">{LABEL_PERFIL[perfil]}</td>
                  {MODULOS.map((m) => (
                    <td key={m.chave} className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={linha?.modulos.includes(m.chave) ?? false}
                        disabled={salvando === perfil || !linha}
                        onChange={(e) => void alternar(perfil, m.chave, e.target.checked)}
                        aria-label={`${LABEL_PERFIL[perfil]} vê ${m.label}`}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
```

Nota: confira o nome e as props reais de `Alerta` em `apps/web/src/components/ui/index.ts` (ou arquivo equivalente) antes de colar — o uso acima (`<Alerta tipo="erro">`) segue o padrão visto em `UsuariosTab.tsx`; se a prop tiver outro nome, ajuste para o que o componente realmente aceita.

- [ ] **Step 2: Renderizar dentro da aba "Usuários e permissões"**

Em `apps/web/src/pages/configuracoes/UsuariosTab.tsx`, importar o novo componente e renderizá-lo no fim do JSX retornado (depois da lista/formulário de usuários existente):

```tsx
import { PermissoesModuloPanel } from './PermissoesModuloPanel';
```

E, no `return` do componente `UsuariosTab`, adicionar `<PermissoesModuloPanel />` como último elemento do container principal (mesmo nível dos outros `<Card>` da tela).

- [ ] **Step 3: Rodar o dev server e testar manualmente**

```bash
npm run dev
```

Como ADMIN, abrir Configurações → Usuários e permissões, confirmar que a grade aparece com os 5 perfis editáveis e os 10 módulos, que ADMIN aparece travado, que marcar/desmarcar uma célula persiste (recarregar a página e conferir que o estado se mantém), e que um erro de rede (desligar a API) reverte o checkbox.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/configuracoes/PermissoesModuloPanel.tsx apps/web/src/pages/configuracoes/UsuariosTab.tsx
git commit -m "feat(permissoes): painel de permissoes de modulo em Configuracoes"
```

---

## Task 10: Verificação final e fora de escopo

**Files:** nenhum (só verificação).

- [ ] **Step 1: Suíte completa, typecheck e build**

```bash
npm run typecheck
npm test
npm run build
```

Expected: tudo verde.

- [ ] **Step 2: Conferir que a migration seed bate com o `nav.ts` anterior à Task 8**

```bash
git show HEAD~9:apps/web/src/components/layout/nav.ts | grep -A2 "perfis:"
```

(ajustar `HEAD~9` para o commit da Task 1, antes da Task 8 remover `perfis` de `nav.ts`) e comparar manualmente com os `INSERT` da migration (Task 1, Step 4) — perfil por perfil, módulo por módulo.

- [ ] **Step 3: Registrar o que ficou fora desta entrega**

Os módulos `dashboards`, `monitoramento`, `gestao`, `campanhas`, `relatorios` aparecem no painel (o ADM pode marcá-los — isso já muda o menu, via Task 8) mas o **backend** deles ainda não tem `requireModulo` — continuam com o `requireRole` hardcoded que já tinham (`metrics.routes.ts`, `reports.routes.ts`, `campaigns.routes.ts`, `produtividade.routes.ts`), porque esses roteadores atendem mais de um item do menu ao mesmo tempo ou já têm sub-restrições que não foram investigadas a fundo nesta rodada. Até uma Fase 2 cobrir isso, marcar um desses módulos no painel muda o que aparece no menu para o perfil, mas não necessariamente o que a API aceita — mesmo tipo de lacuna já corrigido em Atendimento/CRM/Esteira/Chamado de TI nesta entrega. Isso deve ser comunicado ao usuário explicitamente (não é uma omissão silenciosa).

- [ ] **Step 4: Deploy**

Seguir o processo já conhecido deste projeto: push em `main` dispara `verificar` + `implantar` via GitHub Actions; conferir o job pela API pública do GitHub (`/actions/runs/<id>/jobs`), e se `implantar` falhar com "Coolify recusou o disparo | HTTP 000000", disparar manualmente no painel do Coolify.
