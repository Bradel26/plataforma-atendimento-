# Chamado TI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar qualquer pessoa logada abrir um chamado de TI (erro ou
melhoria, com print opcional) direto da plataforma, reaproveitando o módulo
de chamados (`Ticket`/Protocolo) que já existe, e fazer esses chamados
aparecerem marcados na tela de Protocolo que o time de TI já usa.

**Architecture:** Dois campos novos em `Ticket` (`categoria`, `tipoTi`)
distinguem chamado de cliente de chamado interno — sem tabela nova, sem
rota nova (`POST /protocolos` e `POST /protocolos/:id/anexos` já aceitam
qualquer perfil autenticado). Frontend ganha uma tela nova e simples
(`ChamadoTiPage.tsx`) que só cria o ticket e confirma por toast, mais um
item de menu visível a todos os perfis. A tela de gestão existente
(`ProtocoloPage.tsx`) ganha um badge e um filtro para diferenciar os dois
tipos de chamado na mesma lista.

**Tech Stack:** Node/Express/Prisma (Postgres/Neon), React, Vitest, Zod.

**Spec:** `docs/superpowers/specs/2026-09-29-chamado-ti-design.md`

## Global Constraints

- Sem rota nova no backend: `POST /protocolos` e `POST /protocolos/:id/anexos`
  já exigem só `requireAuth` — nenhum `requireRole` a menos ou a mais.
- Sem notificação por e-mail/push (fora de escopo da spec).
- Sem SLA automático de 72h rastreado pelo sistema — "72h" é só texto da
  confirmação, não um `prazoSla` gravado.
- Testes de schema/lógica pura, nunca um teste que escreve no banco de
  desenvolvimento: o projeto não tem suíte de teste de integração contra
  Postgres real na suíte rápida (`npx vitest run`), só funções puras — ver
  `comercial.test.ts` como padrão. `criarTicket` em si não ganha teste
  novo porque não ganhou lógica nova (é o mesmo spread de sempre); o que
  precisa de teste é o **default do schema Zod**, que é lógica pura.

## Review Focus

- Chamado de TI sem print anexado não pode falhar o envio — o upload do
  anexo é uma segunda chamada, condicional, depois da criação do ticket.
- Chamado de TI criado por alguém com perfil que **não** vê a tela
  Protocolo (ex. `SUPORTE`, `COMERCIAL`) ainda precisa ser criado com
  sucesso — a tela nova não pode herdar sem querer nenhum `requireRole`.
- `categoria` ausente no corpo de `POST /protocolos` (todo chamado de
  cliente que já existe no app hoje) tem que continuar virando
  `'ATENDIMENTO'` sozinho — testado via schema Zod, não via chamada real.
- Upload de print que não é imagem (o `<input>` aceita `image/*`, mas o
  navegador não impede colar/arrastar outro tipo) tem que mostrar o erro
  que `POST /protocolos/:id/anexos` já devolve (`storage.ts` recusa tipo
  fora da lista), não travar a tela sem explicação.
- `ProtocoloPage.tsx` já trata `contato` nulo (`'Sem contato'`); o cartão
  do chamado de TI não pode voltar a mostrar "Sem contato" quando
  `tipoTi` está preenchido — tem que mostrar o tipo em vez disso.

---

### Task 1: Backend — schema (`categoria`, `tipoTi` em `Ticket`)

**Files:**
- Modify: `apps/api/prisma/schema.prisma:1379-1437`
- Create: `apps/api/prisma/migrations/20260929130000_chamado_ti/migration.sql`

**Interfaces:**
- Consumes: nada de tarefa anterior.
- Produces: colunas `categoria` (`TicketCategoria`, default `ATENDIMENTO`)
  e `tipo_ti` (`TicketTipoTi`, nula) na tabela `protocolos`. Task 2 usa os
  dois nomes de enum e de campo exatamente como definidos aqui.

- [x] **Step 1: Editar o schema**

Em `apps/api/prisma/schema.prisma`, troque (linhas 1379-1394):

```prisma
enum TicketStatus {
  ABERTO
  EM_ANDAMENTO
  AGUARDANDO_CLIENTE
  RESOLVIDO
  FECHADO
}

enum TicketPrioridade {
  BAIXA
  NORMAL
  ALTA
  URGENTE
}

model Ticket {
```

por:

```prisma
enum TicketStatus {
  ABERTO
  EM_ANDAMENTO
  AGUARDANDO_CLIENTE
  RESOLVIDO
  FECHADO
}

enum TicketPrioridade {
  BAIXA
  NORMAL
  ALTA
  URGENTE
}

/// Chamado de atendimento ao cliente (padrao) ou chamado interno de TI —
/// mesma tabela, dois publicos diferentes. Ver TicketTipoTi para o
/// segundo so fazer sentido quando categoria = TI_INTERNO.
enum TicketCategoria {
  ATENDIMENTO
  TI_INTERNO
}

enum TicketTipoTi {
  ERRO
  MELHORIA
}

model Ticket {
```

E, dentro de `model Ticket`, troque a linha do campo `prioridade` (linha
1409 no arquivo atual):

```prisma
  prioridade    TicketPrioridade @default(NORMAL)
```

por:

```prisma
  prioridade    TicketPrioridade @default(NORMAL)
  categoria     TicketCategoria  @default(ATENDIMENTO)
  /// So preenchido quando categoria = TI_INTERNO.
  tipoTi        TicketTipoTi?    @map("tipo_ti")
```

- [x] **Step 2: Escrever a migration**

Crie `apps/api/prisma/migrations/20260929130000_chamado_ti/migration.sql`:

```sql
-- Chamado de TI: mesma tabela de chamados (protocolos), dois publicos.
--
-- categoria distingue chamado de cliente (ATENDIMENTO, o que ja existia)
-- de chamado interno de TI (TI_INTERNO). tipo_ti so faz sentido no
-- segundo caso, por isso fica nulavel. Default ATENDIMENTO cobre todo
-- protocolo que ja existe sem precisar de backfill manual.

CREATE TYPE "TicketCategoria" AS ENUM ('ATENDIMENTO', 'TI_INTERNO');
CREATE TYPE "TicketTipoTi" AS ENUM ('ERRO', 'MELHORIA');

ALTER TABLE "protocolos"
  ADD COLUMN "categoria" "TicketCategoria" NOT NULL DEFAULT 'ATENDIMENTO',
  ADD COLUMN "tipo_ti" "TicketTipoTi";
```

- [x] **Step 3: Aplicar a migration e regenerar o client**

Run: `cd apps/api && npx prisma migrate deploy`
Expected: `20260929130000_chamado_ti` aparece em "The following migration(s) have been applied".

Run: `npx prisma generate`
Expected: `Generated Prisma Client` sem erro. Se der `EPERM`/arquivo
travado, é o processo do `tsx watch` da API segurando o
`query_engine-windows.dll.node` — pare o processo `dev:api` (ou os
processos `node ... tsx/dist/cli.mjs watch src/main.ts`) e rode de novo;
já aconteceu nesta sessão e a causa foi exatamente essa.

- [x] **Step 4: Confirmar**

Run: `cd apps/api && npx tsc --noEmit`
Expected: PASS (o client novo já expõe `categoria`/`tipoTi` em `Prisma.Ticket`).

- [x] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260929130000_chamado_ti
git commit -m "feat(protocolo): campos categoria e tipoTi no Ticket, para chamado de TI"
```

---

### Task 2: Backend — schemas Zod, service e teste do default

**Files:**
- Modify: `apps/api/src/modules/tickets/tickets.schemas.ts`
- Modify: `apps/api/src/modules/tickets/tickets.service.ts`
- Test: `apps/api/src/modules/tickets/tickets.schemas.test.ts` (novo)

**Interfaces:**
- Consumes: `TicketCategoria`/`TicketTipoTi` (Task 1).
- Produces: `criarTicketSchema` aceita `categoria`/`tipoTi` opcionais (com
  default `'ATENDIMENTO'`/`undefined`); `listarTicketsSchema` aceita
  `categoria` opcional; `listarTickets`/`ticketsKanban` filtram por ela;
  `serialize()` devolve `categoria`/`tipoTi` em todo `Protocolo` — é esse
  shape que a Task 5 (frontend, tipo `Protocolo`) espelha.

- [x] **Step 1: Escrever o teste que falha**

Crie `apps/api/src/modules/tickets/tickets.schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { criarTicketSchema, listarTicketsSchema } from './tickets.schemas';

describe('criarTicketSchema — categoria/tipoTi (chamado de TI)', () => {
  it('categoria default e ATENDIMENTO quando nao informada, e nao exige tipoTi', () => {
    const r = criarTicketSchema.parse({ titulo: 'Sistema lento', descricao: 'Ao abrir a lista de contatos' });
    expect(r.categoria).toBe('ATENDIMENTO');
    expect(r.tipoTi).toBeUndefined();
  });

  it('aceita categoria TI_INTERNO com tipoTi ERRO ou MELHORIA', () => {
    const erro = criarTicketSchema.parse({
      titulo: 'Botao nao responde',
      descricao: 'Ao clicar em Salvar na ficha do contato',
      categoria: 'TI_INTERNO',
      tipoTi: 'ERRO',
    });
    expect(erro.categoria).toBe('TI_INTERNO');
    expect(erro.tipoTi).toBe('ERRO');

    const melhoria = criarTicketSchema.parse({
      titulo: 'Filtro por DDD',
      descricao: 'Seria util filtrar contatos por DDD direto na lista',
      categoria: 'TI_INTERNO',
      tipoTi: 'MELHORIA',
    });
    expect(melhoria.tipoTi).toBe('MELHORIA');
  });

  it('rejeita tipoTi fora do enum', () => {
    expect(() =>
      criarTicketSchema.parse({
        titulo: 'X',
        descricao: 'Y descricao valida',
        categoria: 'TI_INTERNO',
        tipoTi: 'URGENTE',
      }),
    ).toThrow();
  });
});

describe('listarTicketsSchema — filtro de categoria', () => {
  it('categoria e opcional e aceita os dois valores', () => {
    expect(listarTicketsSchema.parse({}).categoria).toBeUndefined();
    expect(listarTicketsSchema.parse({ categoria: 'TI_INTERNO' }).categoria).toBe('TI_INTERNO');
  });
});
```

- [x] **Step 2: Rodar e confirmar que falha**

Run: `cd apps/api && npx vitest run src/modules/tickets/tickets.schemas.test.ts`
Expected: FAIL — `criarTicketSchema`/`listarTicketsSchema` ainda não
conhecem `categoria`/`tipoTi` (o `.parse` de teste 2 e 3 falha porque o
Zod, sem o campo declarado, ignora chave desconhecida silenciosamente por
padrão — então o teste 2 falha em `expect(erro.categoria).toBe('TI_INTERNO')`
por `categoria` vir `undefined`, e o teste 3 falha porque nada rejeita
`tipoTi` inválido).

- [x] **Step 3: Implementar os schemas**

Em `apps/api/src/modules/tickets/tickets.schemas.ts`, troque as linhas 1-26:

```ts
import { z } from 'zod';

export const STATUS_TICKET = [
  'ABERTO',
  'EM_ANDAMENTO',
  'AGUARDANDO_CLIENTE',
  'RESOLVIDO',
  'FECHADO',
] as const;

export const PRIORIDADES = ['BAIXA', 'NORMAL', 'ALTA', 'URGENTE'] as const;

const status = z.enum(STATUS_TICKET);
const prioridade = z.enum(PRIORIDADES);

export const criarTicketSchema = z.object({
  titulo: z.string().trim().min(3, 'Titulo muito curto').max(160),
  descricao: z.string().trim().min(3, 'Descreva o chamado').max(4000),
  prioridade: prioridade.default('NORMAL'),
  contatoId: z.string().uuid().nullable().optional(),
  contaId: z.string().uuid().nullable().optional(),
  conversaId: z.string().uuid().nullable().optional(),
  responsavelId: z.string().uuid().nullable().optional(),
  filaId: z.string().uuid().nullable().optional(),
  prazoSla: z.coerce.date().nullable().optional(),
});
```

por:

```ts
import { z } from 'zod';

export const STATUS_TICKET = [
  'ABERTO',
  'EM_ANDAMENTO',
  'AGUARDANDO_CLIENTE',
  'RESOLVIDO',
  'FECHADO',
] as const;

export const PRIORIDADES = ['BAIXA', 'NORMAL', 'ALTA', 'URGENTE'] as const;

/** ATENDIMENTO = chamado de cliente (padrao). TI_INTERNO = chamado de TI, aberto por quem usa a plataforma. */
export const CATEGORIAS_TICKET = ['ATENDIMENTO', 'TI_INTERNO'] as const;

/** So faz sentido quando categoria = TI_INTERNO. */
export const TIPOS_TI = ['ERRO', 'MELHORIA'] as const;

const status = z.enum(STATUS_TICKET);
const prioridade = z.enum(PRIORIDADES);
const categoria = z.enum(CATEGORIAS_TICKET);
const tipoTi = z.enum(TIPOS_TI);

export const criarTicketSchema = z.object({
  titulo: z.string().trim().min(3, 'Titulo muito curto').max(160),
  descricao: z.string().trim().min(3, 'Descreva o chamado').max(4000),
  prioridade: prioridade.default('NORMAL'),
  categoria: categoria.default('ATENDIMENTO'),
  tipoTi: tipoTi.nullable().optional(),
  contatoId: z.string().uuid().nullable().optional(),
  contaId: z.string().uuid().nullable().optional(),
  conversaId: z.string().uuid().nullable().optional(),
  responsavelId: z.string().uuid().nullable().optional(),
  filaId: z.string().uuid().nullable().optional(),
  prazoSla: z.coerce.date().nullable().optional(),
});
```

E troque `listarTicketsSchema` (linhas 42-54):

```ts
export const listarTicketsSchema = z.object({
  status: status.optional(),
  prioridade: prioridade.optional(),
  responsavelId: z.string().uuid().optional(),
  filaId: z.string().uuid().optional(),
  contatoId: z.string().uuid().optional(),
  contaId: z.string().uuid().optional(),
  /** Somente chamados com SLA vencido e ainda em aberto. */
  slaVencido: z.enum(['true', 'false']).optional(),
  busca: z.string().trim().min(1).optional(),
  limite: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.string().optional(),
});
```

por:

```ts
export const listarTicketsSchema = z.object({
  status: status.optional(),
  prioridade: prioridade.optional(),
  categoria: categoria.optional(),
  responsavelId: z.string().uuid().optional(),
  filaId: z.string().uuid().optional(),
  contatoId: z.string().uuid().optional(),
  contaId: z.string().uuid().optional(),
  /** Somente chamados com SLA vencido e ainda em aberto. */
  slaVencido: z.enum(['true', 'false']).optional(),
  busca: z.string().trim().min(1).optional(),
  limite: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.string().optional(),
});
```

- [x] **Step 4: Rodar e confirmar que passam**

Run: `cd apps/api && npx vitest run src/modules/tickets/tickets.schemas.test.ts`
Expected: PASS.

- [x] **Step 5: `listarTickets`/`ticketsKanban` filtram por categoria, e `serialize` devolve os campos novos**

Em `apps/api/src/modules/tickets/tickets.service.ts`, troque o objeto
devolvido por `serialize` (linhas 38-68):

```ts
function serialize(t: TicketDb) {
  return {
    id: t.id,
    numero: t.numero,
    titulo: t.titulo,
    descricao: t.descricao,
    status: t.status,
    prioridade: t.prioridade,
    prazoSla: t.prazoSla,
```

por:

```ts
function serialize(t: TicketDb) {
  return {
    id: t.id,
    numero: t.numero,
    titulo: t.titulo,
    descricao: t.descricao,
    status: t.status,
    prioridade: t.prioridade,
    categoria: t.categoria,
    tipoTi: t.tipoTi,
    prazoSla: t.prazoSla,
```

(o resto do objeto de retorno continua igual — só as duas linhas novas
entram depois de `prioridade`).

E, em `listarTickets`, troque a linha do filtro de prioridade:

```ts
  if (query.prioridade) filtros.push({ prioridade: query.prioridade });
```

por:

```ts
  if (query.prioridade) filtros.push({ prioridade: query.prioridade });
  if (query.categoria) filtros.push({ categoria: query.categoria });
```

- [x] **Step 6: Typecheck e suite completa da API**

Run: `cd apps/api && npx tsc --noEmit && npx vitest run`
Expected: PASS em tudo, incluindo o arquivo novo.

- [x] **Step 7: Commit**

```bash
git add apps/api/src/modules/tickets/tickets.schemas.ts apps/api/src/modules/tickets/tickets.schemas.test.ts apps/api/src/modules/tickets/tickets.service.ts
git commit -m "feat(protocolo): categoria/tipoTi em criar, listar e serializar chamado"
```

---

### Task 3: Frontend — tipos (`Protocolo`, `TicketCategoria`, `TicketTipoTi`)

**Files:**
- Modify: `apps/web/src/lib/types.ts:713-795`

**Interfaces:**
- Consumes: nada de tarefa anterior (é o espelho do shape que a Task 2
  já devolve).
- Produces: `Protocolo.categoria: TicketCategoria`,
  `Protocolo.tipoTi: TicketTipoTi | null`, `CATEGORIAS_TICKET`,
  `LABEL_CATEGORIA_TICKET`, `TIPOS_TI`, `LABEL_TIPO_TI` — usados pelas
  Tasks 5 e 6.

- [x] **Step 1: Adicionar os tipos e o campo em `Protocolo`**

Troque (linhas 713-714):

```ts
export type TicketStatus = 'ABERTO' | 'EM_ANDAMENTO' | 'AGUARDANDO_CLIENTE' | 'RESOLVIDO' | 'FECHADO';
export type TicketPrioridade = 'BAIXA' | 'NORMAL' | 'ALTA' | 'URGENTE';
```

por:

```ts
export type TicketStatus = 'ABERTO' | 'EM_ANDAMENTO' | 'AGUARDANDO_CLIENTE' | 'RESOLVIDO' | 'FECHADO';
export type TicketPrioridade = 'BAIXA' | 'NORMAL' | 'ALTA' | 'URGENTE';
export type TicketCategoria = 'ATENDIMENTO' | 'TI_INTERNO';
export type TicketTipoTi = 'ERRO' | 'MELHORIA';
```

Troque o campo `prioridade` dentro de `Protocolo` (linha 748):

```ts
  prioridade: TicketPrioridade;
  prazoSla: string | null;
```

por:

```ts
  prioridade: TicketPrioridade;
  categoria: TicketCategoria;
  tipoTi: TicketTipoTi | null;
  prazoSla: string | null;
```

- [x] **Step 2: Adicionar as listas e os rótulos, ao lado dos de prioridade**

Troque (linhas 781-795):

```ts
export const PRIORIDADES_PROTOCOLO: TicketPrioridade[] = ['BAIXA', 'NORMAL', 'ALTA', 'URGENTE'];

export const LABEL_PRIORIDADE: Record<TicketPrioridade, string> = {
  BAIXA: 'Baixa',
  NORMAL: 'Normal',
  ALTA: 'Alta',
  URGENTE: 'Urgente',
};

export const COR_PRIORIDADE: Record<TicketPrioridade, string> = {
  BAIXA: 'bg-slate-100 text-slate-600',
  NORMAL: 'bg-blue-50 text-blue-700',
  ALTA: 'bg-amber-50 text-amber-700',
  URGENTE: 'bg-red-50 text-red-700',
};
```

por:

```ts
export const PRIORIDADES_PROTOCOLO: TicketPrioridade[] = ['BAIXA', 'NORMAL', 'ALTA', 'URGENTE'];

export const LABEL_PRIORIDADE: Record<TicketPrioridade, string> = {
  BAIXA: 'Baixa',
  NORMAL: 'Normal',
  ALTA: 'Alta',
  URGENTE: 'Urgente',
};

export const COR_PRIORIDADE: Record<TicketPrioridade, string> = {
  BAIXA: 'bg-slate-100 text-slate-600',
  NORMAL: 'bg-blue-50 text-blue-700',
  ALTA: 'bg-amber-50 text-amber-700',
  URGENTE: 'bg-red-50 text-red-700',
};

export const CATEGORIAS_TICKET: TicketCategoria[] = ['ATENDIMENTO', 'TI_INTERNO'];

export const LABEL_CATEGORIA_TICKET: Record<TicketCategoria, string> = {
  ATENDIMENTO: 'Atendimento',
  TI_INTERNO: 'TI interno',
};

export const TIPOS_TI: TicketTipoTi[] = ['ERRO', 'MELHORIA'];

export const LABEL_TIPO_TI: Record<TicketTipoTi, string> = {
  ERRO: 'Erro/bug',
  MELHORIA: 'Melhoria',
};
```

- [x] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: FAIL — nenhum consumidor preenche `categoria`/`tipoTi` ainda em
lugar nenhum que construa um `Protocolo` literal à mão. Na prática, como
`Protocolo` só é **recebido** da API (nunca montado à mão no frontend),
isso deve passar direto; se algum teste construir um `Protocolo` fake sem
os dois campos novos, adicione-os ali antes de seguir.

- [x] **Step 4: Commit**

```bash
git add apps/web/src/lib/types.ts
git commit -m "feat(protocolo): tipos TicketCategoria/TicketTipoTi e campos em Protocolo"
```

---

### Task 4: Frontend — ícone, item de menu e rota

**Files:**
- Modify: `apps/web/src/components/layout/icons.tsx`
- Modify: `apps/web/src/components/layout/nav.ts`
- Modify: `apps/web/src/App.tsx`
- Create: `apps/web/src/pages/ChamadoTiPage.tsx` (só o esqueleto — o
  formulário completo é a Task 5)

**Interfaces:**
- Consumes: nada de tarefa anterior.
- Produces: rota `/chamado-ti` registrada e visível no menu para todos os
  perfis; `ChamadoTiPage` exportado de `apps/web/src/pages/ChamadoTiPage.tsx`
  — é esse export que a Task 5 preenche.

- [x] **Step 1: Ícone novo**

No fim de `apps/web/src/components/layout/icons.tsx`, depois de
`IconTelefonia` (linhas 106-110), adicione:

```tsx

export const IconChamadoTi = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="3.5" />
    <path d="M5.5 5.5l3 3M18.5 5.5l-3 3M18.5 18.5l-3-3M5.5 18.5l3-3" />
  </Svg>
);
```

- [x] **Step 2: Esqueleto da página**

Crie `apps/web/src/pages/ChamadoTiPage.tsx`:

```tsx
export function ChamadoTiPage() {
  return <div className="space-y-5" />;
}
```

- [x] **Step 3: Item no menu**

Em `apps/web/src/components/layout/nav.ts`, adicione `IconChamadoTi` à
lista de imports (linhas 3-15) — troque:

```ts
import {
  IconAtendimento,
  IconCampanhas,
  IconConfiguracoes,
  IconCrm,
  IconDashboards,
  IconEsteira,
  IconGestao,
  IconMonitoramento,
  IconProtocolo,
  IconRelatorios,
  IconTelefonia,
} from './icons';
```

por:

```ts
import {
  IconAtendimento,
  IconCampanhas,
  IconChamadoTi,
  IconConfiguracoes,
  IconCrm,
  IconDashboards,
  IconEsteira,
  IconGestao,
  IconMonitoramento,
  IconProtocolo,
  IconRelatorios,
  IconTelefonia,
} from './icons';
```

E adicione a entrada no array `NAV`, depois de Configurações (linha 126)
— troque:

```ts
  { rota: '/configuracoes', label: 'Configuracoes', icone: IconConfiguracoes, perfis: ['ADMIN'], fase: 0 },
];
```

por:

```ts
  { rota: '/configuracoes', label: 'Configuracoes', icone: IconConfiguracoes, perfis: ['ADMIN'], fase: 0 },
  // Visivel a todo perfil, de proposito: problema de sistema afeta
  // qualquer pessoa que usa a plataforma, nao so quem administra.
  {
    rota: '/chamado-ti',
    label: 'Chamado TI',
    icone: IconChamadoTi,
    perfis: ['ADMIN', 'SUPERVISOR', 'GESTOR', 'COMERCIAL', 'SUPORTE', 'AGENTE'],
    fase: 6,
  },
];
```

- [x] **Step 4: Registrar a rota**

Em `apps/web/src/App.tsx`, adicione o import (junto dos outros de
`./pages/`) — troque:

```ts
import { CampanhasPage } from './pages/CampanhasPage';
import { DashboardsPage } from './pages/DashboardsPage';
```

por:

```ts
import { CampanhasPage } from './pages/CampanhasPage';
import { ChamadoTiPage } from './pages/ChamadoTiPage';
import { DashboardsPage } from './pages/DashboardsPage';
```

E adicione a entrada no mapa `PAGINAS` — troque:

```ts
const PAGINAS: Record<string, ComponentType> = {
  '/dashboards': DashboardsPage,
  '/atendimento': AtendimentoPage,
  '/protocolo': ProtocoloPage,
```

por:

```ts
const PAGINAS: Record<string, ComponentType> = {
  '/dashboards': DashboardsPage,
  '/atendimento': AtendimentoPage,
  '/protocolo': ProtocoloPage,
  '/chamado-ti': ChamadoTiPage,
```

- [x] **Step 5: Typecheck e teste de navegação**

Run: `cd apps/web && npx tsc --noEmit && npx vitest run src/components/layout/nav.test.ts`
Expected: PASS nos dois — o item novo não restringe nenhuma subrota
existente, então `nav.test.ts` não deveria nem notar a diferença.

- [x] **Step 6: Commit**

```bash
git add apps/web/src/components/layout/icons.tsx apps/web/src/components/layout/nav.ts apps/web/src/App.tsx apps/web/src/pages/ChamadoTiPage.tsx
git commit -m "feat(chamado-ti): rota /chamado-ti visivel a todos os perfis"
```

---

### Task 5: Frontend — formulário de abertura de chamado

**Files:**
- Modify: `apps/web/src/pages/ChamadoTiPage.tsx`

**Interfaces:**
- Consumes: `Protocolo`, `TIPOS_TI`, `LABEL_TIPO_TI` (Task 3); `api.post`,
  `api.upload` (`apps/web/src/lib/api.ts`, já existentes); `useToast`
  (`apps/web/src/components/ui/Toast.tsx`, já existente).
- Produces: nada consumido por outra tarefa — é a folha da árvore.

- [x] **Step 1: Escrever o formulário completo**

Substitua todo o conteúdo de `apps/web/src/pages/ChamadoTiPage.tsx` (o
esqueleto da Task 4) por:

```tsx
import { useRef, useState } from 'react';
import { Alerta, Button, Card, Field, Select } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { ApiError, api } from '../lib/api';
import { LABEL_TIPO_TI, TIPOS_TI, type Protocolo, type TicketTipoTi } from '../lib/types';

const VAZIO = { tipo: 'ERRO' as TicketTipoTi, titulo: '', descricao: '' };

/**
 * Abertura de chamado de TI — qualquer perfil pode abrir (ver nav.ts).
 *
 * So cria o chamado e confirma: quem gerencia ve e responde pela tela
 * Protocolo, que ja existe. Duas chamadas HTTP quando ha print (criar,
 * depois anexar) porque `POST /protocolos/:id/anexos` exige o id do
 * chamado ja criado — nao da para mandar tudo de uma vez.
 */
export function ChamadoTiPage() {
  const mostrarToast = useToast();
  const [form, setForm] = useState(VAZIO);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputArquivoRef = useRef<HTMLInputElement>(null);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const { protocolo } = await api.post<{ protocolo: Protocolo }>('/protocolos', {
        titulo: form.titulo,
        descricao: form.descricao,
        categoria: 'TI_INTERNO',
        tipoTi: form.tipo,
      });
      if (arquivo) {
        await api.upload(`/protocolos/${protocolo.id}/anexos`, arquivo);
      }
      setForm(VAZIO);
      setArquivo(null);
      if (inputArquivoRef.current) inputArquivoRef.current.value = '';
      mostrarToast('sucesso', 'Chamado aberto! Voce recebe uma resposta em ate 72h.');
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao abrir o chamado');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-5">
      <Alerta tipo="aviso">
        Use esta tela para relatar um erro do sistema ou sugerir uma melhoria. Escolha <strong>Erro/bug</strong>{' '}
        quando algo nao funciona como deveria — descreva o que voce fez antes de acontecer, e o que esperava ver
        em vez disso. Escolha <strong>Melhoria</strong> para uma ideia que facilitaria o trabalho. Um print da
        tela ajuda bastante, mas nao e obrigatorio. Voce recebe uma resposta em ate 72h.
      </Alerta>

      {erro && <Alerta>{erro}</Alerta>}

      <Card titulo="Novo chamado de TI">
        <form onSubmit={enviar} className="space-y-4">
          <Field label="Tipo">
            <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TicketTipoTi })}>
              {TIPOS_TI.map((t) => (
                <option key={t} value={t}>{LABEL_TIPO_TI[t]}</option>
              ))}
            </Select>
          </Field>

          <Field label="Titulo">
            <input
              required
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              placeholder="Resumo curto do problema ou da ideia"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--brand-primary)]"
            />
          </Field>

          <Field label="Descricao" hint="Quanto mais detalhe, mais rapido o time de TI entende o que aconteceu">
            <textarea
              required
              rows={5}
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--brand-primary)]"
            />
          </Field>

          <Field label="Print da tela (opcional)">
            <input
              ref={inputArquivoRef}
              type="file"
              accept="image/*"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </Field>

          <Button type="submit" disabled={enviando} className="w-full">
            {enviando ? 'Enviando...' : 'Enviar chamado'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
```

- [x] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS.

- [x] **Step 3: Conferir no navegador**

Com a API e o front rodando (`npm run dev`), abrir
`http://localhost:5173/chamado-ti` logado com qualquer perfil, preencher
Tipo/Titulo/Descricao (com e sem print) e enviar. Confirmar: toast de
sucesso aparece no canto superior direito, formulario limpa, e o chamado
aparece na coluna "Aberto" de `http://localhost:5173/protocolo` (Task 6
ainda nao mostra o badge "TI interno" — isso e esperado ate a Task 6).

- [x] **Step 4: Commit**

```bash
git add apps/web/src/pages/ChamadoTiPage.tsx
git commit -m "feat(chamado-ti): formulario de abertura com print opcional e confirmacao por toast"
```

---

### Task 6: Frontend — badge e filtro de categoria em Protocolo

**Files:**
- Modify: `apps/web/src/pages/protocolo/ProtocoloPage.tsx`

**Interfaces:**
- Consumes: `Protocolo.categoria`/`Protocolo.tipoTi`, `LABEL_TIPO_TI`
  (Task 3).
- Produces: nada consumido por outra tarefa.

- [x] **Step 1: Import e estado do filtro**

Troque o bloco de import de tipos (linhas 5-16):

```ts
import {
  COR_PRIORIDADE,
  LABEL_PRIORIDADE,
  LABEL_STATUS_PROTOCOLO,
  PRIORIDADES_PROTOCOLO,
  STATUS_PROTOCOLO,
  type Contato,
  type Protocolo,
  type TicketPrioridade,
  type TicketStatus,
  type Usuario,
} from '../../lib/types';
```

por:

```ts
import {
  COR_PRIORIDADE,
  LABEL_PRIORIDADE,
  LABEL_STATUS_PROTOCOLO,
  LABEL_TIPO_TI,
  PRIORIDADES_PROTOCOLO,
  STATUS_PROTOCOLO,
  type Contato,
  type Protocolo,
  type TicketPrioridade,
  type TicketStatus,
  type Usuario,
} from '../../lib/types';
```

E troque a linha do estado de filtros (linha 34):

```ts
  const [filtros, setFiltros] = useState({ prioridade: '', responsavelId: '', slaVencido: '', busca: '' });
```

por:

```ts
  const [filtros, setFiltros] = useState({ prioridade: '', responsavelId: '', slaVencido: '', busca: '', categoria: '' });
```

- [x] **Step 2: Mandar o filtro na querystring**

Troque (linhas 46-50):

```ts
    const qs = new URLSearchParams();
    if (filtros.prioridade) qs.set('prioridade', filtros.prioridade);
    if (filtros.responsavelId) qs.set('responsavelId', filtros.responsavelId);
    if (filtros.slaVencido) qs.set('slaVencido', filtros.slaVencido);
    if (filtros.busca.trim()) qs.set('busca', filtros.busca.trim());
```

por:

```ts
    const qs = new URLSearchParams();
    if (filtros.prioridade) qs.set('prioridade', filtros.prioridade);
    if (filtros.responsavelId) qs.set('responsavelId', filtros.responsavelId);
    if (filtros.slaVencido) qs.set('slaVencido', filtros.slaVencido);
    if (filtros.categoria) qs.set('categoria', filtros.categoria);
    if (filtros.busca.trim()) qs.set('busca', filtros.busca.trim());
```

- [x] **Step 3: Campo de filtro na tela**

Troque o card de Filtros (linhas 135-169):

```tsx
      <Card titulo="Filtros">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Prioridade">
            <Select
              value={filtros.prioridade}
              onChange={(e) => setFiltros({ ...filtros, prioridade: e.target.value })}
            >
              <option value="">Todas</option>
              {PRIORIDADES_PROTOCOLO.map((p) => (
                <option key={p} value={p}>{LABEL_PRIORIDADE[p]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Responsavel">
            <Select
              value={filtros.responsavelId}
              onChange={(e) => setFiltros({ ...filtros, responsavelId: e.target.value })}
            >
              <option value="">Todos</option>
              {agentes.map((a) => (
                <option key={a.id} value={a.id}>{a.nome}</option>
              ))}
            </Select>
          </Field>
          <Field label="SLA">
            <Select value={filtros.slaVencido} onChange={(e) => setFiltros({ ...filtros, slaVencido: e.target.value })}>
              <option value="">Todos</option>
              <option value="true">Somente vencidos</option>
            </Select>
          </Field>
          <Field label="Busca" hint="Titulo, descricao, contato ou numero">
            <Input value={filtros.busca} onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })} />
          </Field>
        </div>
      </Card>
```

por:

```tsx
      <Card titulo="Filtros">
        <div className="grid gap-3 sm:grid-cols-5">
          <Field label="Categoria">
            <Select value={filtros.categoria} onChange={(e) => setFiltros({ ...filtros, categoria: e.target.value })}>
              <option value="">Todas</option>
              <option value="ATENDIMENTO">Atendimento</option>
              <option value="TI_INTERNO">TI interno</option>
            </Select>
          </Field>
          <Field label="Prioridade">
            <Select
              value={filtros.prioridade}
              onChange={(e) => setFiltros({ ...filtros, prioridade: e.target.value })}
            >
              <option value="">Todas</option>
              {PRIORIDADES_PROTOCOLO.map((p) => (
                <option key={p} value={p}>{LABEL_PRIORIDADE[p]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Responsavel">
            <Select
              value={filtros.responsavelId}
              onChange={(e) => setFiltros({ ...filtros, responsavelId: e.target.value })}
            >
              <option value="">Todos</option>
              {agentes.map((a) => (
                <option key={a.id} value={a.id}>{a.nome}</option>
              ))}
            </Select>
          </Field>
          <Field label="SLA">
            <Select value={filtros.slaVencido} onChange={(e) => setFiltros({ ...filtros, slaVencido: e.target.value })}>
              <option value="">Todos</option>
              <option value="true">Somente vencidos</option>
            </Select>
          </Field>
          <Field label="Busca" hint="Titulo, descricao, contato ou numero">
            <Input value={filtros.busca} onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })} />
          </Field>
        </div>
      </Card>
```

- [x] **Step 4: Badge e texto do cartão no kanban**

Troque o `<li>` de cada chamado (linhas 192-216):

```tsx
                  <li
                    key={p.id}
                    draggable
                    onDragStart={() => setArrastando(p.id)}
                    onClick={() => setAberto(p)}
                    className={`cursor-grab rounded-lg border bg-white p-2.5 shadow-sm active:cursor-grabbing ${
                      aberto?.id === p.id ? 'border-[var(--brand-primary)]' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-xs text-slate-500">#{p.numero}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COR_PRIORIDADE[p.prioridade]}`}>
                        {LABEL_PRIORIDADE[p.prioridade]}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm font-medium text-slate-800">{p.titulo}</p>
                    <p className="truncate text-xs text-slate-500">{p.contato?.nome ?? 'Sem contato'}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {p.responsavel && <Badge tom="marca">{p.responsavel.nome}</Badge>}
                      {p.slaVencido && <Badge tom="alerta">SLA</Badge>}
                      {p.agendamentos.some((a) => !a.concluido) && <Badge tom="neutro">agendado</Badge>}
                    </div>
                  </li>
```

por:

```tsx
                  <li
                    key={p.id}
                    draggable
                    onDragStart={() => setArrastando(p.id)}
                    onClick={() => setAberto(p)}
                    className={`cursor-grab rounded-lg border bg-white p-2.5 shadow-sm active:cursor-grabbing ${
                      aberto?.id === p.id ? 'border-[var(--brand-primary)]' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-xs text-slate-500">#{p.numero}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COR_PRIORIDADE[p.prioridade]}`}>
                        {LABEL_PRIORIDADE[p.prioridade]}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm font-medium text-slate-800">{p.titulo}</p>
                    <p className="truncate text-xs text-slate-500">
                      {p.tipoTi ? LABEL_TIPO_TI[p.tipoTi] : (p.contato?.nome ?? 'Sem contato')}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {p.categoria === 'TI_INTERNO' && <Badge tom="neutro">TI interno</Badge>}
                      {p.responsavel && <Badge tom="marca">{p.responsavel.nome}</Badge>}
                      {p.slaVencido && <Badge tom="alerta">SLA</Badge>}
                      {p.agendamentos.some((a) => !a.concluido) && <Badge tom="neutro">agendado</Badge>}
                    </div>
                  </li>
```

- [x] **Step 5: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS.

- [x] **Step 6: Conferir no navegador**

Logado como ADMIN em `http://localhost:5173/protocolo`, com pelo menos um
chamado de TI já aberto (Task 5, Step 3): confirmar que o cartão mostra o
badge "TI interno" e o tipo (Erro/bug ou Melhoria) em vez de "Sem
contato", e que o filtro "Categoria" isola só os chamados de TI.

- [x] **Step 7: Commit**

```bash
git add apps/web/src/pages/protocolo/ProtocoloPage.tsx
git commit -m "feat(protocolo): badge TI interno e filtro de categoria no kanban"
```

---

### Task 7: Verificação final

**Files:** nenhum (só rodar comandos).

- [x] **Step 1: Typecheck completo dos dois workspaces**

Run: `cd apps/api && npx tsc --noEmit && cd ../web && npx tsc --noEmit`
Expected: PASS nos dois.

- [x] **Step 2: Suite de testes completa dos dois workspaces**

Run: `cd apps/api && npx vitest run && cd ../web && npx vitest run`
Expected: PASS em todos os arquivos, incluindo `tickets.schemas.test.ts`
(Task 2) e `nav.test.ts` (Task 4).

- [x] **Step 3: Fluxo ponta a ponta no navegador**

Com `npm run dev` rodando os dois workspaces: abrir `/chamado-ti` com um
perfil que **não** vê `/protocolo` hoje (ex. login como
`comercial@plataforma.local`), abrir um chamado com print, confirmar o
toast. Depois logar como `admin@plataforma.local`, abrir `/protocolo`,
filtrar por Categoria = "TI interno" e confirmar que o chamado aparece
com o badge, o tipo certo e o anexo do print no detalhe
(`DetalheProtocolo`).
