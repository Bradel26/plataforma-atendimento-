# Atendimento por número (Minhas / Fila / Acompanhar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organizar o Atendimento pelo número de WhatsApp (`canalConfig.donoId`), restringir o Supervisor aos números de Comercial e Suporte em toda a plataforma, e desligar o Webchat.

**Architecture:** A regra de quem vê o quê fica só em `politicaConversas` (backend). As abas são filtros extras combinados por `AND` com a política, num módulo puro `conversations.visao.ts`. O tempo real escolhe as salas pelo dono do número, consultado pelo próprio hub. O front só decide em qual aba uma conversa entra.

**Tech Stack:** Node/Express, Prisma (Postgres/Neon), Zod, Socket.IO, React + Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-05-atendimento-minhas-fila-acompanhar-design.md`

## Global Constraints

- Setor = perfil do dono do número. Supervisor acompanha `['COMERCIAL', 'SUPORTE']`.
- Abas: `MINHAS`, `FILA`, `ACOMPANHAR` (rótulos "Minhas", "Fila", "Acompanhar"). Aba inicial: `FILA`.
- Campo novo no resumo/detalhe da conversa: `linha: { id: string; donoId: string | null } | null` (o nome `canal` já é o tipo de canal).
- Valor especial do seletor: `donoId=EMPRESA` = Número da empresa.
- `donoId`/`canalConfigId` fora da permissão → lista vazia, nunca 403. `visao=ACOMPANHAR` para quem não é ADMIN/SUPERVISOR → 403.
- Webchat: `WEBCHAT_ATIVO` (API) e `VITE_WEBCHAT_ATIVO` (front), ambos desligados por padrão. Nada sai do `enum Channel`, nenhuma migration.
- Testes só de unidade (Vitest), sem banco. Nunca rodar `npm run smoke:*` (escrevem na base real).
- Trabalhar na branch `feat/atendimento-por-numero`. **Nunca dar push na `main` sem o usuário pedir** — push na `main` dispara deploy em produção.
- Comentários e mensagens no estilo do repo: português sem acento em código, com acento em texto de tela.

## Review Focus

- Supervisor abrindo pela URL uma conversa do número do Administrador → 404, igual a conversa inexistente (coberto pelo teste da política, Task 1).
- Conversa do número do Leandro transferida para a Alessandra → ela vê e está na Fila dela; o Leandro continua vendo em Minhas (Task 1 e Task 7).
- Supervisor nunca recebe evento de socket de conversa de número de Admin ou de outro Supervisor (Task 4).
- Contador da aba Fila conta só as em espera, igual ao que a aba destaca (Task 3).
- Supervisor mandando `donoId` do Administrador recebe lista vazia, não erro (Task 3).

---

### Task 0: Branch de trabalho

- [ ] **Step 1: Criar a branch a partir da `main` local (que já tem o commit do spec)**

```bash
git switch -c feat/atendimento-por-numero
git log --oneline -2
```
Expected: `dfcec05 docs(atendimento): spec das abas...` no topo.

---

### Task 1: Regra de visibilidade em `politicaConversas`

**Files:**
- Modify: `apps/api/src/lib/politicas.ts` (bloco `politicaConversas`, linhas ~38-80)
- Modify: `apps/api/src/lib/visibilidade.ts` (ramo `veTudo` de `contextoVisibilidade`, linhas ~72-81)
- Test: `apps/api/src/lib/visibilidade.test.ts` (constante `FORA_DE_LINHA_PESSOAL_ALHEIA`, describe `nada vira sem filtro` e `conversas`)

**Interfaces:**
- Produces: `PERFIS_ACOMPANHADOS_PELO_SUPERVISOR: Role[]`, `podeAcompanhar(perfil: string): boolean`, `DO_NUMERO_DA_EMPRESA: Prisma.ConversationWhereInput`, `conversaVisivel(id: string): Promise<boolean>` — todos exportados de `politicas.ts`.
- Produces: `contextoVisibilidade()` passa a preencher `filaIds` também para ADMIN/SUPERVISOR.

- [ ] **Step 1: Escrever os testes que falham** — em `visibilidade.test.ts`, trocar a constante `FORA_DE_LINHA_PESSOAL_ALHEIA` por:

```ts
/** Conversa do Numero da empresa: sem linha, ou linha sem dono (2026-10-05). */
const EMPRESA = { OR: [{ canalConfigId: null }, { canalConfig: { donoId: null } }] };
const MEU_NUMERO = { canalConfig: { donoId: EU } };
const ATRIBUIDA_A_MIM = { agenteId: EU };
```

Trocar o teste `agente sem fila nenhuma nao ve espera nenhuma...` por:

```ts
  it('agente sem fila nenhuma nao ve espera nenhuma, e nao vira sem filtro', () => {
    // O termo da fila continua no filtro, com lista vazia: `in: []` nao casa
    // com nada. Omitir o termo seria "qualquer conversa em espera".
    expect(politicaConversas.filtro(AGENTE_SEM_FILA)).toEqual({
      OR: [MEU_NUMERO, ATRIBUIDA_A_MIM, { status: 'EM_ESPERA', filaId: { in: [] } }],
    });
  });
```

Substituir o `describe('conversas', ...)` inteiro por:

```ts
describe('conversas (organizadas por numero, 2026-10-05)', () => {
  it('ADMIN ve todas, inclusive numero pessoal de outra pessoa', () => {
    expect(politicaConversas.filtro(ADMIN)).toEqual({});
  });

  it('SUPERVISOR ve Numero da empresa, numeros de Comercial e Suporte, o proprio e o atribuido a ele', () => {
    expect(politicaConversas.filtro(SUPERVISOR)).toEqual({
      OR: [
        EMPRESA,
        { canalConfig: { dono: { perfil: { in: ['COMERCIAL', 'SUPORTE'] } } } },
        MEU_NUMERO,
        ATRIBUIDA_A_MIM,
      ],
    });
  });

  it('SUPERVISOR nunca recebe filtro vazio — sem isso veria o numero do Administrador', () => {
    expect(Object.keys(politicaConversas.filtro(SUPERVISOR)).length).toBeGreaterThan(0);
  });

  it('gestor: proprio numero, atribuidas, e a espera e a equipe so no Numero da empresa', () => {
    expect(politicaConversas.filtro(GESTOR)).toEqual({
      OR: [
        MEU_NUMERO,
        ATRIBUIDA_A_MIM,
        { AND: [EMPRESA, { OR: [{ agenteId: { in: [EU, COLEGA] } }, { status: 'EM_ESPERA' }] }] },
      ],
    });
  });

  it('comercial/suporte/agente: proprio numero, atribuidas de qualquer numero, espera das filas em que atuam', () => {
    // "Atribuidas de qualquer numero" e o caso da transferencia: o Leandro passa
    // a conversa do numero dele para a Alessandra, e ela precisa ve-la.
    expect(politicaConversas.filtro(AGENTE)).toEqual({
      OR: [MEU_NUMERO, ATRIBUIDA_A_MIM, { status: 'EM_ESPERA', filaId: { in: ['f-1'] } }],
    });
  });
});
```

Atualizar o comentário acima de `const TODAS = [...]`: "`politicaConversas` fica FORA desta lista: o SUPERVISOR nao recebe filtro vazio nela (2026-10-05) — tem describe proprio".

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/api/src/lib/visibilidade.test.ts`
Expected: FAIL nos testes de `conversas` e em `agente sem fila` (o filtro atual ainda usa `foraDeLinhaPessoalAlheia`).

- [ ] **Step 3: Implementar em `politicas.ts`** — trocar `import type { Prisma } from '@prisma/client';` por `import type { Prisma, Role } from '@prisma/client';` e substituir o bloco `export const politicaConversas = {...};` por:

```ts
/**
 * Perfis dos donos de numero que o SUPERVISOR acompanha.
 *
 * "Setor Comercial e Suporte" e o perfil do dono do numero — nao existe
 * entidade de setor (decisao de 2026-10-05). Se alguem mudar de perfil, a
 * visibilidade muda junto.
 */
export const PERFIS_ACOMPANHADOS_PELO_SUPERVISOR: Role[] = ['COMERCIAL', 'SUPORTE'];

/** Quem tem a aba Acompanhar e o seletor de usuario. */
export const podeAcompanhar = (perfil: string): boolean => perfil === 'ADMIN' || perfil === 'SUPERVISOR';

/**
 * Conversa do Numero da empresa: sem linha registrada, ou numa linha sem dono
 * (a compartilhada, Instagram, Facebook). Nao e de nenhuma pessoa.
 */
export const DO_NUMERO_DA_EMPRESA: Prisma.ConversationWhereInput = {
  OR: [{ canalConfigId: null }, { canalConfig: { donoId: null } }],
};

export const politicaConversas = {
  /**
   * Atendimento organizado por NUMERO (`canalConfig.donoId`), nao por
   * responsavel (2026-10-05):
   *
   * - ADMIN ve todas, inclusive numero pessoal de outra pessoa. Reverte a
   *   decisao de 2026-09-25, que escondia linha pessoal ate do ADMIN.
   * - SUPERVISOR ve o Numero da empresa e os numeros cujo dono e COMERCIAL ou
   *   SUPORTE — nao o de ADMIN, nem o de outro SUPERVISOR. Vale em toda a
   *   plataforma: lista, abrir por id, ficha do contato, etiquetas.
   * - Os demais: as atribuidas a ele (de qualquer numero — e assim que uma
   *   transferencia chega) e as em espera nas filas em que atua.
   *
   * Para todos, as conversas do proprio numero ficam sempre visiveis, mesmo
   * transferidas: "Minhas" e o meu numero.
   */
  filtro(ctx: ContextoVisibilidade): Prisma.ConversationWhereInput {
    if (ctx.perfil === 'ADMIN') return {};

    const doMeuNumero: Prisma.ConversationWhereInput = { canalConfig: { donoId: ctx.usuarioId } };
    const atribuidaAMim: Prisma.ConversationWhereInput = { agenteId: ctx.usuarioId };

    if (ctx.perfil === 'SUPERVISOR') {
      return {
        OR: [
          DO_NUMERO_DA_EMPRESA,
          { canalConfig: { dono: { perfil: { in: PERFIS_ACOMPANHADOS_PELO_SUPERVISOR } } } },
          doMeuNumero,
          atribuidaAMim,
        ],
      };
    }

    if (ctx.veEquipe) {
      return {
        OR: [
          doMeuNumero,
          atribuidaAMim,
          { AND: [DO_NUMERO_DA_EMPRESA, { OR: [{ agenteId: { in: ctx.equipeIds } }, { status: 'EM_ESPERA' }] }] },
        ],
      };
    }

    return {
      OR: [
        doMeuNumero,
        atribuidaAMim,
        // `filaIds` vazio produz `in: []`, que nao casa com nada. E o
        // comportamento certo: quem nao esta em fila nenhuma nao ve espera
        // nenhuma. Um `if` que omitisse este termo transformaria "nenhuma
        // fila" em "sem filtro".
        { status: 'EM_ESPERA', filaId: { in: ctx.filaIds } },
      ],
    };
  },
};

/**
 * O solicitante pode ver esta conversa? Mesma politica da lista e do acesso por
 * id — usada pelo socket antes de deixar alguem entrar na sala da conversa.
 */
export async function conversaVisivel(id: string): Promise<boolean> {
  const achada = await prisma.conversation.findFirst({
    where: apenasVisivel(id, await filtroDe(politicaConversas)),
    select: { id: true },
  });
  return achada !== null;
}
```

- [ ] **Step 4: `filaIds` para todos em `visibilidade.ts`** — no ramo `if (veTudo) {`, substituir o `return {...}` por:

```ts
    // Quem ve tudo nao precisa de equipe, mas precisa das filas: a aba Fila
    // mostra a espera das filas em que a pessoa atua, qualquer que seja o perfil.
    if (veTudo) {
      const vinculos = await prisma.queueAgent.findMany({ where: { usuarioId }, select: { filaId: true } });
      return {
        usuarioId,
        perfil: papel,
        filaIds: vinculos.map((v) => v.filaId),
        equipeIds: [],
        veTudo: true,
        veEquipe: false,
        carteiraAberta: true,
      };
    }
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run apps/api/src/lib/visibilidade.test.ts`
Expected: PASS.

- [ ] **Step 6: Suite inteira — mocks de prisma que não conhecem `queueAgent`**

Run: `npm test`
Expected: pode falhar com `Cannot read properties of undefined (reading 'map')` vindo de `visibilidade.ts` em testes que rodam como ADMIN. Em cada arquivo assim, fazer o mock de `queueAgent.findMany` devolver lista vazia. Em `apps/api/src/modules/conversations/conversations.service.test.ts`, no bloco `vi.hoisted`, trocar `queueAgentFindMany: vi.fn(),` por `queueAgentFindMany: vi.fn().mockResolvedValue([]),`. Repetir até `npm test` passar.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/lib/politicas.ts apps/api/src/lib/visibilidade.ts apps/api/src/lib/visibilidade.test.ts apps/api/src/modules/conversations/conversations.service.test.ts
git commit -m "feat(visibilidade): conversas por numero; supervisor so Comercial e Suporte"
```

---

### Task 2: Filtros das abas (módulo puro)

**Files:**
- Create: `apps/api/src/modules/conversations/conversations.visao.ts`
- Test: `apps/api/src/modules/conversations/conversations.visao.test.ts`

**Interfaces:**
- Consumes: `DO_NUMERO_DA_EMPRESA` (Task 1).
- Produces:
  - `type VisaoInbox = 'MINHAS' | 'FILA' | 'ACOMPANHAR'`
  - `const DONO_EMPRESA = 'EMPRESA'`
  - `type FiltroDaVisao = { visao?: VisaoInbox; donoId?: string; canalConfigId?: string }`
  - `filtroDaVisao(f: FiltroDaVisao, eu: { usuarioId: string; filaIds: string[] }): Prisma.ConversationWhereInput`

- [ ] **Step 1: Escrever os testes que falham**

```ts
import { describe, expect, it } from 'vitest';
import { DONO_EMPRESA, filtroDaVisao } from './conversations.visao';

const EU = { usuarioId: 'u-eu', filaIds: ['f-comercial'] };
const FORA_DOS_MEUS = {
  OR: [{ canalConfigId: null }, { canalConfig: { donoId: null } }, { canalConfig: { donoId: { not: 'u-eu' } } }],
};

/**
 * As abas so ESTREITAM o que a politica ja liberou — sao combinadas com
 * `politicaConversas` por AND em `listarConversas`. Nada aqui decide quem pode
 * ver o que.
 */
describe('filtroDaVisao', () => {
  it('sem visao: nenhum filtro extra', () => {
    expect(filtroDaVisao({}, EU)).toEqual({});
  });

  it('Minhas: conversas de qualquer numero meu, nao as atribuidas a mim', () => {
    expect(filtroDaVisao({ visao: 'MINHAS' }, EU)).toEqual({ canalConfig: { donoId: 'u-eu' } });
  });

  it('Fila: fora dos meus numeros, atribuidas a mim ou em espera nas minhas filas', () => {
    expect(filtroDaVisao({ visao: 'FILA' }, EU)).toEqual({
      AND: [FORA_DOS_MEUS, { OR: [{ agenteId: 'u-eu' }, { status: 'EM_ESPERA', filaId: { in: ['f-comercial'] } }] }],
    });
  });

  it('Fora dos meus numeros inclui conversa sem linha e linha sem dono — `not` sozinho perderia os nulos no SQL', () => {
    expect(FORA_DOS_MEUS.OR).toContainEqual({ canalConfigId: null });
    expect(FORA_DOS_MEUS.OR).toContainEqual({ canalConfig: { donoId: null } });
  });

  it('Acompanhar sem seletor: tudo fora dos meus numeros', () => {
    expect(filtroDaVisao({ visao: 'ACOMPANHAR' }, EU)).toEqual({ AND: [FORA_DOS_MEUS] });
  });

  it('Acompanhar um usuario: so os numeros dele', () => {
    expect(filtroDaVisao({ visao: 'ACOMPANHAR', donoId: 'u-leandro' }, EU)).toEqual({
      AND: [FORA_DOS_MEUS, { canalConfig: { donoId: 'u-leandro' } }],
    });
  });

  it('Acompanhar o Numero da empresa', () => {
    expect(filtroDaVisao({ visao: 'ACOMPANHAR', donoId: DONO_EMPRESA }, EU)).toEqual({
      AND: [FORA_DOS_MEUS, { OR: [{ canalConfigId: null }, { canalConfig: { donoId: null } }] }],
    });
  });

  it('Acompanhar um numero especifico', () => {
    expect(filtroDaVisao({ visao: 'ACOMPANHAR', donoId: 'u-leandro', canalConfigId: 'c-2' }, EU)).toEqual({
      AND: [FORA_DOS_MEUS, { canalConfig: { donoId: 'u-leandro' } }, { canalConfigId: 'c-2' }],
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/api/src/modules/conversations/conversations.visao.test.ts`
Expected: FAIL — "Failed to resolve import ./conversations.visao".

- [ ] **Step 3: Implementar `conversations.visao.ts`**

```ts
import type { Prisma } from '@prisma/client';
import { DO_NUMERO_DA_EMPRESA } from '../../lib/politicas';

/** Abas do Atendimento, organizadas por numero de WhatsApp (2026-10-05). */
export type VisaoInbox = 'MINHAS' | 'FILA' | 'ACOMPANHAR';

/** Valor do seletor de Acompanhar para o Numero da empresa. */
export const DONO_EMPRESA = 'EMPRESA';

export type FiltroDaVisao = { visao?: VisaoInbox; donoId?: string; canalConfigId?: string };

/**
 * Tudo que nao e de um numero meu.
 *
 * Os dois termos de nulo sao obrigatorios: `donoId: { not: eu }` sozinho vira
 * `dono_id <> eu` no SQL, que e NULL — e portanto falso — para linha sem dono.
 * O Numero da empresa sumiria de Fila e de Acompanhar.
 */
function foraDosMeusNumeros(usuarioId: string): Prisma.ConversationWhereInput {
  return {
    OR: [{ canalConfigId: null }, { canalConfig: { donoId: null } }, { canalConfig: { donoId: { not: usuarioId } } }],
  };
}

/**
 * Filtro extra de cada aba. So estreita: `listarConversas` combina com a
 * politica de visibilidade por AND, entao um `donoId` de alguem que eu nao
 * posso acompanhar devolve lista vazia, nunca abre nada.
 */
export function filtroDaVisao(
  f: FiltroDaVisao,
  eu: { usuarioId: string; filaIds: string[] },
): Prisma.ConversationWhereInput {
  switch (f.visao) {
    case undefined:
      return {};
    case 'MINHAS':
      return { canalConfig: { donoId: eu.usuarioId } };
    case 'FILA':
      return {
        AND: [
          foraDosMeusNumeros(eu.usuarioId),
          { OR: [{ agenteId: eu.usuarioId }, { status: 'EM_ESPERA', filaId: { in: eu.filaIds } }] },
        ],
      };
    case 'ACOMPANHAR': {
      const termos: Prisma.ConversationWhereInput[] = [foraDosMeusNumeros(eu.usuarioId)];
      if (f.donoId === DONO_EMPRESA) termos.push(DO_NUMERO_DA_EMPRESA);
      else if (f.donoId) termos.push({ canalConfig: { donoId: f.donoId } });
      if (f.canalConfigId) termos.push({ canalConfigId: f.canalConfigId });
      return { AND: termos };
    }
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run apps/api/src/modules/conversations/conversations.visao.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/conversations/conversations.visao.ts apps/api/src/modules/conversations/conversations.visao.test.ts
git commit -m "feat(atendimento): filtros das abas Minhas, Fila e Acompanhar"
```

---

### Task 3: Lista, contadores, acompanháveis e o campo `linha`

**Files:**
- Modify: `apps/api/src/modules/conversations/conversations.serializer.ts` (`inclusaoResumo`, `inclusaoDetalhe`, `toConversaResumo`, `toConversaDetalhe`)
- Modify: `apps/api/src/modules/conversations/conversations.schemas.ts:4-7` (`listarConversasSchema`)
- Modify: `apps/api/src/modules/conversations/conversations.service.ts` (`listarConversas` ~91-130, `contarPorStatus` ~164-176, nova `listarAcompanhaveis`, nova `agruparPorDono`)
- Modify: `apps/api/src/modules/conversations/conversations.routes.ts:90-95` (contadores) + rota nova
- Test: `apps/api/src/modules/conversations/conversations.service.test.ts`

**Interfaces:**
- Consumes: `filtroDaVisao`, `DONO_EMPRESA`, `VisaoInbox` (Task 2); `podeAcompanhar`, `PERFIS_ACOMPANHADOS_PELO_SUPERVISOR` (Task 1); `contextoVisibilidade` de `lib/visibilidade`.
- Produces:
  - resumo e detalhe com `linha: { id: string; donoId: string | null } | null`
  - `contarPorVisao(): Promise<{ contadores: { MINHAS: number; FILA: number; ACOMPANHAR: number | null }; minhasFilaIds: string[] }>`
  - `listarAcompanhaveis(): Promise<{ usuarios: Array<{ id: string; nome: string; perfil: Role; numeros: Array<{ id: string; nome: string }> }>; empresa: true }>`
  - `GET /conversas/contadores` → `{ contadores, minhasFilaIds }`; `GET /conversas/acompanhaveis`; `GET /conversas?visao=&donoId=&canalConfigId=`

- [ ] **Step 1: Escrever os testes que falham** — em `conversations.service.test.ts`:
  - no `vi.hoisted` adicionar `conversationCount: vi.fn().mockResolvedValue(0),` e `channelConfigFindMany: vi.fn().mockResolvedValue([]),`
  - no mock de prisma: `conversation: { ..., count: conversationCount }` e `channelConfig: { findFirst: channelConfigFindFirst, findMany: channelConfigFindMany }`
  - nos imports do service, trocar `contarPorStatus` por `contarPorVisao`, e adicionar `listarAcompanhaveis, agruparPorDono`
  - trocar o teste `contarPorStatus: sempre exclui arquivadas...` e acrescentar:

```ts
describe('abas por numero (2026-10-05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    conversationFindMany.mockResolvedValue([]);
    conversationCount.mockResolvedValue(0);
  });

  const comoPerfil = <T>(perfil: string, fn: () => Promise<T>) =>
    comOrganizacao('org-1', fn, { id: 'user-1', perfil });

  it('Minhas filtra pelo dono do numero, nao pelo responsavel', async () => {
    await comoPerfil('COMERCIAL', () => listarConversas(SOLICITANTE, { limite: 50, tags: [], visao: 'MINHAS' }));
    const where = JSON.stringify(conversationFindMany.mock.calls[0]?.[0]?.where);
    expect(where).toContain('"canalConfig":{"donoId":"user-1"}');
  });

  it('Supervisor com donoId do Administrador: o termo entra junto da politica (lista vazia, nunca abre)', async () => {
    await comoPerfil('SUPERVISOR', () =>
      listarConversas(SOLICITANTE, { limite: 50, tags: [], visao: 'ACOMPANHAR', donoId: 'u-admin' }),
    );
    const where = JSON.stringify(conversationFindMany.mock.calls[0]?.[0]?.where);
    expect(where).toContain('"donoId":"u-admin"');
    expect(where).toContain('"perfil":{"in":["COMERCIAL","SUPORTE"]}');
  });

  it('Acompanhar e recusado para Comercial', async () => {
    await expect(
      comoPerfil('COMERCIAL', () => listarConversas(SOLICITANTE, { limite: 50, tags: [], visao: 'ACOMPANHAR' })),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('donoId fora da aba Acompanhar e 400', async () => {
    await expect(
      comoPerfil('ADMIN', () => listarConversas(SOLICITANTE, { limite: 50, tags: [], visao: 'FILA', donoId: 'u-x' })),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('contadores: Fila conta so as em espera; nenhum conta arquivada; Comercial nao tem Acompanhar', async () => {
    const r = await comoPerfil('COMERCIAL', () => contarPorVisao());
    expect(r.contadores.ACOMPANHAR).toBeNull();
    const wheres = conversationCount.mock.calls.map((c) => JSON.stringify(c[0].where));
    expect(wheres).toHaveLength(2);
    for (const w of wheres) expect(w).toContain('"arquivada":false');
    expect(wheres[1]).toContain('"status":"EM_ESPERA"');
  });

  it('acompanhaveis: Comercial recebe 403', async () => {
    await expect(comoPerfil('COMERCIAL', () => listarAcompanhaveis())).rejects.toMatchObject({ status: 403 });
  });

  it('acompanhaveis: Supervisor so ve donos Comercial/Suporte e nunca o proprio numero', async () => {
    await comoPerfil('SUPERVISOR', () => listarAcompanhaveis());
    const where = JSON.stringify(channelConfigFindMany.mock.calls[0]?.[0]?.where);
    expect(where).toContain('"perfil":{"in":["COMERCIAL","SUPORTE"]}');
    expect(where).toContain('{"donoId":{"not":"user-1"}}');
  });

  it('agruparPorDono junta os numeros de cada pessoa e da nome a numero sem rotulo', () => {
    const dono = { id: 'u-l', nome: 'Leandro', perfil: 'COMERCIAL' as const };
    expect(
      agruparPorDono([
        { id: 'c-1', nome: 'Vendas', ponteSessao: 's1', dono },
        { id: 'c-2', nome: null, ponteSessao: 'vendedor-ab12', dono },
      ]),
    ).toEqual([
      { ...dono, numeros: [{ id: 'c-1', nome: 'Vendas' }, { id: 'c-2', nome: 'vendedor-ab12' }] },
    ]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/api/src/modules/conversations/conversations.service.test.ts`
Expected: FAIL — `contarPorVisao`/`listarAcompanhaveis`/`agruparPorDono` não exportados.

- [ ] **Step 3: Serializer** — em `inclusaoResumo` e `inclusaoDetalhe`, trocar `canalConfig: { select: { iaAtiva: true } },` por `canalConfig: { select: { id: true, donoId: true, iaAtiva: true } },`. Em `toConversaResumo` e `toConversaDetalhe`, logo depois de `iaAtiva: ...`, acrescentar:

```ts
    // De qual numero a conversa e — decide a aba (Minhas/Fila/Acompanhar).
    // Nulo = Numero da empresa sem linha registrada.
    linha: c.canalConfig ? { id: c.canalConfig.id, donoId: c.canalConfig.donoId } : null,
```

- [ ] **Step 4: Schema** — em `listarConversasSchema`, trocar as linhas de `minhas` por:

```ts
  /** Aba do Atendimento. Sem ela, so a politica de visibilidade filtra. */
  visao: z.enum(['MINHAS', 'FILA', 'ACOMPANHAR']).optional(),
  /** Seletor de Acompanhar: id do dono do numero, ou EMPRESA. */
  donoId: z.union([z.literal('EMPRESA'), z.string().uuid()]).optional(),
  /** Filtro por numero dentro de Acompanhar. */
  canalConfigId: z.string().uuid().optional(),
```

- [ ] **Step 5: Service** — imports: adicionar `import { contextoVisibilidade } from '../../lib/visibilidade';` (junto do `apenasVisivel` existente), `PERFIS_ACOMPANHADOS_PELO_SUPERVISOR, podeAcompanhar` ao import de `../../lib/politicas`, e `import { filtroDaVisao } from './conversations.visao';`. Em `listarConversas`, trocar a linha `if (query.minhas === 'true') filtros.push({ agenteId: solicitante.sub });` por:

```ts
  const ctx = await contextoVisibilidade();
  if (query.visao === 'ACOMPANHAR' && !podeAcompanhar(ctx.perfil)) {
    throw forbidden('Só administrador e supervisor acompanham outros números');
  }
  if ((query.donoId || query.canalConfigId) && query.visao !== 'ACOMPANHAR') {
    throw badRequest('donoId e canalConfigId só valem na aba Acompanhar');
  }
  filtros.push(filtroDaVisao(query, ctx));
```

Substituir `contarPorStatus` inteira por:

```ts
/**
 * Contadores por aba, com o mesmo filtro da lista de cada uma — senao o numero
 * da aba nao bate com o que aparece embaixo dele. Fila conta so as em espera,
 * que e o que a aba destaca. Arquivadas nunca contam (Fase 11.9-A, item 8).
 *
 * Devolve tambem as filas do solicitante: a tela precisa delas para decidir se
 * uma conversa que chegou pelo socket entra na aba Fila.
 */
export async function contarPorVisao() {
  const ctx = await contextoVisibilidade();
  const base: Prisma.ConversationWhereInput[] = [await escopoVisivel(), { arquivada: false }];
  const contar = (extra: Prisma.ConversationWhereInput) =>
    prisma.conversation.count({ where: { AND: [...base, extra] } });

  const [MINHAS, FILA, ACOMPANHAR] = await Promise.all([
    contar(filtroDaVisao({ visao: 'MINHAS' }, ctx)),
    contar({ AND: [filtroDaVisao({ visao: 'FILA' }, ctx), { status: 'EM_ESPERA' }] }),
    podeAcompanhar(ctx.perfil) ? contar(filtroDaVisao({ visao: 'ACOMPANHAR' }, ctx)) : Promise.resolve(null),
  ]);
  return { contadores: { MINHAS, FILA, ACOMPANHAR }, minhasFilaIds: ctx.filaIds };
}

type LinhaComDono = {
  id: string;
  nome: string | null;
  ponteSessao: string | null;
  dono: { id: string; nome: string; perfil: Role } | null;
};

/** Agrupa as linhas por dono, para o seletor de Acompanhar. Pura. */
export function agruparPorDono(linhas: LinhaComDono[]) {
  const porDono = new Map<string, { id: string; nome: string; perfil: Role; numeros: Array<{ id: string; nome: string }> }>();
  for (const l of linhas) {
    if (!l.dono) continue;
    const item = porDono.get(l.dono.id) ?? { ...l.dono, numeros: [] };
    item.numeros.push({ id: l.id, nome: l.nome ?? l.ponteSessao ?? 'Número sem nome' });
    porDono.set(l.dono.id, item);
  }
  return [...porDono.values()];
}

/**
 * Quem o solicitante pode acompanhar, com os numeros de cada um — mesma regra
 * de `politicaConversas`. So lista quem tem numero: escolher alguem sem numero
 * daria sempre uma lista vazia. O proprio solicitante fica de fora (o numero
 * dele esta em Minhas).
 */
export async function listarAcompanhaveis() {
  const ctx = await contextoVisibilidade();
  if (!podeAcompanhar(ctx.perfil)) throw forbidden('Só administrador e supervisor acompanham outros números');

  const linhas = await prisma.channelConfig.findMany({
    where: {
      canal: 'WHATSAPP',
      AND: [{ donoId: { not: null } }, { donoId: { not: ctx.usuarioId } }],
      ...(ctx.perfil === 'SUPERVISOR' ? { dono: { perfil: { in: PERFIS_ACOMPANHADOS_PELO_SUPERVISOR } } } : {}),
    },
    select: { id: true, nome: true, ponteSessao: true, dono: { select: { id: true, nome: true, perfil: true } } },
    orderBy: [{ dono: { nome: 'asc' } }, { id: 'asc' }],
  });

  return { usuarios: agruparPorDono(linhas), empresa: true as const };
}
```

- [ ] **Step 6: Rotas** — no import do service, trocar `contarPorStatus` por `contarPorVisao` e acrescentar `listarAcompanhaveis`. Substituir a rota `/contadores` e acrescentar a nova, ambas antes de `/:id/avatar`:

```ts
conversationsRoutes.get(
  '/contadores',
  asyncHandler(async (_req, res) => {
    res.json(await contarPorVisao());
  }),
);

/** Seletor da aba Acompanhar — antes de `/:id` para nao ser engolida por ela. */
conversationsRoutes.get(
  '/acompanhaveis',
  asyncHandler(async (_req, res) => {
    res.json(await listarAcompanhaveis());
  }),
);
```

- [ ] **Step 7: Rodar e ver passar**

Run: `npx vitest run apps/api/src/modules/conversations/conversations.service.test.ts && npm run typecheck -w @plataforma/api`
Expected: PASS e typecheck limpo. Se o typecheck acusar outro uso de `contarPorStatus` ou `minhas`, trocar para `contarPorVisao`/`visao`.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/conversations
git commit -m "feat(atendimento): lista por aba, contadores por aba e seletor de acompanhaveis"
```

---

### Task 4: Tempo real pelo dono do número

**Files:**
- Modify: `apps/api/src/realtime/events.ts:38-43` (`salas`)
- Modify: `apps/api/src/realtime/hub.ts` (`emitir`, os três `notificar*` de conversa, `notificarStatusAgente`)
- Modify: `apps/api/src/realtime/server.ts:64-90` (salas na conexão, `conversa:entrar`)
- Test: `apps/api/src/realtime/hub.test.ts` (criar)

**Interfaces:**
- Consumes: `PERFIS_ACOMPANHADOS_PELO_SUPERVISOR`, `conversaVisivel` (Task 1).
- Produces: `salas.admin(org)`; `salasDaConversa(org: string, destinos: Destinos, dono: DonoDaConversa | null): string[]`; `type DonoDaConversa = { donoId: string | null; donoPerfil: Role | null }`.

- [ ] **Step 1: Escrever os testes que falham** — criar `apps/api/src/realtime/hub.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prisma', () => ({ prisma: { conversation: { findUnique: vi.fn() } } }));

import { salasDaConversa } from './hub';

const ORG = 'org-1';
const sala = (s: string) => `org:${ORG}:${s}`;

/**
 * A regra de quem RECEBE cada evento de conversa. A lista vem do banco e ja
 * respeita a politica; sem isto o socket entregaria ao Supervisor, ao vivo, o
 * que a lista esconde dele.
 */
describe('salasDaConversa', () => {
  it('numero do Administrador: supervisao nao recebe', () => {
    const alvos = salasDaConversa(ORG, {}, { donoId: 'u-admin', donoPerfil: 'ADMIN' });
    expect(alvos).toContain(sala('admin'));
    expect(alvos).toContain(sala('usuario:u-admin'));
    expect(alvos).not.toContain(sala('supervisao'));
  });

  it('numero de outro Supervisor: supervisao nao recebe', () => {
    expect(salasDaConversa(ORG, {}, { donoId: 'u-romulo', donoPerfil: 'SUPERVISOR' })).not.toContain(sala('supervisao'));
  });

  it('numero de Comercial ou Suporte: supervisao recebe, e o dono tambem', () => {
    for (const perfil of ['COMERCIAL', 'SUPORTE'] as const) {
      const alvos = salasDaConversa(ORG, {}, { donoId: 'u-leandro', donoPerfil: perfil });
      expect(alvos).toContain(sala('supervisao'));
      expect(alvos).toContain(sala('usuario:u-leandro'));
    }
  });

  it('Numero da empresa: supervisao recebe', () => {
    expect(salasDaConversa(ORG, {}, { donoId: null, donoPerfil: null })).toContain(sala('supervisao'));
  });

  it('dono desconhecido (consulta falhou): so o Administrador — falha fechada', () => {
    const alvos = salasDaConversa(ORG, {}, null);
    expect(alvos).toEqual([sala('admin')]);
  });

  it('fila, responsavel, responsavel anterior e sala da conversa continuam como antes', () => {
    const alvos = salasDaConversa(
      ORG,
      { filaId: 'f-1', agenteId: 'u-a', agenteAnteriorId: 'u-b', conversaId: 'c-1' },
      { donoId: null, donoPerfil: null },
    );
    expect(alvos).toEqual(
      expect.arrayContaining([sala('fila:f-1'), sala('usuario:u-a'), sala('usuario:u-b'), sala('conversa:c-1')]),
    );
  });

  it('incluirSalaDaConversa=false tira a sala da conversa (nota interna)', () => {
    const alvos = salasDaConversa(ORG, { conversaId: 'c-1', incluirSalaDaConversa: false }, { donoId: null, donoPerfil: null });
    expect(alvos).not.toContain(sala('conversa:c-1'));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/api/src/realtime/hub.test.ts`
Expected: FAIL — `salasDaConversa` não exportada.

- [ ] **Step 3: `events.ts`** — no objeto `salas`, acrescentar antes de `supervisao`:

```ts
  /** So ADMIN. A supervisao (SUPERVISOR) e outra sala desde 2026-10-05: ela nao recebe tudo. */
  admin: (org: string) => `org:${org}:admin`,
```

- [ ] **Step 4: `hub.ts`** — imports novos no topo:

```ts
import type { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { PERFIS_ACOMPANHADOS_PELO_SUPERVISOR } from '../lib/politicas';
```

Substituir a função `emitir` inteira por:

```ts
/** Dono do numero que recebeu a conversa — decide se a supervisao a enxerga. */
export type DonoDaConversa = { donoId: string | null; donoPerfil: Role | null };

/** Fila, responsavel, responsavel anterior e sala da conversa — comum a todo evento. */
function salasOperacionais(org: string, destinos: Destinos): string[] {
  const alvos: string[] = [];
  if (destinos.filaId) alvos.push(salas.fila(org, destinos.filaId));
  if (destinos.agenteId) alvos.push(salas.usuario(org, destinos.agenteId));
  if (destinos.agenteAnteriorId) alvos.push(salas.usuario(org, destinos.agenteAnteriorId));
  if (destinos.conversaId && destinos.incluirSalaDaConversa !== false) {
    alvos.push(salas.conversa(org, destinos.conversaId));
  }
  return alvos;
}

/**
 * Salas de um evento de CONVERSA, pela mesma regra de `politicaConversas`:
 * ADMIN sempre; SUPERVISOR so para Numero da empresa e numeros de Comercial e
 * Suporte; o dono do numero sempre (e o que mantem "Minhas" ao vivo depois de
 * uma transferencia). `dono` nulo = nao deu para saber: so o ADMIN, nunca a
 * supervisao — perder um evento e melhor que entregar o que a lista esconde.
 */
export function salasDaConversa(org: string, destinos: Destinos, dono: DonoDaConversa | null): string[] {
  const alvos = new Set<string>([salas.admin(org)]);
  if (dono) {
    const supervisaoVe =
      dono.donoId === null || (dono.donoPerfil !== null && PERFIS_ACOMPANHADOS_PELO_SUPERVISOR.includes(dono.donoPerfil));
    if (supervisaoVe) alvos.add(salas.supervisao(org));
    if (dono.donoId) alvos.add(salas.usuario(org, dono.donoId));
  }
  for (const s of salasOperacionais(org, destinos)) alvos.add(s);
  return [...alvos];
}

/** Evento que nao e de conversa (protocolo, chamada, status de canal): gestao inteira. */
function emitir(evento: string, payload: unknown, destinos: Destinos) {
  if (!io) return;
  const org = organizacaoDoContexto();
  if (!org) return;
  io.to([salas.admin(org), salas.supervisao(org), ...salasOperacionais(org, destinos)]).emit(evento, payload);
}

async function donoDaConversa(conversaId: string): Promise<DonoDaConversa | null> {
  try {
    const c = await prisma.conversation.findUnique({
      where: { id: conversaId },
      select: { canalConfig: { select: { donoId: true, dono: { select: { perfil: true } } } } },
    });
    if (!c) return null;
    return { donoId: c.canalConfig?.donoId ?? null, donoPerfil: c.canalConfig?.dono?.perfil ?? null };
  } catch (erro) {
    console.warn('[realtime] dono da conversa indisponivel; evento so para ADMIN', erro);
    return null;
  }
}

/** O id da conversa: dos destinos, ou do proprio payload (detalhe tem `id`, mensagem tem `conversaId`). */
function idDaConversa(payload: unknown, destinos: Destinos): string | null {
  if (destinos.conversaId) return destinos.conversaId;
  const p = payload as { id?: unknown; conversaId?: unknown } | null;
  if (typeof p?.conversaId === 'string') return p.conversaId;
  if (typeof p?.id === 'string') return p.id;
  return null;
}

/**
 * Evento de conversa. Consulta o dono do numero aqui, e nao nos sete lugares
 * que notificam: a regra fica num lugar so. Melhor-esforco, como o resto do
 * tempo real — nunca derruba quem chamou.
 */
async function emitirDaConversa(evento: string, payload: unknown, destinos: Destinos) {
  if (!io) return;
  const org = organizacaoDoContexto();
  if (!org) return;
  const id = idDaConversa(payload, destinos);
  const dono = id ? await donoDaConversa(id) : null;
  io.to(salasDaConversa(org, destinos, dono)).emit(evento, payload);
}
```

Trocar os três notificadores de conversa por:

```ts
export const notificarConversaNova = (conversa: unknown, destinos: Destinos) =>
  void emitirDaConversa(EVENTOS.conversaNova, conversa, destinos);

export const notificarConversaAtualizada = (conversa: unknown, destinos: Destinos) =>
  void emitirDaConversa(EVENTOS.conversaAtualizada, conversa, destinos);

export const notificarMensagem = (payload: unknown, destinos: Destinos) =>
  void emitirDaConversa(EVENTOS.mensagemNova, payload, destinos);
```

E `notificarStatusAgente`:

```ts
export const notificarStatusAgente = (payload: unknown) => {
  const org = organizacaoDoContexto();
  if (!org) return;
  io?.to([salas.admin(org), salas.supervisao(org)]).emit(EVENTOS.agenteStatus, payload);
};
```

Atualizar o comentário de `notificarPreviaAtualizada` onde diz "aquela funcao sempre inclui `salas.supervisao(org)`" para "aquela funcao inclui a gestao".

- [ ] **Step 5: `server.ts`** — adicionar `import { conversaVisivel } from '../lib/politicas';`. Trocar o bloco `if (usuario.perfil === 'ADMIN' || usuario.perfil === 'SUPERVISOR') { await socket.join(salas.supervisao(org)); } else {` por:

```ts
    if (usuario.perfil === 'ADMIN') {
      await socket.join(salas.admin(org));
    } else if (usuario.perfil === 'SUPERVISOR') {
      await socket.join(salas.supervisao(org));
    } else {
```

E o handler `conversa:entrar` por:

```ts
    socket.on('conversa:entrar', async (id: string) => {
      if (typeof id !== 'string' || !id) return;
      // Mesma politica da lista e do acesso por id: sem isto, qualquer usuario
      // da organizacao escutaria as mensagens de qualquer conversa pelo id.
      const pode = await comOrganizacao(org, () => conversaVisivel(id), {
        id: usuario.sub,
        perfil: usuario.perfil,
      }).catch(() => false);
      if (pode) await socket.join(salas.conversa(org, id));
    });
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run apps/api/src/realtime/hub.test.ts && npm test && npm run typecheck -w @plataforma/api`
Expected: PASS em tudo.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/realtime
git commit -m "feat(realtime): eventos de conversa escolhem salas pelo dono do numero"
```

---

### Task 5: Número da empresa determinístico

**Files:**
- Modify: `apps/api/src/modules/channels/channels.service.ts:425-433` (`obterConfig`)
- Test: `apps/api/src/modules/channels/channels.obterConfig.test.ts` (criar)

**Interfaces:**
- Produces: `obterConfig(canal)` com a mesma assinatura; escolha estável.

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it, vi } from 'vitest';

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn().mockResolvedValue(null) }));
vi.mock('../../lib/prisma', () => ({ prisma: { channelConfig: { findFirst } } }));

import { obterConfig } from './channels.service';

describe('obterConfig', () => {
  it('linha sem dono: prefere a ativa, e desempata de forma estavel', async () => {
    await obterConfig('WHATSAPP');
    // Sem orderBy, com duas linhas sem dono o Postgres devolve qualquer uma —
    // e uma inativa faz o envio falhar com "O canal WhatsApp esta inativo".
    expect(findFirst.mock.calls[0]?.[0]).toEqual({
      where: { canal: 'WHATSAPP', donoId: null },
      orderBy: [{ ativo: 'desc' }, { atualizadoEm: 'asc' }, { id: 'asc' }],
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/api/src/modules/channels/channels.obterConfig.test.ts`
Expected: FAIL — o `findFirst` atual não tem `orderBy`. (Se falhar por outro módulo importado por `channels.service`, mockar esse módulo do mesmo jeito que `channels.routes.test.ts` faz.)

- [ ] **Step 3: Implementar** — em `obterConfig`, trocar a primeira consulta por:

```ts
    (await prisma.channelConfig.findFirst({
      where: { canal, donoId: null },
      // Ordem explicita: com mais de uma linha sem dono, sem ela o Postgres
      // escolhe qualquer uma — e uma inativa derruba o envio de forma
      // intermitente. A ativa vem primeiro; o resto desempata estavel.
      orderBy: [{ ativo: 'desc' }, { atualizadoEm: 'asc' }, { id: 'asc' }],
    })) ??
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run apps/api/src/modules/channels/channels.obterConfig.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/channels/channels.service.ts apps/api/src/modules/channels/channels.obterConfig.test.ts
git commit -m "fix(canais): linha da empresa escolhida de forma deterministica, ativa primeiro"
```

---

### Task 6: Webchat desligado

**Files:**
- Modify: `apps/api/src/env.ts` (perto de `WORKER_EMBUTIDO`)
- Modify: `apps/api/src/app.ts:136` e `:146`
- Create: `apps/web/src/lib/recursos.ts`
- Modify: `apps/web/src/App.tsx:42`, `apps/web/src/pages/configuracoes/BotsTab.tsx:14`, `apps/web/src/pages/configuracoes/FilasTab.tsx:6-17,40,86`, `apps/web/src/pages/configuracoes/CanaisTab.tsx:1081-1110`, `apps/web/src/pages/campanhas/MontarPublico.tsx:41`, `apps/web/src/pages/crm/ContatosTab.tsx:25`
- Test: `apps/web/src/lib/recursos.test.ts` (criar)

**Interfaces:**
- Produces: `WEBCHAT_ATIVO: boolean`, `semWebchat<T>(lista: T[], valor: (item: T) => string): T[]` em `apps/web/src/lib/recursos.ts`.

- [ ] **Step 1: Escrever o teste que falha** — `apps/web/src/lib/recursos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { semWebchat } from './recursos';

describe('semWebchat', () => {
  it('tira o Webchat das opcoes quando ele esta desligado (padrao)', () => {
    expect(semWebchat(['WEBCHAT', 'WHATSAPP'], (c) => c)).toEqual(['WHATSAPP']);
    expect(semWebchat([{ valor: 'WEBCHAT' }, { valor: 'VOZ' }], (c) => c.valor)).toEqual([{ valor: 'VOZ' }]);
  });
});
```

Nota: o Vitest da raiz usa `include: ['apps/*/src/**/*.test.ts']`, então este arquivo roda com `npm test`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/web/src/lib/recursos.test.ts`
Expected: FAIL — "Failed to resolve import ./recursos".

- [ ] **Step 3: Criar `apps/web/src/lib/recursos.ts`**

```ts
/**
 * Webchat desligado por padrao (2026-10-05): a equipe atende so por WhatsApp.
 * O codigo fica; religar e definir VITE_WEBCHAT_ATIVO=true no build (e
 * WEBCHAT_ATIVO=true na API) e implantar de novo.
 */
export const WEBCHAT_ATIVO = import.meta.env.VITE_WEBCHAT_ATIVO === 'true';

/** Tira o Webchat de uma lista de opcoes enquanto ele estiver desligado. */
export function semWebchat<T>(lista: T[], valor: (item: T) => string): T[] {
  return WEBCHAT_ATIVO ? lista : lista.filter((item) => valor(item) !== 'WEBCHAT');
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run apps/web/src/lib/recursos.test.ts`
Expected: PASS.

- [ ] **Step 5: API** — em `env.ts`, depois de `WORKER_EMBUTIDO`:

```ts
  /**
   * Webchat (chat do site). Desligado por padrao desde 2026-10-05: sem ele, a
   * rota publica e o script do widget respondem 404 — um widget esquecido em
   * algum site nao cria conversa que ninguem ve.
   */
  WEBCHAT_ATIVO: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
```

Em `app.ts`, trocar `app.use('/api', widgetRoutes);` por `if (env.WEBCHAT_ATIVO) app.use('/api', widgetRoutes);` e `app.use('/api/webchat', webchatRoutes);` por `if (env.WEBCHAT_ATIVO) app.use('/api/webchat', webchatRoutes);`. Antes, conferir que `widgetRoutes` só serve o widget: `grep -n "Routes\.\(get\|post\)" apps/api/src/modules/widget/widget.routes.ts` — se houver rota que não seja do widget, parar e avisar. Conferir que `env` já é importado em `app.ts`.

- [ ] **Step 6: Front**
  - `App.tsx`: `import { WEBCHAT_ATIVO } from './lib/recursos';` e trocar a rota por `{WEBCHAT_ATIVO && <Route path="/webchat" element={<WebchatPage />} />}`.
  - `MontarPublico.tsx` e `ContatosTab.tsx`: envolver as constantes: `const ORIGENS: Canal[] = semWebchat([...lista atual...], (c) => c);`
  - `BotsTab.tsx`: envolver o array de opções com `semWebchat([...], (o) => o.valor)`.
  - `FilasTab.tsx`: trocar a constante por

```ts
const CANAIS: Array<{ valor: Canal; label: string; disponivel: boolean }> = semWebchat(
  [
    { valor: 'WEBCHAT', label: 'Webchat', disponivel: true },
    { valor: 'WHATSAPP', label: 'WhatsApp', disponivel: true },
    { valor: 'INSTAGRAM', label: 'Instagram', disponivel: false },
    { valor: 'FACEBOOK', label: 'Facebook', disponivel: false },
    { valor: 'EMAIL', label: 'E-mail', disponivel: false },
    { valor: 'VOZ', label: 'Voz', disponivel: false },
  ],
  (c) => c.valor,
);
const CANAL_PADRAO: Canal = WEBCHAT_ATIVO ? 'WEBCHAT' : 'WHATSAPP';
```
    e trocar os dois `canalPadrao: 'WEBCHAT'` por `canalPadrao: CANAL_PADRAO`, e o `hint` do campo por `"Canal em que a fila recebe conversas"`. Antes, conferir que o schema de filas da API aceita `WHATSAPP` em `canalPadrao`: `grep -rn "canalPadrao" apps/api/src/modules/queues/*.schemas.ts` (ou o arquivo equivalente).
  - `CanaisTab.tsx`: envolver o `<Card titulo="Widget do site" ...>...</Card>` inteiro em `{WEBCHAT_ATIVO && (...)}`.

- [ ] **Step 7: Verificar**

Run: `npm run typecheck && npm test`
Expected: limpo e verde.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/env.ts apps/api/src/app.ts apps/web/src/lib/recursos.ts apps/web/src/lib/recursos.test.ts apps/web/src/App.tsx apps/web/src/pages
git commit -m "feat(webchat): desligado por padrao na API e escondido das telas"
```

---

### Task 7: Abas no front (`visao.ts`, tipos, `useConversas`)

**Files:**
- Modify: `apps/web/src/lib/types.ts` (`ConversaBase`, `Contadores`)
- Modify: `apps/web/src/features/atendimento/visao.ts` (reescrita)
- Modify: `apps/web/src/features/atendimento/useConversas.ts`
- Test: `apps/web/src/features/atendimento/visao.test.ts` (reescrita)

**Interfaces:**
- Consumes: API da Task 3 (`linha`, `{ contadores, minhasFilaIds }`, `visao/donoId/canalConfigId`).
- Produces:
  - `type VisaoInbox = 'MINHAS' | 'FILA' | 'ACOMPANHAR'`; `VISOES_INBOX`; `LABEL_VISAO_INBOX`
  - `type FiltroAcompanhar = { donoId: string | null; canalConfigId: string | null }`; `SEM_FILTRO_ACOMPANHAR`
  - `visoesDisponiveis(podeAcompanhar: boolean): readonly VisaoInbox[]`
  - `parametrosDaVisao(visao, filtro): Record<string, string>`
  - `type ContextoDaVisao = { meuUsuarioId: string | null; minhasFilaIds: readonly string[]; filtro: FiltroAcompanhar }`
  - `pertenceAVisao(conversa, visao, ctx): boolean`; `pertenceALista(conversa, visao, ctx): boolean`
  - `useConversas(visao, tags, meuUsuarioId, filtro)`; `Contadores = { MINHAS: number; FILA: number; ACOMPANHAR: number | null }`
  - `type Acompanhaveis = { usuarios: Array<{ id: string; nome: string; perfil: string; numeros: Array<{ id: string; nome: string }> }>; empresa: boolean }`

- [ ] **Step 1: Tipos** — em `types.ts`, em `ConversaBase`, depois de `iaAtiva`:

```ts
  /** De qual numero a conversa e (2026-10-05). Nulo = Numero da empresa sem linha registrada. */
  linha: { id: string; donoId: string | null } | null;
```

Trocar `export type Contadores = Record<ConversaStatus, number>;` por:

```ts
/** Contadores por aba. ACOMPANHAR nulo = o perfil nao tem essa aba. */
export type Contadores = { MINHAS: number; FILA: number; ACOMPANHAR: number | null };

/** Quem posso acompanhar na aba Acompanhar, com os numeros de cada um. */
export type Acompanhaveis = {
  usuarios: Array<{ id: string; nome: string; perfil: string; numeros: Array<{ id: string; nome: string }> }>;
  empresa: boolean;
};
```

Run: `grep -rn "Contadores\|contadores\." apps/web/src --include=*.ts --include=*.tsx` e anotar todo consumidor fora de `useConversas.ts`/`AtendimentoPage.tsx` — cada um precisa ser ajustado nesta task ou na Task 8.

- [ ] **Step 2: Escrever os testes que falham** — substituir `visao.test.ts` inteiro:

```ts
import { describe, expect, it } from 'vitest';
import type { ConversaResumo } from '../../lib/types';
import {
  SEM_FILTRO_ACOMPANHAR,
  parametrosDaVisao,
  pertenceALista,
  pertenceAVisao,
  visoesDisponiveis,
  type ContextoDaVisao,
} from './visao';

/**
 * As abas so decidem EM QUAL ABA uma conversa entra. Quem pode ve-la ja foi
 * decidido pelo servidor (politica na lista, salas no socket).
 */
type Campos = Pick<ConversaResumo, 'status' | 'agente' | 'fila' | 'linha' | 'arquivada'>;
const conversa = (o: Partial<Campos>): Campos => ({
  status: 'ATRIBUIDO',
  agente: null,
  fila: null,
  linha: null,
  arquivada: false,
  ...o,
});
const EU: ContextoDaVisao = { meuUsuarioId: 'u-eu', minhasFilaIds: ['f-comercial'], filtro: SEM_FILTRO_ACOMPANHAR };
const DO_MEU_NUMERO = { id: 'c-meu', donoId: 'u-eu' };
const DO_LEANDRO = { id: 'c-leandro', donoId: 'u-leandro' };
const DA_EMPRESA = { id: 'c-empresa', donoId: null };

describe('visoesDisponiveis', () => {
  it('Acompanhar so para quem pode acompanhar', () => {
    expect(visoesDisponiveis(true)).toEqual(['MINHAS', 'FILA', 'ACOMPANHAR']);
    expect(visoesDisponiveis(false)).toEqual(['MINHAS', 'FILA']);
  });
});

describe('parametrosDaVisao', () => {
  it('manda a aba, e o seletor so em Acompanhar', () => {
    expect(parametrosDaVisao('FILA', { donoId: 'u-x', canalConfigId: 'c-x' })).toEqual({ visao: 'FILA' });
    expect(parametrosDaVisao('ACOMPANHAR', SEM_FILTRO_ACOMPANHAR)).toEqual({ visao: 'ACOMPANHAR' });
    expect(parametrosDaVisao('ACOMPANHAR', { donoId: 'EMPRESA', canalConfigId: null })).toEqual({
      visao: 'ACOMPANHAR',
      donoId: 'EMPRESA',
    });
  });
});

describe('pertenceAVisao', () => {
  it('Minhas = do meu numero, mesmo atribuida a outra pessoa', () => {
    const c = conversa({ linha: DO_MEU_NUMERO, agente: { id: 'u-alessandra', nome: 'Alessandra' } });
    expect(pertenceAVisao(c, 'MINHAS', EU)).toBe(true);
    expect(pertenceAVisao(c, 'FILA', EU)).toBe(false);
    expect(pertenceAVisao(c, 'ACOMPANHAR', EU)).toBe(false);
  });

  it('Fila: transferida para mim de outro numero', () => {
    const c = conversa({ linha: DO_LEANDRO, agente: { id: 'u-eu', nome: 'Eu' } });
    expect(pertenceAVisao(c, 'FILA', EU)).toBe(true);
    expect(pertenceAVisao(c, 'MINHAS', EU)).toBe(false);
  });

  it('Fila: em espera so nas minhas filas', () => {
    const naMinha = conversa({ status: 'EM_ESPERA', linha: DA_EMPRESA, fila: { id: 'f-comercial', nome: 'Comercial' } });
    const naOutra = conversa({ status: 'EM_ESPERA', linha: DA_EMPRESA, fila: { id: 'f-suporte', nome: 'Suporte' } });
    expect(pertenceAVisao(naMinha, 'FILA', EU)).toBe(true);
    expect(pertenceAVisao(naOutra, 'FILA', EU)).toBe(false);
  });

  it('Acompanhar: nunca o meu numero; respeita usuario, Numero da empresa e numero', () => {
    const doLeandro = conversa({ linha: DO_LEANDRO });
    const daEmpresa = conversa({ linha: null });
    const filtroLeandro: ContextoDaVisao = { ...EU, filtro: { donoId: 'u-leandro', canalConfigId: null } };
    const filtroEmpresa: ContextoDaVisao = { ...EU, filtro: { donoId: 'EMPRESA', canalConfigId: null } };
    const outroNumero: ContextoDaVisao = { ...EU, filtro: { donoId: 'u-leandro', canalConfigId: 'c-outro' } };

    expect(pertenceAVisao(doLeandro, 'ACOMPANHAR', EU)).toBe(true);
    expect(pertenceAVisao(daEmpresa, 'ACOMPANHAR', EU)).toBe(true);
    expect(pertenceAVisao(doLeandro, 'ACOMPANHAR', filtroLeandro)).toBe(true);
    expect(pertenceAVisao(daEmpresa, 'ACOMPANHAR', filtroLeandro)).toBe(false);
    expect(pertenceAVisao(daEmpresa, 'ACOMPANHAR', filtroEmpresa)).toBe(true);
    expect(pertenceAVisao(doLeandro, 'ACOMPANHAR', filtroEmpresa)).toBe(false);
    expect(pertenceAVisao(doLeandro, 'ACOMPANHAR', outroNumero)).toBe(false);
  });

  it('sem usuario logado nada e "meu"', () => {
    const c = conversa({ linha: { id: 'c', donoId: 'u-eu' } });
    expect(pertenceAVisao(c, 'MINHAS', { ...EU, meuUsuarioId: null })).toBe(false);
  });
});

describe('pertenceALista', () => {
  it('arquivada sai de todas as abas', () => {
    const c = conversa({ linha: DO_MEU_NUMERO, arquivada: true });
    for (const v of ['MINHAS', 'FILA', 'ACOMPANHAR'] as const) expect(pertenceALista(c, v, EU)).toBe(false);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run apps/web/src/features/atendimento/visao.test.ts`
Expected: FAIL — exports novos não existem.

- [ ] **Step 4: Reescrever `visao.ts`**

```ts
import type { ConversaResumo } from '../../lib/types';

/**
 * Abas do Atendimento, organizadas pelo NUMERO de WhatsApp (2026-10-05), nao
 * pelo responsavel:
 *  - Minhas: conversas de qualquer numero meu
 *  - Fila: o que esta atribuido a mim de outros numeros + espera das minhas filas
 *  - Acompanhar: o que posso ver dos outros numeros (ADMIN e SUPERVISOR)
 */
export type VisaoInbox = 'MINHAS' | 'FILA' | 'ACOMPANHAR';

export const VISOES_INBOX: readonly VisaoInbox[] = ['MINHAS', 'FILA', 'ACOMPANHAR'];

export const LABEL_VISAO_INBOX: Record<VisaoInbox, string> = {
  MINHAS: 'Minhas',
  FILA: 'Fila',
  ACOMPANHAR: 'Acompanhar',
};

/** Seletor de Acompanhar. `donoId` nulo = todos os usuarios permitidos; 'EMPRESA' = Numero da empresa. */
export type FiltroAcompanhar = { donoId: string | null; canalConfigId: string | null };
export const SEM_FILTRO_ACOMPANHAR: FiltroAcompanhar = { donoId: null, canalConfigId: null };

export const visoesDisponiveis = (podeAcompanhar: boolean): readonly VisaoInbox[] =>
  podeAcompanhar ? VISOES_INBOX : VISOES_INBOX.filter((v) => v !== 'ACOMPANHAR');

/** Query de `GET /conversas` para a aba. O seletor so vale em Acompanhar. */
export function parametrosDaVisao(visao: VisaoInbox, filtro: FiltroAcompanhar): Record<string, string> {
  const p: Record<string, string> = { visao };
  if (visao === 'ACOMPANHAR') {
    if (filtro.donoId) p.donoId = filtro.donoId;
    if (filtro.canalConfigId) p.canalConfigId = filtro.canalConfigId;
  }
  return p;
}

export type ContextoDaVisao = {
  meuUsuarioId: string | null;
  /** Filas em que atuo — vem de `GET /conversas/contadores`. */
  minhasFilaIds: readonly string[];
  filtro: FiltroAcompanhar;
};

type Campos = Pick<ConversaResumo, 'status' | 'agente' | 'fila' | 'linha'>;

/**
 * Uma conversa que chegou pelo socket entra na aba ativa?
 *
 * So decide a ABA. Quem pode ver ja foi decidido pelo servidor ao escolher as
 * salas (`realtime/hub.ts`) — nenhuma regra de perfil e reimplementada aqui.
 * Espelha `filtroDaVisao` (api, conversations.visao.ts).
 */
export function pertenceAVisao(conversa: Campos, visao: VisaoInbox, ctx: ContextoDaVisao): boolean {
  const eu = ctx.meuUsuarioId;
  const dono = conversa.linha?.donoId ?? null;
  const doMeuNumero = eu !== null && dono === eu;

  switch (visao) {
    case 'MINHAS':
      return doMeuNumero;
    case 'FILA':
      if (doMeuNumero) return false;
      if (eu !== null && conversa.agente?.id === eu) return true;
      return conversa.status === 'EM_ESPERA' && conversa.fila !== null && ctx.minhasFilaIds.includes(conversa.fila.id);
    case 'ACOMPANHAR': {
      if (doMeuNumero) return false;
      const { donoId, canalConfigId } = ctx.filtro;
      if (donoId === 'EMPRESA' && dono !== null) return false;
      if (donoId && donoId !== 'EMPRESA' && dono !== donoId) return false;
      if (canalConfigId && conversa.linha?.id !== canalConfigId) return false;
      return true;
    }
  }
}

/**
 * Pertence a LISTA (aba + arquivamento). Arquivada sai de todas as abas antes
 * de qualquer outra regra: o evento de socket nao sabe que filtro a tela pediu.
 */
export function pertenceALista(
  conversa: Campos & Pick<ConversaResumo, 'arquivada'>,
  visao: VisaoInbox,
  ctx: ContextoDaVisao,
): boolean {
  if (conversa.arquivada) return false;
  return pertenceAVisao(conversa, visao, ctx);
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run apps/web/src/features/atendimento/visao.test.ts`
Expected: PASS.

- [ ] **Step 6: `useConversas.ts`**
  - import: `import { parametrosDaVisao, pertenceALista, type FiltroAcompanhar, type VisaoInbox } from './visao';`
  - `CONTADORES_ZERADOS` passa a ser `{ MINHAS: 0, FILA: 0, ACOMPANHAR: null }`
  - trocar `partesDaVisao` por:

```ts
/** Query da aba — sem o `&` de etiquetas, que `queryTags` ja resolve. */
function partesDaVisao(visao: VisaoInbox, filtro: FiltroAcompanhar): string {
  return new URLSearchParams(parametrosDaVisao(visao, filtro)).toString();
}
```

  - assinatura: `export function useConversas(visao: VisaoInbox, tags: readonly string[] = [], meuUsuarioId: string | null = null, filtro: FiltroAcompanhar = { donoId: null, canalConfigId: null })`
  - logo depois de `meuUsuarioIdRef.current = meuUsuarioId;`:

```ts
  const filtroRef = useRef(filtro);
  filtroRef.current = filtro;
  /** Muda so quando o seletor muda de verdade — o objeto chega novo a cada render. */
  const chaveFiltro = `${filtro.donoId ?? ''}|${filtro.canalConfigId ?? ''}`;
  const minhasFilaIdsRef = useRef<readonly string[]>([]);
```

  - `carregarContadores`:

```ts
  const carregarContadores = useCallback(async () => {
    const r = await api.get<{ contadores: Contadores; minhasFilaIds: string[] }>('/conversas/contadores');
    setContadores(r.contadores);
    minhasFilaIdsRef.current = r.minhasFilaIds;
  }, []);
```

  - em `carregarLista` e `carregarMais`, trocar `partesDaVisao(visaoParaCarregar)` / `partesDaVisao(visaoRef.current)` por `partesDaVisao(visaoParaCarregar, filtroRef.current)` / `partesDaVisao(visaoRef.current, filtroRef.current)`
  - no `useEffect` que chama `carregarLista(visao)`, dependências: `[visao, chaveTags, chaveFiltro, carregarLista]`
  - em `aplicarEvento`, trocar `pertenceALista(resumo, visaoRef.current, meuUsuarioIdRef.current)` por:

```ts
pertenceALista(resumo, visaoRef.current, {
  meuUsuarioId: meuUsuarioIdRef.current,
  minhasFilaIds: minhasFilaIdsRef.current,
  filtro: filtroRef.current,
})
```

  - atualizar o comentário do hook: "lista da aba ativa (Minhas / Fila / Acompanhar)".

- [ ] **Step 7: Verificar** (o `AtendimentoPage.tsx` ainda usa nomes antigos — a Task 8 conserta)

Run: `npm test`
Expected: PASS. `npm run typecheck -w @plataforma/web` pode acusar só `AtendimentoPage.tsx` e consumidores anotados no Step 1.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/types.ts apps/web/src/features/atendimento/visao.ts apps/web/src/features/atendimento/visao.test.ts apps/web/src/features/atendimento/useConversas.ts
git commit -m "feat(atendimento): abas por numero no front e ao vivo pelo socket"
```

---

### Task 8: Tela de Atendimento — abas, seletor e mensagens

**Files:**
- Modify: `apps/web/src/pages/AtendimentoPage.tsx` (import ~9, estado ~161, `useConversas` ~365, `contadorDaVisao` ~376-380, abas ~559-575, lista ~592)

**Interfaces:**
- Consumes: tudo da Task 7; `GET /conversas/acompanhaveis`.

- [ ] **Step 1: Imports e estado**
  - trocar a linha 9 por `import { LABEL_VISAO_INBOX, SEM_FILTRO_ACOMPANHAR, visoesDisponiveis, type FiltroAcompanhar, type VisaoInbox } from '../features/atendimento/visao';`
  - acrescentar `Acompanhaveis` ao import de `../lib/types`
  - trocar `useState<VisaoInbox>('NAO_ATRIBUIDAS')` por `useState<VisaoInbox>('FILA')` e atualizar o comentário acima ("Comeca em Fila: e onde ha conversa esperando alguem")
  - logo abaixo:

```ts
  const podeAcompanhar = temPerfil('ADMIN', 'SUPERVISOR');
  const [filtroAcompanhar, setFiltroAcompanhar] = useState<FiltroAcompanhar>(SEM_FILTRO_ACOMPANHAR);
  const [acompanhaveis, setAcompanhaveis] = useState<Acompanhaveis | null>(null);
```

  (Se `temPerfil` for declarado depois desse ponto do componente, mover estas linhas para logo depois da declaração dele.)

- [ ] **Step 2: Hook e contadores**
  - `useConversas(visao, tags, usuario?.id ?? null)` → `useConversas(visao, tags, usuario?.id ?? null, filtroAcompanhar)`
  - substituir `contadorDaVisao` e o comentário acima por:

```ts
  /** Numero de cada aba, com o mesmo filtro da lista dela (`GET /conversas/contadores`). Fila conta as em espera. */
  const contadorDaVisao = (v: VisaoInbox): number | null => contadores[v];
```

  - acrescentar o carregamento do seletor:

```ts
  useEffect(() => {
    if (!podeAcompanhar) return;
    void api
      .get<Acompanhaveis>('/conversas/acompanhaveis')
      .then(setAcompanhaveis)
      .catch(() => undefined);
  }, [podeAcompanhar]);

  const usuarioAcompanhado = acompanhaveis?.usuarios.find((u) => u.id === filtroAcompanhar.donoId) ?? null;
```

- [ ] **Step 3: Abas** — trocar `{VISOES_INBOX.map((v) => (` por `{visoesDisponiveis(podeAcompanhar).map((v) => (`.

- [ ] **Step 4: Seletor** — logo depois do `</nav>` das abas:

```tsx
          {visao === 'ACOMPANHAR' && (
            <div className="flex flex-col gap-2 border-b border-slate-100 px-3 py-2">
              <Select
                aria-label="Acompanhar conversas de"
                value={filtroAcompanhar.donoId ?? ''}
                onChange={(e) => setFiltroAcompanhar({ donoId: e.target.value || null, canalConfigId: null })}
              >
                <option value="">Todos os usuários permitidos</option>
                {acompanhaveis?.empresa && <option value="EMPRESA">Número da empresa</option>}
                {acompanhaveis?.usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </Select>
              {usuarioAcompanhado && usuarioAcompanhado.numeros.length > 1 && (
                <Select
                  aria-label="Número"
                  value={filtroAcompanhar.canalConfigId ?? ''}
                  onChange={(e) => setFiltroAcompanhar({ ...filtroAcompanhar, canalConfigId: e.target.value || null })}
                >
                  <option value="">Todos os números de {usuarioAcompanhado.nome}</option>
                  {usuarioAcompanhado.numeros.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.nome}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          )}
```

  Conferir que `Select` já é importado de `../components/ui` neste arquivo; se não, acrescentar ao import.

- [ ] **Step 5: Minhas sem número e prévias** — antes do `<ListaConversas`, dentro do ramo que não é erro:

```tsx
            ) : visao === 'MINHAS' && minhaLinha === null && !carregando && filtradas.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">
                Você não tem um número de WhatsApp conectado. Use “Conectar WhatsApp” para trazer suas conversas para cá.
              </p>
            ) : (
```

  e em `<ListaConversas`, trocar `previas={previas}` por `previas={visao === 'MINHAS' ? previas : []}` — prévia é espelho do meu celular, pertence a Minhas.

- [ ] **Step 6: Verificar tudo**

Run: `npm run typecheck && npm test && npm run build`
Expected: os três limpos.

- [ ] **Step 7: Ver funcionando no local** (API e Vite já rodando em `localhost:3333`/`localhost:5173`)
  - abrir `http://localhost:5173/atendimento` com o Playwright, tirar print: três abas para Administrador, "Fila" ativa, seletor aparecendo ao clicar em "Acompanhar", "Número da empresa" listado
  - `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3333/api/webchat/sessao` → `404`; `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3333/api/widget.js` → `404`
  - olhar o print de verdade antes de declarar pronto

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/pages/AtendimentoPage.tsx
git commit -m "feat(atendimento): abas Minhas, Fila e Acompanhar com seletor de usuario e numero"
```

---

### Task 9: Entrega

- [ ] **Step 1: Verificação final na branch**

Run: `npm run typecheck && npm test && npm run build`
Expected: limpos. Registrar a contagem de testes.

- [ ] **Step 2: Revisão do branch inteiro** — `git diff main...feat/atendimento-por-numero --stat` e uma revisão completa com um revisor novo (`superpowers:requesting-code-review`), corrigindo o que for confirmado.

- [ ] **Step 3: Parar e perguntar ao usuário** se pode mesclar na `main` e dar push (o push dispara o deploy, ~35 min). Não fazer sem o "sim".

- [ ] **Step 4: Depois do deploy — configuração em produção pela tela** (feita pelo usuário, conferida por mim com `node scripts/diagnostico-conversas.mjs`, só leitura):
  - Configurações → Filas: criar **Comercial** (Leandro, Luis, Mateus, Ronaldo, Sunamita) e **Suporte** (Alessandra, Elionay), canal WhatsApp
  - Configurações → Canais → WhatsApp Business: fila de destino = Comercial
  - Conectar um WhatsApp ao Número da empresa, para as 5 conversas sem número voltarem a responder
