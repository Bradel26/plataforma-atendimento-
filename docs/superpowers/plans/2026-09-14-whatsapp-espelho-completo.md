# Espelho completo do WhatsApp no Atendimento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A lista de conversas do Atendimento espelha todo o histórico de chats WhatsApp
da linha pessoal de cada vendedor (não só as `Conversation` já formalizadas), e promove
uma prévia para conversa de verdade no primeiro envio real.

**Architecture:** Novo modelo leve `ChatPreview` (uma linha por número, cache de até 30
mensagens), sincronizado por dois listeners novos na ponte (`messaging-history.set` +
`chats.upsert`) entregues por um webhook HMAC igual aos já existentes. Promoção para
`Conversation` acontece dentro dos dois pontos de entrada que já criam conversa hoje
(`registrarMensagemEntrante` e `iniciarConversa`), nunca por um terceiro caminho.

**Tech Stack:** Node/Express/Prisma/Postgres (apps/api), Baileys/Express (apps/ponte),
React/Vite (apps/web), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-whatsapp-espelho-completo-design.md`

## Global Constraints

- Migração do Prisma é **arquivo SQL escrito à mão**, aplicado com `prisma migrate
  deploy` — nunca `prisma migrate dev` (risco de shadow database, ver memória do
  projeto). Nome de pasta: `YYYYMMDDHHMMSS_previas_chat`, mesmo padrão das pastas em
  `apps/api/prisma/migrations/`.
- `ChatPreview` só existe para linha **pessoal** (`ChannelConfig.donoId` preenchido).
  Todo caminho que cria/lê prévia filtra por isso — nunca por conveniência, sempre
  porque a linha compartilhada não tem dono de celular para espelhar.
- Grupo e broadcast ficam fora, mesma regra que `recebida.ts` já aplica a mensagem ao
  vivo (`@g.us`, `status@broadcast`, `@broadcast`) e `contatoValido` já aplica a
  contato (só `@s.whatsapp.net`, `@lid` fora).
- Toda função pura ganha teste de unidade; toda função que toca Prisma ou a rede da
  ponte fica para o smoke test, seguindo a convenção documentada em
  `vitest.config.ts` (já usada por `channels.service.test.ts`, `sessao.test.ts`).
- Cache de mensagem por prévia: no máximo 30, texto/resumo apenas (sem mídia).

---

## Fase 1 — Sincronização e armazenamento

### Task 1: Modelo `ChatPreview` e migração

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (adicionar modelo, perto de `ChannelConfig`)
- Create: `apps/api/prisma/migrations/20260915090000_previas_chat/migration.sql`

**Interfaces:**
- Produces: modelo Prisma `ChatPreview` com campos `id, organizacaoId, canalConfigId,
  numero, nome, ultimaMensagem, ultimaMensagemEm, naoLidas, mensagens (Json), criadoEm,
  atualizadoEm`; relação `canalConfig: ChannelConfig`; único em
  `[canalConfigId, numero]`.

- [ ] **Step 1: Adicionar o modelo ao schema**

Em `apps/api/prisma/schema.prisma`, logo depois do fechamento de `model ChannelConfig`
(linha ~1452 em diante — procure o `}` que fecha esse modelo), adicione:

```prisma
/// Espelho do WhatsApp pessoal de um vendedor: um chat que existe no celular
/// dele mas ainda nao virou `Conversation` formal na plataforma. So-leitura
/// ate o vendedor (ou o cliente) mandar a primeira mensagem de verdade -- ai
/// vira `Conversation` e esta linha e apagada (ver `promoverPrevia`).
model ChatPreview {
  id            String @id @default(uuid())
  organizacaoId String @default("") @map("organizacao_id")
  canalConfigId String @map("canal_config_id")
  numero        String
  nome          String

  ultimaMensagem   String   @map("ultima_mensagem")
  ultimaMensagemEm DateTime @map("ultima_mensagem_em")
  naoLidas         Int      @default(0) @map("nao_lidas")

  /// Cache das ultimas ~30 mensagens (texto/resumo, sem midia), mais novo por
  /// ultimo -- formato `{ autor: 'CLIENTE'|'AGENTE', texto, criadoEm }[]`.
  mensagens Json @default("[]")

  criadoEm     DateTime @default(now()) @map("criado_em")
  atualizadoEm DateTime @updatedAt @map("atualizado_em")

  canalConfig ChannelConfig @relation(fields: [canalConfigId], references: [id], onDelete: Cascade)

  @@unique([canalConfigId, numero])
  @@index([canalConfigId, ultimaMensagemEm])
  @@map("previas_chat")
}
```

Depois, dentro de `model ChannelConfig`, ache a linha da relação `conversas
Conversation[]` (procure por `Conversation[]` dentro desse modelo) e adicione logo
abaixo:

```prisma
  previasChat ChatPreview[]
```

- [ ] **Step 2: Escrever a migração à mão**

Crie o diretório `apps/api/prisma/migrations/20260915090000_previas_chat/` com o
arquivo `migration.sql`:

```sql
-- Espelho do WhatsApp pessoal: um chat do celular do vendedor que ainda nao
-- virou Conversation formal na plataforma.
CREATE TABLE "previas_chat" (
  "id" TEXT NOT NULL,
  "organizacao_id" TEXT NOT NULL DEFAULT '',
  "canal_config_id" TEXT NOT NULL,
  "numero" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "ultima_mensagem" TEXT NOT NULL,
  "ultima_mensagem_em" TIMESTAMP(3) NOT NULL,
  "nao_lidas" INTEGER NOT NULL DEFAULT 0,
  "mensagens" JSONB NOT NULL DEFAULT '[]',
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "previas_chat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "previas_chat_canal_config_id_numero_key" ON "previas_chat"("canal_config_id", "numero");
CREATE INDEX "previas_chat_canal_config_id_ultima_mensagem_em_idx" ON "previas_chat"("canal_config_id", "ultima_mensagem_em");

ALTER TABLE "previas_chat"
  ADD CONSTRAINT "previas_chat_canal_config_id_fkey"
  FOREIGN KEY ("canal_config_id") REFERENCES "canais_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Aplicar a migração e gerar o client**

Run: `cd apps/api && npx prisma migrate deploy && npx prisma generate`
Expected: `previas_chat` criada sem erro; `npx tsc -p tsconfig.json --noEmit` limpo (o
client agora conhece `prisma.chatPreview`).

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260915090000_previas_chat
git commit -m "feat(db): adiciona ChatPreview para o espelho de WhatsApp pessoal"
```

---

### Task 2: `chat-previews.service.ts` — decisão pura + persistência

**Files:**
- Create: `apps/api/src/modules/channels/chat-previews.service.ts`
- Test: `apps/api/src/modules/channels/chat-previews.service.test.ts`

**Interfaces:**
- Consumes: `prisma` de `../../lib/prisma`.
- Produces:
  - `type MensagemPrevia = { autor: 'CLIENTE' | 'AGENTE'; texto: string; criadoEm: string }`
  - `cortarCache(mensagens: MensagemPrevia[], limite?: number): MensagemPrevia[]` — pura.
  - `salvarPrevia(dados: { canalConfigId: string; organizacaoId: string; numero: string; nome: string; ultimaMensagem: string; ultimaMensagemEm: Date; naoLidas: number; mensagens: MensagemPrevia[] }): Promise<void>`
  - `buscarPrevia(canalConfigId: string, numero: string): Promise<{ id: string; mensagens: unknown } | null>`
  - `promoverPrevia(conversaId: string, canalConfigId: string, numero: string): Promise<void>` — usado nas Tasks 6 e 7 (Fase 2).

- [ ] **Step 1: Escrever o teste que falha, para `cortarCache`**

```typescript
// apps/api/src/modules/channels/chat-previews.service.test.ts
import { describe, expect, it } from 'vitest';
import { cortarCache, type MensagemPrevia } from './chat-previews.service';

function msg(texto: string): MensagemPrevia {
  return { autor: 'CLIENTE', texto, criadoEm: '2026-09-14T10:00:00.000Z' };
}

describe('cortarCache', () => {
  it('mantem a lista intacta quando ja esta dentro do limite', () => {
    const mensagens = [msg('a'), msg('b')];
    expect(cortarCache(mensagens, 30)).toEqual(mensagens);
  });

  it('corta para as N mais recentes, descartando as mais antigas (inicio do array)', () => {
    const mensagens = [msg('antiga'), msg('do meio'), msg('recente')];
    expect(cortarCache(mensagens, 2)).toEqual([msg('do meio'), msg('recente')]);
  });

  it('usa 30 como limite padrao quando nao informado', () => {
    const mensagens = Array.from({ length: 35 }, (_, i) => msg(String(i)));
    expect(cortarCache(mensagens)).toHaveLength(30);
    expect(cortarCache(mensagens)[0]).toEqual(msg('5'));
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run apps/api/src/modules/channels/chat-previews.service.test.ts`
Expected: FAIL — `Cannot find module './chat-previews.service'`.

- [ ] **Step 3: Implementar `chat-previews.service.ts`**

```typescript
// apps/api/src/modules/channels/chat-previews.service.ts
import { prisma } from '../../lib/prisma';

export type MensagemPrevia = { autor: 'CLIENTE' | 'AGENTE'; texto: string; criadoEm: string };

const LIMITE_MENSAGENS_CACHE = 30;

/**
 * Corta o cache de mensagens de uma previa para as N mais recentes (mais novo
 * por ultimo, mesma ordem em que chegam do Baileys). Pura -- sem banco -- para
 * a ponte poder aplicar o mesmo limite antes de mandar o lote, e a API poder
 * reaplicar no recebimento sem depender de a ponte ter feito certo.
 */
export function cortarCache(
  mensagens: MensagemPrevia[],
  limite = LIMITE_MENSAGENS_CACHE,
): MensagemPrevia[] {
  return mensagens.slice(-limite);
}

/**
 * Grava (ou atualiza) a previa de um numero numa linha pessoal de WhatsApp.
 * Upsert por `[canalConfigId, numero]` -- chamado tanto na carga inicial
 * (`messaging-history.set`) quanto em atualizacoes incrementais
 * (`chats.upsert`), sempre substituindo o cache pelo mais recente que a ponte
 * mandou.
 */
export async function salvarPrevia(dados: {
  canalConfigId: string;
  organizacaoId: string;
  numero: string;
  nome: string;
  ultimaMensagem: string;
  ultimaMensagemEm: Date;
  naoLidas: number;
  mensagens: MensagemPrevia[];
}): Promise<void> {
  const mensagens = cortarCache(dados.mensagens);
  await prisma.chatPreview.upsert({
    where: { canalConfigId_numero: { canalConfigId: dados.canalConfigId, numero: dados.numero } },
    create: {
      canalConfigId: dados.canalConfigId,
      organizacaoId: dados.organizacaoId,
      numero: dados.numero,
      nome: dados.nome,
      ultimaMensagem: dados.ultimaMensagem,
      ultimaMensagemEm: dados.ultimaMensagemEm,
      naoLidas: dados.naoLidas,
      mensagens,
    },
    update: {
      nome: dados.nome,
      ultimaMensagem: dados.ultimaMensagem,
      ultimaMensagemEm: dados.ultimaMensagemEm,
      naoLidas: dados.naoLidas,
      mensagens,
    },
  });
}

/** Previa de um numero numa linha, ou null se o chat ainda nao foi sincronizado. */
export async function buscarPrevia(canalConfigId: string, numero: string) {
  return prisma.chatPreview.findUnique({
    where: { canalConfigId_numero: { canalConfigId, numero } },
  });
}
```

`promoverPrevia` fica para a Task 6 (Fase 2) — depende de `Message`/`Conversation`, que
só entram em cena quando a promoção é implementada; adicioná-la aqui sem uso ainda
violaria YAGNI.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run apps/api/src/modules/channels/chat-previews.service.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/channels/chat-previews.service.ts apps/api/src/modules/channels/chat-previews.service.test.ts
git commit -m "feat(canais): cache e persistencia de previa de chat do WhatsApp pessoal"
```

---

### Task 3: Endpoint de webhook `POST /whatsapp/:organizacaoId/chats`

**Files:**
- Modify: `apps/api/src/modules/channels/ponte.routes.ts`

**Interfaces:**
- Consumes: `configDoDestino`, `assinaturaValida`, `modoEfetivo` (já importados no
  arquivo); `salvarPrevia` de `./chat-previews.service` (Task 2).
- Produces: rota montada (o router já é montado em `/api/webhooks/ponte` por
  `app.ts:78`), path final `POST /api/webhooks/ponte/whatsapp/:organizacaoId/chats`.

- [ ] **Step 1: Adicionar o import**

Em `apps/api/src/modules/channels/ponte.routes.ts`, no topo, ao lado dos outros imports
de `./channels.service`:

```typescript
import { salvarPrevia } from './chat-previews.service';
```

- [ ] **Step 2: Adicionar o schema e a rota, logo depois da rota de contatos**

Ao final do arquivo (depois do `);` que fecha a rota `/contatos/:organizacaoId`),
adicione:

```typescript
const chatsSchema = z.object({
  /** Mesmo valor de `ChannelConfig.ponteSessao` -- identifica a linha pessoal dona dos chats. */
  sessao: z.string().trim().min(1).max(60),
  chats: z
    .array(
      z.object({
        numero: z.string().trim().min(8).max(20),
        nome: z.string().trim().min(1).max(200),
        ultimaMensagem: z.string().max(4096),
        ultimaMensagemEm: z.string().datetime(),
        naoLidas: z.number().int().min(0).max(999_999),
        mensagens: z
          .array(
            z.object({
              autor: z.enum(['CLIENTE', 'AGENTE']),
              texto: z.string().max(4096),
              criadoEm: z.string().datetime(),
            }),
          )
          .max(30),
      }),
    )
    .max(200),
});

/**
 * Sincroniza o espelho de chats do WhatsApp pessoal de um vendedor -- carga
 * inicial (`messaging-history.set`) e atualizacoes incrementais
 * (`chats.upsert`/`chats.update`) do lado da ponte.
 *
 * Mesmo padrao de seguranca das rotas acima: corpo cru + assinatura HMAC com o
 * `ponteSegredo` da linha. So se aplica a linha PESSOAL (`donoId` preenchido)
 * -- sem dono, o lote e descartado em silencio (204), porque a linha
 * compartilhada nao tem um celular unico para espelhar.
 */
ponteRoutes.post(
  '/chats/:organizacaoId',
  raw({ type: '*/*', limit: '4mb' }),
  asyncHandler(async (req, res) => {
    const organizacaoId = req.params.organizacaoId!;
    const corpoBruto = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');

    if (!(await organizacaoExiste(organizacaoId))) {
      res.status(404).json({ error: { code: 'NAO_ENCONTRADO', message: 'Organizacao nao encontrada' } });
      return;
    }

    await comOrganizacao(organizacaoId, async () => {
      let corpoJson: unknown;
      try {
        corpoJson = JSON.parse(corpoBruto.toString('utf8'));
      } catch (erro) {
        throw badRequest(
          `Corpo invalido: ${erro instanceof Error ? erro.message.slice(0, 200) : 'nao e JSON'}`,
        );
      }

      const sessaoBruta: string | null =
        typeof corpoJson === 'object' &&
        corpoJson !== null &&
        'sessao' in corpoJson &&
        typeof (corpoJson as { sessao?: unknown }).sessao === 'string' &&
        (corpoJson as { sessao: string }).sessao.trim().length > 0
          ? (corpoJson as { sessao: string }).sessao.trim()
          : null;

      const config = await configDoDestino('WHATSAPP', sessaoBruta);

      if (!config?.ativo || modoEfetivo(config.modo) !== 'NAO_OFICIAL') {
        res.status(503).json({
          error: { code: 'CANAL_INDISPONIVEL', message: 'O WhatsApp desta organizacao nao esta no modo nao oficial' },
        });
        return;
      }

      if (!config.ponteSegredo) {
        res.status(503).json({
          error: { code: 'PONTE_SEM_SEGREDO', message: 'Configure o segredo da ponte antes de receber chats' },
        });
        return;
      }

      const assinatura = req.header('x-ponte-assinatura') ?? req.header('x-hub-signature-256');
      if (!assinaturaValida(corpoBruto, assinatura, config.ponteSegredo)) {
        res.status(401).json({ error: { code: 'ASSINATURA_INVALIDA', message: 'Assinatura da ponte invalida' } });
        return;
      }

      // Linha compartilhada: nao ha dono de celular para espelhar. Descarta em
      // silencio -- 4xx aqui so faria a ponte logar erro por um caso esperado.
      if (!config.donoId) {
        res.status(204).end();
        return;
      }

      let corpo: z.infer<typeof chatsSchema>;
      try {
        corpo = chatsSchema.parse(corpoJson);
      } catch (erro) {
        throw badRequest(
          `Corpo invalido: ${erro instanceof Error ? erro.message.slice(0, 200) : 'nao e JSON'}`,
        );
      }

      for (const chat of corpo.chats) {
        await salvarPrevia({
          canalConfigId: config.id,
          organizacaoId,
          numero: chat.numero,
          nome: chat.nome,
          ultimaMensagem: chat.ultimaMensagem,
          ultimaMensagemEm: new Date(chat.ultimaMensagemEm),
          naoLidas: chat.naoLidas,
          mensagens: chat.mensagens,
        });
      }

      res.json({ ok: true, sincronizados: corpo.chats.length });
    });
  }),
);
```

- [ ] **Step 2: Rodar a suite e o typecheck**

Run: `cd apps/api && npx tsc -p tsconfig.json --noEmit && cd ../.. && npx vitest run`
Expected: typecheck limpo; suite inteira continua passando (nenhum teste cobre esta
rota ainda — cobertura vem no smoke test da Task 5).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/channels/ponte.routes.ts
git commit -m "feat(canais): endpoint de webhook para sincronizar previa de chat do WhatsApp"
```

---

### Task 4: Ponte — capturar `messaging-history.set` e `chats.upsert`

**Files:**
- Modify: `apps/ponte/src/sessao.ts`
- Modify: `apps/ponte/src/recebida.ts` (exportar `extrair` para reaproveitar)
- Test: `apps/ponte/src/sessao.test.ts`

**Interfaces:**
- Consumes: `extrair(msg: WAMessage)` exportado de `./recebida.ts` (Step 1 abaixo).
- Produces:
  - `chatValido(chat: { id: string; name?: string | null; conversationTimestamp?: number | Long | null; unreadCount?: number | null }): { numero: string; nome: string; naoLidas: number } | null` — pura, mesma forma de `contatoValido`.
  - `quandoReceberChats(handler: (sessao: Sessao, chats: ChatBruto[]) => void)` — hook injetável, mesma técnica de `quandoReceberContatos`.
  - Tipo `ChatBruto = { numero: string; nome: string; naoLidas: number; ultimaMensagemEm: number; mensagens: { autor: 'CLIENTE' | 'AGENTE'; texto: string; criadoEm: number }[] }`.

- [ ] **Step 1: Exportar `extrair` em `recebida.ts`**

Em `apps/ponte/src/recebida.ts`, troque a assinatura da função (linha 34):

```typescript
export function extrair(msg: WAMessage): Extraido | null {
```

(era `function extrair(...)`, sem `export`). E exporte também o tipo, trocando a
declaração da linha 18:

```typescript
export type Extraido = {
```

- [ ] **Step 2: Escrever o teste que falha, para `chatValido`**

Em `apps/ponte/src/sessao.test.ts`, adicione ao final do arquivo:

```typescript
describe('chatValido', () => {
  it('chat @s.whatsapp.net com nome e timestamp validos entra na sincronizacao', () => {
    expect(
      chatValido({ id: '5511999998888@s.whatsapp.net', name: 'Fulano', unreadCount: 2 }),
    ).toEqual({ numero: '5511999998888', nome: 'Fulano', naoLidas: 2 });
  });

  it('sem nome, usa o proprio numero', () => {
    expect(chatValido({ id: '5511999998888@s.whatsapp.net', unreadCount: 0 })).toEqual({
      numero: '5511999998888',
      nome: '5511999998888',
      naoLidas: 0,
    });
  });

  it('sem unreadCount, assume zero nao lidas', () => {
    expect(chatValido({ id: '5511999998888@s.whatsapp.net', name: 'Fulano' })).toEqual({
      numero: '5511999998888',
      nome: 'Fulano',
      naoLidas: 0,
    });
  });

  it('chat @lid fica de fora, mesma regra de contatoValido', () => {
    expect(chatValido({ id: '79233992933473@lid', name: 'Fulano' })).toBeNull();
  });

  it('chat de grupo (@g.us) fica de fora', () => {
    expect(chatValido({ id: '123456-78901234@g.us', name: 'Grupo da Firma' })).toBeNull();
  });
});
```

E ajuste o import no topo do arquivo para incluir `chatValido`:

```typescript
import { chatValido, contatoValido, jid, lembrarJid, numeroDoJid } from './sessao.js';
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `cd apps/ponte && npx vitest run src/sessao.test.ts`
Expected: FAIL — `chatValido is not defined` / `does not provide an export named 'chatValido'`.

**Nota antes de implementar:** os campos exatos de `Chat`/`WAMessage` (`unreadCount`,
`name`, `messageTimestamp`) vêm de `proto.IConversation`/`proto.IWebMessageInfo` do
Baileys — os nomes usados abaixo batem com o uso comum da lib, mas confirme contra
`node_modules/@whiskeysockets/baileys/lib/Types/Chat.d.ts` e o `WAMessage` já usado em
`recebida.ts` antes de compilar, e ajuste se a versão instalada divergir.

- [ ] **Step 4: Implementar `chatValido` e os listeners em `sessao.ts`**

Logo abaixo de `contatoValido` (depois da linha 106, `}`), adicione:

```typescript
/** So os campos de `Chat` do Baileys que a sincronizacao de previa usa. */
export type ChatBaileysBruto = {
  id: string;
  name?: string | null;
  unreadCount?: number | null;
};

/**
 * Decide se um chat bruto do Baileys entra no espelho de previa, e com que
 * nome/contador. Mesma regra de `contatoValido`: so numero de telefone de
 * verdade entra -- grupo (`@g.us`), broadcast e `@lid` ficam de fora.
 */
export function chatValido(c: ChatBaileysBruto): { numero: string; nome: string; naoLidas: number } | null {
  if (!c.id.endsWith('@s.whatsapp.net')) return null;

  const numero = numeroDoJid(c.id);
  if (!numero) return null;

  return { numero, nome: c.name ?? numero, naoLidas: c.unreadCount ?? 0 };
}
```

Depois, junto aos outros hooks injetáveis (perto da declaração de `aoReceberContatos`,
por volta da linha 140), adicione:

```typescript
export type ChatBruto = {
  numero: string;
  nome: string;
  naoLidas: number;
  ultimaMensagemEm: number;
  mensagens: { autor: 'CLIENTE' | 'AGENTE'; texto: string; criadoEm: number }[];
};

/**
 * Quem recebe o espelho de chats sincronizado do celular. Mesma tecnica de
 * `aoReceberContatos`: hook injetavel, para a sessao nao conhecer a
 * plataforma.
 */
let aoReceberChats: ((sessao: Sessao, chats: ChatBruto[]) => void) | null = null;

export function quandoReceberChats(handler: (sessao: Sessao, chats: ChatBruto[]) => void) {
  aoReceberChats = handler;
}
```

Por fim, dentro de `iniciarSessao` (a função que registra `sock.ev.on(...)`), logo
depois do listener de `contacts.upsert` (linha ~254, `}` que fecha esse bloco), adicione
os dois novos listeners:

```typescript
  /*
   * Carga historica completa -- dispara uma vez por conexao nova (ou quando o
   * historico do celular mudou desde a ultima vez). `messages` vem achatado
   * (todas as mensagens de todos os chats juntas), entao agrupa por
   * remetente antes de montar o lote por chat.
   */
  sock.ev.on('messaging-history.set', ({ chats, messages }) => {
    const porNumero = new Map<string, { autor: 'CLIENTE' | 'AGENTE'; texto: string; criadoEm: number }[]>();
    for (const msg of messages) {
      const remetente = msg.key?.remoteJid ?? '';
      if (remetente.endsWith('@g.us') || remetente === 'status@broadcast' || remetente.endsWith('@broadcast')) continue;
      const numero = numeroDoJid(remetente);
      if (!numero) continue;

      const extraido = extrair(msg);
      if (!extraido || !extraido.texto) continue;

      const lista = porNumero.get(numero) ?? [];
      lista.push({
        autor: msg.key?.fromMe ? 'AGENTE' : 'CLIENTE',
        texto: extraido.texto,
        criadoEm: Number(msg.messageTimestamp ?? 0) * 1000,
      });
      porNumero.set(numero, lista);
    }

    const validos: ChatBruto[] = [];
    for (const chat of chats) {
      const info = chatValido(chat as ChatBaileysBruto);
      if (!info) continue;
      const mensagens = (porNumero.get(info.numero) ?? []).sort((a, b) => a.criadoEm - b.criadoEm);
      const ultima = mensagens[mensagens.length - 1];
      if (!ultima) continue; // chat sem nenhuma mensagem de texto reconhecida: nao ha previa util a mostrar
      validos.push({ ...info, ultimaMensagemEm: ultima.criadoEm, mensagens });
    }
    if (validos.length) aoReceberChats?.(sessao, validos);
  });

  /** Atualizacao incremental depois da carga inicial: nova mensagem, contador de nao lidas mudou. */
  sock.ev.on('chats.upsert', (lista) => {
    const validos = lista
      .map((c) => chatValido(c as ChatBaileysBruto))
      .filter((c): c is { numero: string; nome: string; naoLidas: number } => c !== null)
      .map((info) => ({ ...info, ultimaMensagemEm: Date.now(), mensagens: [] as ChatBruto['mensagens'] }));
    if (validos.length) aoReceberChats?.(sessao, validos);
  });
```

E adicione `extrair` ao import do Baileys/recebida no topo do arquivo:

```typescript
import { extrair } from './recebida.js';
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run src/sessao.test.ts`
Expected: PASS (15 testes: 10 anteriores + 5 novos de `chatValido`).

- [ ] **Step 6: Commit**

```bash
git add apps/ponte/src/sessao.ts apps/ponte/src/recebida.ts apps/ponte/src/sessao.test.ts
git commit -m "feat(ponte): captura historico e atualizacoes de chat do Baileys"
```

---

### Task 5: Ponte — debounce e entrega, `GET /conversas/previas`, smoke test

**Files:**
- Create: `apps/ponte/src/chats.ts`
- Test: `apps/ponte/src/chats.test.ts`
- Modify: `apps/ponte/src/plataforma.ts`
- Modify: `apps/ponte/src/main.ts`
- Modify: `apps/api/src/modules/conversations/conversations.routes.ts`
- Modify: `apps/api/src/modules/conversations/conversations.service.ts`
- Modify: `scripts/smoke-ponte-multi.mjs`

**Interfaces:**
- Consumes: `ChatBruto` (Task 4), `salvarPrevia`/`buscarPrevia` (Task 2),
  `quandoReceberChats` (Task 4).
- Produces:
  - `GerenciadorDeChats` (classe), mesmo formato de `GerenciadorDeContatos`.
  - `entregarChats(sessao: string, chats: ChatBruto[]): Promise<boolean>` em
    `plataforma.ts`.
  - `GET /conversas/previas` → `{ previas: Array<{ id, numero, nome, ultimaMensagem, ultimaMensagemEm, naoLidas }> }`.

- [ ] **Step 1: Escrever o teste que falha, para o acumulador de chats**

```typescript
// apps/ponte/src/chats.test.ts
import { describe, expect, it } from 'vitest';
import { acumularChats } from './chats.js';
import type { ChatBruto } from './sessao.js';

function chat(numero: string, naoLidas = 0): ChatBruto {
  return { numero, nome: numero, naoLidas, ultimaMensagemEm: 1000, mensagens: [] };
}

describe('acumularChats', () => {
  it('adiciona um chat novo ao mapa', () => {
    const resultado = acumularChats(new Map(), [chat('5511999998888')]);
    expect(resultado.get('5511999998888')).toEqual(chat('5511999998888'));
  });

  it('substitui a entrada existente pela mais recente, por numero', () => {
    const atual = new Map([['5511999998888', chat('5511999998888', 1)]]);
    const resultado = acumularChats(atual, [chat('5511999998888', 3)]);
    expect(resultado.get('5511999998888')?.naoLidas).toBe(3);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd apps/ponte && npx vitest run src/chats.test.ts`
Expected: FAIL — `Cannot find module './chats.js'`.

- [ ] **Step 3: Implementar `chats.ts`**

```typescript
// apps/ponte/src/chats.ts
import type { ChatBruto } from './sessao.js';

/**
 * Mescla `novos` dentro de `atual`, por numero. Pura, mesmo papel de
 * `acumular` em `contatos.ts` -- so que aqui a entrada inteira e substituida
 * (nao so o nome), porque chat carrega previa/nao-lidas que mudam a cada
 * mensagem.
 */
export function acumularChats(atual: Map<string, ChatBruto>, novos: ChatBruto[]): Map<string, ChatBruto> {
  const resultado = new Map(atual);
  for (const c of novos) resultado.set(c.numero, c);
  return resultado;
}

const ESPERA_MS = 5_000;

/** Debounce por sessao, mesmo padrao de `GerenciadorDeContatos`. */
export class GerenciadorDeChats {
  private acumulado = new Map<string, ChatBruto>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly entregar: (chats: ChatBruto[]) => void) {}

  adicionar(chats: ChatBruto[]) {
    this.acumulado = acumularChats(this.acumulado, chats);

    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), ESPERA_MS);
    this.timer.unref?.();
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.acumulado.size === 0) return;

    const chats = [...this.acumulado.values()];
    this.acumulado = new Map();
    this.entregar(chats);
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/chats.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Entrega para a plataforma — `entregarChats` em `plataforma.ts`**

Ao final de `apps/ponte/src/plataforma.ts`, adicione (junto ao tipo `MensagemRecebida`
no topo, adicione também `import type { ChatBruto } from './sessao.js';`):

```typescript
/** Chats vao em lotes de no maximo isto por requisicao, mesmo limite de `chatsSchema` na API. */
const TAMANHO_DO_LOTE_CHATS = 200;

/**
 * Entrega o espelho de chats sincronizado do celular do vendedor. Nunca
 * lanca, mesma logica de `entregar`/`entregarContatos`.
 */
export async function entregarChats(sessao: string, chats: ChatBruto[]): Promise<boolean> {
  const endereco = `${BASE}/whatsapp/${config.organizacaoId}/chats`;

  let tudoOk = true;
  for (let i = 0; i < chats.length; i += TAMANHO_DO_LOTE_CHATS) {
    const lote = chats.slice(i, i + TAMANHO_DO_LOTE_CHATS);
    const corpo = JSON.stringify({
      sessao,
      chats: lote.map((c) => ({
        numero: c.numero,
        nome: c.nome,
        ultimaMensagem: c.mensagens[c.mensagens.length - 1]?.texto ?? '',
        ultimaMensagemEm: new Date(c.ultimaMensagemEm).toISOString(),
        naoLidas: c.naoLidas,
        mensagens: c.mensagens.map((m) => ({ ...m, criadoEm: new Date(m.criadoEm).toISOString() })),
      })),
    });
    const ok = await postComRetentativa(endereco, corpo, `${lote.length} chat(s) da sessao "${sessao}"`);
    tudoOk = tudoOk && ok;
  }
  return tudoOk;
}
```

- [ ] **Step 6: Ligar o fio em `main.ts`**

Em `apps/ponte/src/main.ts`, adicione aos imports:

```typescript
import { GerenciadorDeChats } from './chats.js';
import { entregarChats } from './plataforma.js';
import { quandoReceberChats, type ChatBruto } from './sessao.js';
```

E, ao lado do `gerenciadoresDeContatos` existente, adicione:

```typescript
const gerenciadoresDeChats = new Map<string, GerenciadorDeChats>();

quandoReceberChats((sessao, chats: ChatBruto[]) => {
  let gerenciador = gerenciadoresDeChats.get(sessao.nome);
  if (!gerenciador) {
    gerenciador = new GerenciadorDeChats((acumulados) => {
      void entregarChats(sessao.nome, acumulados);
    });
    gerenciadoresDeChats.set(sessao.nome, gerenciador);
  }
  gerenciador.adicionar(chats);
});
```

- [ ] **Step 7: `GET /conversas/previas`**

Em `apps/api/src/modules/conversations/conversations.service.ts`, adicione (perto de
`contarPorStatus`):

```typescript
/**
 * Previas de chat da linha PESSOAL do proprio solicitante -- nunca lista
 * previa de outro vendedor, e nao passa pela politica de visibilidade de
 * `Conversation` (previa e o celular do dono, nao um recurso compartilhado).
 */
export async function listarPrevias(solicitante: Solicitante) {
  const config = await prisma.channelConfig.findFirst({
    where: { canal: 'WHATSAPP', donoId: solicitante.sub },
    select: { id: true },
  });
  if (!config) return { previas: [] };

  const previas = await prisma.chatPreview.findMany({
    where: { canalConfigId: config.id },
    orderBy: { ultimaMensagemEm: 'desc' },
  });

  return {
    previas: previas.map((p) => ({
      id: p.id,
      numero: p.numero,
      nome: p.nome,
      ultimaMensagem: p.ultimaMensagem,
      ultimaMensagemEm: p.ultimaMensagemEm,
      naoLidas: p.naoLidas,
    })),
  };
}
```

Em `apps/api/src/modules/conversations/conversations.routes.ts`, adicione ao import de
`./conversations.service` a função `listarPrevias`, e a rota (antes de
`GET /contadores`, para não colidir com `GET /:id`):

```typescript
conversationsRoutes.get(
  '/previas',
  asyncHandler(async (req, res) => {
    res.json(await listarPrevias(quem(req)));
  }),
);
```

- [ ] **Step 8: Typecheck e suite completa**

Run: `cd apps/api && npx tsc -p tsconfig.json --noEmit && cd ../web && npx tsc -b --noEmit && cd ../.. && npx vitest run`
Expected: ambos limpos; suite inteira passando (nenhum teste novo de integração ainda —
vem no Step 9).

- [ ] **Step 9: Estender o smoke test**

Em `scripts/smoke-ponte-multi.mjs`, adicione um novo cenário (siga o estilo dos
cenários existentes no arquivo — login como admin, criar uma linha pessoal de teste,
depois):

```javascript
// Cenario: sincronizacao de previa de chat.
{
  const numeroDeTeste = '5511900000001';
  const corpoChats = {
    sessao: sessaoDeTeste, // reaproveita a sessao/linha pessoal ja criada acima no arquivo
    chats: [
      {
        numero: numeroDeTeste,
        nome: 'Cliente de teste (smoke)',
        ultimaMensagem: 'Oi, tudo bem?',
        ultimaMensagemEm: new Date().toISOString(),
        naoLidas: 1,
        mensagens: [
          { autor: 'CLIENTE', texto: 'Oi, tudo bem?', criadoEm: new Date().toISOString() },
        ],
      },
    ],
  };
  const corpoTexto = JSON.stringify(corpoChats);
  const assinatura = 'sha256=' + crypto.createHmac('sha256', segredoDaSessaoDeTeste).update(corpoTexto).digest('hex');

  const respostaWebhook = await fetch(`${API_URL}/api/webhooks/ponte/whatsapp/${ORG_ID}/chats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Ponte-Assinatura': assinatura },
    body: corpoTexto,
  });
  assert(respostaWebhook.ok, 'webhook de chats deveria aceitar o lote assinado');

  const respostaPrevias = await fetch(`${API_URL}/api/conversas/previas`, {
    headers: { Authorization: `Bearer ${tokenDoVendedorDeTeste}` },
  });
  const { previas } = await respostaPrevias.json();
  assert(
    previas.some((p) => p.numero === numeroDeTeste && p.ultimaMensagem === 'Oi, tudo bem?'),
    'a previa sincronizada deveria aparecer em GET /conversas/previas',
  );
  console.log('OK: previa de chat sincronizada e listada');
}
```

(Os identificadores `sessaoDeTeste`, `segredoDaSessaoDeTeste`, `tokenDoVendedorDeTeste`,
`API_URL`, `ORG_ID` já existem no arquivo — reaproveite as variáveis criadas pelos
cenários anteriores de linha pessoal, não crie uma linha nova só para isto.)

- [ ] **Step 10: Rodar o smoke test**

Run: `API_URL=http://localhost:3333 node scripts/smoke-ponte-multi.mjs` (API rodando
localmente)
Expected: todos os cenários, incluindo o novo, imprimem `OK`.

**Aviso (memória do projeto):** isto grava dados de teste na base de dev real (Neon) —
sem banco descartável neste projeto. Avise antes de rodar numa sessão onde alguém vai
testar manualmente a mesma feature em seguida, e confira depois se sobrou lixo em
`previas_chat`/`canais_config` (apagar via API real, não Prisma cru).

- [ ] **Step 11: Commit**

```bash
git add apps/ponte/src/chats.ts apps/ponte/src/chats.test.ts apps/ponte/src/plataforma.ts apps/ponte/src/main.ts apps/api/src/modules/conversations/conversations.routes.ts apps/api/src/modules/conversations/conversations.service.ts scripts/smoke-ponte-multi.mjs
git commit -m "feat(atendimento): sincroniza e lista previas de chat do WhatsApp pessoal"
```

**Fase 1 entregue: neste ponto, prévias sincronizam e aparecem em `GET
/conversas/previas`, verificável pelo smoke test, sem nenhuma mudança visível na UI
ainda.**

---

## Fase 2 — Promoção

### Task 6: `promoverPrevia` e integração em `iniciarConversa`

**Files:**
- Modify: `apps/api/src/modules/channels/chat-previews.service.ts`
- Modify: `apps/api/src/modules/channels/chat-previews.service.test.ts`
- Modify: `apps/api/src/modules/conversations/conversations.service.ts`
- Modify: `apps/api/src/modules/conversations/conversations.service.test.ts`

**Interfaces:**
- Consumes: `buscarPrevia` (Task 2).
- Produces: `promoverPrevia(conversaId: string, canalConfigId: string, numero: string): Promise<void>`.

- [ ] **Step 1: Teste que falha, para a decisão pura de mapeamento das mensagens do cache**

Em `chat-previews.service.test.ts`, adicione:

```typescript
describe('mensagensParaHistorico', () => {
  it('mapeia o cache da previa para o formato de Message, preservando ordem e data', () => {
    const cache: MensagemPrevia[] = [
      { autor: 'CLIENTE', texto: 'Oi', criadoEm: '2026-09-10T10:00:00.000Z' },
      { autor: 'AGENTE', texto: 'Ola!', criadoEm: '2026-09-10T10:01:00.000Z' },
    ];
    expect(mensagensParaHistorico('conversa-1', cache)).toEqual([
      { conversaId: 'conversa-1', autor: 'CLIENTE', conteudo: 'Oi', criadoEm: new Date('2026-09-10T10:00:00.000Z') },
      { conversaId: 'conversa-1', autor: 'AGENTE', conteudo: 'Ola!', criadoEm: new Date('2026-09-10T10:01:00.000Z') },
    ]);
  });

  it('cache vazio produz lista vazia', () => {
    expect(mensagensParaHistorico('conversa-1', [])).toEqual([]);
  });
});
```

Ajuste o import no topo do teste para incluir `mensagensParaHistorico`.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run apps/api/src/modules/channels/chat-previews.service.test.ts`
Expected: FAIL — `mensagensParaHistorico is not defined`.

- [ ] **Step 3: Implementar `mensagensParaHistorico` e `promoverPrevia`**

Em `chat-previews.service.ts`, adicione:

```typescript
/**
 * Traduz o cache de uma previa para linhas de `Message` prontas para
 * `createMany` -- pura, para dar para testar sem banco. `conversaId` vem de
 * fora porque a conversa so existe depois que quem chama a criou.
 */
export function mensagensParaHistorico(conversaId: string, cache: MensagemPrevia[]) {
  return cache.map((m) => ({
    conversaId,
    autor: m.autor,
    conteudo: m.texto,
    criadoEm: new Date(m.criadoEm),
  }));
}

/**
 * Promove uma previa (se existir) para dentro de uma `Conversation` recem-
 * criada: o cache de mensagens vira historico real, e a previa e apagada --
 * ela vira superflua, a Conversation passa a ser a fonte da verdade.
 *
 * Silenciosa se nao houver previa: o caminho normal (sem historico previo) e
 * so criar a conversa vazia, como sempre foi.
 */
export async function promoverPrevia(conversaId: string, canalConfigId: string, numero: string): Promise<void> {
  const previa = await buscarPrevia(canalConfigId, numero);
  if (!previa) return;

  const cache = previa.mensagens as unknown as MensagemPrevia[];
  if (cache.length > 0) {
    await prisma.message.createMany({ data: mensagensParaHistorico(conversaId, cache) });
    const maisRecente = cache[cache.length - 1]!;
    await prisma.conversation.update({
      where: { id: conversaId },
      data: { ultimaMensagemEm: new Date(maisRecente.criadoEm) },
    });
  }

  await prisma.chatPreview.delete({ where: { id: previa.id } });
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run apps/api/src/modules/channels/chat-previews.service.test.ts`
Expected: PASS (5 testes: 3 de `cortarCache` + 2 novos).

- [ ] **Step 5: Integrar em `iniciarConversa`**

Em `apps/api/src/modules/conversations/conversations.service.ts`:

Adicione ao import de `../channels/chat-previews.service`:

```typescript
import { promoverPrevia } from '../channels/chat-previews.service';
```

E, dentro de `iniciarConversa`, logo depois do `await prisma.conversation.create({...})`
que cria `conversa` (antes do `return { id: conversa.id }`), adicione:

```typescript
  if (destino.canalConfigId) {
    await promoverPrevia(conversa.id, destino.canalConfigId, contato.telefone!);
  }
```

(`contato.telefone!` é seguro aqui: `motivoSemTelefone` já garantiu, mais acima na
função, que o contato tem telefone.)

- [ ] **Step 6: Teste de integração para `iniciarConversa` promovendo prévia**

Este teste toca Prisma (create de `ChatPreview`, `Contact`, `ChannelConfig`) — por
convenção do projeto (`vitest.config.ts`), isto fica só no smoke test (Task 8), não em
`conversations.service.test.ts`. Pule este step de unit test; a Task 8 cobre o caminho
completo.

- [ ] **Step 7: Typecheck**

Run: `cd apps/api && npx tsc -p tsconfig.json --noEmit`
Expected: limpo.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/channels/chat-previews.service.ts apps/api/src/modules/channels/chat-previews.service.test.ts apps/api/src/modules/conversations/conversations.service.ts
git commit -m "feat(atendimento): iniciarConversa promove previa existente em vez de criar do zero"
```

---

### Task 7: Integração em `registrarMensagemEntrante`

**Files:**
- Modify: `apps/api/src/modules/channels/inbound.service.ts`

**Interfaces:**
- Consumes: `promoverPrevia` (Task 6).

- [ ] **Step 1: Adicionar o import**

```typescript
import { promoverPrevia } from './chat-previews.service';
```

- [ ] **Step 2: Promover a prévia no ramo de conversa nova**

Em `registrarMensagemEntrante` (`inbound.service.ts`), o bloco que cria `conversa`
(linhas ~96-111) fica:

```typescript
  const conversa =
    emAberto ??
    (await prisma.conversation.create({
      data: {
        canal: dados.canal,
        status: destino.agenteId ? 'ATRIBUIDO' : 'EM_ESPERA',
        contatoId: contato.id,
        filaId: destino.filaId,
        agenteId: destino.agenteId,
        atribuidoEm: destino.agenteId ? new Date() : null,
        canalConfigId: destino.canalConfigId,
        enderecoExterno: dados.enderecoExterno,
      },
    }));

  // So promove previa quando a conversa acabou de nascer -- uma ja aberta ou
  // ja foi promovida antes, ou nasceu por `iniciarConversa` (que promove no
  // proprio caminho, Task 6). `dados.telefone` e o mesmo numero usado para
  // gravar a previa (`salvarPrevia`, Task 3).
  if (nova && destino.canalConfigId && dados.telefone) {
    await promoverPrevia(conversa.id, destino.canalConfigId, dados.telefone);
  }
```

- [ ] **Step 3: Rodar a suite completa e o typecheck**

Run: `cd apps/api && npx tsc -p tsconfig.json --noEmit && cd ../.. && npx vitest run`
Expected: typecheck limpo; 636+ testes passando sem regressão (nenhum teste de unidade
cobre este ramo especificamente — banco real, fica para o smoke test).

- [ ] **Step 4: Estender o smoke test com o ciclo completo de promoção**

Em `scripts/smoke-ponte-multi.mjs`, logo depois do cenário de sincronização de prévia
(Task 5, Step 9), adicione:

```javascript
// Cenario: promocao automatica ao chegar mensagem nova do mesmo numero da previa.
{
  const idExternoDaMensagem = 'smoke-promocao-' + Date.now();
  const corpoMensagem = {
    numero: numeroDeTeste,
    sessao: sessaoDeTeste,
    nome: 'Cliente de teste (smoke)',
    texto: 'Mensagem nova, depois da previa',
    idExterno: idExternoDaMensagem,
  };
  const corpoTexto = JSON.stringify(corpoMensagem);
  const assinatura = 'sha256=' + crypto.createHmac('sha256', segredoDaSessaoDeTeste).update(corpoTexto).digest('hex');

  const respostaWebhook = await fetch(`${API_URL}/api/webhooks/ponte/whatsapp/${ORG_ID}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Ponte-Assinatura': assinatura },
    body: corpoTexto,
  });
  const resultado = await respostaWebhook.json();
  assert(respostaWebhook.ok && !resultado.duplicada, 'mensagem nova deveria criar/promover uma conversa');

  const respostaPreviasDepois = await fetch(`${API_URL}/api/conversas/previas`, {
    headers: { Authorization: `Bearer ${tokenDoVendedorDeTeste}` },
  });
  const { previas: previasDepois } = await respostaPreviasDepois.json();
  assert(
    !previasDepois.some((p) => p.numero === numeroDeTeste),
    'a previa deveria ter sumido depois de promovida a conversa',
  );

  const respostaConversas = await fetch(`${API_URL}/api/conversas?busca=${numeroDeTeste}`, {
    headers: { Authorization: `Bearer ${tokenDoVendedorDeTeste}` },
  });
  const { conversas } = await respostaConversas.json();
  assert(conversas.length > 0, 'a conversa promovida deveria aparecer na listagem');
  console.log('OK: previa promovida a conversa ao chegar mensagem nova');
}
```

- [ ] **Step 5: Rodar o smoke test**

Run: `API_URL=http://localhost:3333 node scripts/smoke-ponte-multi.mjs`
Expected: todos os cenários passam, incluindo os dois novos.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/channels/inbound.service.ts scripts/smoke-ponte-multi.mjs
git commit -m "feat(atendimento): mensagem nova do cliente promove previa existente"
```

**Fase 2 entregue: prévia vira conversa de verdade tanto quando o cliente escreve
quanto quando o vendedor inicia pela ficha do CRM, com histórico completo.**

---

## Fase 3 — UI unificada

### Task 8: Lista combinada no Atendimento

**Files:**
- Modify: `apps/web/src/features/atendimento/ListaConversas.tsx`
- Modify: `apps/web/src/pages/AtendimentoPage.tsx`

**Interfaces:**
- Consumes: `GET /conversas/previas` (Task 5).
- Produces: `ListaConversas` aceita uma prop nova `previas` e as intercala com as
  conversas por `ultimaMensagemEm` desc; clicar numa prévia chama um novo callback
  `onAbrirPrevia(numero: string)`.

- [ ] **Step 1: Ler o componente atual**

Antes de editar, leia `apps/web/src/features/atendimento/ListaConversas.tsx` por
inteiro — o subagente que executa esta task precisa do formato exato de props e do
markup de uma linha de conversa para reproduzir o mesmo visual numa linha de prévia
(nome, prévia de texto, hora, badge de não lidas, sem os controles de fila/status que só
uma conversa formal tem).

- [ ] **Step 2: Buscar prévias em `AtendimentoPage.tsx`**

Ao lado do `useEffect` que busca contadores/conversas, adicione um estado e uma busca:

```typescript
const [previas, setPrevias] = useState<Previa[]>([]);

useEffect(() => {
  void api.get<{ previas: Previa[] }>('/conversas/previas').then(({ previas }) => setPrevias(previas)).catch(() => undefined);
}, []);
```

Com o tipo, ao lado dos outros tipos do arquivo:

```typescript
type Previa = { id: string; numero: string; nome: string; ultimaMensagem: string; ultimaMensagemEm: string; naoLidas: number };
```

- [ ] **Step 3: Abrir uma prévia — promove via `iniciarConversa` reaproveitando o contato**

Uma prévia não tem `contatoId` garantido (pode não haver `Contact` cadastrado para
aquele número ainda). Adicione, em `AtendimentoPage.tsx`, ao lado de `abrir`:

```typescript
const abrirPrevia = useCallback(
  async (previa: Previa) => {
    setErroAberta(null);
    try {
      // Reaproveita o Contact existente por telefone, ou cria um minimo -- a
      // ficha completa (nome, empresa, etc.) o vendedor preenche depois, no
      // CRM, se quiser; a prioridade aqui e nao bloquear a conversa por falta
      // de cadastro.
      const { contato } = await api.post<{ contato: { id: string } }>('/contatos/por-telefone', {
        telefone: previa.numero,
        nome: previa.nome,
      });
      const { conversa } = await api.post<{ conversa: { id: string } }>('/conversas', { contatoId: contato.id });
      setPrevias((atual) => atual.filter((p) => p.id !== previa.id));
      await abrir(conversa.id);
    } catch (err) {
      setErroAberta(err instanceof ApiError ? err.message : 'Nao foi possivel abrir a conversa');
    }
  },
  [abrir],
);
```

Isto introduz uma dependência nova: um endpoint `POST /contatos/por-telefone`
(buscar-ou-criar por telefone) que **não existe ainda**. Antes de prosseguir, adicione-o:

Em `apps/api/src/modules/crm/` (ao lado de `ficha.routes.ts`), na rota de contatos
existente (verifique o arquivo de rotas de Contact — `ficha.routes.ts` ou
`contacts.routes.ts`, conforme o que o `grep` abaixo apontar):

```bash
grep -rn "contatosRoutes\|'/contatos'" apps/api/src/modules/crm/*.routes.ts
```

Adicione, no arquivo encontrado:

```typescript
const porTelefoneSchema = z.object({
  telefone: z.string().trim().min(8).max(30),
  nome: z.string().trim().min(1).max(200),
});

/**
 * Busca um Contact pelo telefone, ou cria um minimo. Usado ao abrir uma
 * previa de WhatsApp que ainda nao tem cadastro no CRM -- a conversa nao
 * pode esperar o vendedor preencher a ficha completa primeiro.
 */
router.post(
  '/contatos/por-telefone',
  validateBody(porTelefoneSchema),
  asyncHandler(async (req, res) => {
    const existente = await prisma.contact.findFirst({ where: { telefone: req.body.telefone } });
    if (existente) {
      res.json({ contato: existente });
      return;
    }
    const criado = await prisma.contact.create({
      data: { telefone: req.body.telefone, nome: req.body.nome, canalOrigem: 'WHATSAPP' },
    });
    res.status(201).json({ contato: criado });
  }),
);
```

(Ajuste `router`/imports para o nome real usado no arquivo encontrado pelo `grep`.)

- [ ] **Step 4: Intercalar prévias na lista**

Em `ListaConversas.tsx`, adicione uma prop `previas: Previa[]` e `onAbrirPrevia:
(previa: Previa) => void`, e renderize a união ordenada por data — leia o corpo atual
do componente (Step 1) para replicar exatamente as classes/estrutura de uma linha
existente, trocando só o clique (`onAbrirPrevia` em vez de `onSelecionar`) e omitindo
badges de fila/status que só existem em conversa formal.

- [ ] **Step 5: Testar manualmente**

1. Suba API, web e ponte (`npm run dev` nos três, ou os comandos que a sessão já usa).
2. Conecte uma linha pessoal de WhatsApp que já tenha histórico de conversas reais.
3. Em `/atendimento`, confirme que aparecem linhas de prévia (sem badge de fila) junto
   com conversas formais.
4. Clique numa prévia — deve abrir o histórico e permitir responder.
5. Depois de responder, confirme que a prévia sumiu da lista de prévias e a mesma
   conversa aparece agora como conversa formal (com fila/status).

- [ ] **Step 6: Rodar typecheck**

Run: `cd apps/web && npx tsc -b --noEmit && cd ../api && npx tsc -p tsconfig.json --noEmit`
Expected: ambos limpos.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/atendimento/ListaConversas.tsx apps/web/src/pages/AtendimentoPage.tsx apps/api/src/modules/crm/*.routes.ts
git commit -m "feat(atendimento): lista de conversas espelha previas de WhatsApp nao promovidas"
```

---

### Task 9: Indício de prévia na ficha do contato

**Files:**
- Modify: `apps/api/src/modules/crm/ficha.service.ts` (ou o serviço que monta a ficha
  — confirme lendo o arquivo; é o mesmo usado por `ficha.routes.ts`)
- Modify: `apps/web/src/pages/crm/ficha/FichaContato.tsx`

**Interfaces:**
- Produces: a resposta de `GET /fichas/contatos/:id` (ou rota equivalente — confirme o
  path real em `ficha.routes.ts`) ganha um campo `temPreviaWhatsapp: boolean`.

- [ ] **Step 1: Adicionar o campo na leitura da ficha**

Leia `apps/api/src/modules/crm/ficha.service.ts` para achar a função que monta os dados
da ficha de contato (procure por `toConversaResumo`/`contato.telefone` nesse arquivo —
é o ponto de montagem da resposta). Adicione, antes do `return`:

```typescript
const temPreviaWhatsapp = contato.telefone
  ? (await prisma.chatPreview.count({ where: { numero: contato.telefone } })) > 0
  : false;
```

E inclua `temPreviaWhatsapp` no objeto de retorno.

- [ ] **Step 2: Mostrar na UI**

Em `apps/web/src/pages/crm/ficha/FichaContato.tsx`, ao lado do botão "Iniciar
conversa" (adicionado em sessão anterior — procure por `iniciarConversa` no arquivo),
adicione, condicionado a `ficha.temPreviaWhatsapp`:

```tsx
{ficha.temPreviaWhatsapp && (
  <Badge variante="info">Já tem conversa no WhatsApp</Badge>
)}
```

(Confirme o nome exato do componente `Badge` e suas variantes lendo
`apps/web/src/components/ui` antes de usar — reaproveite o que já existe, não crie um
componente novo para isto.)

- [ ] **Step 3: Testar manualmente**

1. Sincronize uma prévia para um número que já é `Contact` no CRM.
2. Abra a ficha desse contato — confirme que o indício aparece antes de clicar
   "Iniciar conversa".

- [ ] **Step 4: Typecheck e suite completa**

Run: `cd apps/api && npx tsc -p tsconfig.json --noEmit && cd ../web && npx tsc -b --noEmit && cd ../.. && npx vitest run`
Expected: ambos limpos; suite inteira passando.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/crm/ficha.service.ts apps/web/src/pages/crm/ficha/FichaContato.tsx
git commit -m "feat(crm): indica na ficha quando o contato ja tem conversa no WhatsApp"
```

**Fase 3 entregue: a experiência descrita no início — conectar o WhatsApp e falar com
qualquer contato do celular, com histórico, tanto pelo Atendimento quanto pelo CRM —
está completa.**
