# Atendimento estilo PCM (Fases 2 + 3) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trazer para o Atendimento da Bradel as mecânicas demonstradas pela PCM Soluções que não dependem do construtor de fluxos:
- espelhar mensagens enviadas pelo celular;
- aceite atômico;
- transferência para usuário ou equipe;
- coluna "Caixa de entrada" por equipe;
- protocolo, origem e atendente inicial;
- histórico de atendimentos anteriores;
- Auditoria;
- Monitor por equipe;
- iniciar conversa escolhendo a linha;
- aviso de linha desconectada.

**Architecture:** Tudo é aditivo sobre os módulos existentes.
- **Backend:** `apps/api/src/modules/conversations`, `channels`, `metrics` e um helper novo de protocolo.
- **Ponte Baileys:** passa a repassar `fromMe`.
- **Front:** `features/atendimento` e páginas novas `AuditoriaPage`.
- **Modelo de dados:** uma migration aditiva com backfill.
- **Tempo real:** reaproveita os eventos Socket.IO que já existem; nenhum evento novo.

**Tech Stack:** Express 4 + Prisma 6 + PostgreSQL, Socket.IO 4.8, Baileys 7 (ponte), React 18 + Vite 6 + Tailwind 4, Vitest 4.

**Spec:** [`ANALISE_VIDEO_IMPLEMENTACAO.md`](../../../ANALISE_VIDEO_IMPLEMENTACAO.md). Este plano implementa F02–F11, F14, F15, F17 (só a chave de espelhamento) e F18 conforme as decisões da seção 10 da spec.

## Global Constraints

- Escopo: só as Fases 2 + 3 da spec. **Nada de construtor de fluxos**, nada de template oficial, nada de Perfis configuráveis.
- Dependências novas: **nenhuma** (`@xyflow/react` fica para a Fase 4).
- Protocolo de conversa: formato **`AAMMDD-NNNNN`**. Dia no fuso `America/Sao_Paulo`; sequencial por dia **e** por organização, com 5 dígitos e zeros à esquerda (cresce para 6 se passar de 99999).
- Espelhamento de mensagens do celular: **configurável por linha** (`ChannelConfig.espelharCelular`), **ligado por padrão**.
- Aviso de linha desconectada: **só dentro da plataforma** (sem Telegram nem e-mail).
- Caixa de entrada: **coluna separada**, ao lado da lista de chats (layout da PCM), substituindo a aba "Fila".
- Código e comentários em português **sem acento**; textos de tela **com acento**.
- Módulos no padrão `modules/<dominio>/<dominio>.{routes,service,schemas,serializer}.ts`, validação Zod com `validateBody`/`validateQuery`, `asyncHandler`.
- Conversa fora do escopo do usuário responde **404** (`carregarOuFalhar`), nunca 403. Ação proibida ao perfil responde 403 (`requireRole`).
- Commits `feat(escopo): ...` / `fix(escopo): ...` em pt-BR, terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Nunca** rodar `prisma migrate dev` nem apontar `--shadow-database-url` para banco com dados. A migration é gerada por `migrate diff` entre dois arquivos de schema, sem banco.
- Testes de unidade sem banco (Prisma mockado com `vi.hoisted` + `vi.mock('../../lib/prisma')`). **Não** rodar smoke tests contra o banco de dev real.

## Review Focus

1. **Eco da mensagem enviada pela plataforma voltando como `fromMe`:** não pode virar uma segunda mensagem "enviada por outro dispositivo". Testes na Task 5 (ponte ignora id que ela mesma enviou) e na Task 6 (API ignora `idExterno` já gravado).
2. **Dois atendentes clicando "aceitar" ao mesmo tempo:** exatamente um vence e o outro recebe 409 com mensagem clara. Teste na Task 4.
3. **Mensagem própria numa linha com `espelharCelular = false`, ou de contato sem conversa aberta:** primeiro caso ignorado sem efeito colateral; segundo caso cria conversa ATIVA na linha certa, sem `naoLidas`. Testes na Task 6.
4. **Protocolo perto da meia-noite:** 23:30 de Brasília (02:30 UTC do dia seguinte) usa o dia de Brasília. Teste na Task 2.
5. **Auditoria e histórico respeitando o escopo:**
   - SUPERVISOR não vê conversa de número de ADMIN;
   - histórico de outra linha não aparece;
   - COMERCIAL não acessa a auditoria.
   - Testes de escopo e linha: Tasks 9 e 10.
   - O bloqueio de perfil vem do `requireRole` da rota (já testado no middleware) e é verificado manualmente no roteiro 9 da Task 21.

---

## Estrutura de arquivos

**Backend (`apps/api`)**

| Arquivo | Responsabilidade |
|---|---|
| `prisma/schema.prisma` | Novos campos e modelos (Task 1) |
| `prisma/migrations/20261009120000_atendimento_estilo_pcm/migration.sql` | DDL + backfill (Task 1) |
| `src/modules/conversations/protocolo.ts` (+ `.test.ts`) | **novo**: gera `AAMMDD-NNNNN` |
| `src/modules/conversations/conversations.serializer.ts` | Expõe protocolo, origem, atendente inicial, autor da mensagem, evento, dispositivo |
| `src/modules/conversations/conversations.service.ts` | Aceite atômico, eventos, transferência, linhas de saída, histórico, caixa de entrada |
| `src/modules/conversations/conversations.auditoria.ts` (+ `.test.ts`) | **novo**: filtros e consulta paginada da auditoria |
| `src/modules/conversations/conversations.visao.ts` | Aba `FILA` vira `ATRIBUIDAS` |
| `src/modules/conversations/conversations.schemas.ts` / `.routes.ts` | Rotas novas |
| `src/modules/channels/inbound.service.ts` | `registrarMensagemPropria`; origem, protocolo e evento automático na entrada |
| `src/modules/channels/ponte.routes.ts` | Aceita `propria` |
| `src/modules/channels/channels.service.ts` / `.routes.ts` | `espelharCelular`; linhas desconectadas |
| `src/modules/metrics/metrics.service.ts` / `.routes.ts` | Monitor por equipe |

**Ponte (`apps/ponte`)**

| Arquivo | Responsabilidade |
|---|---|
| `src/enviadas.ts` (+ `.test.ts`) | **novo**: lembra ids enviados pela plataforma |
| `src/sessao.ts` | Registra id ao enviar |
| `src/recebida.ts` | Repassa `fromMe` como `propria` |
| `src/plataforma.ts` | Campo `propria` no contrato |

**Front (`apps/web`)**

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/types.ts` | Tipos novos |
| `src/components/ui/Modal.tsx`, `Gaveta.tsx` | **novos**: modal e gaveta lateral reutilizáveis |
| `src/features/atendimento/previaTexto.ts` (+ teste) | **novo**: "cliente:" / "enviada:" / 📷 Foto |
| `src/features/atendimento/links.ts` (+ teste) | **novo**: linkificação |
| `src/features/atendimento/destinos.ts` (+ teste) | **novo**: separa destinos de transferência |
| `src/features/atendimento/caixaEntrada.ts` (+ teste) | **novo**: aplica evento na caixa |
| `src/features/atendimento/useCaixaEntrada.ts` | **novo**: estado da caixa |
| `src/features/atendimento/CaixaEntradaEquipes.tsx` | **novo**: coluna da caixa |
| `src/features/atendimento/ModalTransferir.tsx` | **novo** |
| `src/features/atendimento/ModalIniciarConversa.tsx` | **novo** |
| `src/features/atendimento/useAtendimentosAnteriores.ts` | **novo** |
| `src/features/atendimento/{ListaConversas,PainelChat,visao,useConversas}.ts(x)` | Ajustes |
| `src/pages/AtendimentoPage.tsx` | Coluna da caixa, modais, aba Atribuídas |
| `src/pages/AuditoriaPage.tsx` + `src/features/auditoria/{filtros.ts,filtros.test.ts,GavetaFiltros.tsx}` | **novos** |
| `src/features/monitor/PainelEquipes.tsx` + `src/pages/MonitoramentoPage.tsx` | Monitor por equipe |
| `src/components/layout/AvisoLinhasDesconectadas.tsx` + `AppShell.tsx` | Aviso de desconexão |
| `src/pages/configuracoes/CanaisTab.tsx` | Chave "Espelhar celular" |
| `src/components/layout/nav.ts`, `src/App.tsx` | Rota `/auditoria`; SUPORTE no Atendimento |

---

## Task 0: Branch e documentos

**Files:**
- Create: branch `feat/atendimento-estilo-pcm`
- Commit: `ANALISE_VIDEO_IMPLEMENTACAO.md`, `docs/superpowers/plans/2026-10-09-atendimento-estilo-pcm.md`

- [ ] **Step 1: Criar a branch a partir do HEAD atual**

A branch atual `feat/atendimento-por-numero` contém a organização por número de que este plano depende.

```bash
git checkout -b feat/atendimento-estilo-pcm
```

- [ ] **Step 2: Commitar spec e plano**

```bash
git add ANALISE_VIDEO_IMPLEMENTACAO.md docs/superpowers/plans/2026-10-09-atendimento-estilo-pcm.md
git commit -m "docs(atendimento): analise da demo PCM e plano das fases 2 e 3

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 1: Modelo de dados e migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20261009120000_atendimento_estilo_pcm/migration.sql`

**Interfaces:**
- Produces (Prisma Client):
  - `Conversation.origem: ConversaOrigem` (`'ATIVO' | 'RECEPTIVO'`, default `RECEPTIVO`)
  - `Conversation.atendenteInicialId: string | null` + relação `atendenteInicial`
  - `Conversation.protocolo: string | null`, único por organização
  - `Message.evento: EventoConversa | null` (`'ACEITE' | 'TRANSFERENCIA' | 'ENCERRAMENTO'`)
  - `Message.enviadaPorDispositivo: boolean` (default `false`)
  - `ChannelConfig.espelharCelular: boolean` (default `true`)
  - tabela `contadores_protocolo (organizacao_id, dia, ultimo)`

- [ ] **Step 1: Enums novos**

Logo depois de `enum MessageAuthor { ... }` (perto da linha 285):

```prisma
/// Quem comecou o atendimento: a empresa (ativo) ou o cliente (receptivo).
enum ConversaOrigem {
  ATIVO
  RECEPTIVO
}

/// Evento do historico que muda de quem e o atendimento. Mensagem SISTEMA sem
/// evento continua sendo aviso comum (ex.: falha da pesquisa de satisfacao).
enum EventoConversa {
  ACEITE
  TRANSFERENCIA
  ENCERRAMENTO
}
```

- [ ] **Step 2: Campos em `Conversation`**

1. Depois da linha `tags String[] @default([])`, acrescentar:

```prisma
  /// Ativo (empresa iniciou) ou receptivo (cliente iniciou). Seta na lista e na auditoria.
  origem             ConversaOrigem @default(RECEPTIVO)
  /// Primeiro usuario que ficou com o atendimento. Nao muda em transferencia.
  atendenteInicialId String?        @map("atendente_inicial_id")
  /// Protocolo legivel do atendimento: AAMMDD-NNNNN (ver conversations/protocolo.ts).
  protocolo          String?
```

2. Trocar a relação `agente` (hoje sem nome) por relações nomeadas:

```prisma
  agente           User?          @relation("ConversaAgente", fields: [agenteId], references: [id], onDelete: SetNull)
  atendenteInicial User?          @relation("ConversaAtendenteInicial", fields: [atendenteInicialId], references: [id], onDelete: SetNull)
```

3. No fim do model, junto dos `@@index`:

```prisma
  @@unique([organizacaoId, protocolo])
```

- [ ] **Step 3: Nomear o lado de `User`**

Em `model User`, trocar `conversas Conversation[]` por:

```prisma
  conversas               Conversation[]            @relation("ConversaAgente")
  conversasIniciadas      Conversation[]            @relation("ConversaAtendenteInicial")
```

- [ ] **Step 4: Campos em `Message`**

Depois de `interno Boolean @default(false)`:

```prisma
  /// Evento que mudou o responsavel (aceite, transferencia, encerramento). So em autor SISTEMA.
  evento                EventoConversa?
  /// true = digitada no celular/WhatsApp Web do numero, espelhada pela ponte (autor AGENTE, autorId nulo).
  enviadaPorDispositivo Boolean         @default(false) @map("enviada_por_dispositivo")
```

- [ ] **Step 5: Campo em `ChannelConfig`**

Depois de `donoId String? @map("dono_id")` e do comentário dele:

```prisma
  /// Espelha no historico o que o dono do numero digita no proprio celular/WhatsApp Web.
  espelharCelular Boolean @default(true) @map("espelhar_celular")
```

- [ ] **Step 6: Contador de protocolo**

1. Novo model, logo depois de `model Conversation`:

```prisma
/// Sequencial diario do protocolo de conversa, por organizacao. Escrito so por SQL cru (protocolo.ts).
model ContadorProtocolo {
  organizacaoId String @map("organizacao_id")
  /// AAMMDD no fuso America/Sao_Paulo.
  dia           String
  ultimo        Int    @default(0)

  organizacao Organizacao @relation(fields: [organizacaoId], references: [id], onDelete: Cascade)

  @@id([organizacaoId, dia])
  @@map("contadores_protocolo")
}
```

2. Em `model Organizacao`, junto das outras listas:

```prisma
  contadoresProtocolo ContadorProtocolo[]
```

- [ ] **Step 7: Validar o schema e gerar o client**

```bash
cd apps/api && npx prisma validate && npx prisma generate
```

Expected: `The schema at prisma/schema.prisma is valid` e `Generated Prisma Client`.

- [ ] **Step 8: Gerar o DDL sem banco**

```bash
cd apps/api
ANTES=$(mktemp --suffix=.prisma)
git show HEAD:apps/api/prisma/schema.prisma > "$ANTES"
mkdir -p prisma/migrations/20261009120000_atendimento_estilo_pcm
npx prisma migrate diff --from-schema-datamodel "$ANTES" --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/20261009120000_atendimento_estilo_pcm/migration.sql
cat prisma/migrations/20261009120000_atendimento_estilo_pcm/migration.sql
```

Expected:
- Contém `CREATE TYPE "ConversaOrigem"`, `CREATE TYPE "EventoConversa"`, os `ALTER TABLE` de `conversas`, `mensagens` e `canais_config` (ou o nome mapeado de `ChannelConfig`), `CREATE TABLE "contadores_protocolo"`, o índice único `conversas_organizacao_id_protocolo_key` e a FK `conversas_atendente_inicial_id_fkey`.
- **Nada de `DROP`.** Se aparecer `DROP`, parar e investigar: o schema-base não é o do HEAD.

- [ ] **Step 9: Acrescentar o backfill ao fim da migration**

Anexar ao final do `migration.sql` gerado:

```sql
-- Backfill: origem pela primeira mensagem de gente (cliente ou agente).
UPDATE "conversas" AS c
SET "origem" = 'ATIVO'
WHERE (
  SELECT m."autor"::text
  FROM "mensagens" AS m
  WHERE m."conversa_id" = c."id" AND m."autor" IN ('CLIENTE', 'AGENTE')
  ORDER BY m."criado_em" ASC, m."id" ASC
  LIMIT 1
) = 'AGENTE';

-- Backfill: atendente inicial aproximado pelo responsavel atual (o historico de
-- transferencias antigas nao guarda o id de quem aceitou primeiro).
UPDATE "conversas" SET "atendente_inicial_id" = "agente_id" WHERE "agente_id" IS NOT NULL;

-- Backfill: protocolo AAMMDD-NNNNN pela data de criacao em Brasilia.
UPDATE "conversas" AS c
SET "protocolo" = s.protocolo
FROM (
  SELECT
    "id",
    to_char(("criado_em" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo', 'YYMMDD')
      || '-'
      || lpad(
        row_number() OVER (
          PARTITION BY "organizacao_id",
            to_char(("criado_em" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo', 'YYMMDD')
          ORDER BY "criado_em", "id"
        )::text,
        5,
        '0'
      ) AS protocolo
  FROM "conversas"
) AS s
WHERE c."id" = s."id";

-- Contadores continuam de onde o backfill parou.
INSERT INTO "contadores_protocolo" ("organizacao_id", "dia", "ultimo")
SELECT "organizacao_id", left("protocolo", 6), count(*)::int
FROM "conversas"
WHERE "protocolo" IS NOT NULL
GROUP BY "organizacao_id", left("protocolo", 6);
```

- [ ] **Step 10: Typecheck da API (deve continuar verde, os campos são opcionais ou com default)**

```bash
npm run typecheck -w @plataforma/api
```

Expected: sem erros. Se algum ponto usar `include: { agente: ... }` com tipagem quebrada pela relação renomeada, o nome do campo (`agente`) não mudou; só o nome da relação. Não deve haver erro.

- [ ] **Step 11: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20261009120000_atendimento_estilo_pcm/migration.sql
git commit -m "feat(atendimento): protocolo, origem, atendente inicial e espelhamento no modelo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

> **Aplicar a migration** em dev/produção é feito pelo responsável com `npm run db:deploy -w @plataforma/api` (`prisma migrate deploy`, sem shadow DB). Não faz parte das tasks automáticas.

---

## Task 2: Gerador de protocolo

**Files:**
- Create: `apps/api/src/modules/conversations/protocolo.ts`
- Test: `apps/api/src/modules/conversations/protocolo.test.ts`

**Interfaces:**
- Produces:
  - `diaDoProtocolo(agora: Date): string` (6 dígitos, AAMMDD, Brasília)
  - `formatarProtocolo(dia: string, sequencial: number): string`
  - `reservarProtocolo(agora?: Date): Promise<string>`, que exige contexto de organização (`comOrganizacao`)

- [ ] **Step 1: Teste falhando**

```ts
// apps/api/src/modules/conversations/protocolo.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { comOrganizacao } from '../../lib/tenant';

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }));
vi.mock('../../lib/prisma', () => ({ prisma: { $queryRaw: queryRaw } }));

const { diaDoProtocolo, formatarProtocolo, reservarProtocolo } = await import('./protocolo');

describe('diaDoProtocolo', () => {
  it('usa o dia de Brasilia, nao o de UTC (23:30 de 08/10 em Brasilia = 02:30 UTC de 09/10)', () => {
    expect(diaDoProtocolo(new Date('2026-10-09T02:30:00Z'))).toBe('261008');
  });

  it('meio-dia em Brasilia fica no mesmo dia', () => {
    expect(diaDoProtocolo(new Date('2026-01-05T15:00:00Z'))).toBe('260105');
  });
});

describe('formatarProtocolo', () => {
  it('preenche o sequencial com 5 digitos', () => {
    expect(formatarProtocolo('261008', 42)).toBe('261008-00042');
  });

  it('nao corta sequencial com mais de 5 digitos', () => {
    expect(formatarProtocolo('261008', 123456)).toBe('261008-123456');
  });
});

describe('reservarProtocolo', () => {
  beforeEach(() => queryRaw.mockReset());

  it('reserva o proximo numero do dia da organizacao atual', async () => {
    queryRaw.mockResolvedValue([{ ultimo: 7 }]);
    const protocolo = await comOrganizacao('org-1', () => reservarProtocolo(new Date('2026-10-09T15:00:00Z')), {
      id: 'u-1',
      perfil: 'ADMIN',
    });
    expect(protocolo).toBe('261009-00007');
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('falha alto se o banco nao devolver linha', async () => {
    queryRaw.mockResolvedValue([]);
    await expect(
      comOrganizacao('org-1', () => reservarProtocolo(new Date()), { id: 'u-1', perfil: 'ADMIN' }),
    ).rejects.toThrow(/protocolo/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run apps/api/src/modules/conversations/protocolo.test.ts
```

Expected: FAIL (`Cannot find module './protocolo'`).

- [ ] **Step 3: Implementação**

```ts
// apps/api/src/modules/conversations/protocolo.ts
import { prisma } from '../../lib/prisma';
import { organizacaoAtual } from '../../lib/tenant';

/**
 * Protocolo legivel de cada atendimento: AAMMDD-NNNNN.
 *
 * O dia e o de Brasilia, nao o de UTC: um atendimento aberto as 23:30 de
 * segunda tem de sair com a data de segunda, que e a que o atendente le no
 * relogio. O sequencial reinicia por dia e por organizacao (decisao de
 * 09/10/2026, ANALISE_VIDEO_IMPLEMENTACAO.md secao 10).
 */
const FORMATO_DIA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: '2-digit',
  month: '2-digit',
  day: '2-digit',
});

export function diaDoProtocolo(agora: Date): string {
  const partes = Object.fromEntries(FORMATO_DIA.formatToParts(agora).map((p) => [p.type, p.value]));
  return `${partes.year}${partes.month}${partes.day}`;
}

export function formatarProtocolo(dia: string, sequencial: number): string {
  return `${dia}-${String(sequencial).padStart(5, '0')}`;
}

/**
 * Reserva o proximo numero do dia num passo so: o INSERT ... ON CONFLICT trava
 * a linha do contador, entao duas conversas criadas no mesmo instante recebem
 * numeros diferentes (mesmo raciocinio de `reservarNumero` em tickets.service).
 */
export async function reservarProtocolo(agora: Date = new Date()): Promise<string> {
  const dia = diaDoProtocolo(agora);
  const [linha] = await prisma.$queryRaw<Array<{ ultimo: number }>>`
    INSERT INTO contadores_protocolo (organizacao_id, dia, ultimo)
    VALUES (${organizacaoAtual()}, ${dia}, 1)
    ON CONFLICT (organizacao_id, dia) DO UPDATE SET ultimo = contadores_protocolo.ultimo + 1
    RETURNING ultimo
  `;
  if (!linha) throw new Error('não foi possível reservar o protocolo da conversa');
  return formatarProtocolo(dia, Number(linha.ultimo));
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npx vitest run apps/api/src/modules/conversations/protocolo.test.ts
```

Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/conversations/protocolo.ts apps/api/src/modules/conversations/protocolo.test.ts
git commit -m "feat(atendimento): gerador de protocolo AAMMDD-NNNNN por dia e organizacao

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 3: Serializer, origem, protocolo e atendente inicial na criação

**Files:**
- Modify: `apps/api/src/modules/conversations/conversations.serializer.ts`
- Modify: `apps/api/src/modules/conversations/conversations.serializer.test.ts`
- Modify: `apps/api/src/modules/conversations/conversations.service.ts` (`iniciarConversa`, `listarMensagens`, `enviarMensagem`, `enviarArquivo`)
- Modify: `apps/api/src/modules/channels/inbound.service.ts` (`registrarMensagemEntrante`)
- Modify: testes que mockam o Prisma e quebram por causa do protocolo (lista no Step 7)

**Interfaces:**
- Consumes: `reservarProtocolo()` (Task 2).
- Produces:
  - `toMensagem(m)` passa a devolver também `autorNome: string | null`, `evento: 'ACEITE' | 'TRANSFERENCIA' | 'ENCERRAMENTO' | null` e `enviadaPorDispositivo: boolean`.
  - `toConversaResumo` / `toConversaDetalhe` passam a devolver também `protocolo: string | null`, `origem: 'ATIVO' | 'RECEPTIVO'`, `atendenteInicial: { id: string; nome: string } | null` e `linha: { id, donoId, nome } | null` (o `nome` é novo).
  - `type MensagemSerializavel = Message & { autorUsuario?: { nome: string } | null }`, exportado do serializer.

- [ ] **Step 1: Teste do serializer falhando**

Acrescentar ao fim de `conversations.serializer.test.ts`:

```ts
import { toMensagem } from './conversations.serializer';

describe('campos do atendimento estilo PCM', () => {
  it('resumo expoe protocolo, origem, atendente inicial e nome da linha', () => {
    const r = toConversaResumo(
      criarConversaResumoMock({
        protocolo: '261009-00001',
        origem: 'ATIVO',
        atendenteInicial: { id: 'u-1', nome: 'Guilherme' },
        canalConfig: { id: 'cfg-1', donoId: null, iaAtiva: false, nome: 'Comercial - 3370' },
      }),
    );
    expect(r.protocolo).toBe('261009-00001');
    expect(r.origem).toBe('ATIVO');
    expect(r.atendenteInicial).toEqual({ id: 'u-1', nome: 'Guilherme' });
    expect(r.linha).toEqual({ id: 'cfg-1', donoId: null, nome: 'Comercial - 3370' });
  });

  it('mensagem expoe autorNome, evento e enviadaPorDispositivo', () => {
    const m = toMensagem({
      id: 'm-1',
      organizacaoId: 'org-1',
      conversaId: 'c-1',
      autor: 'AGENTE',
      autorId: null,
      conteudo: 'Meu celular',
      tipoAnexo: 'TEXTO',
      anexoUrl: null,
      idExterno: 'X1',
      interno: false,
      evento: null,
      enviadaPorDispositivo: true,
      criadoEm: new Date('2026-10-09T15:00:00Z'),
      autorUsuario: null,
    });
    expect(m).toMatchObject({ autorNome: null, evento: null, enviadaPorDispositivo: true });
  });

  it('mensagem sem include de autor (recem-criada) devolve autorNome nulo sem quebrar', () => {
    const m = toMensagem({
      id: 'm-2',
      organizacaoId: 'org-1',
      conversaId: 'c-1',
      autor: 'SISTEMA',
      autorId: null,
      conteudo: 'Aceito por: Ana',
      tipoAnexo: 'TEXTO',
      anexoUrl: null,
      idExterno: null,
      interno: false,
      evento: 'ACEITE',
      enviadaPorDispositivo: false,
      criadoEm: new Date(),
    });
    expect(m.autorNome).toBeNull();
    expect(m.evento).toBe('ACEITE');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run apps/api/src/modules/conversations/conversations.serializer.test.ts
```

Expected: FAIL (`protocolo` undefined / `autorNome` undefined).

- [ ] **Step 3: Implementar no serializer**

Em `conversations.serializer.ts`:

1. Trocar o import do topo por:

```ts
import type { Message, Prisma } from '@prisma/client';
```

2. Inclusões (substituir as duas constantes):

```ts
const autorDaMensagem = { autorUsuario: { select: { nome: true } } } satisfies Prisma.MessageInclude;

export const inclusaoResumo = {
  contato: true,
  fila: { select: { id: true, nome: true } },
  agente: { select: { id: true, nome: true } },
  atendenteInicial: { select: { id: true, nome: true } },
  canalConfig: { select: { id: true, donoId: true, iaAtiva: true, nome: true } },
  mensagens: { orderBy: { criadoEm: 'desc' }, take: 1, include: autorDaMensagem },
} satisfies Prisma.ConversationInclude;
```

```ts
export const inclusaoDetalhe = {
  contato: true,
  fila: { select: { id: true, nome: true } },
  agente: { select: { id: true, nome: true } },
  atendenteInicial: { select: { id: true, nome: true } },
  canalConfig: { select: { id: true, donoId: true, iaAtiva: true, nome: true } },
  // Busca as mais recentes (desc) e inverte na serializacao: um atendimento com
  // dois anos de historico nao pode chegar inteiro a cada abertura do painel.
  mensagens: {
    orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
    take: MENSAGENS_NO_DETALHE + 1,
    include: autorDaMensagem,
  },
} satisfies Prisma.ConversationInclude;

export { autorDaMensagem };
```

3. Tipo e `toMensagem`:

```ts
/** Mensagem como sai do banco; `autorUsuario` so vem quando a consulta incluiu. */
export type MensagemSerializavel = Message & { autorUsuario?: { nome: string } | null };

export function toMensagem(m: MensagemSerializavel) {
  return {
    id: m.id,
    conversaId: m.conversaId,
    autor: m.autor,
    autorId: m.autorId,
    autorNome: m.autorUsuario?.nome ?? null,
    conteudo: m.conteudo,
    tipoAnexo: m.tipoAnexo,
    anexoUrl: m.anexoUrl ? urlAssinada(m.anexoUrl) : null,
    interno: m.interno,
    evento: m.evento,
    enviadaPorDispositivo: m.enviadaPorDispositivo,
    criadoEm: m.criadoEm,
  };
}
```

E apagar a linha `type MensagemDb = ...`.

4. Em `toConversaResumo` e em `toConversaDetalhe`:
   - acrescentar, logo depois de `ultimaMensagemEm`:

     ```ts
         protocolo: c.protocolo,
         origem: c.origem,
         atendenteInicial: c.atendenteInicial,
     ```

   - trocar a linha `linha:` por:

     ```ts
         linha: c.canalConfig ? { id: c.canalConfig.id, donoId: c.canalConfig.donoId, nome: c.canalConfig.nome } : null,
     ```

- [ ] **Step 4: Ajustar o mock do teste do serializer**

Em `criarConversaResumoMock` e `criarConversaDetalheMock`, acrescentar ao objeto base:

```ts
    protocolo: null,
    origem: 'RECEPTIVO' as const,
    atendenteInicial: null,
```

- [ ] **Step 5: Rodar o teste do serializer**

```bash
npx vitest run apps/api/src/modules/conversations/conversations.serializer.test.ts
```

Expected: PASS.

- [ ] **Step 6: Gravar origem, protocolo e atendente inicial nos dois pontos que criam conversa**

1. Em `conversations.service.ts`, `iniciarConversa`:
   - acrescentar o import:

     ```ts
     import { reservarProtocolo } from './protocolo';
     ```

   - no `prisma.conversation.create({ data: { ... } })`, acrescentar:

     ```ts
           origem: 'ATIVO',
           protocolo: await reservarProtocolo(),
           atendenteInicialId: destino.agenteId,
     ```

2. Em `inbound.service.ts`, `registrarMensagemEntrante`:
   - acrescentar o import:

     ```ts
     import { reservarProtocolo } from '../conversations/protocolo';
     ```

   - no `prisma.conversation.create`, acrescentar:

     ```ts
             origem: 'RECEPTIVO',
             protocolo: await reservarProtocolo(),
             atendenteInicialId: destino.agenteId,
     ```

3. Ainda em `inbound.service.ts`, linha pessoal: a conversa nasce atribuída com o evento automático "Aceito por" (PCM, 07:06). Logo **depois** de `const mensagem = await criarMensagemOuDetectarCorrida(...)` e do `if (mensagem === null) ...`, acrescentar:

```ts
  // Linha pessoal: a conversa ja nasce do dono, como o "Aceito por" automatico
  // da PCM quando o roteamento manda direto ao vendedor.
  if (nova && destino.agenteId) {
    const dono = await prisma.user.findUnique({ where: { id: destino.agenteId }, select: { nome: true } });
    await prisma.message.create({
      data: { conversaId: conversa.id, autor: 'SISTEMA', evento: 'ACEITE', conteudo: `Aceito por: ${dono?.nome ?? 'responsável do número'}` },
    });
  }
```

4. Em `conversations.service.ts`, as mensagens criadas pelo agente devolvem o nome do autor. Em `enviarMensagem` e em `enviarArquivo`, acrescentar ao `prisma.message.create({ data: {...} })` a chave:

```ts
      include: { autorUsuario: { select: { nome: true } } },
```

5. Em `listarMensagens`, acrescentar ao `prisma.message.findMany({...})`:

```ts
    include: { autorUsuario: { select: { nome: true } } },
```

- [ ] **Step 7: Rodar a suíte inteira e consertar mocks**

```bash
npm test
```

Expected:
- Os testes que passam por `iniciarConversa` ou `registrarMensagemEntrante` com Prisma mockado agora chamam `reservarProtocolo`, que usa `prisma.$queryRaw` (não mockado).
- Para cada arquivo que falhar por isso (procure com `grep -ln "inbound.service'\|conversations.service'" apps/api/src --include=*.test.ts`), acrescentar perto dos outros `vi.mock`:

```ts
vi.mock('../conversations/protocolo', () => ({ reservarProtocolo: vi.fn().mockResolvedValue('261009-00001') }));
```

  (em `conversations.service.test.ts` o caminho é `'./protocolo'`).

- Para os testes de inbound que criam conversa em linha pessoal (`donoId`), acrescentar `user: { findUnique: vi.fn().mockResolvedValue({ nome: 'Dono' }) }` ao mock do Prisma, se ainda não houver.

Rodar `npm test` de novo. Expected: tudo verde.

- [ ] **Step 8: Typecheck**

```bash
npm run typecheck -w @plataforma/api
```

Expected: sem erros. Se algum chamador de `toMensagem` passar um tipo sem `evento`/`enviadaPorDispositivo`, é objeto montado à mão: ele deve vir do Prisma (`MensagemSerializavel`).

- [ ] **Step 9: Commit**

```bash
git add apps/api/src
git commit -m "feat(atendimento): protocolo, origem e atendente inicial nas conversas novas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 4: Aceite atômico e eventos tipados

**Files:**
- Modify: `apps/api/src/modules/conversations/conversations.service.ts` (`registrarEventoSistema`, `assumirConversa`, `enviarMensagem`, `enviarArquivo`, `transferirConversa`, `finalizarConversa`)
- Test: `apps/api/src/modules/conversations/conversations.service.test.ts`

**Interfaces:**
- Produces:
  - `assumirConversa(solicitante, id)`: 409 `CONFLICT` "Outro atendente já assumiu esta conversa" quando perde a corrida; noop (sem evento) quando a conversa já é do solicitante.
  - Eventos gravados:
    - aceite: `{ autor: 'SISTEMA', evento: 'ACEITE', conteudo: 'Aceito por: <nome>' }`
    - transferência: `evento: 'TRANSFERENCIA'`
    - encerramento: `evento: 'ENCERRAMENTO'`

- [ ] **Step 1: Teste falhando**

1. No mock do Prisma de `conversations.service.test.ts`, acrescentar `conversationUpdateMany: vi.fn().mockResolvedValue({ count: 1 })` ao `vi.hoisted` e `updateMany: conversationUpdateMany` em `conversation`.
2. Acrescentar `assumirConversa` ao import.
3. Ao fim do arquivo:

```ts
describe('assumirConversa — aceite atomico (primeiro que pega)', () => {
  beforeEach(() => vi.clearAllMocks());

  const comoAgente = <T>(fn: () => Promise<T>) =>
    comOrganizacao('org-1', fn, { id: 'user-1', perfil: 'ADMIN' });

  it('perde a corrida: updateMany sem linha afetada vira 409 e nao grava evento', async () => {
    conversationFindFirst.mockResolvedValueOnce({ id: 'c-1', status: 'EM_ESPERA', agenteId: null, atendenteInicialId: null, filaId: 'f-1' });
    conversationUpdateMany.mockResolvedValueOnce({ count: 0 });

    await expect(comoAgente(() => assumirConversa(SOLICITANTE, 'c-1'))).rejects.toMatchObject({ status: 409 });
    expect(messageCreate).not.toHaveBeenCalled();
  });

  it('vence: condiciona o update a agenteId nulo e grava o evento ACEITE', async () => {
    conversationFindFirst
      .mockResolvedValueOnce({ id: 'c-1', status: 'EM_ESPERA', agenteId: null, atendenteInicialId: null, filaId: 'f-1' })
      .mockResolvedValueOnce({ id: 'c-1', fila: { id: 'f-1' }, agente: { id: 'user-1' } });
    conversationUpdateMany.mockResolvedValue({ count: 1 });

    await comoAgente(() => assumirConversa(SOLICITANTE, 'c-1'));

    const where = conversationUpdateMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ id: 'c-1', OR: [{ agenteId: null }, { agenteId: 'user-1' }] });
    expect(messageCreate).toHaveBeenCalledWith({
      data: { conversaId: 'c-1', autor: 'SISTEMA', conteudo: 'Aceito por: Admin Teste', evento: 'ACEITE' },
    });
  });

  it('conversa ja e do solicitante: nao escreve nada', async () => {
    conversationFindFirst.mockResolvedValueOnce({ id: 'c-1', status: 'ATRIBUIDO', agenteId: 'user-1', atendenteInicialId: 'user-1', filaId: null });

    await comoAgente(() => assumirConversa(SOLICITANTE, 'c-1'));

    expect(conversationUpdateMany).not.toHaveBeenCalled();
    expect(messageCreate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run apps/api/src/modules/conversations/conversations.service.test.ts -t "aceite atomico"
```

Expected: FAIL (implementação atual usa `update`, não `updateMany`).

- [ ] **Step 3: Implementação**

1. No import de `../../lib/errors`, acrescentar `conflict`.
2. Acrescentar `EventoConversa` ao `import type { ... } from '@prisma/client'`.
3. Substituir `registrarEventoSistema` e `assumirConversa`:

```ts
/** Registra evento do sistema no historico (atribuicao, transferencia, encerramento). */
async function registrarEventoSistema(conversaId: string, texto: string, evento?: EventoConversa) {
  return prisma.message.create({
    data: { conversaId, autor: 'SISTEMA', conteudo: texto, ...(evento ? { evento } : {}) },
  });
}

/** Grava o primeiro atendente uma vez so; transferencias depois nao mudam. */
async function marcarAtendenteInicial(conversaId: string, usuarioId: string) {
  await prisma.conversation.updateMany({
    where: { id: conversaId, atendenteInicialId: null },
    data: { atendenteInicialId: usuarioId },
  });
}

/**
 * Aceite da caixa de entrada: o primeiro que pega leva (PCM, 31:10).
 *
 * A condicao vai NO update (`agenteId` nulo ou eu), nao numa leitura antes: com
 * dois cliques simultaneos as duas leituras viam a conversa livre e o segundo
 * update sobrescrevia o primeiro.
 */
export async function assumirConversa(solicitante: Solicitante, id: string) {
  const conversa = await carregarOuFalhar(id);
  if (conversa.status === 'FINALIZADO') throw badRequest('Conversa já finalizada');
  if (conversa.agenteId === solicitante.sub) return toConversaDetalhe(conversa);

  const { count } = await prisma.conversation.updateMany({
    where: { id, status: { not: 'FINALIZADO' }, OR: [{ agenteId: null }, { agenteId: solicitante.sub }] },
    data: { agenteId: solicitante.sub, status: 'ATRIBUIDO', atribuidoEm: new Date() },
  });
  if (count === 0) throw conflict('Outro atendente já assumiu esta conversa');

  await marcarAtendenteInicial(id, solicitante.sub);
  await registrarEventoSistema(id, `Aceito por: ${solicitante.nome}`, 'ACEITE');

  return publicar(id, { agenteAnteriorId: conversa.agenteId, filaAnteriorId: conversa.filaId });
}
```

4. Em `enviarMensagem` e `enviarArquivo`, depois do `prisma.conversation.update(...)` que aplica `assumir`, acrescentar:

```ts
  if (!conversa.agenteId) await marcarAtendenteInicial(id, solicitante.sub);
```

5. Em `transferirConversa`, nos dois `registrarEventoSistema`:
   - o de agente passa a ser:

     ```ts
         await registrarEventoSistema(id, `${solicitante.nome} transferiu o atendimento para ${destino.nome}.${sufixo}`, 'TRANSFERENCIA');
     ```

     e, logo depois do update de agente, acrescentar `await marcarAtendenteInicial(id, destino.id);`

   - o de fila passa a ser:

     ```ts
         await registrarEventoSistema(id, `${solicitante.nome} transferiu o atendimento para a equipe ${fila.nome}.${sufixo}`, 'TRANSFERENCIA');
     ```

6. Em `finalizarConversa`, trocar o evento de encerramento por:

```ts
  await registrarEventoSistema(id, `${solicitante.nome} encerrou o atendimento.`, 'ENCERRAMENTO');
```

- [ ] **Step 4: Rodar a suíte da conversa**

```bash
npx vitest run apps/api/src/modules/conversations
```

Expected: PASS. Se um teste antigo esperava o texto "devolveu o atendimento para a fila" ou "finalizou o atendimento", atualize a expectativa para o texto novo; é mudança deliberada de rótulo.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/conversations
git commit -m "fix(atendimento): aceite atomico da conversa e eventos tipados no historico

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 5: Ponte repassa mensagens enviadas pelo celular

**Files:**
- Create: `apps/ponte/src/enviadas.ts`
- Test: `apps/ponte/src/enviadas.test.ts`
- Modify: `apps/ponte/src/sessao.ts` (função que chama `sock.sendMessage`, ~linha 669)
- Modify: `apps/ponte/src/recebida.ts`
- Modify: `apps/ponte/src/plataforma.ts` (`MensagemRecebida`)
- Test: `apps/ponte/src/recebida.test.ts`

**Interfaces:**
- Produces:
  - `lembrarEnviadaPelaPlataforma(id: string, agora?: number): void`
  - `foiEnviadaPelaPlataforma(id: string, agora?: number): boolean`
  - `MensagemRecebida.propria?: boolean`. Quando `true`, `nome` vai `null`; o pushName de mensagem própria é o nome do dono do número e renomearia o contato.

- [ ] **Step 1: Teste de `enviadas` falhando**

```ts
// apps/ponte/src/enviadas.test.ts
import { describe, expect, it } from 'vitest';
import { foiEnviadaPelaPlataforma, lembrarEnviadaPelaPlataforma } from './enviadas.js';

describe('ids enviados pela plataforma', () => {
  it('lembra o id por 10 minutos', () => {
    lembrarEnviadaPelaPlataforma('A1', 1_000);
    expect(foiEnviadaPelaPlataforma('A1', 1_000 + 9 * 60_000)).toBe(true);
    expect(foiEnviadaPelaPlataforma('A1', 1_000 + 11 * 60_000)).toBe(false);
  });

  it('id desconhecido nao foi enviado pela plataforma', () => {
    expect(foiEnviadaPelaPlataforma('NUNCA', Date.now())).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run apps/ponte/src/enviadas.test.ts
```

Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `enviadas.ts`**

```ts
// apps/ponte/src/enviadas.ts
/**
 * Ids de mensagens que a PLATAFORMA mandou por esta ponte.
 *
 * Com o espelhamento do celular ligado, tudo que sai do numero volta como
 * `fromMe` — inclusive o que a propria plataforma enviou. Sem esta memoria, a
 * resposta do atendente apareceria duas vezes: a dele e uma "enviada por outro
 * dispositivo". A API tambem deduplica pelo idExterno; esta e a primeira trava.
 */
const VALIDADE_MS = 10 * 60_000;
const LIMITE = 5_000;
const enviadas = new Map<string, number>();

export function lembrarEnviadaPelaPlataforma(id: string, agora = Date.now()): void {
  enviadas.set(id, agora + VALIDADE_MS);
  if (enviadas.size > LIMITE) {
    for (const [chave, expira] of enviadas) {
      if (expira <= agora || enviadas.size > LIMITE) enviadas.delete(chave);
      if (enviadas.size <= LIMITE) break;
    }
  }
}

export function foiEnviadaPelaPlataforma(id: string, agora = Date.now()): boolean {
  const expira = enviadas.get(id);
  if (expira === undefined) return false;
  if (expira <= agora) {
    enviadas.delete(id);
    return false;
  }
  return true;
}
```

- [ ] **Step 4: Registrar o id ao enviar**

Em `apps/ponte/src/sessao.ts`:

1. Acrescentar o import:

```ts
import { lembrarEnviadaPelaPlataforma } from './enviadas.js';
```

2. Substituir as duas últimas linhas da função que chama `sendMessage` (hoje `const enviada = await sessao.sock.sendMessage(...)` / `return enviada?.key?.id ?? null;`) por:

```ts
  const enviada = await sessao.sock.sendMessage(await jid(sessao, destino), conteudo);
  const id = enviada?.key?.id ?? null;
  if (id) lembrarEnviadaPelaPlataforma(id);
  return id;
```

- [ ] **Step 5: Teste de `recebida` falhando**

Acrescentar ao fim de `apps/ponte/src/recebida.test.ts`:

```ts
import { lembrarEnviadaPelaPlataforma } from './enviadas.js';

function msgPropria(id: string, texto: string): WAMessage {
  return {
    key: { remoteJid: '5562992197010@s.whatsapp.net', fromMe: true, id },
    pushName: 'Guilherme (dono do numero)',
    message: { conversation: texto },
  } as unknown as WAMessage;
}

describe('receber — mensagem enviada pelo celular (fromMe)', () => {
  it('repassa como propria, sem o pushName do dono', async () => {
    entregarMock.mockClear();
    await receber(sessaoComSock({} as Sessao['sock']), msgPropria('CEL-1', 'Meu celular'));
    expect(entregarMock).toHaveBeenCalledTimes(1);
    expect(entregarMock.mock.calls[0]?.[0]).toMatchObject({
      numero: '5562992197010',
      texto: 'Meu celular',
      idExterno: 'CEL-1',
      propria: true,
      nome: null,
    });
  });

  it('ignora o eco do que a propria plataforma enviou', async () => {
    entregarMock.mockClear();
    lembrarEnviadaPelaPlataforma('PLAT-1');
    await receber(sessaoComSock({} as Sessao['sock']), msgPropria('PLAT-1', 'boa tarde'));
    expect(entregarMock).not.toHaveBeenCalled();
  });

  it('mensagem do cliente continua sem propria', async () => {
    entregarMock.mockClear();
    await receber(sessaoComSock({} as Sessao['sock']), msgTexto('5562992197010@s.whatsapp.net', 'Oi'));
    expect(entregarMock.mock.calls[0]?.[0]?.propria).toBe(false);
  });
});
```

- [ ] **Step 6: Rodar e ver falhar**

```bash
npx vitest run apps/ponte/src/recebida.test.ts
```

Expected: FAIL (`fromMe` descartado; `propria` ausente).

- [ ] **Step 7: Implementar em `recebida.ts` e `plataforma.ts`**

1. Em `plataforma.ts`, no tipo `MensagemRecebida`, acrescentar:

```ts
  /** true = digitada no celular/WhatsApp Web do proprio numero (fromMe), nao pelo cliente. */
  propria?: boolean;
```

2. Em `recebida.ts`, acrescentar o import:

```ts
import { foiEnviadaPelaPlataforma } from './enviadas.js';
```

3. Substituir o bloco

```ts
    // Eco do que a propria plataforma mandou. Registrar de novo duplicaria a
    // mensagem na conversa, como se o cliente tivesse escrito.
    if (msg.key?.fromMe) return;
```

por

```ts
    /*
     * `fromMe` e o que o dono do numero digitou no celular ou no WhatsApp Web —
     * vai para a plataforma como mensagem PROPRIA (auditoria do vendedor, PCM
     * 04:00). O eco do que a propria plataforma enviou fica de fora: senao a
     * resposta do atendente apareceria duas vezes.
     */
    const propria = Boolean(msg.key?.fromMe);
    if (propria && msg.key?.id && foiEnviadaPelaPlataforma(msg.key.id)) return;
```

4. No `await entregar({...})`, trocar `nome: msg.pushName ?? null,` por:

```ts
      // O pushName de mensagem propria e o nome do DONO do numero: gravar
      // renomearia o contato do cliente com o nome do vendedor.
      nome: propria ? null : (msg.pushName ?? null),
      propria,
```

- [ ] **Step 8: Rodar os testes da ponte**

```bash
npx vitest run apps/ponte/src
```

Expected: PASS (inclusive os testes antigos de `@lid`).

- [ ] **Step 9: Typecheck da ponte**

```bash
npm run typecheck -w @plataforma/ponte
```

Expected: sem erros.

- [ ] **Step 10: Commit**

```bash
git add apps/ponte/src
git commit -m "feat(ponte): repassa mensagens enviadas pelo celular e ignora o eco da plataforma

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 6: API grava mensagem própria ("Mensagem enviada por outro dispositivo")

**Files:**
- Modify: `apps/api/src/modules/channels/inbound.service.ts`
- Modify: `apps/api/src/modules/channels/ponte.routes.ts`
- Test: `apps/api/src/modules/channels/inbound.service.propria.test.ts` (novo)

**Interfaces:**
- Consumes:
  - `reservarProtocolo` (Task 2);
  - campos `Message.enviadaPorDispositivo`, `Conversation.origem` e `ChannelConfig.espelharCelular` (Task 1);
  - payload `propria` (Task 5).
- Produces:
  - `registrarMensagemPropria(dados: MensagemNormalizada): Promise<{ duplicada: true } | { ignorada: true } | { duplicada: false; conversaId: string; mensagemId: string }>`

> **Fora de escopo e documentado:**
> - WAHA/GOWA mandam `mensagem.propria` **sem conteúdo** (`channel-provider.ts:87`); continuam só no log.
> - WPPConnect (`wppconnect.inbound.ts`) continua descartando `fromMe`.
> - Produção usa Baileys.

- [ ] **Step 1: Teste falhando**

```ts
// apps/api/src/modules/channels/inbound.service.propria.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { comOrganizacao } from '../../lib/tenant';

const db = vi.hoisted(() => ({
  messageFindUnique: vi.fn(),
  messageCreate: vi.fn(),
  conversationFindFirst: vi.fn(),
  conversationCreate: vi.fn(),
  conversationUpdate: vi.fn(),
  contactFindFirst: vi.fn(),
  contactCreate: vi.fn(),
  contactFindUniqueOrThrow: vi.fn(),
  queueFindFirst: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    message: { findUnique: db.messageFindUnique, create: db.messageCreate },
    conversation: { findFirst: db.conversationFindFirst, create: db.conversationCreate, update: db.conversationUpdate },
    contact: { findFirst: db.contactFindFirst, create: db.contactCreate, findUniqueOrThrow: db.contactFindUniqueOrThrow },
    queue: { findFirst: db.queueFindFirst },
    user: { findUnique: vi.fn().mockResolvedValue({ nome: 'Dono' }) },
  },
}));

const { configDoDestino } = vi.hoisted(() => ({ configDoDestino: vi.fn() }));
vi.mock('./channels.service', () => ({ configDoDestino }));
vi.mock('./media.service', () => ({ baixarAnexo: vi.fn().mockResolvedValue({ url: null, motivo: null }) }));
vi.mock('./chat-previews.service', () => ({ promoverPrevia: vi.fn() }));
vi.mock('../conversations/protocolo', () => ({ reservarProtocolo: vi.fn().mockResolvedValue('261009-00003') }));
const { entregarParaIa } = vi.hoisted(() => ({ entregarParaIa: vi.fn() }));
vi.mock('../bots/ia.service', () => ({ entregarParaIa }));
const { responderAutomaticamente } = vi.hoisted(() => ({ responderAutomaticamente: vi.fn() }));
vi.mock('../bots/bots.service', () => ({ responderAutomaticamente }));
const hub = vi.hoisted(() => ({ notificarMensagem: vi.fn(), notificarConversaNova: vi.fn(), notificarConversaAtualizada: vi.fn() }));
vi.mock('../../realtime/hub', () => hub);
vi.mock('../conversations/conversations.serializer', () => ({
  inclusaoDetalhe: {},
  toConversaDetalhe: (c: unknown) => c,
  toMensagem: (m: unknown) => m,
}));

const { registrarMensagemPropria } = await import('./inbound.service');

const DADOS = {
  canal: 'WHATSAPP' as const,
  enderecoExterno: '5562992197010',
  nomeExibicao: null,
  telefone: '5562992197010',
  idExterno: 'CEL-1',
  conteudo: 'Meu celular para enviar mensagem',
  tipoAnexo: 'TEXTO' as const,
  anexoUrl: null,
  anexoIdExterno: null,
  anexoNome: null,
  identificadorDestino: 'vendedor-1',
};

const rodar = () => comOrganizacao('org-1', () => registrarMensagemPropria(DADOS), { id: 'sistema', perfil: 'ADMIN' });

describe('registrarMensagemPropria', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.messageFindUnique.mockResolvedValue(null);
    db.contactFindFirst.mockResolvedValue({ id: 'contato-1' });
    db.conversationFindFirst.mockResolvedValue(null);
    db.messageCreate.mockResolvedValue({ id: 'm-1', criadoEm: new Date() });
    db.conversationUpdate.mockResolvedValue({ id: 'c-1', filaId: null, agenteId: 'dono-1' });
  });

  it('linha com espelharCelular desligado: ignora sem gravar nada', async () => {
    configDoDestino.mockResolvedValue({ id: 'cfg-1', donoId: 'dono-1', filaId: null, espelharCelular: false });
    await expect(rodar()).resolves.toEqual({ ignorada: true });
    expect(db.messageCreate).not.toHaveBeenCalled();
    expect(db.conversationCreate).not.toHaveBeenCalled();
  });

  it('idExterno ja gravado (eco da plataforma): duplicada', async () => {
    db.messageFindUnique.mockResolvedValue({ id: 'm-existente' });
    await expect(rodar()).resolves.toEqual({ duplicada: true });
    expect(db.messageCreate).not.toHaveBeenCalled();
  });

  it('sem conversa aberta: cria conversa ATIVA na linha, atribuida ao dono, com protocolo', async () => {
    configDoDestino.mockResolvedValue({ id: 'cfg-1', donoId: 'dono-1', filaId: null, espelharCelular: true });
    db.conversationCreate.mockResolvedValue({ id: 'c-1', status: 'EM_ATENDIMENTO' });

    await rodar();

    expect(db.conversationCreate.mock.calls[0]?.[0]?.data).toMatchObject({
      origem: 'ATIVO',
      protocolo: '261009-00003',
      canalConfigId: 'cfg-1',
      agenteId: 'dono-1',
      atendenteInicialId: 'dono-1',
      status: 'EM_ATENDIMENTO',
    });
    expect(db.messageCreate.mock.calls[0]?.[0]?.data).toMatchObject({
      autor: 'AGENTE',
      enviadaPorDispositivo: true,
      idExterno: 'CEL-1',
    });
    expect(db.conversationUpdate.mock.calls[0]?.[0]?.data).not.toHaveProperty('naoLidas');
    expect(hub.notificarConversaNova).toHaveBeenCalledTimes(1);
  });

  it('com conversa aberta: reaproveita e nunca aciona IA nem bot', async () => {
    configDoDestino.mockResolvedValue({ id: 'cfg-1', donoId: 'dono-1', filaId: null, espelharCelular: true });
    // 1a consulta: encontrarOuCriarContato acha o contato pela conversa anterior;
    // 2a consulta: a conversa aberta na linha.
    db.conversationFindFirst
      .mockResolvedValueOnce({ contatoId: 'contato-1' })
      .mockResolvedValueOnce({ id: 'c-9', status: 'EM_ATENDIMENTO', canalConfigId: 'cfg-1' });
    db.contactFindUniqueOrThrow.mockResolvedValue({ id: 'contato-1' });

    await rodar();

    expect(db.conversationCreate).not.toHaveBeenCalled();
    expect(entregarParaIa).not.toHaveBeenCalled();
    expect(responderAutomaticamente).not.toHaveBeenCalled();
    expect(hub.notificarConversaAtualizada).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run apps/api/src/modules/channels/inbound.service.propria.test.ts
```

Expected: FAIL (`registrarMensagemPropria` não existe).

- [ ] **Step 3: Generalizar `criarMensagemOuDetectarCorrida`**

Em `inbound.service.ts`:

1. Trocar a assinatura por:

```ts
async function criarMensagemOuDetectarCorrida(
  conversaId: string,
  dados: MensagemNormalizada,
  anexo: { url?: string | null },
  autoria: { autor: 'CLIENTE' | 'AGENTE'; enviadaPorDispositivo?: boolean } = { autor: 'CLIENTE' },
) {
```

2. No `prisma.message.create`, trocar `autor: 'CLIENTE',` por:

```ts
        autor: autoria.autor,
        enviadaPorDispositivo: autoria.enviadaPorDispositivo ?? false,
```

- [ ] **Step 4: Implementar `registrarMensagemPropria`**

Acrescentar depois de `registrarMensagemEntrante`:

```ts
/**
 * Mensagem que o DONO do numero digitou no celular ou no WhatsApp Web
 * ("Mensagem enviada por outro dispositivo", PCM 04:00).
 *
 * Diferente da entrante em quatro pontos, todos de proposito:
 * - respeita `espelharCelular` da linha (decisao de 09/10/2026);
 * - nao conta como nao lida — foi a propria equipe que escreveu;
 * - nao aciona IA nem bot;
 * - conversa nova nasce ATIVA (a empresa falou primeiro).
 */
export async function registrarMensagemPropria(dados: MensagemNormalizada) {
  const jaExiste = await prisma.message.findUnique({ where: { idExterno: dados.idExterno } });
  if (jaExiste) return { duplicada: true as const };

  const config = await configDoDestino(dados.canal, dados.identificadorDestino);
  if (config && config.espelharCelular === false) return { ignorada: true as const };

  // Sem nome de exibicao: o pushName de mensagem propria e o do dono do numero.
  const contato = await encontrarOuCriarContato({ ...dados, nomeExibicao: null });
  const canalConfigId = config?.id ?? null;

  const emAberto = await prisma.conversation.findFirst({
    where: { contatoId: contato.id, canal: dados.canal, canalConfigId, status: { not: 'FINALIZADO' } },
    orderBy: { ultimaMensagemEm: 'desc' },
  });

  const nova = !emAberto;
  let conversa = emAberto;
  if (!conversa) {
    const destino = await destinoParaConfig(dados.canal, config);
    conversa = await prisma.conversation.create({
      data: {
        canal: dados.canal,
        status: destino.agenteId ? 'EM_ATENDIMENTO' : 'EM_ESPERA',
        contatoId: contato.id,
        filaId: destino.filaId,
        agenteId: destino.agenteId,
        atribuidoEm: destino.agenteId ? new Date() : null,
        atendenteInicialId: destino.agenteId,
        canalConfigId: destino.canalConfigId,
        enderecoExterno: dados.enderecoExterno,
        origem: 'ATIVO',
        protocolo: await reservarProtocolo(),
      },
    });
  }

  const anexo = await baixarAnexo(dados.canal, dados);
  if (anexo.motivo) {
    console.warn(`[anexo] ${dados.canal} ${dados.idExterno}: ${redigirTexto(anexo.motivo)}`);
  }

  const mensagem = await criarMensagemOuDetectarCorrida(conversa.id, dados, anexo, {
    autor: 'AGENTE',
    enviadaPorDispositivo: true,
  });
  if (mensagem === null) return { duplicada: true as const };

  const atualizada = await prisma.conversation.update({
    where: { id: conversa.id },
    data: {
      ultimaMensagemEm: mensagem.criadoEm,
      arquivada: false,
      ...(conversa.status === 'ATRIBUIDO' ? { status: 'EM_ATENDIMENTO' as const } : {}),
    },
    include: inclusaoDetalhe,
  });

  const detalhe = toConversaDetalhe(atualizada);
  const destinos = { conversaId: conversa.id, filaId: atualizada.filaId, agenteId: atualizada.agenteId };
  notificarMensagem({ conversaId: conversa.id, mensagem: toMensagem(mensagem) }, destinos);
  if (nova) notificarConversaNova(detalhe, destinos);
  else notificarConversaAtualizada(detalhe, destinos);

  return { duplicada: false as const, conversaId: conversa.id, mensagemId: mensagem.id };
}
```

- [ ] **Step 5: Rodar o teste novo**

```bash
npx vitest run apps/api/src/modules/channels/inbound.service.propria.test.ts
```

Expected: PASS (4 testes).

- [ ] **Step 6: Rota da ponte aceita `propria`**

Em `ponte.routes.ts`:

1. No `mensagemSchema`, acrescentar:

```ts
  /** true = digitada no celular/WhatsApp Web do numero (fromMe), espelhada para auditoria. */
  propria: z.boolean().optional(),
```

2. Trocar o import de `registrarMensagemEntrante` por:

```ts
import { registrarMensagemEntrante, registrarMensagemPropria } from './inbound.service';
```

3. Trocar `const conteudo = corpo.texto?.trim() || (corpo.anexoUrl ? '[arquivo recebido]' : '');` por:

```ts
      const conteudo =
        corpo.texto?.trim() || (corpo.anexoUrl ? (corpo.propria ? '[arquivo enviado]' : '[arquivo recebido]') : '');
```

4. Trocar `const resultado = await registrarMensagemEntrante({` por:

```ts
      const registrar = corpo.propria ? registrarMensagemPropria : registrarMensagemEntrante;
      const resultado = await registrar({
```

5. Trocar a última resposta por:

```ts
      res.json({ ok: true, duplicada: 'duplicada' in resultado ? resultado.duplicada : false });
```

(continua valendo; `ignorada` não tem `duplicada` e responde `false`, o que diz à ponte que não precisa reentregar).

- [ ] **Step 7: Suíte e typecheck**

```bash
npm test && npm run typecheck -w @plataforma/api
```

Expected: verde.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/channels
git commit -m "feat(atendimento): espelha mensagens enviadas pelo celular como outro dispositivo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 7: Destinos de transferência e SUPORTE no Atendimento

**Files:**
- Modify: `apps/api/src/modules/conversations/conversations.service.ts`
- Modify: `apps/api/src/modules/conversations/conversations.routes.ts`
- Modify: `apps/web/src/components/layout/nav.ts`
- Test: `apps/api/src/modules/conversations/conversations.service.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/conversas/destinos-transferencia` → `{ usuarios: Array<{ id; nome; perfil; status }>, filas: Array<{ id; nome }> }`
  - `PERFIS_QUE_ATENDEM: Role[] = ['SUPERVISOR', 'GESTOR', 'COMERCIAL', 'SUPORTE', 'AGENTE']`

- [ ] **Step 1: Teste falhando**

No `vi.hoisted` do mock de `conversations.service.test.ts`, acrescentar `userFindMany: vi.fn()` e `queueFindMany: vi.fn()`. No mock do Prisma, acrescentar `user: { findMany: userFindMany }` e `queue: { findMany: queueFindMany }` (se `user`/`queue` já existirem, só incluir a chave). Importar `listarDestinosTransferencia`.

```ts
describe('listarDestinosTransferencia', () => {
  it('lista usuarios ativos de todos os perfis que atendem (nao so AGENTE) e as filas ativas', async () => {
    userFindMany.mockResolvedValue([{ id: 'u-2', nome: 'Viviane', perfil: 'SUPORTE', status: 'DISPONIVEL' }]);
    queueFindMany.mockResolvedValue([{ id: 'f-1', nome: 'Suporte' }]);

    const r = await comOrganizacao('org-1', () => listarDestinosTransferencia(), { id: 'user-1', perfil: 'COMERCIAL' });

    expect(userFindMany.mock.calls[0]?.[0]?.where).toEqual({
      ativo: true,
      perfil: { in: ['SUPERVISOR', 'GESTOR', 'COMERCIAL', 'SUPORTE', 'AGENTE'] },
    });
    expect(queueFindMany.mock.calls[0]?.[0]?.where).toEqual({ ativa: true });
    expect(r).toEqual({
      usuarios: [{ id: 'u-2', nome: 'Viviane', perfil: 'SUPORTE', status: 'DISPONIVEL' }],
      filas: [{ id: 'f-1', nome: 'Suporte' }],
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run apps/api/src/modules/conversations/conversations.service.test.ts -t listarDestinosTransferencia
```

Expected: FAIL.

- [ ] **Step 3: Implementação**

Em `conversations.service.ts`:

```ts
/** Perfis que recebem atendimento por transferencia. ADMIN fica de fora (regra de `transferirConversa`). */
export const PERFIS_QUE_ATENDEM: Role[] = ['SUPERVISOR', 'GESTOR', 'COMERCIAL', 'SUPORTE', 'AGENTE'];

/**
 * Para onde qualquer atendente pode transferir: pessoas e equipes (filas).
 *
 * Antes a tela pedia `/usuarios?perfil=AGENTE`, rota so de ADMIN/SUPERVISOR e
 * perfil que a operacao nao usa — em producao a lista vinha vazia.
 */
export async function listarDestinosTransferencia() {
  const [usuarios, filas] = await Promise.all([
    prisma.user.findMany({
      where: { ativo: true, perfil: { in: PERFIS_QUE_ATENDEM } },
      select: { id: true, nome: true, perfil: true, status: true },
      orderBy: { nome: 'asc' },
    }),
    prisma.queue.findMany({ where: { ativa: true }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
  ]);
  return { usuarios, filas };
}
```

Em `conversations.routes.ts`, importar `listarDestinosTransferencia` e registrar **antes** de `conversationsRoutes.get('/:id', ...)`:

```ts
/** Pessoas e equipes para o modal "Transferir conversa" — antes de `/:id`. */
conversationsRoutes.get(
  '/destinos-transferencia',
  asyncHandler(async (_req, res) => {
    res.json(await listarDestinosTransferencia());
  }),
);
```

- [ ] **Step 4: SUPORTE entra no Atendimento**

Em `apps/web/src/components/layout/nav.ts`, no item `/atendimento`, trocar `perfis: ['ADMIN', 'SUPERVISOR', 'AGENTE', 'COMERCIAL']` por:

```ts
perfis: ['ADMIN', 'SUPERVISOR', 'AGENTE', 'COMERCIAL', 'SUPORTE']
```

- [ ] **Step 5: Testes e typecheck**

```bash
npm test && npm run typecheck
```

Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/conversations apps/web/src/components/layout/nav.ts
git commit -m "feat(atendimento): destinos de transferencia para todos os perfis e SUPORTE no atendimento

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 8: Caixa de entrada por equipe (API) e aba "Atribuídas"

**Files:**
- Modify: `apps/api/src/modules/conversations/conversations.visao.ts` (+ `.test.ts`)
- Modify: `apps/api/src/modules/conversations/conversations.schemas.ts`
- Modify: `apps/api/src/modules/conversations/conversations.service.ts` (`contarPorVisao`, nova `listarCaixaEntrada`)
- Modify: `apps/api/src/modules/conversations/conversations.routes.ts`
- Test: `apps/api/src/modules/conversations/conversations.service.test.ts`

**Interfaces:**
- Produces:
  - `VisaoInbox = 'MINHAS' | 'ATRIBUIDAS' | 'ACOMPANHAR'` (API). `ATRIBUIDAS` = atribuídas a mim, de números que não são meus.
  - `GET /api/conversas/contadores` → `{ contadores: { MINHAS, ATRIBUIDAS, ACOMPANHAR }, minhasFilaIds }`
  - `GET /api/conversas/caixa-entrada` → `{ grupos: Array<{ fila: { id; nome } | null; conversas: ConversaResumo[] }> }`
    - grupos = filas do usuário (ativas, ordem alfabética);
    - grupo `fila: null` ("Sem equipe") só para ADMIN/SUPERVISOR, sempre primeiro;
    - conversas `EM_ESPERA`, sem agente, não arquivadas, a mais antiga primeiro.

- [ ] **Step 1: Atualizar o teste da visão (falhando)**

Em `conversations.visao.test.ts`, substituir o caso de `'FILA'` por:

```ts
  it('ATRIBUIDAS: so o que esta comigo e nao e de numero meu (a espera foi para a Caixa de entrada)', () => {
    expect(filtroDaVisao({ visao: 'ATRIBUIDAS' }, EU)).toEqual({
      AND: [
        { OR: [{ canalConfigId: null }, { canalConfig: { donoId: null } }, { canalConfig: { donoId: { not: EU.usuarioId } } }] },
        { agenteId: EU.usuarioId },
      ],
    });
  });
```

Em `conversations.service.test.ts`, no teste que usa `visao: 'FILA'` (por volta da linha 542), trocar para `visao: 'ATRIBUIDAS'`.

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run apps/api/src/modules/conversations/conversations.visao.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implementar a visão**

Em `conversations.visao.ts`:

```ts
/** Abas do Atendimento. A espera das filas saiu das abas para a Caixa de entrada (09/10/2026). */
export type VisaoInbox = 'MINHAS' | 'ATRIBUIDAS' | 'ACOMPANHAR';
```

e trocar o `case 'FILA':` por:

```ts
    case 'ATRIBUIDAS':
      return { AND: [foraDosMeusNumeros(eu.usuarioId), { agenteId: eu.usuarioId }] };
```

Em `conversations.schemas.ts`: `visao: z.enum(['MINHAS', 'ATRIBUIDAS', 'ACOMPANHAR']).optional(),`.

Em `contarPorVisao` (`conversations.service.ts`), trocar a desestruturação e o retorno:

```ts
  const [MINHAS, ATRIBUIDAS, ACOMPANHAR] = await Promise.all([
    contar(filtroDaVisao({ visao: 'MINHAS' }, ctx)),
    contar(filtroDaVisao({ visao: 'ATRIBUIDAS' }, ctx)),
    podeAcompanhar(ctx.perfil) ? contar(filtroDaVisao({ visao: 'ACOMPANHAR' }, ctx)) : Promise.resolve(null),
  ]);
  return { contadores: { MINHAS, ATRIBUIDAS, ACOMPANHAR }, minhasFilaIds: ctx.filaIds };
```

- [ ] **Step 4: Teste da caixa de entrada (falhando)**

No mock de `conversations.service.test.ts`, garantir `queueFindMany` (Task 7) e importar `listarCaixaEntrada`.

```ts
describe('listarCaixaEntrada', () => {
  beforeEach(() => vi.clearAllMocks());

  it('agrupa a espera pelas filas do usuario; ADMIN ganha o grupo sem equipe primeiro', async () => {
    queueAgentFindMany.mockResolvedValue([{ filaId: 'f-com' }]);
    queueFindMany.mockResolvedValue([{ id: 'f-com', nome: 'Comercial' }]);
    conversationFindMany.mockResolvedValue([
      { id: 'c-1', filaId: 'f-com' },
      { id: 'c-2', filaId: null },
    ]);

    const r = await comOrganizacao('org-1', () => listarCaixaEntrada(), { id: 'user-1', perfil: 'ADMIN' });

    expect(r.grupos.map((g) => g.fila?.nome ?? null)).toEqual([null, 'Comercial']);
    expect(r.grupos[0]?.conversas.map((c) => c.id)).toEqual(['c-2']);
    expect(r.grupos[1]?.conversas.map((c) => c.id)).toEqual(['c-1']);
    const where = conversationFindMany.mock.calls[0]?.[0]?.where;
    expect(JSON.stringify(where)).toContain('"status":"EM_ESPERA"');
    expect(conversationFindMany.mock.calls[0]?.[0]?.orderBy).toEqual([{ ultimaMensagemEm: 'asc' }, { id: 'asc' }]);
  });

  it('COMERCIAL nao ganha o grupo sem equipe', async () => {
    queueAgentFindMany.mockResolvedValue([{ filaId: 'f-com' }]);
    queueFindMany.mockResolvedValue([{ id: 'f-com', nome: 'Comercial' }]);
    conversationFindMany.mockResolvedValue([]);

    const r = await comOrganizacao('org-1', () => listarCaixaEntrada(), { id: 'user-1', perfil: 'COMERCIAL' });

    expect(r.grupos.map((g) => g.fila?.nome ?? null)).toEqual(['Comercial']);
  });
});
```

- [ ] **Step 5: Implementar `listarCaixaEntrada`**

Em `conversations.service.ts`:

```ts
/**
 * Coluna "Caixa de entrada" (PCM 00:22): a espera das filas em que eu atuo,
 * agrupada por equipe, a mais antiga primeiro. Quem pega primeiro leva
 * (`assumirConversa`). ADMIN e SUPERVISOR veem tambem a espera sem equipe —
 * a conversa que, sem eles, ninguem enxergaria.
 */
export async function listarCaixaEntrada() {
  const ctx = await contextoVisibilidade();
  const verSemEquipe = podeAcompanhar(ctx.perfil);

  const [filas, conversas] = await Promise.all([
    prisma.queue.findMany({
      where: { id: { in: ctx.filaIds }, ativa: true },
      select: { id: true, nome: true },
      orderBy: { nome: 'asc' },
    }),
    prisma.conversation.findMany({
      where: {
        AND: [
          await escopoVisivel(),
          { arquivada: false, status: 'EM_ESPERA', agenteId: null },
          { OR: [{ filaId: { in: ctx.filaIds } }, ...(verSemEquipe ? [{ filaId: null }] : [])] },
        ],
      },
      include: inclusaoResumo,
      orderBy: [{ ultimaMensagemEm: 'asc' }, { id: 'asc' }],
      take: 200,
    }),
  ]);

  type Grupo = { fila: { id: string; nome: string } | null; conversas: ReturnType<typeof toConversaResumo>[] };
  const doGrupo = (filaId: string | null) => conversas.filter((c) => c.filaId === filaId).map(toConversaResumo);

  const grupos: Grupo[] = [
    ...(verSemEquipe ? [{ fila: null, conversas: doGrupo(null) }] : []),
    ...filas.map((fila) => ({ fila, conversas: doGrupo(fila.id) })),
  ];
  return { grupos };
}
```

Em `conversations.routes.ts`, importar `listarCaixaEntrada` e registrar **antes** de `/:id`:

```ts
/** Coluna Caixa de entrada — antes de `/:id`. */
conversationsRoutes.get(
  '/caixa-entrada',
  asyncHandler(async (_req, res) => {
    res.json(await listarCaixaEntrada());
  }),
);
```

- [ ] **Step 6: Rodar testes e typecheck da API**

```bash
npx vitest run apps/api/src/modules/conversations && npm run typecheck -w @plataforma/api
```

Expected: verde.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/conversations
git commit -m "feat(atendimento): caixa de entrada por equipe e aba Atribuidas na API

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

> O front ainda usa `visao=FILA` até a Task 13; o typecheck do web fica verde porque os tipos do web são separados, mas a aba "Fila" responde 400 no intervalo. As Tasks 8 e 13 devem ir juntas para produção (a branch inteira vai junta de qualquer forma).

---

## Task 9: Histórico de atendimentos anteriores (API)

**Files:**
- Modify: `apps/api/src/modules/conversations/conversations.service.ts`
- Modify: `apps/api/src/modules/conversations/conversations.schemas.ts`
- Modify: `apps/api/src/modules/conversations/conversations.routes.ts`
- Test: `apps/api/src/modules/conversations/conversations.service.test.ts`

**Interfaces:**
- Produces: `GET /api/conversas/:id/anteriores?cursor=` → `{ atendimento: { id; protocolo; criadoEm; finalizadoEm; mensagens: Mensagem[] } | null, proximoCursor: string | null }`.
  - Um atendimento por chamada, do mais recente para o mais antigo.
  - Só do mesmo contato, mesmo canal e **mesma linha**.
  - Sempre dentro do escopo do solicitante.

- [ ] **Step 1: Teste falhando**

1. Importar `listarAtendimentosAnteriores`.
2. No `vi.mock('./conversations.serializer', ...)` do arquivo de teste, acrescentar `autorDaMensagem: {},`. O Vitest lança erro ao acessar um export que a factory do mock não define, e o service passa a importar `autorDaMensagem`.

```ts
describe('listarAtendimentosAnteriores', () => {
  beforeEach(() => vi.clearAllMocks());

  it('busca so na mesma linha e contato, antes da conversa atual, dentro do escopo', async () => {
    const criadoEm = new Date('2026-10-08T18:00:00Z');
    conversationFindFirst
      .mockResolvedValueOnce({ id: 'c-atual', contatoId: 'k-1', canal: 'WHATSAPP', canalConfigId: 'cfg-1', criadoEm })
      .mockResolvedValueOnce({
        id: 'c-velha',
        protocolo: '261006-00004',
        criadoEm: new Date('2026-10-06T13:00:00Z'),
        finalizadoEm: new Date('2026-10-06T13:30:00Z'),
        mensagens: [{ id: 'm-1' }],
      });

    const r = await comOrganizacao('org-1', () => listarAtendimentosAnteriores(SOLICITANTE, 'c-atual', {}), { id: 'user-1', perfil: 'ADMIN' });

    const where = conversationFindFirst.mock.calls[1]?.[0]?.where;
    expect(JSON.stringify(where)).toContain('"canalConfigId":"cfg-1"');
    expect(JSON.stringify(where)).toContain('"contatoId":"k-1"');
    expect(r.atendimento?.protocolo).toBe('261006-00004');
    expect(r.proximoCursor).toEqual(expect.any(String));
  });

  it('sem atendimento anterior devolve nulo e cursor nulo', async () => {
    conversationFindFirst
      .mockResolvedValueOnce({ id: 'c-atual', contatoId: 'k-1', canal: 'WHATSAPP', canalConfigId: 'cfg-1', criadoEm: new Date() })
      .mockResolvedValueOnce(null);

    const r = await comOrganizacao('org-1', () => listarAtendimentosAnteriores(SOLICITANTE, 'c-atual', {}), { id: 'user-1', perfil: 'ADMIN' });

    expect(r).toEqual({ atendimento: null, proximoCursor: null });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run apps/api/src/modules/conversations/conversations.service.test.ts -t listarAtendimentosAnteriores
```

Expected: FAIL.

- [ ] **Step 3: Implementação**

Em `conversations.service.ts`:
- trocar o import de paginação por `import { apos, codificarCursor, decodificarCursor, fatiar } from '../../lib/paginacao';` (confirme que `codificarCursor` é exportado ali; o serializer já o importa);
- importar `autorDaMensagem` do serializer.

```ts
/**
 * Atendimento anterior do mesmo contato NA MESMA LINHA (PCM 28:00): o painel
 * cola no topo, com o separador "dd/mm/aa - Conversa anterior - <protocolo>".
 * Um por chamada, do mais recente para o mais antigo. Outra linha nunca entra:
 * duas linhas falando com o mesmo cliente sao duas conversas (achado critico
 * #1 de 23/09/2026).
 */
export async function listarAtendimentosAnteriores(
  solicitante: Solicitante,
  id: string,
  query: { cursor?: string },
) {
  const atual = await carregarOuFalhar(id);
  const cursor = decodificarCursor(query.cursor);

  const anterior = await prisma.conversation.findFirst({
    where: {
      AND: [
        await escopoVisivel(),
        {
          contatoId: atual.contatoId,
          canal: atual.canal,
          canalConfigId: atual.canalConfigId,
          id: { not: atual.id },
          criadoEm: { lt: atual.criadoEm },
        },
        apos('criadoEm', cursor) ?? {},
      ],
    },
    orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
    include: { mensagens: { orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }], take: 300, include: autorDaMensagem } },
  });

  if (!anterior) return { atendimento: null, proximoCursor: null };

  return {
    atendimento: {
      id: anterior.id,
      protocolo: anterior.protocolo,
      criadoEm: anterior.criadoEm,
      finalizadoEm: anterior.finalizadoEm,
      mensagens: anterior.mensagens.map(toMensagem),
    },
    proximoCursor: codificarCursor({ valor: anterior.criadoEm, id: anterior.id }),
  };
}
```

Em `conversations.schemas.ts`:

```ts
export const anterioresSchema = z.object({ cursor: z.string().optional() });
```

Em `conversations.routes.ts`, importar `anterioresSchema` e `listarAtendimentosAnteriores` e registrar (pode ficar depois de `/:id/mensagens`):

```ts
conversationsRoutes.get(
  '/:id/anteriores',
  validateQuery(anterioresSchema),
  asyncHandler(async (req, res) => {
    res.json(await listarAtendimentosAnteriores(quem(req), param(req, 'id'), res.locals.query));
  }),
);
```

- [ ] **Step 4: Rodar e typecheck**

```bash
npx vitest run apps/api/src/modules/conversations && npm run typecheck -w @plataforma/api
```

Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/conversations
git commit -m "feat(atendimento): historico de atendimentos anteriores da mesma linha

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 10: Auditoria (API)

**Files:**
- Create: `apps/api/src/modules/conversations/conversations.auditoria.ts`
- Test: `apps/api/src/modules/conversations/conversations.auditoria.test.ts`
- Modify: `apps/api/src/modules/conversations/conversations.routes.ts`

**Interfaces:**
- Produces:
  - `auditoriaSchema` (Zod) e `type AuditoriaQuery`
  - `filtrosDaAuditoria(q: AuditoriaQuery): Prisma.ConversationWhereInput[]` (pura)
  - `situacaoDaConversa(status: ConversationStatus): 'AGUARDANDO_FILA' | 'EM_ATENDIMENTO' | 'FINALIZADA'` (pura)
  - `GET /api/conversas/auditoria` (ADMIN, SUPERVISOR, GESTOR) → `{ total, pagina, tamanho, itens: LinhaAuditoria[] }`
  - `LinhaAuditoria = { id; contato: { id; nome; telefone }; protocolo; linha: { id; nome } | null; equipe: { id; nome } | null; criadoEm; finalizadoEm; atendenteInicial: { id; nome } | null; origem; situacao }`
  - `GET /api/conversas/auditoria/opcoes` (mesmos perfis) → `{ usuarios: { id; nome }[]; filas: { id; nome }[]; linhas: { id; nome }[] }`

- [ ] **Step 1: Teste falhando**

```ts
// apps/api/src/modules/conversations/conversations.auditoria.test.ts
import { describe, expect, it } from 'vitest';
import { auditoriaSchema, filtrosDaAuditoria, situacaoDaConversa } from './conversations.auditoria';

describe('situacaoDaConversa', () => {
  it('traduz o status interno para o rotulo da auditoria', () => {
    expect(situacaoDaConversa('EM_ESPERA')).toBe('AGUARDANDO_FILA');
    expect(situacaoDaConversa('ATRIBUIDO')).toBe('EM_ATENDIMENTO');
    expect(situacaoDaConversa('EM_ATENDIMENTO')).toBe('EM_ATENDIMENTO');
    expect(situacaoDaConversa('FINALIZADO')).toBe('FINALIZADA');
  });
});

describe('auditoriaSchema', () => {
  it('aceita filtro repetido como lista e pagina padrao 1 x 10', () => {
    const q = auditoriaSchema.parse({ agenteId: '11111111-1111-1111-1111-111111111111', situacao: ['EM_ATENDIMENTO'] });
    expect(q.pagina).toBe(1);
    expect(q.tamanho).toBe(10);
    expect(q.agenteId).toEqual(['11111111-1111-1111-1111-111111111111']);
  });

  it('recusa intervalo de inicio invertido', () => {
    expect(() => auditoriaSchema.parse({ inicioDe: '2026-10-09', inicioAte: '2026-10-01' })).toThrow();
  });
});

describe('filtrosDaAuditoria', () => {
  const base = auditoriaSchema.parse({});

  it('sem filtro nao restringe nada', () => {
    expect(filtrosDaAuditoria(base)).toEqual([]);
  });

  it('usuario casa com atendente inicial OU responsavel atual', () => {
    const q = auditoriaSchema.parse({ agenteId: ['11111111-1111-1111-1111-111111111111'] });
    expect(filtrosDaAuditoria(q)).toContainEqual({
      OR: [
        { agenteId: { in: ['11111111-1111-1111-1111-111111111111'] } },
        { atendenteInicialId: { in: ['11111111-1111-1111-1111-111111111111'] } },
      ],
    });
  });

  it('situacao vira status; SEM_EQUIPE vira filaId nulo', () => {
    const q = auditoriaSchema.parse({ situacao: ['EM_ATENDIMENTO', 'FINALIZADA'], filaId: ['SEM_EQUIPE'] });
    const f = filtrosDaAuditoria(q);
    expect(f).toContainEqual({ status: { in: ['ATRIBUIDO', 'EM_ATENDIMENTO', 'FINALIZADO'] } });
    expect(f).toContainEqual({ OR: [{ filaId: null }] });
  });

  it('telefone filtra so pelos digitos', () => {
    const q = auditoriaSchema.parse({ telefone: '(62) 99219-7010' });
    expect(filtrosDaAuditoria(q)).toContainEqual({ contato: { telefone: { contains: '62992197010' } } });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run apps/api/src/modules/conversations/conversations.auditoria.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implementação**

```ts
// apps/api/src/modules/conversations/conversations.auditoria.ts
import type { ConversationStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { filtroDe, politicaConversas } from '../../lib/politicas';

/**
 * Auditoria de conversas (PCM 02:56 e 30:00): uma linha por atendimento
 * (protocolo), paginada no servidor, sempre dentro de `politicaConversas` —
 * o supervisor audita o que ja pode ver, nada alem.
 */

const lista = <T extends z.ZodTypeAny>(item: T) =>
  z
    .union([item, z.array(item)])
    .optional()
    .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]) as z.infer<T>[]);

export const SITUACOES = ['AGUARDANDO_FILA', 'EM_ATENDIMENTO', 'FINALIZADA'] as const;
export type Situacao = (typeof SITUACOES)[number];

const STATUS_DA_SITUACAO: Record<Situacao, ConversationStatus[]> = {
  AGUARDANDO_FILA: ['EM_ESPERA'],
  EM_ATENDIMENTO: ['ATRIBUIDO', 'EM_ATENDIMENTO'],
  FINALIZADA: ['FINALIZADO'],
};

export function situacaoDaConversa(status: ConversationStatus): Situacao {
  if (status === 'EM_ESPERA') return 'AGUARDANDO_FILA';
  if (status === 'FINALIZADO') return 'FINALIZADA';
  return 'EM_ATENDIMENTO';
}

export const auditoriaSchema = z
  .object({
    pagina: z.coerce.number().int().min(1).default(1),
    tamanho: z.coerce.number().int().min(1).max(100).default(10),
    agenteId: lista(z.string().uuid()),
    /** Id de fila, ou SEM_EQUIPE para conversa sem fila. */
    filaId: lista(z.union([z.string().uuid(), z.literal('SEM_EQUIPE')])),
    canalConfigId: lista(z.string().uuid()),
    situacao: lista(z.enum(SITUACOES)),
    origem: z.enum(['ATIVO', 'RECEPTIVO']).optional(),
    contato: z.string().trim().min(1).max(120).optional(),
    telefone: z.string().trim().min(1).max(30).optional(),
    protocolo: z.string().trim().min(1).max(20).optional(),
    inicioDe: z.coerce.date().optional(),
    inicioAte: z.coerce.date().optional(),
    fimDe: z.coerce.date().optional(),
    fimAte: z.coerce.date().optional(),
  })
  .refine((q) => !(q.inicioDe && q.inicioAte) || q.inicioDe <= q.inicioAte, {
    message: 'Data de início: o começo do intervalo é depois do fim',
  })
  .refine((q) => !(q.fimDe && q.fimAte) || q.fimDe <= q.fimAte, {
    message: 'Data de fim: o começo do intervalo é depois do fim',
  });

export type AuditoriaQuery = z.infer<typeof auditoriaSchema>;

export function filtrosDaAuditoria(q: AuditoriaQuery): Prisma.ConversationWhereInput[] {
  const f: Prisma.ConversationWhereInput[] = [];
  if (q.agenteId.length) {
    f.push({ OR: [{ agenteId: { in: q.agenteId } }, { atendenteInicialId: { in: q.agenteId } }] });
  }
  if (q.filaId.length) {
    const ids = q.filaId.filter((v) => v !== 'SEM_EQUIPE');
    f.push({ OR: [...(ids.length ? [{ filaId: { in: ids } }] : []), ...(q.filaId.includes('SEM_EQUIPE') ? [{ filaId: null }] : [])] });
  }
  if (q.canalConfigId.length) f.push({ canalConfigId: { in: q.canalConfigId } });
  if (q.situacao.length) f.push({ status: { in: q.situacao.flatMap((s) => STATUS_DA_SITUACAO[s]) } });
  if (q.origem) f.push({ origem: q.origem });
  if (q.contato) f.push({ contato: { nome: { contains: q.contato, mode: 'insensitive' } } });
  if (q.telefone) {
    const digitos = q.telefone.replace(/\D/g, '');
    if (digitos) f.push({ contato: { telefone: { contains: digitos } } });
  }
  if (q.protocolo) f.push({ protocolo: { contains: q.protocolo } });
  if (q.inicioDe || q.inicioAte) f.push({ criadoEm: { ...(q.inicioDe ? { gte: q.inicioDe } : {}), ...(q.inicioAte ? { lte: q.inicioAte } : {}) } });
  if (q.fimDe || q.fimAte) f.push({ finalizadoEm: { ...(q.fimDe ? { gte: q.fimDe } : {}), ...(q.fimAte ? { lte: q.fimAte } : {}) } });
  return f;
}

const inclusaoAuditoria = {
  contato: { select: { id: true, nome: true, telefone: true } },
  fila: { select: { id: true, nome: true } },
  atendenteInicial: { select: { id: true, nome: true } },
  canalConfig: { select: { id: true, nome: true, ponteSessao: true, phoneNumberId: true } },
} satisfies Prisma.ConversationInclude;

type RegistroAuditoria = Prisma.ConversationGetPayload<{ include: typeof inclusaoAuditoria }>;

function toLinhaAuditoria(c: RegistroAuditoria) {
  return {
    id: c.id,
    contato: c.contato,
    protocolo: c.protocolo,
    linha: c.canalConfig
      ? { id: c.canalConfig.id, nome: c.canalConfig.nome ?? c.canalConfig.phoneNumberId ?? c.canalConfig.ponteSessao ?? 'Número' }
      : null,
    equipe: c.fila,
    criadoEm: c.criadoEm,
    finalizadoEm: c.finalizadoEm,
    atendenteInicial: c.atendenteInicial,
    origem: c.origem,
    situacao: situacaoDaConversa(c.status),
  };
}

export async function listarAuditoria(q: AuditoriaQuery) {
  const where: Prisma.ConversationWhereInput = { AND: [await filtroDe(politicaConversas), ...filtrosDaAuditoria(q)] };
  const [total, registros] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      include: inclusaoAuditoria,
      orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
      skip: (q.pagina - 1) * q.tamanho,
      take: q.tamanho,
    }),
  ]);
  return { total, pagina: q.pagina, tamanho: q.tamanho, itens: registros.map(toLinhaAuditoria) };
}

/** Opcoes da gaveta de filtros. */
export async function opcoesDaAuditoria() {
  const [usuarios, filas, linhas] = await Promise.all([
    prisma.user.findMany({ where: { ativo: true }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
    prisma.queue.findMany({ select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
    prisma.channelConfig.findMany({
      where: { canal: 'WHATSAPP' },
      select: { id: true, nome: true, ponteSessao: true, phoneNumberId: true },
      orderBy: { id: 'asc' },
    }),
  ]);
  return {
    usuarios,
    filas,
    linhas: linhas.map((l) => ({ id: l.id, nome: l.nome ?? l.phoneNumberId ?? l.ponteSessao ?? 'Número' })),
  };
}
```

Em `conversations.routes.ts`:
- importar `requireRole` de `'../../http/middleware/auth'`;
- importar `auditoriaSchema`, `listarAuditoria` e `opcoesDaAuditoria`;
- registrar **antes** de `/:id`:

```ts
/** Auditoria (ADMIN, SUPERVISOR, GESTOR) — antes de `/:id`. O escopo continua sendo politicaConversas. */
conversationsRoutes.get(
  '/auditoria',
  requireRole('ADMIN', 'SUPERVISOR', 'GESTOR'),
  validateQuery(auditoriaSchema),
  asyncHandler(async (_req, res) => {
    res.json(await listarAuditoria(res.locals.query));
  }),
);

conversationsRoutes.get(
  '/auditoria/opcoes',
  requireRole('ADMIN', 'SUPERVISOR', 'GESTOR'),
  asyncHandler(async (_req, res) => {
    res.json(await opcoesDaAuditoria());
  }),
);
```

- [ ] **Step 4: Rodar e typecheck**

```bash
npx vitest run apps/api/src/modules/conversations && npm run typecheck -w @plataforma/api
```

Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/conversations
git commit -m "feat(atendimento): auditoria de conversas com filtros e paginacao

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 11: Monitor por equipe (API)

**Files:**
- Modify: `apps/api/src/modules/metrics/metrics.service.ts`
- Modify: `apps/api/src/modules/metrics/metrics.routes.ts`
- Test: `apps/api/src/modules/metrics/equipes.test.ts` (novo, só a função pura)

**Interfaces:**
- Produces:
  - `montarEquipes(filas, contagens, chatsPorAgente): Equipe[]` (pura)
  - `GET /api/metricas/equipes?filaId=...` (ADMIN, SUPERVISOR, GESTOR) → `{ equipes: Equipe[] }`
  - `Equipe = { id; nome; usuariosOnline: number; aguardando: number; emAtendimento: number; total: number; usuarios: Array<{ id; nome; status; caixaEntrada: number; chats: number }> }`
  - **Definição nossa** (o original é [?] na spec): `caixaEntrada` do usuário = soma das conversas EM_ESPERA nas equipes **selecionadas** de que ele participa.

- [ ] **Step 1: Teste falhando**

```ts
// apps/api/src/modules/metrics/equipes.test.ts
import { describe, expect, it } from 'vitest';
import { montarEquipes } from './metrics.service';

describe('montarEquipes', () => {
  it('soma aguardando + atendimento no total e conta online pelos membros', () => {
    const filas = [
      {
        id: 'f-com',
        nome: 'Comercial',
        agentes: [
          { usuario: { id: 'u-g', nome: 'Guilherme', status: 'EM_ATENDIMENTO' as const, ativo: true } },
          { usuario: { id: 'u-c', nome: 'Comercial', status: 'OFFLINE' as const, ativo: true } },
        ],
      },
    ];
    const contagens = [
      { filaId: 'f-com', status: 'EM_ESPERA' as const, _count: { _all: 1 } },
      { filaId: 'f-com', status: 'ATRIBUIDO' as const, _count: { _all: 2 } },
      { filaId: 'f-com', status: 'EM_ATENDIMENTO' as const, _count: { _all: 1 } },
    ];
    const chats = [{ agenteId: 'u-g', _count: { _all: 14 } }];

    const [equipe] = montarEquipes(filas, contagens, chats);

    expect(equipe).toMatchObject({ nome: 'Comercial', usuariosOnline: 1, aguardando: 1, emAtendimento: 3, total: 4 });
    expect(equipe?.usuarios).toEqual([
      { id: 'u-c', nome: 'Comercial', status: 'OFFLINE', caixaEntrada: 1, chats: 0 },
      { id: 'u-g', nome: 'Guilherme', status: 'EM_ATENDIMENTO', caixaEntrada: 1, chats: 14 },
    ]);
  });

  it('usuario desativado nao entra', () => {
    const filas = [{ id: 'f', nome: 'X', agentes: [{ usuario: { id: 'u', nome: 'U', status: 'DISPONIVEL' as const, ativo: false } }] }];
    expect(montarEquipes(filas, [], [])[0]?.usuarios).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run apps/api/src/modules/metrics/equipes.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implementação**

Acrescentar ao fim de `metrics.service.ts` (importar `AgentStatus` e `ConversationStatus` de `@prisma/client` se ainda não estiverem):

```ts
type FilaComMembros = {
  id: string;
  nome: string;
  agentes: Array<{ usuario: { id: string; nome: string; status: AgentStatus; ativo: boolean } }>;
};
type ContagemFila = { filaId: string | null; status: ConversationStatus; _count: { _all: number } };
type ContagemAgente = { agenteId: string | null; _count: { _all: number } };

/** Monitor de Equipes (PCM 10:18): por fila, quem esta online e quantos tickets aguardam / em atendimento. Pura. */
export function montarEquipes(filas: FilaComMembros[], contagens: ContagemFila[], chatsPorAgente: ContagemAgente[]) {
  const aguardandoDaFila = (id: string) =>
    contagens.filter((c) => c.filaId === id && c.status === 'EM_ESPERA').reduce((s, c) => s + c._count._all, 0);
  const atendimentoDaFila = (id: string) =>
    contagens
      .filter((c) => c.filaId === id && (c.status === 'ATRIBUIDO' || c.status === 'EM_ATENDIMENTO'))
      .reduce((s, c) => s + c._count._all, 0);
  const chats = new Map(chatsPorAgente.map((c) => [c.agenteId, c._count._all]));
  const filasDoUsuario = new Map<string, string[]>();
  for (const f of filas) {
    for (const { usuario } of f.agentes) filasDoUsuario.set(usuario.id, [...(filasDoUsuario.get(usuario.id) ?? []), f.id]);
  }

  return filas.map((f) => {
    const membros = f.agentes.map((a) => a.usuario).filter((u) => u.ativo);
    const aguardando = aguardandoDaFila(f.id);
    const emAtendimento = atendimentoDaFila(f.id);
    return {
      id: f.id,
      nome: f.nome,
      usuariosOnline: membros.filter((u) => u.status !== 'OFFLINE').length,
      aguardando,
      emAtendimento,
      total: aguardando + emAtendimento,
      usuarios: membros
        .map((u) => ({
          id: u.id,
          nome: u.nome,
          status: u.status,
          caixaEntrada: (filasDoUsuario.get(u.id) ?? []).reduce((s, filaId) => s + aguardandoDaFila(filaId), 0),
          chats: chats.get(u.id) ?? 0,
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    };
  });
}

export async function monitorEquipes(filaIds: string[]) {
  const filas = await prisma.queue.findMany({
    where: { ativa: true, ...(filaIds.length ? { id: { in: filaIds } } : {}) },
    select: {
      id: true,
      nome: true,
      agentes: { select: { usuario: { select: { id: true, nome: true, status: true, ativo: true } } } },
    },
    orderBy: { nome: 'asc' },
  });
  const ids = filas.map((f) => f.id);
  const usuarioIds = [...new Set(filas.flatMap((f) => f.agentes.map((a) => a.usuario.id)))];

  const [contagens, chatsPorAgente] = await Promise.all([
    prisma.conversation.groupBy({
      by: ['filaId', 'status'],
      where: { filaId: { in: ids }, status: { not: 'FINALIZADO' }, arquivada: false },
      _count: { _all: true },
    }),
    prisma.conversation.groupBy({
      by: ['agenteId'],
      where: { agenteId: { in: usuarioIds }, status: { in: ['ATRIBUIDO', 'EM_ATENDIMENTO'] }, arquivada: false },
      _count: { _all: true },
    }),
  ]);

  return montarEquipes(filas, contagens, chatsPorAgente);
}
```

Em `metrics.routes.ts`, importar `monitorEquipes` e acrescentar:

```ts
const equipesSchema = z.object({
  filaId: z
    .union([z.string().uuid(), z.array(z.string().uuid())])
    .optional()
    .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v])),
});

/** Monitor de Equipes: por fila, online, aguardando, em atendimento e carga por pessoa. */
metricsRoutes.get(
  '/equipes',
  requireRole('ADMIN', 'SUPERVISOR', 'GESTOR'),
  validateQuery(equipesSchema),
  asyncHandler(async (_req, res) => {
    const { filaId } = res.locals.query as z.infer<typeof equipesSchema>;
    res.json({ equipes: await monitorEquipes(filaId) });
  }),
);
```

- [ ] **Step 4: Rodar e typecheck**

```bash
npx vitest run apps/api/src/modules/metrics && npm run typecheck -w @plataforma/api
```

Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/metrics
git commit -m "feat(monitoramento): contagens de tickets e carga por equipe

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 12: Linhas — espelhamento, desconectadas e linhas de saída

**Files:**
- Modify: `apps/api/src/modules/channels/channels.routes.ts` (`atualizarNumeroSchema`, rota nova)
- Modify: `apps/api/src/modules/channels/channels.service.ts` (`SalvarNumeroInput`, `listarCanais`, nova `listarLinhasDesconectadas`)
- Modify: `apps/api/src/modules/conversations/conversations.service.ts` (`iniciarConversa`, nova `listarLinhasDeSaida`)
- Modify: `apps/api/src/modules/conversations/conversations.schemas.ts` (`iniciarConversaSchema`)
- Modify: `apps/api/src/modules/conversations/conversations.routes.ts`
- Test: `apps/api/src/modules/conversations/conversations.service.test.ts`

**Interfaces:**
- Produces:
  - `PUT /api/canais/numeros/:id` aceita `espelharCelular?: boolean`; `GET /api/canais` devolve `espelharCelular` em cada linha.
  - `GET /api/canais/linhas-desconectadas` (ADMIN, SUPERVISOR) → `{ linhas: Array<{ id; nome; dono: { id; nome } | null; desde: string | null }> }`
  - `GET /api/conversas/linhas-de-saida` → `{ linhas: Array<{ id; nome; modo; minha: boolean }> }` (as linhas pessoais do solicitante + as linhas sem dono, ativas)
  - `POST /api/conversas` aceita `{ contatoId, canalConfigId? }`; `canalConfigId` fora das linhas de saída → 404 "Linha não encontrada".

- [ ] **Step 1: Teste falhando (linhas de saída e iniciar com linha)**

Importar `listarLinhasDeSaida`.

```ts
describe('listarLinhasDeSaida e iniciarConversa com linha escolhida', () => {
  beforeEach(() => vi.clearAllMocks());

  it('linhas de saida = as minhas + as da empresa, ativas, WhatsApp', async () => {
    channelConfigFindMany.mockResolvedValue([
      { id: 'cfg-minha', nome: 'Kaua', modo: 'NAO_OFICIAL', donoId: 'user-1', ponteSessao: 's1', phoneNumberId: null },
      { id: 'cfg-emp', nome: null, modo: 'NAO_OFICIAL', donoId: null, ponteSessao: 's0', phoneNumberId: null },
    ]);

    const r = await comOrganizacao('org-1', () => listarLinhasDeSaida(SOLICITANTE), { id: 'user-1', perfil: 'ADMIN' });

    expect(channelConfigFindMany.mock.calls[0]?.[0]?.where).toEqual({
      canal: 'WHATSAPP',
      ativo: true,
      OR: [{ donoId: 'user-1' }, { donoId: null }],
    });
    expect(r.linhas).toEqual([
      { id: 'cfg-minha', nome: 'Kaua', modo: 'NAO_OFICIAL', minha: true },
      { id: 'cfg-emp', nome: 's0', modo: 'NAO_OFICIAL', minha: false },
    ]);
  });

  it('iniciarConversa com linha de outro vendedor responde 404', async () => {
    contactFindFirst.mockResolvedValue({ id: 'contato-x', telefone: '5562992197010' });
    channelConfigFindFirst.mockResolvedValue(null);

    await expect(
      comOrganizacao('org-1', () => iniciarConversa(SOLICITANTE, 'contato-x', 'cfg-de-outro'), { id: 'user-1', perfil: 'ADMIN' }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run apps/api/src/modules/conversations/conversations.service.test.ts -t "linhas de saida"
```

Expected: FAIL.

- [ ] **Step 3: Implementação em conversations**

1. Em `conversations.schemas.ts`:

```ts
export const iniciarConversaSchema = z.object({
  contatoId: z.string().uuid(),
  /** Linha por onde a conversa sai (modal "Iniciar nova conversa"). Sem ela, a linha do solicitante. */
  canalConfigId: z.string().uuid().optional(),
});
```

2. Em `conversations.service.ts`:

```ts
const ondeSaem = (solicitante: Solicitante) => ({
  canal: 'WHATSAPP' as const,
  ativo: true,
  OR: [{ donoId: solicitante.sub }, { donoId: null }],
});

/**
 * Linhas por onde o solicitante pode iniciar conversa: as dele e as da
 * empresa. A linha pessoal de outra pessoa nunca: seria falar com o cliente
 * pelo numero do colega.
 */
export async function listarLinhasDeSaida(solicitante: Solicitante) {
  const linhas = await prisma.channelConfig.findMany({
    where: ondeSaem(solicitante),
    select: { id: true, nome: true, modo: true, donoId: true, ponteSessao: true, phoneNumberId: true },
    orderBy: [{ donoId: 'asc' }, { id: 'asc' }],
  });
  return {
    linhas: linhas.map((l) => ({
      id: l.id,
      nome: l.nome ?? l.phoneNumberId ?? l.ponteSessao ?? 'Número da empresa',
      modo: l.modo,
      minha: l.donoId === solicitante.sub,
    })),
  };
}
```

3. Mudar a assinatura de `iniciarConversa` para `(solicitante: Solicitante, contatoId: string, canalConfigId?: string)` e trocar `const config = await configWhatsappDoSolicitante(solicitante);` por:

```ts
  const config = canalConfigId
    ? await prisma.channelConfig.findFirst({ where: { id: canalConfigId, ...ondeSaem(solicitante) } })
    : await configWhatsappDoSolicitante(solicitante);
  if (canalConfigId && !config) throw notFound('Linha não encontrada');
```

4. Em `conversations.routes.ts`:
   - no `POST /`, passar `req.body.canalConfigId`:

     ```ts
         res.status(201).json({ conversa: await iniciarConversa(quem(req), req.body.contatoId, req.body.canalConfigId) });
     ```

   - registrar antes de `/:id`:

     ```ts
     conversationsRoutes.get(
       '/linhas-de-saida',
       asyncHandler(async (req, res) => {
         res.json(await listarLinhasDeSaida(quem(req)));
       }),
     );
     ```

- [ ] **Step 4: Implementação em channels**

1. Em `channels.service.ts`:
   - `type SalvarNumeroInput = SalvarCanalInput & { nome?: string | null; donoId?: string | null; espelharCelular?: boolean };`
   - em `listarCanais`, no objeto devolvido, acrescentar `espelharCelular: c.espelharCelular,` logo depois de `ponteStatusEm`;
   - nova função:

```ts
/** Linhas nao oficiais ativas que a ponte avisou como caidas — aviso dentro da plataforma (decisao de 09/10/2026). */
export async function listarLinhasDesconectadas() {
  const linhas = await prisma.channelConfig.findMany({
    where: { canal: 'WHATSAPP', modo: 'NAO_OFICIAL', ativo: true, ponteStatus: 'DESCONECTADO' },
    select: { id: true, nome: true, ponteSessao: true, ponteStatusEm: true, dono: { select: { id: true, nome: true } } },
    orderBy: { ponteStatusEm: 'asc' },
  });
  return {
    linhas: linhas.map((l) => ({ id: l.id, nome: l.nome ?? l.ponteSessao ?? 'Número', dono: l.dono, desde: l.ponteStatusEm })),
  };
}
```

2. Em `channels.routes.ts`:
   - no `atualizarNumeroSchema`, acrescentar `espelharCelular: z.boolean().optional(),`;
   - importar `listarLinhasDesconectadas`;
   - registrar **antes** das rotas com `/:canal`:

```ts
channelsRoutes.get(
  '/linhas-desconectadas',
  requireRole('ADMIN', 'SUPERVISOR'),
  asyncHandler(async (_req, res) => {
    res.json(await listarLinhasDesconectadas());
  }),
);
```

(confirme o nome da variável do router e o import de `requireRole` no arquivo; o padrão é o mesmo das outras rotas `GET /` com `requireRole('ADMIN', 'SUPERVISOR')`).

- [ ] **Step 5: Rodar e typecheck**

```bash
npm test && npm run typecheck -w @plataforma/api
```

Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules
git commit -m "feat(canais): espelhar celular por linha, linhas desconectadas e linhas de saida

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 13: Tipos do front, modal e gaveta reutilizáveis

**Files:**
- Modify: `apps/web/src/lib/types.ts`
- Create: `apps/web/src/components/ui/Modal.tsx`
- Create: `apps/web/src/components/ui/Gaveta.tsx`

**Interfaces:**
- Produces:
  - `Mensagem` ganha `autorNome: string | null; evento: EventoConversa | null; enviadaPorDispositivo: boolean`
  - `type EventoConversa = 'ACEITE' | 'TRANSFERENCIA' | 'ENCERRAMENTO'`
  - `ConversaBase` ganha `protocolo: string | null; origem: 'ATIVO' | 'RECEPTIVO'; atendenteInicial: { id: string; nome: string } | null`, e `linha` ganha `nome: string | null`
  - `Contadores = { MINHAS: number; ATRIBUIDAS: number; ACOMPANHAR: number | null }`
  - `<Modal aberto titulo aoFechar rodape? largura?>` e `<Gaveta aberta titulo aoFechar rodape?>`

- [ ] **Step 1: Tipos**

1. Em `types.ts`, no tipo `Mensagem`, acrescentar depois de `autorId`:

```ts
  /** Nome de quem enviou pela plataforma. Nulo para cliente, bot, sistema e mensagem do celular. */
  autorNome: string | null;
```

   e depois de `interno`:

```ts
  /** Evento que mudou o responsavel (so em autor SISTEMA). */
  evento: EventoConversa | null;
  /** Digitada no celular/WhatsApp Web do numero ("Mensagem enviada por outro dispositivo"). */
  enviadaPorDispositivo: boolean;
```

2. Logo antes de `export type Mensagem`:

```ts
export type EventoConversa = 'ACEITE' | 'TRANSFERENCIA' | 'ENCERRAMENTO';
export type OrigemConversa = 'ATIVO' | 'RECEPTIVO';
```

3. Em `ConversaBase`, depois de `ultimaMensagemEm: string;`:

```ts
  /** Protocolo do atendimento (AAMMDD-NNNNN). Nulo so em conversa anterior a 09/10/2026 sem backfill. */
  protocolo: string | null;
  origem: OrigemConversa;
  atendenteInicial: { id: string; nome: string } | null;
```

4. Trocar a linha `linha:` de `ConversaBase` por:

```ts
  linha: { id: string; donoId: string | null; nome: string | null } | null;
```

5. Trocar `Contadores` por:

```ts
export type Contadores = { MINHAS: number; ATRIBUIDAS: number; ACOMPANHAR: number | null };
```

- [ ] **Step 2: `Modal.tsx`**

```tsx
// apps/web/src/components/ui/Modal.tsx
import { useEffect, useId, type ReactNode } from 'react';

/**
 * Dialogo central reutilizavel (Transferir, Iniciar conversa). Mesmo fundo e
 * mesma regra do ConfirmDialog: Esc e clique fora fecham, nunca confirmam.
 */
export function Modal({
  aberto,
  titulo,
  aoFechar,
  children,
  rodape,
  largura = 'max-w-md',
}: {
  aberto: boolean;
  titulo: string;
  aoFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
  largura?: string;
}) {
  const idTitulo = useId();

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={idTitulo}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      onClick={aoFechar}
    >
      <div
        className={`anim-entrada-diálogo flex max-h-[90vh] w-full ${largura} flex-col rounded-xl border border-slate-200 bg-white shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 id={idTitulo} className="text-sm font-semibold text-slate-800">{titulo}</h2>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded px-2 text-lg leading-none text-slate-400 hover:text-slate-600">
            ×
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {rodape && <footer className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{rodape}</footer>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `Gaveta.tsx`**

```tsx
// apps/web/src/components/ui/Gaveta.tsx
import { useEffect, useId, type ReactNode } from 'react';

/** Painel lateral direito (Filtros da Auditoria). Esc e clique no fundo fecham. */
export function Gaveta({
  aberta,
  titulo,
  aoFechar,
  children,
  rodape,
}: {
  aberta: boolean;
  titulo: string;
  aoFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
}) {
  const idTitulo = useId();

  useEffect(() => {
    if (!aberta) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberta, aoFechar]);

  if (!aberta) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={idTitulo} className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={aoFechar}>
      <aside className="flex h-full w-full max-w-sm flex-col bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 id={idTitulo} className="text-sm font-semibold text-slate-800">{titulo}</h2>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded px-2 text-lg leading-none text-slate-400 hover:text-slate-600">
            ×
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {rodape && <footer className="flex justify-between gap-2 border-t border-slate-100 px-5 py-3">{rodape}</footer>}
      </aside>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck do web**

```bash
npm run typecheck -w @plataforma/web
```

Expected: erros de `Contadores.FILA` / `'FILA'` em `useConversas.ts`, `visao.ts` e `AtendimentoPage.tsx`. `Contadores` e `VisaoInbox` precisam mudar juntos, então a renomeação da aba entra **nesta** task:

1. Executar agora o **Step 1 da Task 16 inteiro** (`visao.ts` + `visao.test.ts`).
2. Em `useConversas.ts`:

```ts
const CONTADORES_ZERADOS: Contadores = { MINHAS: 0, ATRIBUIDAS: 0, ACOMPANHAR: null };
```

3. Em `AtendimentoPage.tsx`, trocar `useState<VisaoInbox>('FILA')` por `useState<VisaoInbox>('MINHAS')`.

Rodar de novo:

```bash
npx vitest run apps/web/src && npm run typecheck -w @plataforma/web
```

Expected: verde. A partir daqui, as Tasks 8 (API) e 13 (web) já estão coerentes entre si.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): tipos do atendimento estilo PCM, modal e gaveta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 14: Lista de chats — origem, prévia "cliente:/enviada:", linha

**Files:**
- Create: `apps/web/src/features/atendimento/previaTexto.ts`
- Test: `apps/web/src/features/atendimento/previaTexto.test.ts`
- Modify: `apps/web/src/features/atendimento/ListaConversas.tsx`

**Interfaces:**
- Produces:
  - `textoDaPrevia(m: Pick<Mensagem, 'autor' | 'conteudo' | 'tipoAnexo' | 'interno'> | null): string`
  - `SetaOrigem` (componente local da lista)

- [ ] **Step 1: Teste falhando**

```ts
// apps/web/src/features/atendimento/previaTexto.test.ts
import { describe, expect, it } from 'vitest';
import { textoDaPrevia } from './previaTexto';

const m = (autor: 'CLIENTE' | 'AGENTE' | 'SISTEMA' | 'BOT', conteudo: string, tipoAnexo: 'TEXTO' | 'IMAGEM' | 'AUDIO' | 'VIDEO' | 'ARQUIVO' = 'TEXTO', interno = false) => ({
  autor,
  conteudo,
  tipoAnexo,
  interno,
});

describe('textoDaPrevia', () => {
  it('sem mensagem', () => expect(textoDaPrevia(null)).toBe('Sem mensagens'));
  it('cliente', () => expect(textoDaPrevia(m('CLIENTE', 'Oi'))).toBe('cliente: Oi'));
  it('agente e bot contam como enviada', () => {
    expect(textoDaPrevia(m('AGENTE', 'boa tarde'))).toBe('enviada: boa tarde');
    expect(textoDaPrevia(m('BOT', 'Menu'))).toBe('enviada: Menu');
  });
  it('imagem sem legenda vira foto', () => expect(textoDaPrevia(m('CLIENTE', '[imagem recebida]', 'IMAGEM'))).toBe('cliente: 📷 Foto'));
  it('imagem com legenda mostra a legenda', () => expect(textoDaPrevia(m('CLIENTE', 'olha isso', 'IMAGEM'))).toBe('cliente: 📷 olha isso'));
  it('audio, video e arquivo', () => {
    expect(textoDaPrevia(m('CLIENTE', '[audio recebido]', 'AUDIO'))).toBe('cliente: 🎤 Áudio');
    expect(textoDaPrevia(m('AGENTE', '[video recebido]', 'VIDEO'))).toBe('enviada: 🎥 Vídeo');
    expect(textoDaPrevia(m('AGENTE', 'proposta.pdf', 'ARQUIVO'))).toBe('enviada: 📄 proposta.pdf');
  });
  it('evento do sistema sem prefixo', () => expect(textoDaPrevia(m('SISTEMA', 'Aceito por: Ana'))).toBe('Aceito por: Ana'));
  it('nota interna marcada', () => expect(textoDaPrevia(m('AGENTE', 'ligar amanha', 'TEXTO', true))).toBe('nota: ligar amanha'));
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run apps/web/src/features/atendimento/previaTexto.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implementação**

```ts
// apps/web/src/features/atendimento/previaTexto.ts
import type { Mensagem } from '../../lib/types';

const ICONE: Record<Mensagem['tipoAnexo'], string> = { TEXTO: '', IMAGEM: '📷', AUDIO: '🎤', VIDEO: '🎥', ARQUIVO: '📄' };
const SEM_LEGENDA: Record<Mensagem['tipoAnexo'], string> = { TEXTO: '', IMAGEM: 'Foto', AUDIO: 'Áudio', VIDEO: 'Vídeo', ARQUIVO: 'Arquivo' };

/** Texto que a ponte grava quando a midia chega sem legenda — nao e legenda de verdade. */
const RESUMO_DE_MIDIA = /^\[(imagem|audio|video|arquivo) (recebid[oa]|enviad[oa])\]$/i;

/** Linha de previa do card (PCM: "cliente: Oi", "enviada: template", "cliente: 📷 Foto"). */
export function textoDaPrevia(m: Pick<Mensagem, 'autor' | 'conteudo' | 'tipoAnexo' | 'interno'> | null): string {
  if (!m) return 'Sem mensagens';
  if (m.autor === 'SISTEMA') return m.conteudo;

  const corpo =
    m.tipoAnexo === 'TEXTO'
      ? m.conteudo
      : `${ICONE[m.tipoAnexo]} ${RESUMO_DE_MIDIA.test(m.conteudo.trim()) ? SEM_LEGENDA[m.tipoAnexo] : m.conteudo}`;

  if (m.interno) return `nota: ${corpo}`;
  return `${m.autor === 'CLIENTE' ? 'cliente' : 'enviada'}: ${corpo}`;
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npx vitest run apps/web/src/features/atendimento/previaTexto.test.ts
```

Expected: PASS.

- [ ] **Step 5: Usar na lista**

Em `ListaConversas.tsx`:

1. Importar `import { textoDaPrevia } from './previaTexto';` e apagar a função local `previa`.
2. Acrescentar, depois de `horaCurta`:

```tsx
/** Seta de origem (PCM): ↗ a empresa iniciou, ↙ o cliente iniciou. */
function SetaOrigem({ origem }: { origem: ConversaResumo['origem'] }) {
  const ativa = origem === 'ATIVO';
  return (
    <span
      className="shrink-0 text-xs text-slate-400"
      title={ativa ? 'Iniciada pela empresa' : 'Iniciada pelo cliente'}
      aria-label={ativa ? 'Iniciada pela empresa' : 'Iniciada pelo cliente'}
    >
      {ativa ? '↗' : '↙'}
    </span>
  );
}
```

3. No card da conversa:
   - trocar `<p className="mt-0.5 truncate text-xs text-slate-500">{previa(c)}</p>` por:

```tsx
                <p className="mt-0.5 truncate text-xs text-slate-500">{textoDaPrevia(c.ultimaMensagem)}</p>
```

   - trocar a linha do nome/hora por:

```tsx
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-slate-800">{c.contato.nome}</span>
                  <span className="flex shrink-0 items-baseline gap-1.5">
                    <SetaOrigem origem={c.origem} />
                    <span className="text-xs text-slate-500">{horaCurta(c.ultimaMensagemEm)}</span>
                  </span>
                </div>
```

   - na linha de badges, trocar `<Badge tom="neutro">{c.canal}</Badge>` por:

```tsx
                  <Badge tom="neutro">{c.linha?.nome ?? c.canal}</Badge>
```

   - trocar `{c.fila && <Badge tom="neutro">{c.fila.nome}</Badge>}` por:

```tsx
                  {c.fila && (
                    <span title={`Equipe: ${c.fila.nome}`}>
                      <Badge tom="neutro">{c.fila.nome}</Badge>
                    </span>
                  )}
```

- [ ] **Step 6: Testes e typecheck do web**

```bash
npx vitest run apps/web/src && npm run typecheck -w @plataforma/web
```

Expected: verde. Se `ListaConversas.test.ts` testava o prefixo "Você:", atualizar para "enviada:" (mudança deliberada).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/atendimento
git commit -m "feat(atendimento): origem e previa cliente/enviada nos cards de chat

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 15: Painel da conversa — rótulos, eventos, links, protocolo, menu, somente leitura e histórico anterior

**Files:**
- Create: `apps/web/src/features/atendimento/links.ts`
- Test: `apps/web/src/features/atendimento/links.test.ts`
- Create: `apps/web/src/features/atendimento/useAtendimentosAnteriores.ts`
- Modify: `apps/web/src/features/atendimento/PainelChat.tsx`

**Interfaces:**
- Consumes: `GET /conversas/:id/anteriores` (Task 9); tipos da Task 13.
- Produces:
  - `partesComLinks(texto: string): Array<{ texto: string; href?: string }>`
  - `PainelChat` props:
    - removido: `agentes`;
    - novos: `aoTransferir?: () => void` e `somenteLeitura?: boolean`.
- `useAtendimentosAnteriores(conversaId: string)` →
  - `{ blocos: BlocoAnterior[]; carregando: boolean; fim: boolean; carregarMais(): Promise<void> }`
  - `BlocoAnterior = { id; protocolo: string | null; criadoEm: string; mensagens: Mensagem[] }`

- [ ] **Step 1: Teste de links falhando**

```ts
// apps/web/src/features/atendimento/links.test.ts
import { describe, expect, it } from 'vitest';
import { partesComLinks } from './links';

describe('partesComLinks', () => {
  it('texto sem link fica inteiro', () => {
    expect(partesComLinks('bom dia')).toEqual([{ texto: 'bom dia' }]);
  });

  it('separa o link do texto em volta', () => {
    expect(partesComLinks('clique: https://wa.me/556239203399 obrigado')).toEqual([
      { texto: 'clique: ' },
      { texto: 'https://wa.me/556239203399', href: 'https://wa.me/556239203399' },
      { texto: ' obrigado' },
    ]);
  });

  it('nao engole a pontuacao final', () => {
    expect(partesComLinks('veja https://bradel.com.br.')).toEqual([
      { texto: 'veja ' },
      { texto: 'https://bradel.com.br', href: 'https://bradel.com.br' },
      { texto: '.' },
    ]);
  });

  it('ignora esquema que nao e http(s)', () => {
    expect(partesComLinks('javascript:alert(1)')).toEqual([{ texto: 'javascript:alert(1)' }]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run apps/web/src/features/atendimento/links.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implementação de `links.ts`**

```ts
// apps/web/src/features/atendimento/links.ts
/** So http(s): link de outro esquema (javascript:, data:) vira texto comum. */
const URL = /https?:\/\/[^\s<]+/g;
const PONTUACAO_FINAL = /[.,;:!?)\]]+$/;

export function partesComLinks(texto: string): Array<{ texto: string; href?: string }> {
  const partes: Array<{ texto: string; href?: string }> = [];
  let ultimo = 0;
  for (const achado of texto.matchAll(URL)) {
    const inicio = achado.index ?? 0;
    let url = achado[0];
    const sobra = url.match(PONTUACAO_FINAL)?.[0] ?? '';
    if (sobra) url = url.slice(0, -sobra.length);
    if (inicio > ultimo) partes.push({ texto: texto.slice(ultimo, inicio) });
    partes.push({ texto: url, href: url });
    ultimo = inicio + url.length;
  }
  if (ultimo < texto.length) partes.push({ texto: texto.slice(ultimo) });
  return partes.length ? partes : [{ texto }];
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npx vitest run apps/web/src/features/atendimento/links.test.ts
```

Expected: PASS.

- [ ] **Step 5: Hook do histórico anterior**

```ts
// apps/web/src/features/atendimento/useAtendimentosAnteriores.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import type { Mensagem } from '../../lib/types';

export type BlocoAnterior = { id: string; protocolo: string | null; criadoEm: string; mensagens: Mensagem[] };

type Resposta = {
  atendimento: { id: string; protocolo: string | null; criadoEm: string; mensagens: Mensagem[] } | null;
  proximoCursor: string | null;
};

/**
 * Atendimentos anteriores do mesmo contato na mesma linha, um por vez, do mais
 * recente para o mais antigo (PCM 28:00). Zera ao trocar de conversa.
 */
export function useAtendimentosAnteriores(conversaId: string) {
  const [blocos, setBlocos] = useState<BlocoAnterior[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [fim, setFim] = useState(false);
  const cursor = useRef<string | null>(null);
  const emVoo = useRef(false);

  useEffect(() => {
    setBlocos([]);
    setFim(false);
    cursor.current = null;
  }, [conversaId]);

  const carregarMais = useCallback(async () => {
    if (fim || emVoo.current) return;
    emVoo.current = true;
    setCarregando(true);
    try {
      const q = cursor.current ? `?cursor=${encodeURIComponent(cursor.current)}` : '';
      const r = await api.get<Resposta>(`/conversas/${conversaId}/anteriores${q}`);
      if (!r.atendimento) {
        setFim(true);
        return;
      }
      cursor.current = r.proximoCursor;
      setBlocos((atual) => [r.atendimento!, ...atual]);
      if (!r.proximoCursor) setFim(true);
    } finally {
      emVoo.current = false;
      setCarregando(false);
    }
  }, [conversaId, fim]);

  return { blocos, carregando, fim, carregarMais };
}
```

- [ ] **Step 6: PainelChat — bolhas, eventos e links**

Em `PainelChat.tsx`:

1. Imports (substituir os do topo):

```tsx
import { Fragment, useEffect, useRef, useState } from 'react';
import { Alerta, Badge, Button } from '../../components/ui';
import { Dropdown } from '../../components/ui/Dropdown';
import { useToast } from '../../components/ui/Toast';
import { ApiError, api } from '../../lib/api';
import { LABEL_CONVERSA_STATUS, type ConversaDetalhe, type Mensagem } from '../../lib/types';
import { AvatarConversa } from './AvatarConversa';
import { partesComLinks } from './links';
import { useAtendimentosAnteriores, type BlocoAnterior } from './useAtendimentosAnteriores';
```

2. Depois de `const hora = ...`:

```tsx
const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

function TextoComLinks({ texto }: { texto: string }) {
  return (
    <p className="whitespace-pre-wrap break-words">
      {partesComLinks(texto).map((p, i) =>
        p.href ? (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" className="text-sky-700 underline">
            {p.texto}
          </a>
        ) : (
          <Fragment key={i}>{p.texto}</Fragment>
        ),
      )}
    </p>
  );
}

/** Pilula central de evento (PCM: "Aceito por: Guilherme"). */
function EventoConversa({ mensagem }: { mensagem: Mensagem }) {
  return (
    <li className="my-2 flex justify-center">
      <span className="inline-flex flex-col items-center rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs text-slate-700 shadow-sm">
        <span className="font-medium">{mensagem.conteudo}</span>
        <span className="text-[10px] text-slate-400">{dataHora(mensagem.criadoEm)}</span>
      </span>
    </li>
  );
}

/** Separador de atendimento anterior (PCM: "Hoje - Conversa anterior - 62080133711913"). */
function SeparadorAnterior({ bloco }: { bloco: BlocoAnterior }) {
  const data = new Date(bloco.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  return (
    <li className="my-3 flex justify-center">
      <span className="rounded-full bg-slate-200/80 px-3 py-1 text-xs text-slate-600">
        {data} - Conversa anterior{bloco.protocolo ? ` - ${bloco.protocolo}` : ''}
      </span>
    </li>
  );
}

/** Quem escreveu, no topo da bolha da direita (PCM). */
function rotuloDoAutor(m: Mensagem): string | null {
  if (m.enviadaPorDispositivo) return 'Mensagem enviada por outro dispositivo';
  if (m.autor === 'BOT') return 'Mensagem do sistema';
  if (m.autor === 'AGENTE') return m.autorNome;
  return null;
}
```

3. Substituir a função `Bolha` inteira por:

```tsx
function Bolha({ mensagem }: { mensagem: Mensagem }) {
  if (mensagem.autor === 'SISTEMA') {
    if (mensagem.evento) return <EventoConversa mensagem={mensagem} />;
    return (
      <li className="my-2 text-center">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">{mensagem.conteudo}</span>
      </li>
    );
  }

  if (mensagem.interno) {
    return (
      <li className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-sm text-slate-800">
          <p className="mb-1 text-xs font-semibold text-amber-700">
            Nota interna{mensagem.autorNome ? ` · ${mensagem.autorNome}` : ''}
          </p>
          <Anexo mensagem={mensagem} />
          <TextoComLinks texto={mensagem.conteudo} />
          <p className="mt-1 text-right text-[10px] text-amber-700/70">{hora(mensagem.criadoEm)}</p>
        </div>
      </li>
    );
  }

  const daEmpresa = mensagem.autor !== 'CLIENTE';
  const rotulo = rotuloDoAutor(mensagem);
  return (
    <li className={`flex ${daEmpresa ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
          daEmpresa ? 'text-slate-800' : 'border border-slate-200 bg-white text-slate-800'
        }`}
        style={daEmpresa ? { backgroundColor: mensagem.autor === 'BOT' ? '#ffffff' : '#d9fdd3' } : undefined}
      >
        {rotulo && <p className="mb-1 text-xs font-semibold text-slate-600">{rotulo}</p>}
        <Anexo mensagem={mensagem} />
        <TextoComLinks texto={mensagem.conteudo} />
        <p className="mt-1 flex items-center justify-end gap-1 text-right text-[10px] text-slate-500">
          {hora(mensagem.criadoEm)}
          {daEmpresa && (
            <svg width="14" height="10" viewBox="0 0 16 11" fill="none" aria-label="Enviada">
              <path
                d="M1 5.5L4.5 9L11 1.5M5.5 5.5L9 9L15.5 1.5"
                stroke="#53bdeb"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </p>
      </div>
    </li>
  );
}
```

- [ ] **Step 7: PainelChat — props, cabeçalho com protocolo e menu ⋮**

1. Trocar a assinatura do componente:

```tsx
export function PainelChat({
  conversa,
  onMudou,
  aoTransferir,
  aoVoltarParaLista,
  aoAlternarFicha,
  fichaAberta,
  somenteLeitura = false,
}: {
  conversa: ConversaDetalhe;
  onMudou: (detalhe: ConversaDetalhe) => void;
  /** Abre o modal "Transferir conversa" (AtendimentoPage). */
  aoTransferir?: () => void;
  aoVoltarParaLista?: () => void;
  aoAlternarFicha?: () => void;
  fichaAberta?: boolean;
  /** Visualizador da Auditoria: sem rodape e sem acoes (PCM 03:00). */
  somenteLeitura?: boolean;
}) {
```

2. Logo depois dos `useState` existentes:

```tsx
  const mostrar = useToast();
  const anteriores = useAtendimentosAnteriores(conversa.id);
  const topo = useRef<HTMLDivElement>(null);
```

3. Dentro de `executar`, depois de `onMudou(nova);`, nada muda. Acrescentar a função de encerrar:

```tsx
  const encerrar = () =>
    void executar(async () => {
      const r = await api.post<{ conversa: ConversaDetalhe }>(`/conversas/${conversa.id}/finalizar`);
      mostrar('sucesso', 'Chat encerrado com sucesso.');
      return r;
    });
```

4. No `<header>`, trocar a linha do e-mail/telefone por:

```tsx
            <p className="truncate text-xs text-slate-500">
              {conversa.contato.telefone ?? conversa.contato.email ?? 'Sem contato informado'}
              {conversa.linha?.nome ? ` · ${conversa.linha.nome}` : ''}
              {conversa.fila ? ` · ${conversa.fila.nome}` : ''}
            </p>
```

   e, logo depois do `</div>` que fecha `min-w-0 flex-1`, acrescentar o protocolo:

```tsx
          {conversa.protocolo && (
            <button
              type="button"
              title="Copiar protocolo"
              onClick={() => {
                void navigator.clipboard?.writeText(conversa.protocolo!);
                mostrar('info', `Protocolo ${conversa.protocolo} copiado`);
              }}
              className="shrink-0 rounded border border-slate-200 px-2 py-0.5 font-mono text-xs text-slate-600 hover:bg-slate-50"
            >
              {conversa.protocolo}
            </button>
          )}
```

5. Substituir **toda** a `<div className="flex flex-wrap items-center gap-2">` de ações (status, Assumir, select de transferência, Devolver, Resolver, Arquivar) por:

```tsx
        <div className="flex flex-wrap items-center gap-2">
          <Badge tom={finalizada ? 'neutro' : 'sucesso'}>{LABEL_CONVERSA_STATUS[conversa.status]}</Badge>
          {conversa.arquivada && <Badge tom="neutro">Arquivada</Badge>}
          <span className="text-xs text-slate-400">{conversa.origem === 'ATIVO' ? '↗ Ativo' : '↙ Receptivo'}</span>

          {!somenteLeitura && (
            <div className="ml-auto flex items-center gap-2">
              {conversa.status === 'EM_ESPERA' && (
                <Button disabled={ocupado} onClick={() => void executar(() => api.post(`/conversas/${conversa.id}/assumir`))}>
                  Aceitar
                </Button>
              )}
              <Dropdown
                rotulo={<span aria-label="Ações da conversa">⋮</span>}
                itens={[
                  ...(!finalizada
                    ? [
                        { chave: 'encerrar', rotulo: 'Encerrar', aoSelecionar: encerrar, desabilitado: ocupado },
                        ...(aoTransferir ? [{ chave: 'transferir', rotulo: 'Transferir', aoSelecionar: aoTransferir, desabilitado: ocupado }] : []),
                        ...(conversa.fila && conversa.agente
                          ? [
                              {
                                chave: 'devolver',
                                rotulo: `Devolver à equipe ${conversa.fila.nome}`,
                                desabilitado: ocupado,
                                aoSelecionar: () =>
                                  void executar(() => api.post(`/conversas/${conversa.id}/transferir`, { filaId: conversa.fila!.id })),
                              },
                            ]
                          : []),
                      ]
                    : []),
                  {
                    chave: 'arquivar',
                    rotulo: conversa.arquivada ? 'Desarquivar' : 'Arquivar',
                    desabilitado: ocupado,
                    aoSelecionar: () =>
                      void executar(() => api.post(`/conversas/${conversa.id}/${conversa.arquivada ? 'desarquivar' : 'arquivar'}`)),
                  },
                ]}
              />
            </div>
          )}
        </div>
```

(Os itens de `Dropdown` usam `{ chave, rotulo, aoSelecionar, desabilitado? }`, que é exatamente o tipo `ItemDropdown` do kit.)

- [ ] **Step 8: PainelChat — área de mensagens com atendimentos anteriores e sentinela**

1. Acrescentar um efeito que dispara a carga quando o topo fica visível e o histórico da conversa atual acabou:

```tsx
  const historicoAtualEsgotado = !(conversa.temHistoricoAnterior ?? false) || fimDoHistorico;

  useEffect(() => {
    const alvo = topo.current;
    if (!alvo || !historicoAtualEsgotado || anteriores.fim) return;
    const observador = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) void anteriores.carregarMais();
    });
    observador.observe(alvo);
    return () => observador.disconnect();
  }, [historicoAtualEsgotado, anteriores.fim, anteriores.carregarMais, conversa.id]);
```

2. Dentro de `<div className="mx-auto max-w-3xl">`, antes do botão "Carregar mensagens anteriores", inserir a sentinela e o indicador:

```tsx
          <div ref={topo} aria-hidden="true" />
          {anteriores.carregando && <p className="mb-2 text-center text-xs text-slate-500">Carregando atendimento anterior...</p>}
```

3. **Antes de mexer no `<ul>`, resolver a colisão de nomes.** O estado antigo `const [anteriores, setAnteriores] = useState<Mensagem[]>([]);` guarda as mensagens mais antigas da **própria** conversa; o hook novo também se chama `anteriores`. Renomear o estado antigo para `anterioresDaConversa` / `setAnterioresDaConversa` em todo o arquivo: declaração, `useEffect` que zera ao trocar de conversa e `carregarAnteriores` (`setAnterioresDaConversa((atual) => [...resp.mensagens, ...atual]);`).

4. Trocar o `<ul className="space-y-2">...</ul>` por:

```tsx
          <ul className="space-y-2">
            {anteriores.blocos.map((bloco) => (
              <Fragment key={bloco.id}>
                <SeparadorAnterior bloco={bloco} />
                {bloco.mensagens.map((m) => (
                  <Bolha key={m.id} mensagem={m} />
                ))}
              </Fragment>
            ))}
            {anteriores.blocos.length > 0 && (
              <li className="my-3 flex justify-center">
                <span className="rounded-full bg-slate-200/80 px-3 py-1 text-xs text-slate-600">
                  Atendimento atual{conversa.protocolo ? ` - ${conversa.protocolo}` : ''}
                </span>
              </li>
            )}
            {[...anterioresDaConversa, ...conversa.mensagens].map((m) => (
              <Bolha key={m.id} mensagem={m} />
            ))}
          </ul>
```

5. Rodapé: trocar `<footer className="border-t border-slate-200 bg-white p-4">` por

```tsx
      {!somenteLeitura && <footer className="border-t border-slate-200 bg-white p-4">
```

   e o `</footer>` correspondente por `</footer>}`.

- [ ] **Step 9: Ajustar o chamador**

Em `AtendimentoPage.tsx`:
- remover a prop `agentes={agentes}` do `<PainelChat>`;
- apagar o `useState<Usuario[]>` de `agentes` e o `useEffect` que buscava `/usuarios?perfil=AGENTE`;
- remover `Usuario` do import de tipos se ficar sem uso.

A prop `aoTransferir` entra na Task 16.

- [ ] **Step 10: Testes e typecheck**

```bash
npx vitest run apps/web/src && npm run typecheck -w @plataforma/web
```

Expected: verde. Se `PainelChat.test.ts` testava uma função exportada que mudou de nome, ajuste o import.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src
git commit -m "feat(atendimento): painel com autor, eventos, links, protocolo, menu e historico anterior

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 16: Coluna Caixa de entrada, aba Atribuídas e modal Transferir

**Files:**
- Modify: `apps/web/src/features/atendimento/visao.ts` (+ `visao.test.ts`)
- Create: `apps/web/src/features/atendimento/caixaEntrada.ts`
- Test: `apps/web/src/features/atendimento/caixaEntrada.test.ts`
- Create: `apps/web/src/features/atendimento/useCaixaEntrada.ts`
- Create: `apps/web/src/features/atendimento/CaixaEntradaEquipes.tsx`
- Create: `apps/web/src/features/atendimento/destinos.ts`
- Test: `apps/web/src/features/atendimento/destinos.test.ts`
- Create: `apps/web/src/features/atendimento/ModalTransferir.tsx`
- Modify: `apps/web/src/pages/AtendimentoPage.tsx`

**Interfaces:**
- Consumes:
  - `GET /conversas/caixa-entrada` (Task 8);
  - `GET /conversas/destinos-transferencia` (Task 7);
  - `POST /conversas/:id/assumir` (409 em conflito, Task 4);
  - `Modal` (Task 13).
- Produces:
  - `VisaoInbox = 'MINHAS' | 'ATRIBUIDAS' | 'ACOMPANHAR'` (web)
  - `GrupoCaixa = { fila: { id: string; nome: string } | null; conversas: ConversaResumo[] }`
  - `aplicarNaCaixa(grupos: GrupoCaixa[], conversa: ConversaResumo): GrupoCaixa[]`
  - `separarDestinos(destinos, busca, agenteAtualId)` → `{ disponiveis; indisponiveis; equipes }`

- [ ] **Step 1: Visão no web (teste + implementação)** — *já executado na Task 13, Step 4; aqui só confirmar que `visao.test.ts` está verde.*

1. Em `visao.test.ts`:
   - trocar as expectativas de `visoesDisponiveis` para `['MINHAS', 'ATRIBUIDAS', 'ACOMPANHAR']` e `['MINHAS', 'ATRIBUIDAS']`;
   - trocar `parametrosDaVisao('FILA', ...)` por `parametrosDaVisao('ATRIBUIDAS', ...)` com resultado `{ visao: 'ATRIBUIDAS' }`;
   - substituir os testes de `pertenceAVisao(..., 'FILA', ...)` por:

```ts
  it('ATRIBUIDAS: so o que esta comigo e nao e do meu numero', () => {
    const comigo = { status: 'ATRIBUIDO', agente: { id: EU.meuUsuarioId!, nome: 'Eu' }, fila: null, linha: { id: 'l', donoId: null, nome: null } } as const;
    const esperando = { ...comigo, status: 'EM_ESPERA', agente: null } as const;
    expect(pertenceAVisao(comigo, 'ATRIBUIDAS', EU)).toBe(true);
    expect(pertenceAVisao(esperando, 'ATRIBUIDAS', EU)).toBe(false);
  });
```

   - no laço final, trocar `'FILA'` por `'ATRIBUIDAS'`.

2. Em `visao.ts`:

```ts
export type VisaoInbox = 'MINHAS' | 'ATRIBUIDAS' | 'ACOMPANHAR';

export const VISOES_INBOX: readonly VisaoInbox[] = ['MINHAS', 'ATRIBUIDAS', 'ACOMPANHAR'];

export const LABEL_VISAO_INBOX: Record<VisaoInbox, string> = {
  MINHAS: 'Minhas',
  ATRIBUIDAS: 'Atribuídas',
  ACOMPANHAR: 'Acompanhar',
};
```

   e trocar o `case 'FILA':` de `pertenceAVisao` por:

```ts
    case 'ATRIBUIDAS':
      return !doMeuNumero && eu !== null && conversa.agente?.id === eu;
```

   Atualizar o comentário do topo: a espera agora fica na coluna Caixa de entrada.

```bash
npx vitest run apps/web/src/features/atendimento/visao.test.ts
```

Expected: PASS.

- [ ] **Step 2: Teste de `caixaEntrada` falhando**

```ts
// apps/web/src/features/atendimento/caixaEntrada.test.ts
import { describe, expect, it } from 'vitest';
import type { ConversaResumo } from '../../lib/types';
import { aplicarNaCaixa, type GrupoCaixa } from './caixaEntrada';

const conv = (id: string, extra: Partial<ConversaResumo> = {}) =>
  ({
    id,
    status: 'EM_ESPERA',
    agente: null,
    arquivada: false,
    fila: { id: 'f-com', nome: 'Comercial' },
    ultimaMensagemEm: '2026-10-09T15:00:00Z',
    ...extra,
  }) as ConversaResumo;

const grupos = (): GrupoCaixa[] => [
  { fila: null, conversas: [] },
  { fila: { id: 'f-com', nome: 'Comercial' }, conversas: [conv('c-velha', { ultimaMensagemEm: '2026-10-09T14:00:00Z' })] },
];

describe('aplicarNaCaixa', () => {
  it('conversa nova em espera entra no grupo da equipe, a mais antiga primeiro', () => {
    const r = aplicarNaCaixa(grupos(), conv('c-nova'));
    expect(r[1]?.conversas.map((c) => c.id)).toEqual(['c-velha', 'c-nova']);
  });

  it('aceita por alguem (ganhou agente) sai da caixa de todo mundo', () => {
    const r = aplicarNaCaixa(grupos(), conv('c-velha', { status: 'ATRIBUIDO', agente: { id: 'u-2', nome: 'Viviane' } }));
    expect(r[1]?.conversas).toEqual([]);
  });

  it('sem equipe vai para o grupo sem equipe quando ele existe', () => {
    const r = aplicarNaCaixa(grupos(), conv('c-sem', { fila: null }));
    expect(r[0]?.conversas.map((c) => c.id)).toEqual(['c-sem']);
  });

  it('equipe que nao e minha nao entra', () => {
    const r = aplicarNaCaixa(grupos(), conv('c-fin', { fila: { id: 'f-fin', nome: 'Financeiro' } }));
    expect(r.flatMap((g) => g.conversas.map((c) => c.id))).toEqual(['c-velha']);
  });

  it('arquivada sai', () => {
    const r = aplicarNaCaixa(grupos(), conv('c-velha', { arquivada: true }));
    expect(r[1]?.conversas).toEqual([]);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
npx vitest run apps/web/src/features/atendimento/caixaEntrada.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implementar `caixaEntrada.ts` e `useCaixaEntrada.ts`**

```ts
// apps/web/src/features/atendimento/caixaEntrada.ts
import type { ConversaResumo } from '../../lib/types';

export type GrupoCaixa = { fila: { id: string; nome: string } | null; conversas: ConversaResumo[] };

const maisAntigaPrimeiro = (a: ConversaResumo, b: ConversaResumo) =>
  new Date(a.ultimaMensagemEm).getTime() - new Date(b.ultimaMensagemEm).getTime();

/**
 * Aplica um evento de socket na Caixa de entrada: tira a conversa de todos os
 * grupos e, se ela ainda espera alguem numa equipe que ja esta na tela, poe no
 * grupo certo. E assim que "o primeiro que pega tira da caixa dos outros"
 * (PCM 31:10) aparece sem recarregar. Quem pode ver ja foi decidido pelo
 * servidor ao escolher as salas.
 */
export function aplicarNaCaixa(grupos: GrupoCaixa[], conversa: ConversaResumo): GrupoCaixa[] {
  const esperando = conversa.status === 'EM_ESPERA' && !conversa.agente && !conversa.arquivada;
  const filaId = conversa.fila?.id ?? null;
  return grupos.map((g) => {
    const semEla = g.conversas.filter((c) => c.id !== conversa.id);
    const ehDoGrupo = esperando && (g.fila?.id ?? null) === filaId;
    return { ...g, conversas: ehDoGrupo ? [...semEla, conversa].sort(maisAntigaPrimeiro) : semEla };
  });
}
```

```ts
// apps/web/src/features/atendimento/useCaixaEntrada.ts
import { useCallback, useEffect, useState } from 'react';
import { api, getAccessToken } from '../../lib/api';
import { EVENTOS, conectar } from '../../lib/realtime';
import type { ConversaDetalhe, ConversaResumo } from '../../lib/types';
import { aplicarNaCaixa, type GrupoCaixa } from './caixaEntrada';

const paraResumo = (c: ConversaDetalhe | ConversaResumo): ConversaResumo => {
  if ('mensagens' in c) {
    const { mensagens, ...resto } = c;
    return { ...resto, ultimaMensagem: mensagens.at(-1) ?? null };
  }
  return c;
};

/** Estado da coluna Caixa de entrada, ao vivo pelo socket. */
export function useCaixaEntrada() {
  const [grupos, setGrupos] = useState<GrupoCaixa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await api.get<{ grupos: GrupoCaixa[] }>('/conversas/caixa-entrada');
      setGrupos(r.grupos);
      setErro(null);
    } catch {
      setErro('Não foi possível carregar a caixa de entrada');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const socket = conectar({ token });
    const aplicar = (c: ConversaDetalhe) => setGrupos((atual) => aplicarNaCaixa(atual, paraResumo(c)));
    socket.on(EVENTOS.conversaNova, aplicar);
    socket.on(EVENTOS.conversaAtualizada, aplicar);
    return () => {
      socket.disconnect();
    };
  }, []);

  const total = grupos.reduce((s, g) => s + g.conversas.length, 0);
  return { grupos, carregando, erro, total, recarregar: carregar };
}
```

```bash
npx vitest run apps/web/src/features/atendimento/caixaEntrada.test.ts
```

Expected: PASS.

- [ ] **Step 5: Componente da coluna**

```tsx
// apps/web/src/features/atendimento/CaixaEntradaEquipes.tsx
import { useState } from 'react';
import { Alerta } from '../../components/ui';
import { SkeletonBloco } from '../../components/ui/Skeleton';
import { telefoneLegivel } from '../../lib/telefone';
import { AvatarConversa } from './AvatarConversa';
import type { GrupoCaixa } from './caixaEntrada';

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/**
 * Coluna "Caixa de entrada" (PCM 00:22 / 27:44): grupos por equipe, contador
 * amarelo, clique no item = aceitar. Grupo vazio mostra "Sem nenhum chat novo".
 */
export function CaixaEntradaEquipes({
  grupos,
  carregando,
  erro,
  aceitandoId,
  onAceitar,
}: {
  grupos: GrupoCaixa[];
  carregando: boolean;
  erro: string | null;
  aceitandoId: string | null;
  onAceitar: (conversaId: string) => void;
}) {
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const chave = (g: GrupoCaixa) => g.fila?.id ?? 'sem-equipe';
  const estaAberto = (g: GrupoCaixa) => abertos[chave(g)] ?? g.conversas.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-slate-100 px-3 py-2.5">
        <h2 className="text-sm font-semibold text-slate-800">Caixa de entrada</h2>
      </header>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
        {erro && <Alerta>{erro}</Alerta>}
        {carregando && grupos.length === 0 && <SkeletonBloco className="h-8 w-full" />}
        {!carregando && grupos.length === 0 && !erro && (
          <p className="px-2 py-3 text-xs text-slate-500">Você não está em nenhuma equipe. Peça a um administrador para incluir você numa fila.</p>
        )}
        {grupos.map((g) => (
          <section key={chave(g)} className="rounded-lg bg-slate-50">
            <button
              type="button"
              onClick={() => setAbertos((a) => ({ ...a, [chave(g)]: !estaAberto(g) }))}
              aria-expanded={estaAberto(g)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
            >
              <span className="truncate">{g.fila?.nome ?? 'Sem equipe'}</span>
              {g.conversas.length > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 text-xs font-semibold text-slate-900">
                  {g.conversas.length}
                </span>
              )}
            </button>
            {estaAberto(g) && (
              <ul className="space-y-1 px-1.5 pb-1.5">
                {g.conversas.length === 0 && <li className="py-2 text-center text-xs text-slate-400">Sem nenhum chat novo</li>}
                {g.conversas.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={aceitandoId !== null}
                      onClick={() => onAceitar(c.id)}
                      title="Aceitar esta conversa"
                      className="flex w-full items-center gap-2 rounded-md bg-white px-2 py-2 text-left shadow-sm transition hover:ring-1 hover:ring-[var(--brand-primary)] disabled:opacity-60"
                    >
                      <AvatarConversa conversaId={c.id} nome={c.contato.nome} className="h-8 w-8" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-xs font-medium text-slate-800">{c.contato.nome}</span>
                          <span className="shrink-0 text-[10px] text-slate-400">{hora(c.ultimaMensagemEm)}</span>
                        </div>
                        <p className="truncate text-[11px] text-slate-500">
                          {c.contato.telefone ? telefoneLegivel(c.contato.telefone) : (c.linha?.nome ?? '')}
                        </p>
                      </div>
                      {aceitandoId === c.id && <span className="text-[10px] text-slate-400">...</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Teste de `destinos` falhando**

```ts
// apps/web/src/features/atendimento/destinos.test.ts
import { describe, expect, it } from 'vitest';
import { separarDestinos } from './destinos';

const D = {
  usuarios: [
    { id: 'u-1', nome: 'Guilherme', perfil: 'COMERCIAL', status: 'EM_ATENDIMENTO' },
    { id: 'u-2', nome: 'Viviane', perfil: 'SUPORTE', status: 'OFFLINE' },
    { id: 'u-3', nome: 'Comercial', perfil: 'COMERCIAL', status: 'DISPONIVEL' },
  ],
  filas: [{ id: 'f-1', nome: 'Suporte' }],
};

describe('separarDestinos', () => {
  it('online em Disponiveis, offline em Indisponiveis, sem o responsavel atual', () => {
    const r = separarDestinos(D, '', 'u-1');
    expect(r.disponiveis.map((u) => u.nome)).toEqual(['Comercial']);
    expect(r.indisponiveis.map((u) => u.nome)).toEqual(['Viviane']);
    expect(r.equipes.map((f) => f.nome)).toEqual(['Suporte']);
  });

  it('busca sem acento e sem caixa em pessoas e equipes', () => {
    const r = separarDestinos(D, 'VIV', null);
    expect(r.indisponiveis.map((u) => u.nome)).toEqual(['Viviane']);
    expect(r.disponiveis).toEqual([]);
    expect(r.equipes).toEqual([]);
  });
});
```

```bash
npx vitest run apps/web/src/features/atendimento/destinos.test.ts
```

Expected: FAIL.

- [ ] **Step 7: Implementar `destinos.ts` e `ModalTransferir.tsx`**

```ts
// apps/web/src/features/atendimento/destinos.ts
export type UsuarioDestino = { id: string; nome: string; perfil: string; status: string };
export type Destinos = { usuarios: UsuarioDestino[]; filas: Array<{ id: string; nome: string }> };

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Modal "Transferir conversa" (PCM 31:38): Disponiveis = online. Pura. */
export function separarDestinos(d: Destinos, busca: string, agenteAtualId: string | null) {
  const termo = normalizar(busca.trim());
  const casa = (nome: string) => !termo || normalizar(nome).includes(termo);
  const pessoas = d.usuarios.filter((u) => u.id !== agenteAtualId && casa(u.nome));
  return {
    disponiveis: pessoas.filter((u) => u.status !== 'OFFLINE'),
    indisponiveis: pessoas.filter((u) => u.status === 'OFFLINE'),
    equipes: d.filas.filter((f) => casa(f.nome)),
  };
}
```

```tsx
// apps/web/src/features/atendimento/ModalTransferir.tsx
import { useEffect, useState } from 'react';
import { Alerta, Button, Input } from '../../components/ui';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { ApiError, api } from '../../lib/api';
import { LABEL_PERFIL, type ConversaDetalhe, type Perfil } from '../../lib/types';
import { separarDestinos, type Destinos } from './destinos';

type Escolha = { tipo: 'agente'; id: string; nome: string } | { tipo: 'fila'; id: string; nome: string };

export function ModalTransferir({
  conversa,
  aberto,
  aoFechar,
  aoTransferir,
}: {
  conversa: ConversaDetalhe;
  aberto: boolean;
  aoFechar: () => void;
  aoTransferir: (detalhe: ConversaDetalhe) => void;
}) {
  const mostrar = useToast();
  const [destinos, setDestinos] = useState<Destinos | null>(null);
  const [busca, setBusca] = useState('');
  const [motivo, setMotivo] = useState('');
  const [escolha, setEscolha] = useState<Escolha | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setBusca('');
    setMotivo('');
    setEscolha(null);
    setErro(null);
    void api
      .get<Destinos>('/conversas/destinos-transferencia')
      .then(setDestinos)
      .catch(() => setErro('Não foi possível carregar usuários e equipes'));
  }, [aberto]);

  const grupos = destinos ? separarDestinos(destinos, busca, conversa.agente?.id ?? null) : null;
  const total = grupos ? grupos.disponiveis.length + grupos.indisponiveis.length + grupos.equipes.length : 0;

  const transferir = async () => {
    if (!escolha) return;
    setEnviando(true);
    setErro(null);
    try {
      const corpo = {
        ...(escolha.tipo === 'agente' ? { agenteId: escolha.id } : { filaId: escolha.id }),
        ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
      };
      const { conversa: nova } = await api.post<{ conversa: ConversaDetalhe }>(`/conversas/${conversa.id}/transferir`, corpo);
      mostrar('sucesso', `Conversa transferida para ${escolha.nome}`);
      aoTransferir(nova);
      aoFechar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao transferir');
    } finally {
      setEnviando(false);
    }
  };

  const item = (e: Escolha, legenda: string) => (
    <li key={`${e.tipo}-${e.id}`}>
      <button
        type="button"
        onClick={() => setEscolha(e)}
        aria-pressed={escolha?.id === e.id}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
          escolha?.id === e.id ? 'bg-[var(--brand-primary)]/10 ring-1 ring-[var(--brand-primary)]' : 'hover:bg-slate-50'
        }`}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-600">{e.nome.charAt(0)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-slate-800">{e.nome}</span>
          <span className="block text-[11px] text-slate-500">{legenda}</span>
        </span>
      </button>
    </li>
  );

  return (
    <Modal
      aberto={aberto}
      titulo="Transferir conversa"
      aoFechar={aoFechar}
      rodape={
        <>
          <Button variante="neutro" onClick={aoFechar} disabled={enviando}>Cancelar</Button>
          <Button onClick={() => void transferir()} disabled={!escolha || enviando}>
            {enviando ? 'Transferindo...' : 'Transferir Conversa'}
          </Button>
        </>
      }
    >
      <label className="mb-1 block text-xs font-medium text-slate-700">Usuário ou equipe *</label>
      <Input placeholder="Buscar usuário ou equipe..." value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus />
      {erro && <div className="mt-2"><Alerta>{erro}</Alerta></div>}
      {!grupos && !erro && <p className="mt-3 text-xs text-slate-500">Carregando...</p>}
      {grupos && (
        <div className="mt-3 space-y-3">
          <p className="flex justify-between text-[11px] uppercase tracking-wide text-slate-400">
            <span>Disponíveis</span>
            <span>{total} encontrados</span>
          </p>
          <ul className="space-y-0.5">
            {grupos.disponiveis.map((u) => item({ tipo: 'agente', id: u.id, nome: u.nome }, LABEL_PERFIL[u.perfil as Perfil] ?? 'Usuário'))}
          </ul>
          {grupos.equipes.length > 0 && (
            <>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Equipes</p>
              <ul className="space-y-0.5">{grupos.equipes.map((f) => item({ tipo: 'fila', id: f.id, nome: f.nome }, 'Equipe'))}</ul>
            </>
          )}
          {grupos.indisponiveis.length > 0 && (
            <>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Indisponíveis</p>
              <ul className="space-y-0.5 opacity-70">
                {grupos.indisponiveis.map((u) => item({ tipo: 'agente', id: u.id, nome: u.nome }, 'Offline'))}
              </ul>
            </>
          )}
          {total === 0 && <p className="text-xs text-slate-500">Nenhum usuário ou equipe encontrado.</p>}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Motivo (opcional)</label>
            <Input value={motivo} maxLength={280} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: cliente pediu o financeiro" />
          </div>
        </div>
      )}
    </Modal>
  );
}
```

```bash
npx vitest run apps/web/src/features/atendimento/destinos.test.ts
```

Expected: PASS.

- [ ] **Step 8: Integrar na página**

Em `AtendimentoPage.tsx`:

1. Imports:

```tsx
import { useToast } from '../components/ui/Toast';
import { CaixaEntradaEquipes } from '../features/atendimento/CaixaEntradaEquipes';
import { ModalTransferir } from '../features/atendimento/ModalTransferir';
import { useCaixaEntrada } from '../features/atendimento/useCaixaEntrada';
```

2. Estado: trocar `useState<VisaoInbox>('FILA')` por `useState<VisaoInbox>('MINHAS')` e atualizar o comentário: a espera agora mora na coluna Caixa de entrada.

3. Depois de `useConversas(...)`:

```tsx
  const mostrar = useToast();
  const caixa = useCaixaEntrada();
  const [aceitandoId, setAceitandoId] = useState<string | null>(null);
  const [transferindo, setTransferindo] = useState(false);

  /** Clique na Caixa de entrada = aceitar (PCM 00:59). Conflito = outro atendente pegou antes. */
  const aceitar = useCallback(
    async (id: string) => {
      setAceitandoId(id);
      try {
        const { conversa } = await api.post<{ conversa: ConversaDetalhe }>(`/conversas/${id}/assumir`);
        mostrar('sucesso', 'Conversa movida para a lista de chats.');
        aplicarEvento(conversa);
        setVisao(conversa.linha?.donoId === usuario?.id ? 'MINHAS' : 'ATRIBUIDAS');
        await abrir(id);
      } catch (e) {
        mostrar('erro', e instanceof ApiError ? e.message : 'Não foi possível aceitar a conversa');
        void caixa.recarregar();
      } finally {
        setAceitandoId(null);
      }
    },
    [abrir, aplicarEvento, caixa, mostrar, usuario?.id],
  );
```

   (`abrir` é declarado depois; mova este bloco para **depois** da declaração de `abrir`.)

4. Layout desktop/notebook/tablet: dentro do `<div ref={containerRef} ...>`, **antes** de `{mostrarLista && (`, acrescentar a coluna:

```tsx
      {mostrarLista && !emMobile && (
        <section className="flex w-60 shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
          <CaixaEntradaEquipes
            grupos={caixa.grupos}
            carregando={caixa.carregando}
            erro={caixa.erro}
            aceitandoId={aceitandoId}
            onAceitar={(id) => void aceitar(id)}
          />
        </section>
      )}
```

5. Mobile: dentro da seção da lista, logo depois do `<div className="border-b border-slate-100 p-3">` da busca, acrescentar:

```tsx
          {emMobile && caixa.total > 0 && (
            <div className="max-h-56 overflow-y-auto border-b border-slate-100">
              <CaixaEntradaEquipes
                grupos={caixa.grupos.filter((g) => g.conversas.length > 0)}
                carregando={false}
                erro={caixa.erro}
                aceitandoId={aceitandoId}
                onAceitar={(id) => void aceitar(id)}
              />
            </div>
          )}
```

6. No `<PainelChat>`, acrescentar `aoTransferir={() => setTransferindo(true)}`. Logo depois do `</section>` do chat, acrescentar:

```tsx
      {aberta && (
        <ModalTransferir conversa={aberta} aberto={transferindo} aoFechar={() => setTransferindo(false)} aoTransferir={aoMudar} />
      )}
```

7. A largura padrão da lista no desktop continua 320; com a coluna nova (240) e o gap, o chat encolhe. Mantenha.

- [ ] **Step 9: Testes e typecheck**

```bash
npx vitest run apps/web/src && npm run typecheck -w @plataforma/web
```

Expected: verde.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src
git commit -m "feat(atendimento): coluna Caixa de entrada por equipe, aba Atribuidas e modal Transferir

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 17: Modal "Iniciar nova conversa"

**Files:**
- Create: `apps/web/src/features/atendimento/ModalIniciarConversa.tsx`
- Modify: `apps/web/src/pages/AtendimentoPage.tsx`

**Interfaces:**
- Consumes:
  - `GET /conversas/linhas-de-saida` e `POST /conversas { contatoId, canalConfigId }` (Task 12);
  - `GET /contatos?busca=&limite=8` → `{ contatos: Contato[] }`;
  - `POST /contatos/por-telefone { telefone, nome }` → `{ contato }`.
- Produces: `<ModalIniciarConversa aberto aoFechar aoIniciar={(conversaId) => void} />`

- [ ] **Step 1: Componente**

```tsx
// apps/web/src/features/atendimento/ModalIniciarConversa.tsx
import { useEffect, useState } from 'react';
import { Alerta, Button, Input, Select } from '../../components/ui';
import { Modal } from '../../components/ui/Modal';
import { SkeletonBloco } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { ApiError, api } from '../../lib/api';
import { telefoneLegivel } from '../../lib/telefone';
import type { Contato } from '../../lib/types';

type Linha = { id: string; nome: string; modo: string | null; minha: boolean };

/** Modal "Iniciar nova conversa" (PCM 01:25): linha de saida, contato, telefone. */
export function ModalIniciarConversa({
  aberto,
  aoFechar,
  aoIniciar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoIniciar: (conversaId: string) => void;
}) {
  const mostrar = useToast();
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [linhaId, setLinhaId] = useState('');
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<Contato[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [contato, setContato] = useState<Contato | null>(null);
  const [novo, setNovo] = useState<{ nome: string; telefone: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setBusca('');
    setContato(null);
    setNovo(null);
    setErro(null);
    void api
      .get<{ linhas: Linha[] }>('/conversas/linhas-de-saida')
      .then(({ linhas: l }) => {
        setLinhas(l);
        setLinhaId(l.find((x) => x.minha)?.id ?? l[0]?.id ?? '');
      })
      .catch(() => setErro('Não foi possível carregar as linhas de saída'));
  }, [aberto]);

  // Busca com espera de 300 ms entre teclas, para nao consultar a cada letra.
  useEffect(() => {
    if (!aberto) return;
    const termo = busca.trim();
    setBuscando(true);
    const t = window.setTimeout(() => {
      const q = termo ? `busca=${encodeURIComponent(termo)}&` : '';
      void api
        .get<{ contatos: Contato[] }>(`/contatos?${q}limite=8`)
        .then(({ contatos }) => setResultados(contatos))
        .catch(() => setResultados([]))
        .finally(() => setBuscando(false));
    }, 300);
    return () => window.clearTimeout(t);
  }, [busca, aberto]);

  const iniciar = async () => {
    if (!linhaId) return setErro('Escolha o canal de saída');
    setEnviando(true);
    setErro(null);
    try {
      let alvo = contato;
      if (!alvo && novo) {
        if (!novo.nome.trim() || novo.telefone.replace(/\D/g, '').length < 10) {
          setErro('Informe nome e telefone com DDD');
          return;
        }
        alvo = (await api.post<{ contato: Contato }>('/contatos/por-telefone', { nome: novo.nome.trim(), telefone: novo.telefone })).contato;
      }
      if (!alvo) {
        setErro('Escolha um contato');
        return;
      }
      const { conversa } = await api.post<{ conversa: { id: string } }>('/conversas', { contatoId: alvo.id, canalConfigId: linhaId });
      mostrar('sucesso', 'Conversa iniciada com sucesso');
      aoIniciar(conversa.id);
      aoFechar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível iniciar a conversa');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      aberto={aberto}
      titulo="Iniciar nova conversa"
      aoFechar={aoFechar}
      rodape={
        <>
          <Button variante="neutro" onClick={aoFechar} disabled={enviando}>Cancelar</Button>
          <Button onClick={() => void iniciar()} disabled={enviando || (!contato && !novo)}>
            {enviando ? 'Iniciando...' : 'Iniciar Conversa'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Canal de saída *</label>
          <Select value={linhaId} onChange={(e) => setLinhaId(e.target.value)}>
            {linhas.length === 0 && <option value="">Nenhuma linha disponível</option>}
            {linhas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}{l.minha ? ' (meu número)' : ''}
              </option>
            ))}
          </Select>
        </div>

        {!novo ? (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Contato *</label>
            <Input placeholder="Buscar contato..." value={busca} onChange={(e) => { setBusca(e.target.value); setContato(null); }} />
            <ul className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200">
              <li>
                <button type="button" onClick={() => setNovo({ nome: busca.trim(), telefone: '' })} className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                  + Criar novo contato
                </button>
              </li>
              {buscando && resultados === null && (
                <li className="space-y-2 p-3"><SkeletonBloco className="h-4 w-full" /><SkeletonBloco className="h-4 w-4/5" /></li>
              )}
              {resultados?.length === 0 && !buscando && (
                <li className="px-3 py-3 text-center text-xs text-slate-500">Nenhum contato encontrado</li>
              )}
              {resultados?.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setContato(c)}
                    aria-pressed={contato?.id === c.id}
                    className={`w-full px-3 py-2 text-left text-sm ${contato?.id === c.id ? 'bg-[var(--brand-primary)]/10' : 'hover:bg-slate-50'}`}
                  >
                    <span className="block text-slate-800">{c.nome}</span>
                    <span className="block text-[11px] text-slate-500">{c.telefone ? telefoneLegivel(c.telefone.replace(/\D/g, '')) : 'Sem telefone'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-medium text-slate-700">Novo contato</p>
            <Input placeholder="Nome (ex.: Bradel - Mateus)" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
            <Input placeholder="Telefone com DDD" value={novo.telefone} onChange={(e) => setNovo({ ...novo, telefone: e.target.value })} />
            <button type="button" onClick={() => setNovo(null)} className="text-xs text-slate-500 underline">Voltar para a busca</button>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Telefone *</label>
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {contato?.telefone ? `${telefoneLegivel(contato.telefone.replace(/\D/g, ''))} · principal` : 'Selecione um contato primeiro'}
          </p>
        </div>

        {erro && <Alerta>{erro}</Alerta>}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Botão na página**

Em `AtendimentoPage.tsx`:

1. Importar o modal e criar o estado `const [iniciando, setIniciando] = useState(false);`.
2. Trocar o bloco da busca da lista por:

```tsx
          <div className="flex items-center gap-2 border-b border-slate-100 p-3">
            <Input placeholder="Buscar por contato ou mensagem" value={busca} onChange={(e) => setBusca(e.target.value)} />
            <Button tamanho="sm" variante="neutro" title="Iniciar nova conversa" aria-label="Iniciar nova conversa" onClick={() => setIniciando(true)}>
              +
            </Button>
          </div>
```

3. No fim do JSX (junto do `ModalTransferir`):

```tsx
      <ModalIniciarConversa aberto={iniciando} aoFechar={() => setIniciando(false)} aoIniciar={(id) => void abrir(id)} />
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck -w @plataforma/web
```

Expected: verde.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src
git commit -m "feat(atendimento): modal Iniciar nova conversa com escolha da linha

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 18: Página de Auditoria

**Files:**
- Create: `apps/web/src/features/auditoria/filtros.ts`
- Test: `apps/web/src/features/auditoria/filtros.test.ts`
- Create: `apps/web/src/features/auditoria/GavetaFiltros.tsx`
- Create: `apps/web/src/pages/AuditoriaPage.tsx`
- Modify: `apps/web/src/components/layout/nav.ts` (item + ícone)
- Modify: `apps/web/src/App.tsx` (`PAGINAS`)

**Interfaces:**
- Consumes:
  - `GET /conversas/auditoria` e `/conversas/auditoria/opcoes` (Task 10);
  - `GET /conversas/:id`;
  - socket `conversa:entrar` + `mensagem:nova`;
  - `PainelChat somenteLeitura` (Task 15);
  - `Gaveta` (Task 13).
- Produces:
  - `type CampoFiltro = 'agenteId' | 'filaId' | 'canalConfigId' | 'situacao' | 'origem' | 'contato' | 'telefone' | 'protocolo' | 'inicioDe' | 'inicioAte' | 'fimDe' | 'fimAte'`
  - `type FiltroAplicado = { campo: CampoFiltro; valores: string[] }`
  - `paraQuery(filtros: FiltroAplicado[], pagina: number): string`
  - `rotuloDoChip(f: FiltroAplicado, opcoes): string`

- [ ] **Step 1: Teste falhando**

```ts
// apps/web/src/features/auditoria/filtros.test.ts
import { describe, expect, it } from 'vitest';
import { paraQuery, rotuloDoChip } from './filtros';

const OPCOES = {
  usuarios: [{ id: 'u-1', nome: 'Guilherme' }],
  filas: [{ id: 'f-1', nome: 'Comercial' }],
  linhas: [{ id: 'l-1', nome: 'Comercial - 3370' }],
};

describe('paraQuery', () => {
  it('repete a chave para cada valor e leva a pagina', () => {
    expect(
      paraQuery(
        [
          { campo: 'agenteId', valores: ['u-1'] },
          { campo: 'situacao', valores: ['EM_ATENDIMENTO', 'FINALIZADA'] },
        ],
        2,
      ),
    ).toBe('pagina=2&tamanho=10&agenteId=u-1&situacao=EM_ATENDIMENTO&situacao=FINALIZADA');
  });

  it('ignora filtro sem valor', () => {
    expect(paraQuery([{ campo: 'contato', valores: [''] }], 1)).toBe('pagina=1&tamanho=10');
  });
});

describe('rotuloDoChip', () => {
  it('troca id pelo nome', () => {
    expect(rotuloDoChip({ campo: 'agenteId', valores: ['u-1'] }, OPCOES)).toBe('Usuário: Guilherme');
    expect(rotuloDoChip({ campo: 'situacao', valores: ['EM_ATENDIMENTO'] }, OPCOES)).toBe('Status: Em atendimento');
    expect(rotuloDoChip({ campo: 'filaId', valores: ['SEM_EQUIPE'] }, OPCOES)).toBe('Equipe: Sem equipe');
  });
});
```

```bash
npx vitest run apps/web/src/features/auditoria/filtros.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Implementar `filtros.ts`**

```ts
// apps/web/src/features/auditoria/filtros.ts
export type CampoFiltro =
  | 'agenteId'
  | 'filaId'
  | 'canalConfigId'
  | 'situacao'
  | 'origem'
  | 'contato'
  | 'telefone'
  | 'protocolo'
  | 'inicioDe'
  | 'inicioAte'
  | 'fimDe'
  | 'fimAte';

export type FiltroAplicado = { campo: CampoFiltro; valores: string[] };
export type OpcoesAuditoria = {
  usuarios: Array<{ id: string; nome: string }>;
  filas: Array<{ id: string; nome: string }>;
  linhas: Array<{ id: string; nome: string }>;
};

export const LABEL_CAMPO: Record<CampoFiltro, string> = {
  agenteId: 'Usuário',
  filaId: 'Equipe',
  canalConfigId: 'Canal',
  situacao: 'Status',
  origem: 'Origem',
  contato: 'Contato',
  telefone: 'Número de telefone',
  protocolo: 'Protocolo',
  inicioDe: 'Data início (de)',
  inicioAte: 'Data início (até)',
  fimDe: 'Data fim (de)',
  fimAte: 'Data fim (até)',
};

export const LABEL_SITUACAO: Record<string, string> = {
  AGUARDANDO_FILA: 'Aguardando na fila',
  EM_ATENDIMENTO: 'Em atendimento',
  FINALIZADA: 'Finalizada',
};

export const LABEL_ORIGEM: Record<string, string> = { ATIVO: 'Ativo', RECEPTIVO: 'Receptivo' };

/** Campos de texto livre ou data: um valor so; os demais sao multiplos. */
export const CAMPO_DE_TEXTO: Record<CampoFiltro, 'texto' | 'data' | 'lista'> = {
  agenteId: 'lista',
  filaId: 'lista',
  canalConfigId: 'lista',
  situacao: 'lista',
  origem: 'lista',
  contato: 'texto',
  telefone: 'texto',
  protocolo: 'texto',
  inicioDe: 'data',
  inicioAte: 'data',
  fimDe: 'data',
  fimAte: 'data',
};

export function paraQuery(filtros: FiltroAplicado[], pagina: number): string {
  const p = new URLSearchParams({ pagina: String(pagina), tamanho: '10' });
  for (const f of filtros) for (const v of f.valores) if (v.trim()) p.append(f.campo, v.trim());
  return p.toString();
}

export function rotuloDoChip(f: FiltroAplicado, o: OpcoesAuditoria): string {
  const nome = (v: string) => {
    if (f.campo === 'agenteId') return o.usuarios.find((u) => u.id === v)?.nome ?? v;
    if (f.campo === 'filaId') return v === 'SEM_EQUIPE' ? 'Sem equipe' : (o.filas.find((x) => x.id === v)?.nome ?? v);
    if (f.campo === 'canalConfigId') return o.linhas.find((l) => l.id === v)?.nome ?? v;
    if (f.campo === 'situacao') return LABEL_SITUACAO[v] ?? v;
    if (f.campo === 'origem') return LABEL_ORIGEM[v] ?? v;
    if (CAMPO_DE_TEXTO[f.campo] === 'data') return new Date(`${v}T00:00:00`).toLocaleDateString('pt-BR');
    return v;
  };
  return `${LABEL_CAMPO[f.campo]}: ${f.valores.map(nome).join(', ')}`;
}
```

```bash
npx vitest run apps/web/src/features/auditoria/filtros.test.ts
```

Expected: PASS.

- [ ] **Step 3: Gaveta de filtros**

```tsx
// apps/web/src/features/auditoria/GavetaFiltros.tsx
import { useEffect, useState } from 'react';
import { Button, Input, Select } from '../../components/ui';
import { Gaveta } from '../../components/ui/Gaveta';
import { CAMPO_DE_TEXTO, LABEL_CAMPO, LABEL_ORIGEM, LABEL_SITUACAO, type CampoFiltro, type FiltroAplicado, type OpcoesAuditoria } from './filtros';

const CAMPOS = Object.keys(LABEL_CAMPO) as CampoFiltro[];

/** Gaveta "Filtrar" (PCM 30:14): linhas Filtro -> valor, + Adicionar Filtro, Aplicar. */
export function GavetaFiltros({
  aberta,
  aoFechar,
  aplicados,
  opcoes,
  aoAplicar,
}: {
  aberta: boolean;
  aoFechar: () => void;
  aplicados: FiltroAplicado[];
  opcoes: OpcoesAuditoria | null;
  aoAplicar: (filtros: FiltroAplicado[]) => void;
}) {
  const [linhas, setLinhas] = useState<FiltroAplicado[]>([]);

  useEffect(() => {
    if (aberta) setLinhas(aplicados.length ? aplicados : [{ campo: 'agenteId', valores: [] }]);
  }, [aberta, aplicados]);

  const opcoesDo = (campo: CampoFiltro): Array<{ valor: string; rotulo: string }> => {
    if (!opcoes) return [];
    if (campo === 'agenteId') return opcoes.usuarios.map((u) => ({ valor: u.id, rotulo: u.nome }));
    if (campo === 'filaId') return [{ valor: 'SEM_EQUIPE', rotulo: 'Sem equipe' }, ...opcoes.filas.map((f) => ({ valor: f.id, rotulo: f.nome }))];
    if (campo === 'canalConfigId') return opcoes.linhas.map((l) => ({ valor: l.id, rotulo: l.nome }));
    if (campo === 'situacao') return Object.entries(LABEL_SITUACAO).map(([valor, rotulo]) => ({ valor, rotulo }));
    if (campo === 'origem') return Object.entries(LABEL_ORIGEM).map(([valor, rotulo]) => ({ valor, rotulo }));
    return [];
  };

  const mudar = (i: number, f: FiltroAplicado) => setLinhas((l) => l.map((x, j) => (j === i ? f : x)));

  return (
    <Gaveta
      aberta={aberta}
      titulo="Filtrar"
      aoFechar={aoFechar}
      rodape={
        <>
          <Button variante="neutro" onClick={aoFechar}>Cancelar</Button>
          <Button
            onClick={() => {
              aoAplicar(linhas.filter((l) => l.valores.some((v) => v.trim())));
              aoFechar();
            }}
          >
            Aplicar filtro
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {linhas.map((linha, i) => {
          const tipo = CAMPO_DE_TEXTO[linha.campo];
          return (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Select
                  aria-label="Filtro"
                  value={linha.campo}
                  onChange={(e) => mudar(i, { campo: e.target.value as CampoFiltro, valores: [] })}
                >
                  {CAMPOS.map((c) => (
                    <option key={c} value={c}>{LABEL_CAMPO[c]}</option>
                  ))}
                </Select>
                <button type="button" aria-label="Remover filtro" onClick={() => setLinhas((l) => l.filter((_, j) => j !== i))} className="px-2 text-red-500">
                  🗑
                </button>
              </div>
              {tipo === 'lista' && (
                <Select
                  multiple
                  aria-label="Selecionar opções"
                  value={linha.valores}
                  onChange={(e) => mudar(i, { ...linha, valores: [...e.target.selectedOptions].map((o) => o.value) })}
                  className="h-28"
                >
                  {opcoesDo(linha.campo).map((o) => (
                    <option key={o.valor} value={o.valor}>{o.rotulo}</option>
                  ))}
                </Select>
              )}
              {tipo === 'texto' && <Input value={linha.valores[0] ?? ''} onChange={(e) => mudar(i, { ...linha, valores: [e.target.value] })} />}
              {tipo === 'data' && <Input type="date" value={linha.valores[0] ?? ''} onChange={(e) => mudar(i, { ...linha, valores: [e.target.value] })} />}
            </div>
          );
        })}
        <Button tamanho="sm" onClick={() => setLinhas((l) => [...l, { campo: 'situacao', valores: [] }])}>+ Adicionar Filtro</Button>
      </div>
    </Gaveta>
  );
}
```

- [ ] **Step 4: Página**

```tsx
// apps/web/src/pages/AuditoriaPage.tsx
import { useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, Button } from '../components/ui';
import { SkeletonBloco } from '../components/ui/Skeleton';
import { GavetaFiltros } from '../features/auditoria/GavetaFiltros';
import { LABEL_SITUACAO, paraQuery, rotuloDoChip, type FiltroAplicado, type OpcoesAuditoria } from '../features/auditoria/filtros';
import { PainelChat } from '../features/atendimento/PainelChat';
import { ApiError, api, getAccessToken } from '../lib/api';
import { EVENTOS, conectar } from '../lib/realtime';
import { telefoneLegivel } from '../lib/telefone';
import type { ConversaDetalhe, Mensagem } from '../lib/types';

type Linha = {
  id: string;
  contato: { id: string; nome: string; telefone: string | null };
  protocolo: string | null;
  linha: { id: string; nome: string } | null;
  equipe: { id: string; nome: string } | null;
  criadoEm: string;
  finalizadoEm: string | null;
  atendenteInicial: { id: string; nome: string } | null;
  origem: 'ATIVO' | 'RECEPTIVO';
  situacao: 'AGUARDANDO_FILA' | 'EM_ATENDIMENTO' | 'FINALIZADA';
};
type Pagina = { total: number; pagina: number; tamanho: number; itens: Linha[] };

const TOM: Record<Linha['situacao'], 'sucesso' | 'neutro' | 'alerta'> = {
  EM_ATENDIMENTO: 'sucesso',
  FINALIZADA: 'neutro',
  AGUARDANDO_FILA: 'alerta',
};
const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Visualizador somente leitura, ao vivo (PCM 04:24). */
function Visualizador({ id, aoVoltar }: { id: string; aoVoltar: () => void }) {
  const [conversa, setConversa] = useState<ConversaDetalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<{ conversa: ConversaDetalhe }>(`/conversas/${id}`)
      .then(({ conversa: c }) => setConversa(c))
      .catch((e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível abrir a conversa'));
    const token = getAccessToken();
    if (!token) return;
    const socket = conectar({ token });
    socket.emit('conversa:entrar', id);
    socket.on(EVENTOS.mensagemNova, ({ conversaId, mensagem }: { conversaId: string; mensagem: Mensagem }) => {
      if (conversaId !== id) return;
      setConversa((c) => (c && !c.mensagens.some((m) => m.id === mensagem.id) ? { ...c, mensagens: [...c.mensagens, mensagem] } : c));
    });
    socket.on(EVENTOS.conversaAtualizada, (c: ConversaDetalhe) => {
      if (c.id === id) setConversa((atual) => (atual ? { ...c, mensagens: atual.mensagens } : atual));
    });
    return () => {
      socket.emit('conversa:sair', id);
      socket.disconnect();
    };
  }, [id]);

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-3 py-2">
        <Button tamanho="sm" variante="neutro" onClick={aoVoltar}>← Voltar para a auditoria</Button>
      </div>
      {erro && <div className="p-4"><Alerta>{erro}</Alerta></div>}
      {!conversa && !erro && <p className="p-6 text-sm text-slate-500">Carregando conversa...</p>}
      {conversa && <div className="min-h-0 flex-1"><PainelChat conversa={conversa} onMudou={setConversa} somenteLeitura /></div>}
    </div>
  );
}

export function AuditoriaPage() {
  const [filtros, setFiltros] = useState<FiltroAplicado[]>([]);
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState<Pagina | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [opcoes, setOpcoes] = useState<OpcoesAuditoria | null>(null);
  const [gaveta, setGaveta] = useState(false);
  const [vendo, setVendo] = useState<string | null>(null);

  useEffect(() => {
    void api.get<OpcoesAuditoria>('/conversas/auditoria/opcoes').then(setOpcoes).catch(() => undefined);
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setDados(await api.get<Pagina>(`/conversas/auditoria?${paraQuery(filtros, pagina)}`));
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar a auditoria');
    } finally {
      setCarregando(false);
    }
  }, [filtros, pagina]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (vendo) return <Visualizador id={vendo} aoVoltar={() => { setVendo(null); void carregar(); }} />;

  const totalPaginas = dados ? Math.max(1, Math.ceil(dados.total / dados.tamanho)) : 1;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button variante="neutro" onClick={() => setGaveta(true)}>
          Filtrar <span className="ml-1 rounded-full bg-orange-500 px-1.5 text-xs text-white">{filtros.length}</span>
        </Button>
      </div>

      {filtros.length > 0 && opcoes && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500">Filtros aplicados:</span>
          {filtros.map((f, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { setFiltros((l) => l.filter((_, j) => j !== i)); setPagina(1); }}
              className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700 hover:bg-slate-200"
              title="Remover filtro"
            >
              {rotuloDoChip(f, opcoes)} ×
            </button>
          ))}
        </div>
      )}

      {erro && <Alerta>{erro}</Alerta>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1100px] text-left text-xs">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              {['Contato', 'Telefone', 'Protocolo', 'Canal', 'Equipe', 'Data início', 'Data fim', 'Atendente inicial', 'Origem', 'Status', 'Ações'].map((h) => (
                <th key={h} className="px-3 py-2.5 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {carregando && !dados && (
              <tr><td colSpan={11} className="p-4"><SkeletonBloco className="h-4 w-full" /></td></tr>
            )}
            {dados?.itens.length === 0 && (
              <tr><td colSpan={11} className="p-6 text-center text-slate-500">Nenhuma conversa com estes filtros.</td></tr>
            )}
            {dados?.itens.map((l) => (
              <tr key={l.id} className="hover:bg-slate-50">
                <td className="px-3 py-2">{l.contato.nome}</td>
                <td className="px-3 py-2">{l.contato.telefone ? telefoneLegivel(l.contato.telefone.replace(/\D/g, '')) : '—'}</td>
                <td className="px-3 py-2 font-mono">{l.protocolo ?? '—'}</td>
                <td className="px-3 py-2">{l.linha?.nome ?? 'Número da empresa'}</td>
                <td className="px-3 py-2">{l.equipe?.nome ?? 'Sem equipe'}</td>
                <td className="px-3 py-2">{dataHora(l.criadoEm)}</td>
                <td className="px-3 py-2">{l.finalizadoEm ? dataHora(l.finalizadoEm) : 'Não finalizado'}</td>
                <td className="px-3 py-2">{l.atendenteInicial?.nome ?? 'Não atendido'}</td>
                <td className="px-3 py-2" title={l.origem === 'ATIVO' ? 'Iniciada pela empresa' : 'Iniciada pelo cliente'}>{l.origem === 'ATIVO' ? '↗' : '↙'}</td>
                <td className="px-3 py-2"><Badge tom={TOM[l.situacao]}>{LABEL_SITUACAO[l.situacao]}</Badge></td>
                <td className="px-3 py-2">
                  <button type="button" title="Visualizar" aria-label="Visualizar conversa" onClick={() => setVendo(l.id)} className="rounded px-1.5 py-0.5 hover:bg-slate-100">
                    📄
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {dados && (
          <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
            <span>Itens {dados.itens.length} de {dados.total}</span>
            <div className="flex items-center gap-1">
              <Button tamanho="sm" variante="neutro" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>Anterior</Button>
              <span className="px-2">{pagina} / {totalPaginas}</span>
              <Button tamanho="sm" variante="neutro" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>Próximo</Button>
            </div>
          </div>
        )}
      </div>

      <GavetaFiltros
        aberta={gaveta}
        aoFechar={() => setGaveta(false)}
        aplicados={filtros}
        opcoes={opcoes}
        aoAplicar={(f) => { setFiltros(f); setPagina(1); }}
      />
    </div>
  );
}
```

- [ ] **Step 5: Rota e menu**

1. Em `App.tsx`, importar `AuditoriaPage` e acrescentar `'/auditoria': AuditoriaPage,` em `PAGINAS`.
2. Em `nav.ts`, depois do item `/monitoramento`, acrescentar:

```ts
  { rota: '/auditoria', label: 'Auditoria', icone: IconMonitoramento, perfis: ['ADMIN', 'SUPERVISOR', 'GESTOR'], fase: 3 },
```

(reaproveita o ícone do monitoramento; um ícone próprio é refinamento opcional).

- [ ] **Step 6: Testes e typecheck**

```bash
npx vitest run apps/web/src && npm run typecheck -w @plataforma/web
```

Expected: verde. Se `Select` do kit não repassar `multiple`, ele é um `<select>` com `...props` (`index.tsx:166`), então repassa.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src
git commit -m "feat(atendimento): pagina de Auditoria com filtros e visualizador ao vivo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 19: Monitor por equipe na página de Monitoramento

**Files:**
- Create: `apps/web/src/features/monitor/PainelEquipes.tsx`
- Modify: `apps/web/src/pages/MonitoramentoPage.tsx`

**Interfaces:**
- Consumes: `GET /metricas/equipes` (Task 11).
- Produces: `<PainelEquipes />` (busca e se atualiza sozinho).

- [ ] **Step 1: Componente**

```tsx
// apps/web/src/features/monitor/PainelEquipes.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alerta } from '../../components/ui';
import { ApiError, api, getAccessToken } from '../../lib/api';
import { EVENTOS, conectar } from '../../lib/realtime';

type Equipe = {
  id: string;
  nome: string;
  usuariosOnline: number;
  aguardando: number;
  emAtendimento: number;
  total: number;
  usuarios: Array<{ id: string; nome: string; status: string; caixaEntrada: number; chats: number }>;
};

function Pilula({ valor, rotulo, cor }: { valor: number; rotulo: string; cor: string }) {
  return (
    <span className={`inline-flex items-baseline gap-1.5 rounded-lg px-3 py-1.5 texto-sobre-cor-fixa ${cor}`}>
      <span className="text-lg font-semibold leading-none">{valor}</span>
      <span className="text-xs">{rotulo}</span>
    </span>
  );
}

/** Monitor de Equipes (PCM 10:18): por equipe, online e tickets; expande para a carga de cada pessoa. */
export function PainelEquipes() {
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [abertas, setAbertas] = useState<Record<string, boolean>>({});
  const [erro, setErro] = useState<string | null>(null);
  const espera = useRef<number | null>(null);

  const carregar = useCallback(async () => {
    try {
      const q = selecionadas.map((id) => `filaId=${id}`).join('&');
      const r = await api.get<{ equipes: Equipe[] }>(`/metricas/equipes${q ? `?${q}` : ''}`);
      setEquipes(r.equipes);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar as equipes');
    }
  }, [selecionadas]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Recarrega com espera de 1 s: uma rajada de mensagens nao vira uma rajada de consultas.
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const socket = conectar({ token });
    const agendar = () => {
      if (espera.current) window.clearTimeout(espera.current);
      espera.current = window.setTimeout(() => void carregar(), 1_000);
    };
    socket.on(EVENTOS.conversaNova, agendar);
    socket.on(EVENTOS.conversaAtualizada, agendar);
    socket.on(EVENTOS.agenteStatus, agendar);
    return () => {
      if (espera.current) window.clearTimeout(espera.current);
      socket.disconnect();
    };
  }, [carregar]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-800">Monitor de Equipes</h2>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {equipes.map((e) => {
            const ativa = selecionadas.length === 0 || selecionadas.includes(e.id);
            return (
              <button
                key={e.id}
                type="button"
                aria-pressed={ativa}
                onClick={() =>
                  setSelecionadas((s) => (s.includes(e.id) ? s.filter((x) => x !== e.id) : [...s, e.id]))
                }
                className={`rounded-full px-2.5 py-0.5 text-xs ${ativa ? 'bg-slate-200 text-slate-800' : 'bg-slate-50 text-slate-400'}`}
              >
                {e.nome}
              </button>
            );
          })}
        </div>
      </div>
      {erro && <Alerta>{erro}</Alerta>}
      {equipes.length === 0 && !erro && <p className="text-sm text-slate-500">Nenhuma equipe (fila) ativa cadastrada.</p>}
      {equipes.map((e) => (
        <div key={e.id} className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-lg border border-slate-200 p-2">
              <p className="mb-1 text-sm font-semibold text-slate-700">Usuários</p>
              <Pilula valor={e.usuariosOnline} rotulo="Online" cor="bg-sky-900" />
            </div>
            <div className="rounded-lg border border-slate-200 p-2">
              <p className="mb-1 text-sm font-semibold text-slate-700">Tickets</p>
              <div className="flex gap-2">
                <Pilula valor={e.aguardando} rotulo="Aguardando" cor="bg-red-700" />
                <Pilula valor={e.emAtendimento} rotulo="Atendimento" cor="bg-orange-500" />
                <Pilula valor={e.total} rotulo="Total" cor="bg-green-700" />
              </div>
            </div>
            <button
              type="button"
              aria-expanded={abertas[e.id] ?? false}
              onClick={() => setAbertas((a) => ({ ...a, [e.id]: !a[e.id] }))}
              className="ml-auto text-lg font-semibold text-slate-800"
            >
              {e.nome} {abertas[e.id] ? '˄' : '›'}
            </button>
          </div>
          {abertas[e.id] && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
              {e.usuarios.length === 0 && <p className="text-xs text-slate-500">Ninguém nesta equipe.</p>}
              {e.usuarios.map((u) => (
                <div key={u.id} className="w-52 overflow-hidden rounded-lg border border-slate-200">
                  <p className="flex items-center gap-2 bg-sky-950 px-3 py-2 text-sm font-medium texto-sobre-cor-fixa">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-xs text-sky-950">{u.nome.charAt(0)}</span>
                    {u.nome}
                    {u.status === 'OFFLINE' && <span className="ml-auto text-[10px] opacity-70">offline</span>}
                  </p>
                  <p className="flex justify-between px-3 py-2 text-xs text-slate-600">
                    <span><strong className="text-base text-slate-800">{u.caixaEntrada}</strong> caixa de entrada</span>
                    <span><strong className="text-base text-slate-800">{u.chats}</strong> chats</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
```

> Os chips de equipe filtram a consulta: com nenhum selecionado, mostra todas. Um chip desmarcado some da lista na próxima resposta. Para voltar a vê-lo, o usuário desmarca todos os outros. Esse comportamento é aceitável, mas, se o revisor preferir, troque `selecionadas` por uma lista local que só filtra a renderização (sem `filaId` na query).

- [ ] **Step 2: Usar na página**

Em `MonitoramentoPage.tsx`:
1. Importar `import { PainelEquipes } from '../features/monitor/PainelEquipes';`.
2. Colocar `<PainelEquipes />` como **primeiro** filho do `<div className="space-y-5">`, sem remover nada do que existe.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck -w @plataforma/web
```

Expected: verde.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src
git commit -m "feat(monitoramento): monitor de equipes com tickets e carga por pessoa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 20: Aviso de linha desconectada e chave "Espelhar celular"

**Files:**
- Create: `apps/web/src/components/layout/AvisoLinhasDesconectadas.tsx`
- Modify: `apps/web/src/components/layout/AppShell.tsx`
- Modify: `apps/web/src/pages/configuracoes/CanaisTab.tsx`

**Interfaces:**
- Consumes:
  - `GET /canais/linhas-desconectadas` e socket `canal:status` (Task 12);
  - `PUT /canais/numeros/:id { espelharCelular }`.

- [ ] **Step 1: Aviso**

```tsx
// apps/web/src/components/layout/AvisoLinhasDesconectadas.tsx
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthProvider';
import { api, getAccessToken } from '../../lib/api';
import { EVENTOS, conectar } from '../../lib/realtime';

type LinhaCaida = { id: string; nome: string; dono: { id: string; nome: string } | null; desde: string | null };

/**
 * Aviso dentro da plataforma quando um WhatsApp nao oficial cai (decisao de
 * 09/10/2026: sem Telegram nem e-mail). Fica ate a linha reconectar.
 */
export function AvisoLinhasDesconectadas() {
  const { temPerfil } = useAuth();
  const ve = temPerfil('ADMIN', 'SUPERVISOR');
  const [linhas, setLinhas] = useState<LinhaCaida[]>([]);

  const carregar = useCallback(async () => {
    try {
      setLinhas((await api.get<{ linhas: LinhaCaida[] }>('/canais/linhas-desconectadas')).linhas);
    } catch {
      // Aviso e conveniencia: falhar em silencio nao esconde nada que a tela de Canais nao mostre.
    }
  }, []);

  useEffect(() => {
    if (!ve) return;
    void carregar();
    const token = getAccessToken();
    if (!token) return;
    const socket = conectar({ token });
    socket.on(EVENTOS.canalStatus, () => void carregar());
    return () => {
      socket.disconnect();
    };
  }, [ve, carregar]);

  if (!ve || linhas.length === 0) return null;

  return (
    <div role="alert" className="border-b border-red-200 bg-red-50 px-6 py-2 text-sm text-red-700">
      <strong>{linhas.length === 1 ? 'WhatsApp desconectado:' : `${linhas.length} WhatsApps desconectados:`}</strong>{' '}
      {linhas
        .map((l) => `${l.nome}${l.dono ? ` (${l.dono.nome})` : ''}${l.desde ? ` desde ${new Date(l.desde).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}`)
        .join(' · ')}{' '}
      — <Link to="/configuracoes" className="underline">ler o QR Code de novo</Link>
    </div>
  );
}
```

Em `AppShell.tsx`:
1. Importar `import { AvisoLinhasDesconectadas } from './AvisoLinhasDesconectadas';`.
2. Inserir `<AvisoLinhasDesconectadas />` entre `<Topbar ... />` e `<main ...>`.

- [ ] **Step 2: Chave na aba Canais**

Em `CanaisTab.tsx`:
1. No tipo local `CanalConfig`, acrescentar `espelharCelular?: boolean;`.
2. Em `numeroVazio`, acrescentar `espelharCelular: true,`.
3. Em `editarNumero` (o `setNumeroForm` que monta o form a partir de `numero`), acrescentar `espelharCelular: numero.espelharCelular ?? true,`.
4. Em `salvarNumero`, depois de `const corpo: Record<string, unknown> = { ativo: numeroForm.ativo, modo: numeroForm.modo };`, acrescentar:

```ts
      if (numeroForm.modo === 'NAO_OFICIAL') corpo.espelharCelular = numeroForm.espelharCelular;
```

5. No formulário do número, logo depois do `Field` "Rótulo", acrescentar:

```tsx
                {numeroForm.modo === 'NAO_OFICIAL' && (
                  <label className="flex items-start gap-2 text-sm text-slate-700 sm:col-span-2">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={numeroForm.espelharCelular}
                      onChange={(e) => setNumeroForm({ ...numeroForm, espelharCelular: e.target.checked })}
                    />
                    <span>
                      Espelhar mensagens enviadas pelo celular
                      <span className="block text-xs text-slate-500">
                        O que o dono do número digitar no celular ou no WhatsApp Web aparece no histórico como “Mensagem enviada por outro dispositivo”.
                      </span>
                    </span>
                  </label>
                )}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck -w @plataforma/web
```

Expected: verde.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src
git commit -m "feat(canais): aviso de WhatsApp desconectado e chave de espelhamento por linha

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 21: Verificação final

**Files:** nenhum novo (só correções se algo falhar).

- [ ] **Step 1: Suíte, typecheck e build**

```bash
npm test && npm run typecheck && npm run build && npm run build:ponte
```

Expected: tudo verde. Anotar a contagem de testes (antes da branch eram 101 arquivos `.test.ts`; agora há 10 novos: `protocolo`, `inbound.service.propria`, `conversations.auditoria`, `equipes`, `enviadas`, `previaTexto`, `links`, `caixaEntrada`, `destinos`, `filtros`).

- [ ] **Step 2: Verificação manual no app**

Usar a skill `run` (ou `npm run dev` + `npm run dev:ponte`) **com banco isolado** (branch Neon descartável ou Postgres local; **não** o banco de dev compartilhado) e `prisma migrate deploy` aplicado nele. Usar `WHATSAPP_PROVIDER=baileys` (produção usa Baileys).

| # | Roteiro | Resultado esperado | Trecho do vídeo |
|---|---|---|---|
| 1 | Cliente manda "Oi" para a linha da empresa com fila Comercial | Grupo Comercial da Caixa de entrada ganha badge 1 em ≤ 2 s; dois navegadores veem | 27:44 |
| 2 | Atendente A e B clicam juntos no item | Um vê o toast verde e a conversa aberta; o outro vê o toast de erro "Outro atendente já assumiu" e o item some | 00:59 |
| 3 | Na conversa aceita | Pílula "Aceito por: <nome>", protocolo `AAMMDD-NNNNN` no cabeçalho, seta ↙ no card | 01:04 |
| 4 | Vendedor responde pelo celular | Bolha "Mensagem enviada por outro dispositivo" em ≤ 3 s, inclusive na Auditoria aberta; nenhuma duplicata da resposta enviada pela plataforma | 04:00–04:58 |
| 5 | Desligar "Espelhar celular" na linha e repetir 4 | Nada aparece | — |
| 6 | Menu ⋮ → Transferir → escolher Viviane (SUPORTE) | Some da lista de quem transferiu; aparece para a Viviane; evento no histórico | 31:38 |
| 7 | Menu ⋮ → Encerrar; cliente manda nova mensagem | Toast "Chat encerrado com sucesso"; novo protocolo; ao abrir, rolar ao topo mostra "dd/mm/aa - Conversa anterior - <protocolo>" | 26:50, 28:00 |
| 8 | Auditoria → Filtrar Usuário + Status | Chips "Filtros aplicados", contagem certa, remover chip refaz a busca; visualizador sem rodapé e ao vivo | 30:00–30:30 |
| 9 | Login como COMERCIAL e abrir `/auditoria` | Rota não existe no menu e redireciona | — |
| 10 | Monitoramento | Faixa por equipe com Online / Aguardando / Atendimento / Total; aceitar no Atendimento move os números | 10:18 |
| 11 | Derrubar a sessão da ponte de teste | Faixa vermelha para ADMIN/SUPERVISOR até reconectar | 34:36 (adaptado) |
| 12 | Modal "Iniciar nova conversa" | Lista só as linhas do usuário e as da empresa; criar contato no modal; toast "Conversa iniciada com sucesso"; card ↗ | 01:25, 02:35 |

- [ ] **Step 3: Revisão de código da branch**

Disparar a skill `superpowers:requesting-code-review` sobre `main...feat/atendimento-estilo-pcm` com foco na seção **Review Focus** deste plano.

- [ ] **Step 4: Registrar limitações no fim da spec**

Acrescentar ao fim de `ANALISE_VIDEO_IMPLEMENTACAO.md` uma seção "Entregue nas Fases 2 + 3" listando:
- o que foi feito (tasks 1–20);
- o que ficou de fora: fluxos, template oficial, WAHA/GOWA/WPPConnect sem espelhamento, emoji e gravação de áudio;
- as definições nossas onde o vídeo era [?]: "caixa de entrada" por usuário no Monitor; filtro Usuário = atendente inicial **ou** responsável.

Commit:

```bash
git add ANALISE_VIDEO_IMPLEMENTACAO.md
git commit -m "docs(atendimento): registro do que foi entregue nas fases 2 e 3

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
