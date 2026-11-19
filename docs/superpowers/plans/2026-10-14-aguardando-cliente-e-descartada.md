# Aguardando Cliente + Oportunidade Descartada Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `AGUARDANDO_CLIENTE` conversation status (the conversation is assigned, the agent has replied, and we're waiting on the client) and a `DESCARTADA` opportunity status (closed without a real win/loss, excluded from conversion-rate math), matching the two confirmed gaps from the Nectar comparative investigation (`docs/engenharia-reversa-nectar/07-nosso-crm/lacunas.md` L1/L2), while preserving every existing invariant already confirmed correct in `docs/engenharia-reversa-nectar/09-relatorios/etapa-0-leitura-codigo.md` (atomic "assumir conversa", RBAC, isolation by channel/line, the already-superior flow-versioning engine).

**Architecture:** Two independent, additive Prisma enum values. Conversation status gets two small pure helper functions (`aoFalarComCliente`, `aoReceberDoCliente`) in a new leaf module with zero dependents, imported from the three places a message can flow (painel, WhatsApp webhook, Webchat) so the transition rule is defined exactly once. Opportunity status reuses the existing `fecharOportunidade` action (already generic over status) and widens the few places that explicitly enumerate `'ATRIBUIDO'/'EM_ATENDIMENTO'` or `'PERDIDA'`; everywhere else in the codebase already filters by *exact* status match rather than by negation, so conversion-rate math is unaffected by construction — confirmed file-by-file during planning, not assumed.

**Tech Stack:** Node/TypeScript (Fastify-style Express app), Prisma 6 + PostgreSQL, Zod, Vitest, React + Vite frontend.

**Spec:** `docs/engenharia-reversa-nectar/08-implementacao/roadmap.md` (Etapa 1), `07-nosso-crm/lacunas.md` (L1, L2), `06-arquitetura/maquinas-estados.md`, `09-relatorios/etapa-0-leitura-codigo.md`, `08-implementacao/criterios-aceite.md` (BL-05, BL-06).

## Global Constraints

- Every new/changed Prisma field or query keeps the existing multi-tenant pattern: scoped by `organizacaoId` through the Prisma extension, never bypassed.
- Never widen a query with `status: { not: X }` — this codebase's convention (and this plan's safety argument) depends on exact-match (`===` / `{ in: [...] }`) filtering; do not introduce negation-based status filters.
- No new required field/motive is added for `DESCARTADA` (YAGNI per plan review — flagged as an open decision in Review Focus, not built speculatively).
- `interno` (nota interna) messages never reach the client and must never change `ConversationStatus` to `AGUARDANDO_CLIENTE`.
- Migrations only add enum values (`ALTER TYPE ... ADD VALUE`) — strictly additive, no backfill, no destructive change. Never run against the shared/dev-production database per project memory (`banco-dev-e-producao-compartilhado.md`) — only the engineer's own local/dev database, and only after the user's explicit go-ahead for this plan.
- Preserve RBAC (6 roles), channel isolation (`canalConfigId`), and the atomic `UPDATE ... WHERE` pattern in `assumirConversa` exactly as they are — no task in this plan touches them.
- Keep Portuguese identifiers and the existing comment style (short, reasoned "why" comments) consistent with the surrounding code.

## Review Focus

- **Nota interna must never flip status to `AGUARDANDO_CLIENTE`.** A reasonable person expects an internal note (visible only to the team) to never look, from the client-visibility queue's point of view, like "the agent already replied." Covered by Task 3's unit test on `aoFalarComCliente`.
- **Dashboard/queue-load counts must keep counting a conversation that is `AGUARDANDO_CLIENTE` as "active," not silently drop it.** A supervisor checking team load would otherwise see fewer active conversations than actually exist. Covered by Task 6's tests on `metrics.service.ts`/`vendedores.service.ts`.
- **`taxaConversao`/`conversao()` must keep excluding `DESCARTADA` from both numerator and denominator.** This is the entire point of the feature (Nectar's documented rule) — a regression here would silently reintroduce the exact distortion this plan exists to fix. Covered by Task 10's test.
- **A contact whose only opportunity was discarded must land in the `PERDIDO` lifecycle rung, not silently fall back to `QUALIFICADO`/`CONTATADO`/`LEAD`.** `fatosDosContatos` currently queries `status: 'PERDIDA'` exactly, so a `DESCARTADA` opportunity would be invisible to the lifecycle engine without this fix. Covered by Task 11's test.
- **`assumirConversa`'s atomic claim must still correctly reject a second agent when the conversation is already `AGUARDANDO_CLIENTE`** (owned by someone else), not just when it's `ATRIBUIDO`/`EM_ATENDIMENTO`. The existing guard uses `status: { not: 'FINALIZADO' }`, which already covers the new value — this is a regression *test* to add (no code change), not a code fix, since the existing logic is already correct by construction.

---

### Task 1: Prisma schema — add the two enum values

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (enum `ConversationStatus` ~line 298, enum `OportunidadeStatus` ~line 633)
- Create: Prisma migration (generated, name `aguardando_cliente_e_descartada`)

**Interfaces:**
- Produces: `ConversationStatus` now includes `AGUARDANDO_CLIENTE`; `OportunidadeStatus` now includes `DESCARTADA`. Every later task imports these from `@prisma/client`.

- [ ] **Step 1: Edit the enums**

```prisma
enum ConversationStatus {
  EM_ESPERA
  ATRIBUIDO
  EM_ATENDIMENTO
  /// O agente ja respondeu e espera o cliente — ver `conversations.estados.ts`.
  AGUARDANDO_CLIENTE
  FINALIZADO
}
```

```prisma
enum OportunidadeStatus {
  ABERTA
  GANHA
  PERDIDA
  /// Fechada sem decisao de compra/venda real (ex.: cliente sumiu, oportunidade
  /// duplicada). Fica fora do calculo de taxa de conversao (ver `comercial.service.ts`
  /// e `vendedores.ts`, que ja filtram por igualdade exata e por isso nao precisam
  /// de mudanca para excluir este valor).
  DESCARTADA
}
```

- [ ] **Step 2: Generate the migration (dev database only)**

Run: `cd apps/api && npx prisma migrate dev --name aguardando_cliente_e_descartada`
Expected: a new folder under `apps/api/prisma/migrations/<timestamp>_aguardando_cliente_e_descartada/migration.sql` containing two `ALTER TYPE ... ADD VALUE` statements, applied to the local dev database, and `@prisma/client` regenerated (so the new literals type-check everywhere below).

- [ ] **Step 3: Verify the generated SQL is additive only**

Open the generated `migration.sql` and confirm it contains only:
```sql
ALTER TYPE "ConversationStatus" ADD VALUE 'AGUARDANDO_CLIENTE';
ALTER TYPE "OportunidadeStatus" ADD VALUE 'DESCARTADA';
```
No `DROP`, no `ALTER COLUMN`, no data migration. If Prisma split this into two separate migration files (a known Postgres restriction — `ADD VALUE` cannot be used in the same transaction as a later statement that reads the new value), that's expected and fine.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(db): adiciona status AGUARDANDO_CLIENTE e DESCARTADA"
```

---

### Task 2: Shared conversation-status helpers

**Files:**
- Create: `apps/api/src/modules/conversations/conversations.estados.ts`
- Test: `apps/api/src/modules/conversations/conversations.estados.test.ts`

**Interfaces:**
- Consumes: `ConversationStatus` from `@prisma/client` (Task 1).
- Produces: `aoFalarComCliente(atual: ConversationStatus, interno: boolean): ConversationStatus`, `aoReceberDoCliente(atual: ConversationStatus): ConversationStatus`, `EM_ATENDIMENTO_ATIVO: readonly ConversationStatus[]`. Tasks 3, 4, 5, 6 import from this module. This module imports nothing from `conversations.service.ts` or `channels/inbound.service.ts` — it must stay a leaf so both of those (which already import from each other in one direction) can depend on it without a cycle.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/modules/conversations/conversations.estados.test.ts
import { describe, expect, it } from 'vitest';
import { aoFalarComCliente, aoReceberDoCliente, EM_ATENDIMENTO_ATIVO } from './conversations.estados';

describe('aoFalarComCliente', () => {
  it('poe em espera para AGUARDANDO_CLIENTE quando a mensagem nao e interna', () => {
    expect(aoFalarComCliente('ATRIBUIDO', false)).toBe('AGUARDANDO_CLIENTE');
    expect(aoFalarComCliente('EM_ATENDIMENTO', false)).toBe('AGUARDANDO_CLIENTE');
    expect(aoFalarComCliente('AGUARDANDO_CLIENTE', false)).toBe('AGUARDANDO_CLIENTE');
  });

  it('nota interna nunca poe em AGUARDANDO_CLIENTE', () => {
    expect(aoFalarComCliente('ATRIBUIDO', true)).toBe('ATRIBUIDO');
    expect(aoFalarComCliente('EM_ATENDIMENTO', true)).toBe('EM_ATENDIMENTO');
    expect(aoFalarComCliente('AGUARDANDO_CLIENTE', true)).toBe('AGUARDANDO_CLIENTE');
  });

  it('nota interna em conversa EM_ESPERA promove so para ATRIBUIDO, nunca para AGUARDANDO_CLIENTE', () => {
    expect(aoFalarComCliente('EM_ESPERA', true)).toBe('ATRIBUIDO');
  });
});

describe('aoReceberDoCliente', () => {
  it('devolve o agente para EM_ATENDIMENTO quando o cliente responde', () => {
    expect(aoReceberDoCliente('AGUARDANDO_CLIENTE')).toBe('EM_ATENDIMENTO');
  });

  it('nao mexe em EM_ESPERA, ATRIBUIDO, EM_ATENDIMENTO ou FINALIZADO', () => {
    expect(aoReceberDoCliente('EM_ESPERA')).toBe('EM_ESPERA');
    expect(aoReceberDoCliente('ATRIBUIDO')).toBe('ATRIBUIDO');
    expect(aoReceberDoCliente('EM_ATENDIMENTO')).toBe('EM_ATENDIMENTO');
    expect(aoReceberDoCliente('FINALIZADO')).toBe('FINALIZADO');
  });
});

describe('EM_ATENDIMENTO_ATIVO', () => {
  it('inclui os tres estados de atendimento atribuido', () => {
    expect(EM_ATENDIMENTO_ATIVO).toEqual(['ATRIBUIDO', 'EM_ATENDIMENTO', 'AGUARDANDO_CLIENTE']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/api/src/modules/conversations/conversations.estados.test.ts`
Expected: FAIL with "Cannot find module './conversations.estados'"

- [ ] **Step 3: Write the implementation**

```typescript
// apps/api/src/modules/conversations/conversations.estados.ts
import type { ConversationStatus } from '@prisma/client';

/**
 * Estados de "atendimento ativo": atribuida a alguem e nao finalizada, seja
 * esperando o agente agir ou esperando o cliente responder. Usado nos
 * paineis de carga (quantas conversas cada agente/fila tem em andamento) para
 * nao perder conversas que so estao aguardando o cliente responder.
 */
export const EM_ATENDIMENTO_ATIVO: readonly ConversationStatus[] = [
  'ATRIBUIDO',
  'EM_ATENDIMENTO',
  'AGUARDANDO_CLIENTE',
];

/**
 * Status depois que o AGENTE (ou o dono pelo celular) fala com o cliente.
 *
 * Nota interna nunca sai pelo canal externo — nao e "falar com o cliente", e
 * so avanca EM_ESPERA para ATRIBUIDO (a nota tambem assume a conversa, mas
 * ninguem do lado de fora foi avisado ainda). Fora isso, nota interna
 * preserva o status atual: uma nota numa conversa ja ATRIBUIDO/EM_ATENDIMENTO/
 * AGUARDANDO_CLIENTE nao muda nada do ponto de vista do cliente.
 *
 * Mensagem de verdade sempre poe em AGUARDANDO_CLIENTE: e exatamente o que
 * aconteceu — alguem respondeu, agora e a vez do cliente.
 */
export function aoFalarComCliente(atual: ConversationStatus, interno: boolean): ConversationStatus {
  if (interno) return atual === 'EM_ESPERA' ? 'ATRIBUIDO' : atual;
  return 'AGUARDANDO_CLIENTE';
}

/**
 * Status depois que o CLIENTE escreve (canal externo ou Webchat).
 *
 * So existe uma transicao: de AGUARDANDO_CLIENTE (agente ja tinha respondido e
 * esperava) de volta para EM_ATENDIMENTO (e a vez do agente de novo). Qualquer
 * outro status fica como esta — em especial EM_ESPERA (ninguem assumiu ainda,
 * cliente so engrossa a fila) e ATRIBUIDO (agente assumiu mas ainda nao
 * respondeu nada; mais uma mensagem do cliente nao muda isso).
 */
export function aoReceberDoCliente(atual: ConversationStatus): ConversationStatus {
  return atual === 'AGUARDANDO_CLIENTE' ? 'EM_ATENDIMENTO' : atual;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/api/src/modules/conversations/conversations.estados.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/conversations/conversations.estados.ts apps/api/src/modules/conversations/conversations.estados.test.ts
git commit -m "feat(conversas): helpers puros de transicao para AGUARDANDO_CLIENTE"
```

---

### Task 3: Wire the outbound transition into `conversations.service.ts`

**Files:**
- Modify: `apps/api/src/modules/conversations/conversations.service.ts` (`enviarMensagem` ~line 759-762, `enviarArquivo` ~line 828-831, `conversations.schemas.ts` ~line 5, imports ~line 27-39)
- Modify: `apps/api/src/modules/conversations/conversations.schemas.ts` (`listarConversasSchema.status` enum)
- Test: `apps/api/src/modules/conversations/conversations.service.test.ts` (extend existing file)

**Interfaces:**
- Consumes: `aoFalarComCliente` from `./conversations.estados` (Task 2).
- Produces: `enviarMensagem`/`enviarArquivo` now set `AGUARDANDO_CLIENTE` on real outbound messages. No signature change — same exported functions, same parameters.

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/modules/conversations/conversations.service.test.ts` (follow the existing file's setup/mocking conventions — it already mocks `prisma` and builds a `Solicitante`; match that pattern exactly rather than introducing a new one):

```typescript
describe('enviarMensagem — transicao de status', () => {
  it('poe a conversa em AGUARDANDO_CLIENTE quando o agente manda mensagem real', async () => {
    // Arrange: conversa existente com status ATRIBUIDO e agenteId = solicitante.
    // Act: enviarMensagem(solicitante, conversa.id, 'oi', false)
    // Assert: prisma.conversation.update foi chamado com data.status === 'AGUARDANDO_CLIENTE'
  });

  it('NAO poe em AGUARDANDO_CLIENTE quando a mensagem e nota interna', async () => {
    // Act: enviarMensagem(solicitante, conversa.id, 'nota', true)
    // Assert: data.status permanece o status atual da conversa (ex.: 'EM_ATENDIMENTO'), nunca 'AGUARDANDO_CLIENTE'
  });

  it('enviarArquivo tambem poe em AGUARDANDO_CLIENTE para envio real, e preserva o status em nota interna', async () => {
    // Mesmo par de casos para enviarArquivo.
  });
});
```

Write these against the existing mock harness already in the file (read the file's current `describe('enviarMensagem', ...)` block first and copy its exact mock shape — do not invent a different one).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/api/src/modules/conversations/conversations.service.test.ts -t "transicao de status"`
Expected: FAIL — `data.status` is currently always the literal `'EM_ATENDIMENTO'`.

- [ ] **Step 3: Implement**

In `conversations.service.ts`, add to the imports (near the existing `./conversations.estados`-less import block, alongside the `./conversations.serializer` import):

```typescript
import { aoFalarComCliente } from './conversations.estados';
```

Change `enviarMensagem`'s update (currently):

```typescript
  await prisma.conversation.update({
    where: { id },
    data: { ...assumir, status: 'EM_ATENDIMENTO', ultimaMensagemEm: mensagem.criadoEm },
  });
```

to:

```typescript
  await prisma.conversation.update({
    where: { id },
    data: { ...assumir, status: aoFalarComCliente(conversa.status, interno), ultimaMensagemEm: mensagem.criadoEm },
  });
```

Change `enviarArquivo`'s update (currently identical shape) the same way.

In `conversations.schemas.ts`, widen:

```typescript
  status: z.enum(['EM_ESPERA', 'ATRIBUIDO', 'EM_ATENDIMENTO', 'FINALIZADO']).optional(),
```

to:

```typescript
  status: z.enum(['EM_ESPERA', 'ATRIBUIDO', 'EM_ATENDIMENTO', 'AGUARDANDO_CLIENTE', 'FINALIZADO']).optional(),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/api/src/modules/conversations/conversations.service.test.ts`
Expected: PASS, including all pre-existing tests in the file (no regression).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/conversations/conversations.service.ts apps/api/src/modules/conversations/conversations.schemas.ts apps/api/src/modules/conversations/conversations.service.test.ts
git commit -m "feat(conversas): enviarMensagem/enviarArquivo poem AGUARDANDO_CLIENTE em envio real"
```

---

### Task 4: Wire both transitions into the WhatsApp inbound path

**Files:**
- Modify: `apps/api/src/modules/channels/inbound.service.ts` (`registrarMensagemEntrante` ~line 174-189, `registrarMensagemPropria` create path ~line 279 and update path ~line 304-311)
- Test: `apps/api/src/modules/channels/inbound.service.propria.test.ts` (extend) and `apps/api/src/modules/channels/inbound.service.isolamento-linha.test.ts` if it asserts on status (read it first; extend only if it already asserts status)

**Interfaces:**
- Consumes: `aoReceberDoCliente` from `../conversations/conversations.estados` (client → agent direction); the `'AGUARDANDO_CLIENTE'` literal directly (owner-spoke-first direction).

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/modules/channels/inbound.service.propria.test.ts` (match its existing mock style exactly):

```typescript
it('conversa nova por linha pessoal nasce em AGUARDANDO_CLIENTE, nao EM_ATENDIMENTO (o dono falou primeiro)', async () => {
  // Arrange: config com donoId preenchido, nenhuma conversa aberta existente.
  // Act: registrarMensagemPropria(dados)
  // Assert: prisma.conversation.create foi chamado com data.status === 'AGUARDANDO_CLIENTE'
});

it('mensagem propria em conversa ja ATRIBUIDO ou EM_ATENDIMENTO poe em AGUARDANDO_CLIENTE', async () => {
  // Arrange: conversa existente (emAberto) com status 'ATRIBUIDO'.
  // Act: registrarMensagemPropria(dados)
  // Assert: prisma.conversation.update foi chamado com data.status === 'AGUARDANDO_CLIENTE'
});

it('mensagem propria em conversa EM_ESPERA nao mexe no status (sem agente assumido)', async () => {
  // Arrange: conversa existente com status 'EM_ESPERA'.
  // Act: registrarMensagemPropria(dados)
  // Assert: data no update nao inclui a chave 'status'
});
```

Add to a test file covering `registrarMensagemEntrante` (check whether `inbound.service.isolamento-linha.test.ts` already has a `describe('registrarMensagemEntrante', ...)` block; if yes, add there — if the existing suite for this function lives in a different file, add it there instead; do not create a third inbound test file):

```typescript
it('cliente escrevendo numa conversa AGUARDANDO_CLIENTE devolve o status para EM_ATENDIMENTO', async () => {
  // Arrange: emAberto com status 'AGUARDANDO_CLIENTE'.
  // Act: registrarMensagemEntrante(dados)
  // Assert: prisma.conversation.update foi chamado com data.status === 'EM_ATENDIMENTO'
});

it('cliente escrevendo numa conversa EM_ESPERA ou ATRIBUIDO nao muda o status', async () => {
  // Arrange: emAberto com status 'EM_ESPERA' (depois repita para 'ATRIBUIDO').
  // Act + Assert: data.status permanece o mesmo valor, ou a chave status nem aparece em data.
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/api/src/modules/channels/inbound.service.propria.test.ts`
Expected: FAIL on the new assertions (current code hardcodes `'EM_ATENDIMENTO'`/only reacts to `'ATRIBUIDO'`, and `registrarMensagemEntrante` never touches `status` at all).

- [ ] **Step 3: Implement**

Add the import near the top of `inbound.service.ts` (alongside the existing `../conversations/conversations.serializer` and `../conversations/protocolo` imports):

```typescript
import { aoReceberDoCliente } from '../conversations/conversations.estados';
```

In `registrarMensagemEntrante`, the `conversation.update` block currently:

```typescript
  const atualizada = await prisma.conversation.update({
    where: { id: conversa.id },
    data: {
      ultimaMensagemEm: mensagem.criadoEm,
      naoLidas: { increment: 1 },
      enderecoExterno: dados.enderecoExterno,
      arquivada: false,
    },
    include: inclusaoDetalhe,
  });
```

becomes:

```typescript
  const atualizada = await prisma.conversation.update({
    where: { id: conversa.id },
    data: {
      ultimaMensagemEm: mensagem.criadoEm,
      naoLidas: { increment: 1 },
      enderecoExterno: dados.enderecoExterno,
      arquivada: false,
      status: aoReceberDoCliente(conversa.status),
    },
    include: inclusaoDetalhe,
  });
```

(`conversa` here is the variable holding `emAberto ?? (recém-criada)`; a brand-new conversation is always `EM_ESPERA`/`ATRIBUIDO`, so `aoReceberDoCliente` is a safe no-op for that case — no branching needed.)

In `registrarMensagemPropria`, the creation block currently:

```typescript
    conversa = await prisma.conversation.create({
      data: {
        canal: dados.canal,
        status: destino.agenteId ? 'EM_ATENDIMENTO' : 'EM_ESPERA',
        ...
```

becomes:

```typescript
    conversa = await prisma.conversation.create({
      data: {
        canal: dados.canal,
        // O dono falou primeiro pelo celular — ja nasce aguardando o cliente,
        // nao "em atendimento" (que implicaria uma troca ja rolando).
        status: destino.agenteId ? 'AGUARDANDO_CLIENTE' : 'EM_ESPERA',
        ...
```

And the update block currently:

```typescript
  const atualizada = await prisma.conversation.update({
    where: { id: conversa.id },
    data: {
      ultimaMensagemEm: mensagem.criadoEm,
      arquivada: false,
      ...(conversa.status === 'ATRIBUIDO' ? { status: 'EM_ATENDIMENTO' as const } : {}),
    },
    include: inclusaoDetalhe,
  });
```

becomes:

```typescript
  const atualizada = await prisma.conversation.update({
    where: { id: conversa.id },
    data: {
      ultimaMensagemEm: mensagem.criadoEm,
      arquivada: false,
      // So mexe se ja havia agente (ATRIBUIDO ou EM_ATENDIMENTO) — uma
      // conversa EM_ESPERA sem ninguem assumido fica como esta, mesma
      // fronteira que o codigo ja respeitava antes desta mudanca.
      ...(conversa.status === 'ATRIBUIDO' || conversa.status === 'EM_ATENDIMENTO'
        ? { status: 'AGUARDANDO_CLIENTE' as const }
        : {}),
    },
    include: inclusaoDetalhe,
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/api/src/modules/channels/`
Expected: PASS, including `inbound.service.isolamento-linha.test.ts` and `chat-previews.service.test.ts` (no regression — they don't assert on the exact status literal for unrelated cases, but re-run the whole directory to be sure).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/channels/inbound.service.ts apps/api/src/modules/channels/inbound.service.propria.test.ts
git commit -m "feat(whatsapp): AGUARDANDO_CLIENTE no fluxo de entrada e mensagem propria"
```

---

### Task 5: Wire the client-message transition into Webchat

**Files:**
- Modify: `apps/api/src/modules/webchat/webchat.service.ts` (`mensagemDoCliente` ~line 120-124)
- Test: `apps/api/src/modules/webchat/webchat.service.test.ts` (extend)

**Interfaces:**
- Consumes: `aoReceberDoCliente` from `../conversations/conversations.estados`.

- [ ] **Step 1: Write the failing test**

```typescript
it('visitante escrevendo numa conversa AGUARDANDO_CLIENTE devolve para EM_ATENDIMENTO', async () => {
  // Arrange: conversa mockada com status 'AGUARDANDO_CLIENTE'.
  // Act: mensagemDoCliente(conversaId, 'ola')
  // Assert: prisma.conversation.update foi chamado com data.status === 'EM_ATENDIMENTO'
});

it('visitante escrevendo numa conversa EM_ESPERA nao muda o status', async () => {
  // Arrange: conversa mockada com status 'EM_ESPERA'.
  // Act + Assert: data.status permanece 'EM_ESPERA' (ou a chave nao aparece).
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/api/src/modules/webchat/webchat.service.test.ts`
Expected: FAIL — today's `mensagemDoCliente` never sets `status` at all.

- [ ] **Step 3: Implement**

Add import:

```typescript
import { aoReceberDoCliente } from '../conversations/conversations.estados';
```

Change:

```typescript
  const atualizada = await prisma.conversation.update({
    where: { id: conversaId },
    data: { ultimaMensagemEm: mensagem.criadoEm, naoLidas: { increment: 1 } },
    include: inclusaoDetalhe,
  });
```

to:

```typescript
  const atualizada = await prisma.conversation.update({
    where: { id: conversaId },
    data: {
      ultimaMensagemEm: mensagem.criadoEm,
      naoLidas: { increment: 1 },
      status: aoReceberDoCliente(conversa.status),
    },
    include: inclusaoDetalhe,
  });
```

(`conversa` is already loaded above via `prisma.conversation.findUnique` earlier in the same function — no new query needed.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/api/src/modules/webchat/webchat.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/webchat/webchat.service.ts apps/api/src/modules/webchat/webchat.service.test.ts
git commit -m "feat(webchat): visitante respondendo devolve a conversa para EM_ATENDIMENTO"
```

---

### Task 6: Fix the audit situação map and the dashboard/load queries

**Files:**
- Modify: `apps/api/src/modules/conversations/conversations.auditoria.ts` (`STATUS_DA_SITUACAO` ~line 15-19)
- Modify: `apps/api/src/modules/metrics/metrics.service.ts` (lines ~40, ~240, ~295, ~413 — **not** line ~395, which is `Ticket.status`, a different enum, untouched)
- Modify: `apps/api/src/modules/metrics/vendedores.service.ts` (line ~140)
- Test: `apps/api/src/modules/conversations/conversations.auditoria.test.ts` (extend), `apps/api/src/modules/metrics/equipes.test.ts` (extend), `apps/api/src/modules/metrics/vendedores.test.ts` (extend)

**Interfaces:**
- Consumes: `EM_ATENDIMENTO_ATIVO` from `../conversations/conversations.estados` (Task 2).

- [ ] **Step 1: Write the failing tests**

In `conversations.auditoria.test.ts`, add:

```typescript
it('situacaoDaConversa trata AGUARDANDO_CLIENTE como EM_ATENDIMENTO', () => {
  expect(situacaoDaConversa('AGUARDANDO_CLIENTE')).toBe('EM_ATENDIMENTO');
});

it('filtro por situacao EM_ATENDIMENTO inclui AGUARDANDO_CLIENTE', () => {
  const filtros = filtrosDaAuditoria({ ...queryBase, situacao: ['EM_ATENDIMENTO'] });
  expect(filtros).toContainEqual({ status: { in: ['ATRIBUIDO', 'EM_ATENDIMENTO', 'AGUARDANDO_CLIENTE'] } });
});
```

(Match the existing test file's `queryBase`/helper fixture — read the file first and reuse it rather than redefining one.)

In `apps/api/src/modules/metrics/equipes.test.ts`, add a case asserting that a conversation with `status: 'AGUARDANDO_CLIENTE'` is counted in `atendimentoDaFila`/`montarEquipes`'s "em atendimento" bucket (follow the existing test's fixture shape for `contagens`/`ContagemFila`).

In `apps/api/src/modules/metrics/vendedores.test.ts`, add a case asserting `abertas` (the open/active conversation count) includes an `'AGUARDANDO_CLIENTE'` group from `conversasPorStatus`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/api/src/modules/conversations/conversations.auditoria.test.ts apps/api/src/modules/metrics/equipes.test.ts apps/api/src/modules/metrics/vendedores.test.ts`
Expected: FAIL on the new assertions.

- [ ] **Step 3: Implement**

In `conversations.auditoria.ts`:

```typescript
const STATUS_DA_SITUACAO: Record<Situacao, ConversationStatus[]> = {
  AGUARDANDO_FILA: ['EM_ESPERA'],
  EM_ATENDIMENTO: ['ATRIBUIDO', 'EM_ATENDIMENTO', 'AGUARDANDO_CLIENTE'],
  FINALIZADA: ['FINALIZADO'],
};

export function situacaoDaConversa(status: ConversationStatus): Situacao {
  if (status === 'EM_ESPERA') return 'AGUARDANDO_FILA';
  if (status === 'FINALIZADO') return 'FINALIZADA';
  return 'EM_ATENDIMENTO';
}
```

(`situacaoDaConversa` needs no code change — it already falls through to `'EM_ATENDIMENTO'` for anything that isn't `EM_ESPERA`/`FINALIZADO`. Only `STATUS_DA_SITUACAO`, used for the reverse filter, needs the new literal.)

In `metrics.service.ts`, add the import:

```typescript
import { EM_ATENDIMENTO_ATIVO } from '../conversations/conversations.estados';
```

Replace, at each of the three sites (line ~40, ~295, ~413):

```typescript
status: { in: ['ATRIBUIDO', 'EM_ATENDIMENTO'] },
```
→
```typescript
status: { in: EM_ATENDIMENTO_ATIVO },
```

(Keep the surrounding object literal unchanged — only the array value changes.)

At line ~240:

```typescript
  const atendimentoDaFila = (id: string) =>
    contagens
      .filter((c) => c.filaId === id && (c.status === 'ATRIBUIDO' || c.status === 'EM_ATENDIMENTO'))
      .reduce((soma, c) => soma + c._count._all, 0);
```
→
```typescript
  const atendimentoDaFila = (id: string) =>
    contagens
      .filter((c) => c.filaId === id && (EM_ATENDIMENTO_ATIVO as string[]).includes(c.status))
      .reduce((soma, c) => soma + c._count._all, 0);
```

**Do not touch line ~395** (`protocolos: { where: { status: { in: ['ABERTO', 'EM_ANDAMENTO', 'AGUARDANDO_CLIENTE'] } } }`) — that `'AGUARDANDO_CLIENTE'` is `TicketStatus`, an unrelated enum that already had this value before this plan; touching it is out of scope and would be a no-op anyway since it's a different type.

In `vendedores.service.ts`, line ~140:

```typescript
  const abertas = contarStatus(conversasPorStatus, 'ATRIBUIDO') + contarStatus(conversasPorStatus, 'EM_ATENDIMENTO');
```
→
```typescript
  const abertas =
    contarStatus(conversasPorStatus, 'ATRIBUIDO') +
    contarStatus(conversasPorStatus, 'EM_ATENDIMENTO') +
    contarStatus(conversasPorStatus, 'AGUARDANDO_CLIENTE');
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/api/src/modules/conversations/conversations.auditoria.test.ts apps/api/src/modules/metrics/`
Expected: PASS, including every pre-existing test in `apps/api/src/modules/metrics/` (no regression in `assuntos.test.ts`, `equipes.test.ts`, `vendedores.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/conversations/conversations.auditoria.ts apps/api/src/modules/conversations/conversations.auditoria.test.ts apps/api/src/modules/metrics/metrics.service.ts apps/api/src/modules/metrics/vendedores.service.ts apps/api/src/modules/metrics/equipes.test.ts apps/api/src/modules/metrics/vendedores.test.ts
git commit -m "fix(metrics): paineis e auditoria contam AGUARDANDO_CLIENTE como atendimento ativo"
```

---

### Task 7: Regression test for `assumirConversa` concurrency with the new status

**Files:**
- Modify: `apps/api/src/modules/conversations/conversations.service.test.ts` (extend existing `describe('assumirConversa', ...)` block)

**Interfaces:**
- Consumes: `assumirConversa` (already exported, unchanged).

- [ ] **Step 1: Write the failing — actually, confirming — test**

This is a pure regression test: no production code changes in this task. Add:

```typescript
it('rejeita assumir uma conversa AGUARDANDO_CLIENTE ja atribuida a outro agente', async () => {
  // Arrange: conversa com status 'AGUARDANDO_CLIENTE', agenteId = outroAgenteId.
  // Mock prisma.conversation.updateMany to resolve { count: 0 } (simulando que o
  // WHERE não casou, porque agenteId já não é nulo nem do solicitante).
  // Act + Assert: await expect(assumirConversa(solicitante, conversa.id)).rejects.toThrow()
  //   e a mensagem/erro é o mesmo 409 'conflict' já usado para ATRIBUIDO/EM_ATENDIMENTO.
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run apps/api/src/modules/conversations/conversations.service.test.ts -t "rejeita assumir"`
Expected: PASS immediately — `assumirConversa`'s guard (`status: { not: 'FINALIZADO' }`) already covers `AGUARDANDO_CLIENTE` by construction. This test exists to pin that behavior so a future refactor can't silently narrow the guard back to an explicit list of statuses that forgets the new one.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/conversations/conversations.service.test.ts
git commit -m "test(conversas): fixa que assumir rejeita conversa AGUARDANDO_CLIENTE de outro agente"
```

---

### Task 8: Frontend — `ConversaStatus` type, labels, tabs, and the chat badge

**Files:**
- Modify: `apps/web/src/lib/types.ts` (`ConversaStatus` ~line 128, `LABEL_CONVERSA_STATUS` ~line 266, `ABAS_ATENDIMENTO` ~line 273)
- Modify: `apps/web/src/features/atendimento/PainelChat.tsx` (badge ~line 458)
- Modify: `apps/web/src/features/atendimento/visao.ts` (doc comment only, ~line 10 — "quatro valores" → "cinco valores")
- Test: `apps/web/src/features/atendimento/PainelChat.test.ts` (extend if it covers the status badge; otherwise skip — check the file first)

**Interfaces:**
- Produces: `ConversaStatus` includes `'AGUARDANDO_CLIENTE'`; `LABEL_CONVERSA_STATUS['AGUARDANDO_CLIENTE']` = `'Aguardando cliente'`.

- [ ] **Step 1: Check for existing status-badge tests**

Read `apps/web/src/features/atendimento/PainelChat.test.ts` in full. If it already renders the status `Badge` and asserts its text/tone, add a case for `'AGUARDANDO_CLIENTE'` there (matching that file's existing render/query style) before touching any source file. If it doesn't test the badge at all, skip straight to Step 3 (this task's frontend surface is small enough that a manual smoke-check in the running app, not a new unit test, is proportionate — don't invent test infrastructure that doesn't already exist for this file).

- [ ] **Step 2: If a test was added, run it to verify it fails**

Run: `npx vitest run apps/web/src/features/atendimento/PainelChat.test.ts`
Expected: FAIL (type error or missing label) if a test was added in Step 1.

- [ ] **Step 3: Implement**

In `apps/web/src/lib/types.ts`:

```typescript
export type ConversaStatus = 'EM_ESPERA' | 'ATRIBUIDO' | 'EM_ATENDIMENTO' | 'AGUARDANDO_CLIENTE' | 'FINALIZADO';
```

```typescript
export const LABEL_CONVERSA_STATUS: Record<ConversaStatus, string> = {
  EM_ESPERA: 'Em espera',
  ATRIBUIDO: 'Atribuído',
  EM_ATENDIMENTO: 'Em atendimento',
  AGUARDANDO_CLIENTE: 'Aguardando cliente',
  FINALIZADO: 'Finalizado',
};

export const ABAS_ATENDIMENTO: ConversaStatus[] = [
  'EM_ESPERA',
  'ATRIBUIDO',
  'EM_ATENDIMENTO',
  'AGUARDANDO_CLIENTE',
  'FINALIZADO',
];
```

In `PainelChat.tsx`, change:

```tsx
<Badge tom={finalizada ? 'neutro' : 'sucesso'}>{LABEL_CONVERSA_STATUS[conversa.status]}</Badge>
```

to:

```tsx
<Badge tom={finalizada ? 'neutro' : conversa.status === 'AGUARDANDO_CLIENTE' ? 'alerta' : 'sucesso'}>
  {LABEL_CONVERSA_STATUS[conversa.status]}
</Badge>
```

In `visao.ts`, update the doc comment:

```typescript
 * Uma camada ACIMA de `ConversaStatus`: o status continua com os cinco valores
 * de sempre, e a aba so escolhe como consultar/filtrar.
```

- [ ] **Step 4: Run the frontend test suite for this area**

Run: `npx vitest run apps/web/src/features/atendimento/`
Expected: PASS, no regressions in `ListaConversas.test.ts`, `caixaEntrada.test.ts`, `visao.test.ts`, `destinos.test.ts`, `links.test.ts`, `previaTexto.test.ts`, `previas.test.ts`.

- [ ] **Step 5: Typecheck the frontend**

Run: `npm run typecheck --workspace apps/web`
Expected: no new errors (the `ConversaStatus` union is a superset, so every existing exhaustive-looking code either already has a default/fallback branch or will now need one — this step is what surfaces any that don't).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/types.ts apps/web/src/features/atendimento/PainelChat.tsx apps/web/src/features/atendimento/visao.ts
git commit -m "feat(web): rotulo, aba e badge de AGUARDANDO_CLIENTE no painel de atendimento"
```

---

### Task 9: Widen the `fecharOportunidade`/`reabrirOportunidade`/list schemas

**Files:**
- Modify: `apps/api/src/modules/crm/opportunities.schemas.ts` (`fecharOportunidadeSchema` ~line 88-96, `listarOportunidadesSchema.status` ~line 111)
- Modify: `apps/api/src/modules/crm/opportunities.service.ts` (`reabrirOportunidade` guard ~line 688)
- Test: `apps/api/src/modules/crm/opportunities.service.test.ts` (check if it exists; if not, extend whichever test file already covers `fecharOportunidade`/`reabrirOportunidade` — read the directory listing first)

**Interfaces:**
- Produces: `fecharOportunidadeSchema` accepts `status: 'GANHA' | 'PERDIDA' | 'DESCARTADA'`; `motivoPerda` still required only for `'PERDIDA'`. `reabrirOportunidade` now also accepts an opportunity currently in `'DESCARTADA'`.

- [ ] **Step 1: Write the failing tests**

```typescript
it('fecharOportunidadeSchema aceita DESCARTADA sem exigir motivoPerda', () => {
  const resultado = fecharOportunidadeSchema.safeParse({ status: 'DESCARTADA' });
  expect(resultado.success).toBe(true);
});

it('fechar com status DESCARTADA grava motivoPerda nulo e fechadoEm preenchido', async () => {
  // Arrange: oportunidade ABERTA mockada.
  // Act: fecharOportunidade(id, { status: 'DESCARTADA' })
  // Assert: tx.opportunity.update foi chamado com data.status === 'DESCARTADA' e data.motivoPerda === null
});

it('reabrirOportunidade aceita uma oportunidade DESCARTADA, nao so PERDIDA', async () => {
  // Arrange: oportunidade com status 'DESCARTADA'.
  // Act: reabrirOportunidade(id)
  // Assert: nao lanca; tx.opportunity.update foi chamado com data.status === 'ABERTA'
});

it('reabrirOportunidade continua recusando uma oportunidade GANHA', async () => {
  // Regressao: garante que o guard nao ficou permissivo demais.
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/api/src/modules/crm/opportunities.service.test.ts` (or the actual file located in Step 1's directory check)
Expected: FAIL — the current zod enum rejects `'DESCARTADA'`, and `reabrirOportunidade` throws for any status other than `'PERDIDA'`.

- [ ] **Step 3: Implement**

In `opportunities.schemas.ts`:

```typescript
export const fecharOportunidadeSchema = z
  .object({
    status: z.enum(['GANHA', 'PERDIDA', 'DESCARTADA']),
    motivoPerda: z.enum(MOTIVOS_PERDA).optional(),
  })
  .refine((d) => d.status !== 'PERDIDA' || Boolean(d.motivoPerda), {
    message: 'Informe o motivo da perda',
    path: ['motivoPerda'],
  });
```

```typescript
export const listarOportunidadesSchema = z.object({
  funilId: z.string().uuid().optional(),
  estagioId: z.string().uuid().optional(),
  contaId: z.string().uuid().optional(),
  responsavelId: z.string().uuid().optional(),
  status: z.enum(['ABERTA', 'GANHA', 'PERDIDA', 'DESCARTADA']).optional(),
  busca: z.string().trim().min(1).optional(),
  limite: z.coerce.number().int().min(1).max(200).default(100),
});
```

In `opportunities.service.ts`, `fecharOportunidade` needs **no change to its body** — `data: { status: input.status, motivoPerda: input.status === 'PERDIDA' ? input.motivoPerda : null, fechadoEm: new Date() }` already does the right thing for `'DESCARTADA'` (falls into the `: null` branch) purely because the schema now allows the new literal to flow through; the `input.status === 'GANHA'` desconto/etapa guards above it are correctly skipped for `'DESCARTADA'` too, the same way they already are for `'PERDIDA'`.

Change `reabrirOportunidade`'s guard:

```typescript
  if (atual.status !== 'PERDIDA') throw badRequest('Somente oportunidade perdida pode ser reaberta');
```

to:

```typescript
  if (atual.status !== 'PERDIDA' && atual.status !== 'DESCARTADA') {
    throw badRequest('Somente oportunidade perdida ou descartada pode ser reaberta');
  }
```

and update its audit call (currently hardcodes the "from" value):

```typescript
    await registrarAuditoria(tx, id, [{ campo: 'STATUS', de: 'PERDIDA', para: 'ABERTA' }]);
```

to:

```typescript
    await registrarAuditoria(tx, id, [{ campo: 'STATUS', de: atual.status, para: 'ABERTA' }]);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/api/src/modules/crm/`
Expected: PASS, including every pre-existing opportunity test (no regression in `comercial.test.ts`, `produtividade.test.ts`, etc. — run the whole directory since `opportunities.service.ts` is imported widely).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/crm/opportunities.schemas.ts apps/api/src/modules/crm/opportunities.service.ts
git commit -m "feat(oportunidades): status DESCARTADA em fechar/reabrir/listar"
```

---

### Task 10: Confirm (with a test) that conversion-rate math excludes `DESCARTADA`

**Files:**
- Modify: `apps/api/src/modules/crm/comercial.test.ts` (check this file exists via the directory listing already done — it does: `apps/api/src/modules/crm/comercial.test.ts`)
- Modify: `apps/api/src/modules/metrics/vendedores.test.ts`

**Interfaces:**
- Consumes: `montarFluxo` (comercial.service.ts, unchanged), `conversao` (metrics/vendedores.ts, unchanged).

This task is pure regression-test — per the plan's safety argument (see Global Constraints and the file-by-file trace done during planning), neither `montarFluxo` nor `conversao` needs a code change, because both already filter by exact `'GANHA'`/`'PERDIDA'` equality rather than by negation. Writing the test first here still matters: it is the proof that the claim is true, not just an assumption carried over from planning.

- [ ] **Step 1: Write the test**

In `comercial.test.ts`:

```typescript
it('montarFluxo ignora fechamentos DESCARTADA na taxa de conversao', () => {
  const fechamentos: FechamentoComercial[] = [
    { status: 'GANHA', valor: 1000, criadoEm: new Date('2026-01-01'), fechadoEm: new Date('2026-01-10') },
    { status: 'PERDIDA', valor: 500, criadoEm: new Date('2026-01-01'), fechadoEm: new Date('2026-01-12') },
    { status: 'DESCARTADA', valor: 2000, criadoEm: new Date('2026-01-01'), fechadoEm: new Date('2026-01-15') },
  ];
  const fluxo = montarFluxo(fechamentos);
  expect(fluxo.ganhas).toBe(1);
  expect(fluxo.perdidas).toBe(1);
  // Sem a oportunidade descartada no denominador: 1 / (1 + 1) = 0.5, nao 1 / 3.
  expect(fluxo.taxaConversao).toBe(0.5);
});
```

In `vendedores.test.ts`:

```typescript
it('conversao() nao e afetada por oportunidades DESCARTADA — o chamador nunca as inclui em ganhas/perdidas', () => {
  // DESCARTADA nem entra nos parametros de conversao(), que so recebe
  // ganhas/perdidas ja filtrados por `oportunidadesPorStatus.find(status === 'GANHA'|'PERDIDA')`
  // — este teste fixa o contrato da funcao pura, o teste de integracao real
  // (que a chamada feita em obterDesempenho exclui DESCARTADA do groupBy lido)
  // fica coberto indiretamente por nao quebrar nenhum teste existente de
  // obterDesempenho ao rodar toda a suite do modulo.
  expect(conversao(3, 1)).toBeCloseTo(0.75);
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run apps/api/src/modules/crm/comercial.test.ts apps/api/src/modules/metrics/vendedores.test.ts`
Expected: PASS immediately, with no production code change — this is the proof, not a fix.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/crm/comercial.test.ts apps/api/src/modules/metrics/vendedores.test.ts
git commit -m "test(crm): fixa que DESCARTADA fica fora da taxa de conversao"
```

---

### Task 11: Fix `cicloDeVida` to treat `DESCARTADA` like `PERDIDA`

**Files:**
- Modify: `apps/api/src/modules/crm/cicloDeVida.service.ts` (`fatosDosContatos`, `porConta` ~line 49-61)
- Test: `apps/api/src/modules/crm/cicloDeVida.test.ts`

**Interfaces:**
- Produces: `fatosDosContatos`'s `oportunidadesPerdidas` count now includes both `'PERDIDA'` and `'DESCARTADA'` opportunities. `cicloDeVida()` (the pure function in `cicloDeVida.ts`) is unchanged — it only ever reads the `oportunidadesPerdidas` *fact*, never the raw status.

- [ ] **Step 1: Write the failing test**

Read `cicloDeVida.test.ts` first to match its existing fixture/mock style for `prisma.opportunity.groupBy`. Add:

```typescript
it('conta de oportunidadesPerdidas inclui oportunidades DESCARTADA, para o ciclo cair em PERDIDO em vez de voltar a um degrau mais baixo', async () => {
  // Arrange: um contato cuja unica oportunidade tem status 'DESCARTADA' (mock
  // de prisma.opportunity.groupBy devolvendo essa conta no grupo 'DESCARTADA',
  // nao em 'PERDIDA').
  // Act: fatosDosContatos(filtro)
  // Assert: fatos.get(contatoId).oportunidadesPerdidas === 1
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/api/src/modules/crm/cicloDeVida.test.ts`
Expected: FAIL — `porConta('PERDIDA')` today queries `status: 'PERDIDA'` exactly, so a `'DESCARTADA'` row is invisible to it.

- [ ] **Step 3: Implement**

```typescript
  const porConta = async (status: 'GANHA' | 'ABERTA' | ('PERDIDA' | 'DESCARTADA')[]) =>
    contas.length === 0
      ? []
      : prisma.opportunity.groupBy({
          by: ['contaId'],
          where: { contaId: { in: contas }, status: Array.isArray(status) ? { in: status } : status },
          _count: { _all: true },
        });

  const [ganhas, abertas, perdidas, leads, qualificados, conversas] = await Promise.all([
    porConta('GANHA'),
    porConta('ABERTA'),
    // Descartada conta como perdida para o CICLO DE VIDA do contato: do ponto
    // de vista dele, "a empresa desistiu" e "o cliente disse nao" chegam no
    // mesmo lugar (sem negociacao aberta, ja houve uma tentativa). A distincao
    // entre perdida/descartada importa para METRICA DE CONVERSAO (comercial.service.ts,
    // vendedores.ts), nao para este degrau.
    porConta(['PERDIDA', 'DESCARTADA']),
    prisma.lead.groupBy({ by: ['contatoId'], _count: { _all: true } }),
    ...
```

(Keep the rest of the function body — `mapaPorConta`, the `fatos.set(...)` loop — exactly as-is; only the `porConta` signature and the one call site for "perdidas" change.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/api/src/modules/crm/cicloDeVida.test.ts`
Expected: PASS, including every pre-existing test in the file.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/crm/cicloDeVida.service.ts apps/api/src/modules/crm/cicloDeVida.test.ts
git commit -m "fix(ciclo-de-vida): oportunidade descartada conta como perdida no degrau do contato"
```

---

### Task 12: Frontend — `OportunidadeStatus` type, Kanban "Descartar" action, and status badges

**Files:**
- Modify: `apps/web/src/lib/types.ts` (`OportunidadeStatus` ~line 293)
- Modify: `apps/web/src/pages/crm/OportunidadesTab.tsx` (`aoFechar` prop type ~line 58, `enviarFechamento`/`fechar` signatures ~line 378/392, new button ~line 191-198)
- Modify: `apps/web/src/pages/crm/ficha/FichaOportunidade.tsx` (`TOM_STATUS` ~line 41)
- Modify: `apps/web/src/pages/crm/ContasTab.tsx` (status badge ternary ~line 1022)
- Test: `apps/web/src/pages/crm/sinalDeAcao.test.ts` (check whether it exercises `status`; extend only if so)

**Interfaces:**
- Produces: a third "Descartar" button next to "Ganhou"/"Perdeu" on every opportunity card, calling the same `/oportunidades/:id/fechar` endpoint with `status: 'DESCARTADA'`.

- [ ] **Step 1: Check for existing coverage**

Read `apps/web/src/pages/crm/sinalDeAcao.test.ts`. If it switches/branches on `o.status`, add a `'DESCARTADA'` case there first. If `sinalDeAcao`/`temperatura` (the two pure helper files already confirmed not to read `status` at all) are untouched by this change, skip to Step 2 — do not add tests to files that don't exercise this code path.

- [ ] **Step 2: Implement**

In `apps/web/src/lib/types.ts`:

```typescript
export type OportunidadeStatus = 'ABERTA' | 'GANHA' | 'PERDIDA' | 'DESCARTADA';
```

In `OportunidadesTab.tsx`, widen every occurrence of the inline union type:

```typescript
  aoFechar: (id: string, status: 'GANHA' | 'PERDIDA' | 'DESCARTADA') => void;
```

```typescript
  const enviarFechamento = async (id: string, status: 'GANHA' | 'PERDIDA' | 'DESCARTADA', motivoPerda?: MotivoPerda) => {
```

```typescript
  const fechar = async (id: string, status: 'GANHA' | 'PERDIDA' | 'DESCARTADA') => {
    if (status === 'PERDIDA') {
      setPedidoMotivo(id);
      return;
    }
    await enviarFechamento(id, status);
  };
```

(`DESCARTADA` falls into the same "no motive dialog, send immediately" branch as `GANHA` — matching the plan's YAGNI decision not to add a discard reason. If the review in Step 1 of this task — or the person reviewing this plan before execution — wants a reason captured, that's a schema/UI addition to raise explicitly before coding, not something to improvise here.)

Add the third button, right after the existing "Perdeu" button:

```tsx
          <button
            type="button"
            onClick={() => aoFechar(o.id, 'DESCARTADA')}
            className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
          >
            Descartar
          </button>
```

In `FichaOportunidade.tsx`:

```typescript
const TOM_STATUS = { ABERTA: 'marca', GANHA: 'sucesso', PERDIDA: 'alerta', DESCARTADA: 'neutro' } as const;
```

In `ContasTab.tsx`, change:

```tsx
<Badge tom={o.status === 'GANHA' ? 'sucesso' : o.status === 'PERDIDA' ? 'neutro' : 'marca'}>
```

to:

```tsx
<Badge tom={o.status === 'GANHA' ? 'sucesso' : o.status === 'ABERTA' ? 'marca' : 'neutro'}>
```

(Flipped the fallthrough: previously anything that wasn't `GANHA`/`PERDIDA` fell to `'marca'`, which would have silently shown a brand-new `'DESCARTADA'` opportunity with the same tone as an open one. Now only `'ABERTA'` gets `'marca'`; both `'PERDIDA'` and `'DESCARTADA'` get `'neutro'`, matching this file's existing choice for `'PERDIDA'`.)

- [ ] **Step 3: Run the frontend test suite for this area**

Run: `npx vitest run apps/web/src/pages/crm/`
Expected: PASS, no regressions.

- [ ] **Step 4: Typecheck the frontend**

Run: `npm run typecheck --workspace apps/web`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/types.ts apps/web/src/pages/crm/OportunidadesTab.tsx apps/web/src/pages/crm/ficha/FichaOportunidade.tsx apps/web/src/pages/crm/ContasTab.tsx
git commit -m "feat(web): botao Descartar e badges de status para oportunidade DESCARTADA"
```

---

### Task 13: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test` (root — `vitest run`, covers both `apps/api` and `apps/web`)
Expected: PASS, zero failures, zero skipped-by-accident.

- [ ] **Step 2: Run the full typecheck**

Run: `npm run typecheck` (root — delegates to every workspace)
Expected: PASS, zero errors.

- [ ] **Step 3: Grep for any remaining literal status arrays this plan might have missed**

Run:
```bash
grep -rn "'ATRIBUIDO', 'EM_ATENDIMENTO'\|'EM_ATENDIMENTO', 'ATRIBUIDO'" apps/api/src --include="*.ts"
grep -rn "status === 'PERDIDA'" apps/api/src/modules/crm --include="*.ts"
```
Expected: every remaining hit is one this plan deliberately left alone (documented in Task 6/11's rationale — e.g., `relatorioPerdas`'s exact `'PERDIDA'` filter, which correctly should NOT include `DESCARTADA`). If an unexpected hit turns up, stop and treat it as a new finding — do not silently patch it without re-checking its surrounding logic the way this plan did for every other site.

- [ ] **Step 4: Manual smoke check (dev environment only)**

Start the dev stack (`npm run dev` per the project's own dev workflow — never against the shared/production database), open the Atendimento panel, send a real message as an agent, confirm the badge reads "Aguardando cliente," then reply as the client (via the test/dev channel already used for this project) and confirm it flips back to "Em atendimento." Open the CRM funnel, discard a test opportunity, confirm the card leaves the Kanban and the contact's ciclo de vida (if visible in the UI) doesn't regress to a lower rung.

- [ ] **Step 5: Final commit (if Step 4 surfaced any fixups)**

```bash
git add -A
git commit -m "chore: ajustes finais da verificacao de regressao"
```

(Skip this commit entirely if Step 4 found nothing to fix.)

---

## Self-Review

**Spec coverage:**
- "ConversationStatus: eventos de mensagens recebidas e enviadas" → Tasks 3, 4, 5.
- "Transições automáticas e manuais" → automatic transitions are the whole mechanism (Tasks 2-5); no manual override was requested or added (flagged as a deliberate scope boundary, not a gap).
- "Reabertura e encerramento" → `aoReceberDoCliente` covers reopening from `AGUARDANDO_CLIENTE`; `finalizarConversa` is untouched by design (no task changes it, and none needed to — it already works from any non-`FINALIZADO` status).
- "Atribuição e transferência" → `assumirConversa` and `transferirConversa` deliberately untouched (Task 7 pins this); both already use `status: { not: 'FINALIZADO' }` or set status explicitly, both already correct for the new value.
- "Filtros da interface, Filas" → Task 3 (`conversations.schemas.ts`), Task 6 (`metrics.service.ts`, `vendedores.service.ts`), Task 8 (`types.ts`, `ABAS_ATENDIMENTO`).
- "Notificações" → not touched: `realtime/events.ts` has no status-specific logic (confirmed during planning), and `notificarConversaAtualizada` already carries whatever `status` the record has.
- "WebSockets" → same as above; the socket payload is just the serialized conversation, no separate wiring needed.
- "Relatórios" → Task 6 (auditoria `Situacao` mapping).
- "Histórico de transições" → `registrarEventoSistema` already logs `ACEITE`/`TRANSFERENCIA`/`ENCERRAMENTO` system events on the actions that call it; this plan doesn't add a new system-message event for the `AGUARDANDO_CLIENTE`/`EM_ATENDIMENTO` auto-transition itself, because those happen on every single message and a system-message-per-message would flood the transcript. Flagged here explicitly as a scope decision, not an oversight: the transition is visible via the status badge, not via a chat-log entry.
- "Preserve compatibilidade com provedores de WhatsApp" → Task 4 touches both the official/Meta path (`registrarMensagemEntrante`) and the non-official/ponte path (`registrarMensagemPropria`), since both funnel through the same `Conversation` model and the same two functions regardless of `ChannelConfig.modo`.
- "OportunidadeStatus: enum, migração, serviços, validações, endpoints, filtros, frontend, relatórios, indicadores, taxas de conversão, histórico" → Tasks 1, 9, 10, 11, 12 respectively. "Histórico de alterações" → `registrarAuditoria` is already called inside `fecharOportunidade`/`reabrirOportunidade` with the real `input.status`/`atual.status`, so `DESCARTADA` is audited automatically, no new code needed (verified in Task 9's read of the existing function body).
- "Não reclassifique oportunidades históricas automaticamente" → Task 1's migration is additive-only (no `UPDATE` statement); no task in this plan touches existing rows.
- "RBAC de 6 perfis, isolamento de canais, visibilidade por supervisor, concorrência atômica, motor de automação, integrações WhatsApp, contratos de API que não precisam mudar" → none of these are touched by any task; Task 7 adds a regression test specifically to pin the concurrency guarantee.

**Placeholder scan:** no task contains "TBD"/"handle edge cases"/"similar to Task N" — every step has literal code or a literal shell command. The few places that say "read the file first" (Tasks 3, 4, 6, 8, 12) do so because the exact mock/fixture shape of an existing test file is the authority, not because the step is vague — the assertion each test must make is spelled out in full.

**Type consistency:** `aoFalarComCliente`/`aoReceberDoCliente`/`EM_ATENDIMENTO_ATIVO` (Task 2) are the only new exported names, and every later task that uses them (3, 4, 5, 6) imports the same three names with the same signatures. `OportunidadeStatus`'s three call sites that needed a signature change (`opportunities.schemas.ts`, `OportunidadesTab.tsx`'s `aoFechar`/`enviarFechamento`/`fechar`) all land on the same literal union `'GANHA' | 'PERDIDA' | 'DESCARTADA'`.

**Review Focus:** all five items listed have an owning task and an explicit test (Tasks 3, 6, 10, 11, 7 respectively).
