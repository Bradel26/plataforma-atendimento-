# Atendimento com visual e comportamento do WhatsBot-Pro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replicar, na tela de Atendimento, o comportamento e o visual do
WhatsBot-Pro: tag de IA + badge de canal na lista de conversas, botão
"Resolver", nota interna ("Mensagem Privada") e bolhas de mensagem no
estilo visual do WhatsApp.

**Architecture:** Mudança de UI + um campo novo (`Message.interno`) no
stack atual (Node/Express/Prisma + React). Nenhuma mudança na camada de
`ChannelProvider`/canais — a nota interna simplesmente nunca chama o
provider.

**Tech Stack:** Express, Prisma, Zod, React, Tailwind (classes utilitárias,
sem novo componente de design system).

**Spec:** [docs/superpowers/specs/2026-09-25-atendimento-estilo-whatsbot-design.md](../specs/2026-09-25-atendimento-estilo-whatsbot-design.md)

## Global Constraints

- `interno` em `Message` tem default `false` e é opcional em todo ponto de
  entrada — nenhum caller existente de `enviarMensagem`/`enviarArquivo`
  pode quebrar.
- Nota interna nunca chama `ChannelProvider.enviarTexto`/`enviarArquivo`
  nem `entregarParaIa`.
- `iaAtiva` no resumo de conversa é `true`, `false` ou `null` — nunca
  omitido, nunca `false` por omissão quando não se aplica (Webchat).
- Cor verde das bolhas do agente é local ao `PainelChat`, nunca reescreve
  `--brand-primary` (que é branding white-label usado em todo o app).
- Sem tema escuro forçado — a tela de Atendimento continua respeitando a
  preferência de tema do usuário.

## Review Focus

- Conversa sem `canalConfigId` (Webchat): `iaAtiva` precisa vir `null`, e a
  lista não pode quebrar nem mostrar badge de IA nenhum. (Task 3, Task 4)
- Enviar nota interna numa conversa `FINALIZADO`: continua recusando com
  400, igual ao envio normal — `interno` não é atalho pra contornar isso.
  (Task 2)
- Duas abas do rodapé (Responder / Mensagem Privada) com envio em voo: o
  estado de loading bloqueia as duas, não só a ativa. (Task 5)
- `canalConfig` virando `null` depois (canal excluído/desativado,
  `onDelete: SetNull`): resumo continua respondendo `iaAtiva: null` sem
  erro. (Task 3)
- Nota interna com anexo: mesma validação de tamanho/tipo do anexo normal,
  sem exceção pra `interno`. (Task 2)

---

### Task 1: Migration — campo `interno` em `Message`

**Files:**
- Modify: `apps/api/prisma/schema.prisma:394-413` (model `Message`)
- Create: migration gerada por `prisma migrate dev` em
  `apps/api/prisma/migrations/`

**Interfaces:**
- Produces: `Message.interno: boolean` (default `false`), disponível pro
  Prisma Client (`prisma.message.create({ data: { interno: true } })`) que
  as Tasks 2 e 3 vão usar.

- [ ] **Step 1: Adicionar o campo ao schema**

Em `apps/api/prisma/schema.prisma`, no model `Message` (por volta da linha
404, logo após `idExterno`), adicionar:

```prisma
  /// true = nota interna, visivel so a equipe; nunca sai pelo canal externo.
  /// Mesmo campo/semantica de TicketComment.interno, agora tambem em Message.
  interno       Boolean        @default(false)
```

O model completo, depois da mudança, fica:

```prisma
model Message {
  id            String         @id @default(uuid())
  organizacaoId String         @default("") @map("organizacao_id")
  conversaId    String         @map("conversa_id")
  autor         MessageAuthor
  /// Preenchido quando autor = AGENTE.
  autorId       String?        @map("autor_id")
  conteudo      String
  tipoAnexo     AttachmentType @default(TEXTO) @map("tipo_anexo")
  anexoUrl      String?        @map("anexo_url")
  /// Id da mensagem no provedor externo. Unico: o webhook da Meta reentrega.
  idExterno     String?        @unique @map("id_externo")
  /// true = nota interna, visivel so a equipe; nunca sai pelo canal externo.
  /// Mesmo campo/semantica de TicketComment.interno, agora tambem em Message.
  interno       Boolean        @default(false)
  criadoEm      DateTime       @default(now()) @map("criado_em")

  conversa     Conversation @relation(fields: [conversaId], references: [id], onDelete: Cascade)
  autorUsuario User?        @relation(fields: [autorId], references: [id], onDelete: SetNull)
  organizacao  Organizacao  @relation(fields: [organizacaoId], references: [id], onDelete: Cascade)

  @@index([organizacaoId, conversaId, criadoEm])
  @@map("mensagens")
}
```

- [ ] **Step 2: Gerar e aplicar a migration**

Rodar dentro de `apps/api`:

```bash
npx prisma migrate dev --name mensagem_interna
```

Expected: cria `apps/api/prisma/migrations/<timestamp>_mensagem_interna/migration.sql`
com `ALTER TABLE "mensagens" ADD COLUMN "interno" BOOLEAN NOT NULL DEFAULT false;`,
aplica no banco de dev local, e regenera o Prisma Client.

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(atendimento): adiciona Message.interno para nota interna"
```

---

### Task 2: Backend — nota interna nunca sai pelo canal externo

**Files:**
- Modify: `apps/api/src/modules/conversations/conversations.schemas.ts:49-51`
- Modify: `apps/api/src/modules/conversations/conversations.service.ts:366-455`
  (`enviarMensagem`, `enviarArquivo`)
- Modify: `apps/api/src/modules/conversations/conversations.serializer.ts:28-39`
  (`toMensagem`)
- Modify: `apps/api/src/modules/conversations/conversations.routes.ts:111-131`
- Test: `apps/api/src/modules/conversations/conversations.service.test.ts`

**Interfaces:**
- Consumes: `Message.interno` (Task 1).
- Produces: `enviarMensagem(solicitante, id, conteudo, interno?: boolean)`,
  `enviarArquivo(solicitante, id, arquivo, legenda?, interno?: boolean)` —
  Task 5 (frontend) vai mandar `interno` no corpo do POST.

- [ ] **Step 1: Escrever os testes que falham**

Em `apps/api/src/modules/conversations/conversations.service.test.ts`,
localizar o `describe` de `enviarMensagem` (procurar por
`describe('enviarMensagem'` ou o bloco de testes mais próximo dessa
função) e adicionar, no mesmo arquivo, seguindo o padrão de mocks já usado
nos testes vizinhos (mock de `prisma`, mock de `enviarParaCanal` /
`ChannelProvider`, mock de `entregarParaIa`):

```typescript
it('nota interna nao chama o canal nem a IA, e grava interno=true', async () => {
  const conversa = criarConversaMock({ canal: 'WHATSAPP', status: 'EM_ATENDIMENTO' });
  mockCarregarOuFalhar.mockResolvedValue(conversa);
  mockPrismaMessageCreate.mockResolvedValue(
    criarMensagemMock({ conteudo: 'nota interna de teste', interno: true }),
  );

  await enviarMensagem(SOLICITANTE, conversa.id, 'nota interna de teste', true);

  expect(mockEnviarParaCanal).not.toHaveBeenCalled();
  expect(mockEntregarParaIa).not.toHaveBeenCalled();
  expect(mockPrismaMessageCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ interno: true, idExterno: null }),
    }),
  );
});

it('sem o parametro interno, continua enviando pelo canal normalmente (regressao)', async () => {
  const conversa = criarConversaMock({ canal: 'WHATSAPP', status: 'EM_ATENDIMENTO' });
  mockCarregarOuFalhar.mockResolvedValue(conversa);
  mockEnviarParaCanal.mockResolvedValue({ idExterno: 'ext-1' });
  mockPrismaMessageCreate.mockResolvedValue(criarMensagemMock({ conteudo: 'oi', interno: false }));

  await enviarMensagem(SOLICITANTE, conversa.id, 'oi');

  expect(mockEnviarParaCanal).toHaveBeenCalled();
  expect(mockPrismaMessageCreate).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ interno: false }) }),
  );
});
```

Ajustar os nomes dos mocks (`mockCarregarOuFalhar`, `mockPrismaMessageCreate`,
`mockEnviarParaCanal`, `mockEntregarParaIa`, `criarConversaMock`,
`criarMensagemMock`, `SOLICITANTE`) para os nomes reais já usados no
arquivo — o objetivo do teste é o comportamento acima, não os nomes
exatos dos helpers existentes.

- [ ] **Step 2: Rodar os testes e confirmar que falham**

```bash
npm test -w @plataforma/api -- conversations.service.test
```

Expected: FAIL — `enviarMensagem` ainda não aceita um 4º parâmetro
`interno`, e o campo `interno` não existe na criação da mensagem.

- [ ] **Step 3: Adicionar `interno` ao schema Zod**

Em `apps/api/src/modules/conversations/conversations.schemas.ts:49-51`:

```typescript
export const enviarMensagemSchema = z.object({
  conteudo: z.string().trim().min(1, 'Escreva uma mensagem').max(4000),
  interno: z.boolean().optional().default(false),
});
```

- [ ] **Step 4: `enviarMensagem` pula canal externo e IA quando `interno`**

Em `apps/api/src/modules/conversations/conversations.service.ts`, a
assinatura e o corpo de `enviarMensagem` (linha 366) passam a:

```typescript
export async function enviarMensagem(
  solicitante: Solicitante,
  id: string,
  conteudo: string,
  interno = false,
) {
  const conversa = await carregarOuFalhar(id);
  if (conversa.status === 'FINALIZADO') throw badRequest('Conversa finalizada — nao aceita novas mensagens');

  // Responder sem ter assumido atribui a conversa ao agente automaticamente.
  const assumir = conversa.agenteId ? {} : { agenteId: solicitante.sub, atribuidoEm: new Date() };

  // Nota interna nunca sai pelo canal externo nem alimenta o motor de IA —
  // e uma anotacao entre a equipe, nao parte da conversa com o cliente.
  const envio =
    !interno && exigeEnvioExterno(conversa.canal)
      ? await enviarParaCanal(conversa.canal, conversa.enderecoExterno, conteudo, conversa.canalConfigId)
      : { idExterno: null };

  const mensagem = await prisma.message.create({
    data: {
      conversaId: id,
      autor: 'AGENTE',
      autorId: solicitante.sub,
      conteudo,
      idExterno: envio.idExterno,
      interno,
    },
  });

  await prisma.conversation.update({
    where: { id },
    data: { ...assumir, status: 'EM_ATENDIMENTO', ultimaMensagemEm: mensagem.criadoEm },
  });

  const atualizada = await publicar(id, { filaAnteriorId: conversa.filaId });
  notificarMensagem(
    { conversaId: id, mensagem: toMensagem(mensagem) },
    { conversaId: id, filaId: atualizada.fila?.id, agenteId: atualizada.agente?.id },
  );

  // Nota interna nao entra em contexto de IA (ver acima) — so agenda quando
  // a mensagem realmente saiu pro cliente.
  if (!interno) {
    void entregarParaIa(mensagem, { ...conversa, agenteId: conversa.agenteId ?? solicitante.sub });
  }

  return { mensagem: toMensagem(mensagem), conversa: atualizada };
}
```

- [ ] **Step 5: `enviarArquivo` recebe o mesmo parâmetro**

Em `apps/api/src/modules/conversations/conversations.service.ts`, a
assinatura de `enviarArquivo` (linha 415) ganha `interno = false` como
5º parâmetro, e o corpo espelha a mesma lógica:

```typescript
export async function enviarArquivo(
  solicitante: Solicitante,
  id: string,
  arquivo: { buffer: Buffer; nome: string; tipo: string },
  legenda?: string,
  interno = false,
) {
  const conversa = await carregarOuFalhar(id);
  if (conversa.status === 'FINALIZADO') throw badRequest('Conversa finalizada — nao aceita novas mensagens');

  const envio =
    !interno && exigeEnvioExterno(conversa.canal)
      ? await enviarArquivoParaCanal(conversa.canal, conversa.enderecoExterno, { ...arquivo, legenda }, conversa.canalConfigId)
      : { idExterno: null };

  const salvo = await salvar(arquivo);
  const assumir = conversa.agenteId ? {} : { agenteId: solicitante.sub, atribuidoEm: new Date() };

  const mensagem = await prisma.message.create({
    data: {
      conversaId: id,
      autor: 'AGENTE',
      autorId: solicitante.sub,
      conteudo: legenda?.trim() || salvo.nome,
      tipoAnexo: tipoAnexoDe(salvo.tipo),
      anexoUrl: salvo.url,
      idExterno: envio.idExterno,
      interno,
    },
  });

  await prisma.conversation.update({
    where: { id },
    data: { ...assumir, status: 'EM_ATENDIMENTO', ultimaMensagemEm: mensagem.criadoEm },
  });

  const atualizada = await publicar(id, { filaAnteriorId: conversa.filaId });
  notificarMensagem(
    { conversaId: id, mensagem: toMensagem(mensagem) },
    { conversaId: id, filaId: atualizada.fila?.id, agenteId: atualizada.agente?.id },
  );

  return { mensagem: toMensagem(mensagem), conversa: atualizada };
}
```

- [ ] **Step 6: Expor `interno` no formato de mensagem devolvido**

Em `apps/api/src/modules/conversations/conversations.serializer.ts:28-39`,
`toMensagem` passa a incluir o campo:

```typescript
export function toMensagem(m: MensagemDb) {
  return {
    id: m.id,
    conversaId: m.conversaId,
    autor: m.autor,
    autorId: m.autorId,
    conteudo: m.conteudo,
    tipoAnexo: m.tipoAnexo,
    anexoUrl: m.anexoUrl ? urlAssinada(m.anexoUrl) : null,
    interno: m.interno,
    criadoEm: m.criadoEm,
  };
}
```

- [ ] **Step 7: Rotas passam `interno` adiante**

Em `apps/api/src/modules/conversations/conversations.routes.ts:111-131`:

```typescript
conversationsRoutes.post(
  '/:id/mensagens',
  validateBody(enviarMensagemSchema),
  asyncHandler(async (req, res) => {
    const resultado = await enviarMensagem(quem(req), param(req, 'id'), req.body.conteudo, req.body.interno);
    res.status(201).json(resultado);
  }),
);

/** Anexo do agente: imagem, audio, video ou documento no campo `arquivo`. */
conversationsRoutes.post(
  '/:id/anexos',
  upload.single('arquivo'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Envie o arquivo no campo "arquivo"');
    const legenda = typeof req.body?.legenda === 'string' ? req.body.legenda : undefined;
    // multipart/form-data: todo campo chega como string, nao como boolean.
    const interno = req.body?.interno === 'true';
    const resultado = await enviarArquivo(
      quem(req),
      param(req, 'id'),
      { buffer: req.file.buffer, nome: req.file.originalname, tipo: req.file.mimetype },
      legenda,
      interno,
    );
    res.status(201).json(resultado);
  }),
);
```

- [ ] **Step 8: Rodar os testes e confirmar que passam**

```bash
npm test -w @plataforma/api -- conversations.service.test
```

Expected: PASS.

- [ ] **Step 9: Rodar a suíte inteira do backend (regressão)**

```bash
npm test -w @plataforma/api
```

Expected: PASS — nenhum outro teste quebrou (`enviarMensagem`/`enviarArquivo`
continuam funcionando para todo caller que não passa `interno`).

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/conversations
git commit -m "feat(atendimento): nota interna nunca sai pelo canal nem vai pra IA"
```

---

### Task 3: Backend — `iaAtiva` no resumo de conversa

**Files:**
- Modify: `apps/api/src/modules/conversations/conversations.serializer.ts:5-10,42-63`
- Test: `apps/api/src/modules/conversations/conversations.service.test.ts`
  (ou um teste dedicado de serializer, se existir um arquivo próprio — usar
  `conversations.service.test.ts` se não houver)

**Interfaces:**
- Consumes: `ChannelConfig.iaAtiva` (já existe, `apps/api/prisma/schema.prisma`).
- Produces: `toConversaResumo(c).iaAtiva: boolean | null` — Task 4
  (frontend) consome esse campo.

- [ ] **Step 1: Escrever o teste que falha**

Em `apps/api/src/modules/conversations/conversations.service.test.ts`,
próximo aos testes de `listarConversas` (ou de `toConversaResumo`, se
testado isoladamente), adicionar:

```typescript
it('resumo da conversa inclui iaAtiva do canal, e null quando nao ha canalConfigId', () => {
  const comCanal = toConversaResumo(
    criarConversaResumoMock({ canalConfig: { iaAtiva: true } }),
  );
  expect(comCanal.iaAtiva).toBe(true);

  const semCanal = toConversaResumo(criarConversaResumoMock({ canalConfig: null }));
  expect(semCanal.iaAtiva).toBeNull();
});
```

Ajustar `criarConversaResumoMock` para o helper de mock real já usado no
arquivo (ou construir o objeto inline, seguindo a forma que
`inclusaoResumo` produz — precisa ter a chave `canalConfig`).

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
npm test -w @plataforma/api -- conversations.service.test
```

Expected: FAIL — `canalConfig` não está incluído na query, e
`toConversaResumo` não devolve `iaAtiva`.

- [ ] **Step 3: Incluir `canalConfig` na query de resumo**

Em `apps/api/src/modules/conversations/conversations.serializer.ts:5-10`:

```typescript
export const inclusaoResumo = {
  contato: true,
  fila: { select: { id: true, nome: true } },
  agente: { select: { id: true, nome: true } },
  canalConfig: { select: { iaAtiva: true } },
  mensagens: { orderBy: { criadoEm: 'desc' }, take: 1 },
} satisfies Prisma.ConversationInclude;
```

- [ ] **Step 4: Devolver `iaAtiva` no resumo**

Em `apps/api/src/modules/conversations/conversations.serializer.ts:42-63`,
`toConversaResumo` ganha o campo:

```typescript
export function toConversaResumo(c: ConversaResumo) {
  const ultima = c.mensagens[0];
  return {
    id: c.id,
    canal: c.canal,
    status: c.status,
    assunto: c.assunto,
    tags: c.tags,
    naoLidas: c.naoLidas,
    arquivada: c.arquivada,
    criadoEm: c.criadoEm,
    atribuidoEm: c.atribuidoEm,
    finalizadoEm: c.finalizadoEm,
    ultimaMensagemEm: c.ultimaMensagemEm,
    contato: { id: c.contato.id, nome: c.contato.nome, email: c.contato.email, telefone: c.contato.telefone },
    fila: c.fila,
    agente: c.agente,
    // null = conversa sem canal configurado (ex. Webchat) — nao confundir
    // com false ("IA desligada"), que so se aplica quando ha canal.
    iaAtiva: c.canalConfig?.iaAtiva ?? null,
    ultimaMensagem: ultima ? toMensagem(ultima) : null,
  };
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

```bash
npm test -w @plataforma/api -- conversations.service.test
```

Expected: PASS.

- [ ] **Step 6: Rodar a suíte inteira do backend (regressão)**

```bash
npm test -w @plataforma/api
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/conversations
git commit -m "feat(atendimento): resumo de conversa inclui iaAtiva do canal"
```

---

### Task 4: Frontend — badge de IA na lista de conversas

**Files:**
- Modify: `apps/web/src/lib/types.ts:123-132,159-179`
- Modify: `apps/web/src/features/atendimento/ListaConversas.tsx:126-171`
- Test: `apps/web/src/features/atendimento/ListaConversas.test.tsx` (criar
  se não existir; se já houver testes de `ListaConversas`, adicionar nele)

**Interfaces:**
- Consumes: `iaAtiva: boolean | null` no payload de `ConversaResumo`
  (Task 3).
- Produces: nenhuma interface nova para outras tasks.

- [ ] **Step 1: Adicionar `interno` e `iaAtiva` aos tipos**

Em `apps/web/src/lib/types.ts:123-132`, `Mensagem` ganha o campo:

```typescript
export type Mensagem = {
  id: string;
  conversaId: string;
  autor: AutorMensagem;
  autorId: string | null;
  conteudo: string;
  tipoAnexo: 'TEXTO' | 'IMAGEM' | 'AUDIO' | 'VIDEO' | 'ARQUIVO';
  anexoUrl: string | null;
  interno: boolean;
  criadoEm: string;
};
```

Em `apps/web/src/lib/types.ts:159-179`, `ConversaBase` ganha o campo:

```typescript
type ConversaBase = {
  id: string;
  canal: Canal;
  status: ConversaStatus;
  assunto: string | null;
  tags: string[];
  naoLidas: number;
  arquivada: boolean;
  criadoEm: string;
  atribuidoEm: string | null;
  finalizadoEm: string | null;
  ultimaMensagemEm: string;
  contato: Contato;
  fila: { id: string; nome: string } | null;
  agente: { id: string; nome: string } | null;
  /** Estado de IA do canal desta conversa. Null = conversa sem canal (ex. Webchat). */
  iaAtiva: boolean | null;
};
```

- [ ] **Step 2: Escrever o teste que falha**

Criar/editar `apps/web/src/features/atendimento/ListaConversas.test.tsx`
seguindo o padrão de testes de componente já usado no projeto (procurar um
teste de componente vizinho, ex. em `apps/web/src/features/atendimento/`,
pra copiar o setup de `render`/Testing Library já convencionado):

```typescript
it('mostra badge IA ON quando iaAtiva=true, IA OFF quando false, e nenhum quando null', () => {
  const conversas = [
    criarConversaMock({ id: 'c1', iaAtiva: true }),
    criarConversaMock({ id: 'c2', iaAtiva: false }),
    criarConversaMock({ id: 'c3', iaAtiva: null }),
  ];

  render(
    <ListaConversas
      conversas={conversas}
      previas={[]}
      onAbrirPrevia={() => {}}
      selecionadaId={null}
      onSelecionar={() => {}}
      carregando={false}
    />,
  );

  expect(screen.getByText('IA ON')).toBeInTheDocument();
  expect(screen.getByText('IA OFF')).toBeInTheDocument();
  expect(screen.queryAllByText(/^IA (ON|OFF)$/)).toHaveLength(2);
});
```

Ajustar `criarConversaMock` para o helper real de mock de `ConversaResumo`
já usado nos testes do projeto (ou construir o objeto inline com todos os
campos obrigatórios de `ConversaResumo`).

- [ ] **Step 3: Rodar o teste e confirmar que falha**

```bash
npm test -w @plataforma/web -- ListaConversas
```

Expected: FAIL — nenhum badge de IA é renderizado ainda.

- [ ] **Step 4: Renderizar o badge**

Em `apps/web/src/features/atendimento/ListaConversas.tsx`, dentro do bloco
de `item.tipo === 'conversa'` (linha 152-161), logo depois do badge de
canal:

```tsx
<div className="mt-1.5 flex items-center gap-1.5">
  <Badge tom="neutro">{c.canal}</Badge>
  {c.iaAtiva !== null && (
    <Badge tom={c.iaAtiva ? 'sucesso' : 'neutro'}>{c.iaAtiva ? 'IA ON' : 'IA OFF'}</Badge>
  )}
  {c.fila && <Badge tom="neutro">{c.fila.nome}</Badge>}
  {c.agente && <Badge tom="marca">{c.agente.nome}</Badge>}
  {c.naoLidas > 0 && (
    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-semibold text-white">
      {c.naoLidas}
    </span>
  )}
</div>
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

```bash
npm test -w @plataforma/web -- ListaConversas
```

Expected: PASS.

- [ ] **Step 6: Rodar a suíte inteira do frontend (regressão)**

```bash
npm test -w @plataforma/web
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/types.ts apps/web/src/features/atendimento/ListaConversas.tsx apps/web/src/features/atendimento/ListaConversas.test.tsx
git commit -m "feat(atendimento): badge de IA ON/OFF na lista de conversas"
```

---

### Task 5: Frontend — botão "Resolver" e nota interna no painel de chat

**Files:**
- Modify: `apps/web/src/features/atendimento/PainelChat.tsx:37-63,306-312,387-431`
- Test: `apps/web/src/features/atendimento/PainelChat.test.tsx` (criar se
  não existir; se já houver testes de `PainelChat`, adicionar nele)

**Interfaces:**
- Consumes: `Mensagem.interno` (Task 4, tipo já atualizado);
  `POST /conversas/:id/mensagens` aceitando `interno` no corpo (Task 2).
- Produces: nenhuma interface nova para outras tasks (Task 6 modifica o
  mesmo arquivo depois, mas em outra região — o visual das bolhas).

- [ ] **Step 1: Escrever os testes que falham**

Em `apps/web/src/features/atendimento/PainelChat.test.tsx`, seguindo o
setup de mock de `api` já usado nos testes vizinhos do projeto (mock de
`apps/web/src/lib/api.ts`):

```typescript
it('renderiza o botao como "Resolver" (nao mais "Finalizar")', () => {
  render(<PainelChat conversa={criarConversaDetalheMock()} agentes={[]} onMudou={() => {}} />);
  expect(screen.getByRole('button', { name: 'Resolver' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Finalizar' })).not.toBeInTheDocument();
});

it('aba Mensagem Privada envia interno=true; aba Responder envia interno=false', async () => {
  const postMock = vi.spyOn(api, 'post').mockResolvedValue({
    mensagem: criarMensagemMock(),
    conversa: criarConversaDetalheMock(),
  });
  const user = userEvent.setup();
  render(<PainelChat conversa={criarConversaDetalheMock()} agentes={[]} onMudou={() => {}} />);

  await user.click(screen.getByRole('tab', { name: 'Mensagem Privada' }));
  await user.type(screen.getByPlaceholderText(/nota interna/i), 'anotacao interna');
  await user.click(screen.getByRole('button', { name: 'Enviar' }));

  expect(postMock).toHaveBeenCalledWith(
    expect.stringContaining('/mensagens'),
    expect.objectContaining({ interno: true }),
  );
});

it('mensagem com interno=true mostra o selo "Nota interna"', () => {
  const conversa = criarConversaDetalheMock({
    mensagens: [criarMensagemMock({ interno: true, conteudo: 'so a equipe ve' })],
  });
  render(<PainelChat conversa={conversa} agentes={[]} onMudou={() => {}} />);
  expect(screen.getByText('Nota interna')).toBeInTheDocument();
});
```

Ajustar os helpers de mock (`criarConversaDetalheMock`, `criarMensagemMock`)
e o import de `api`/`userEvent` para o padrão real já usado nos testes
vizinhos do projeto.

- [ ] **Step 2: Rodar os testes e confirmar que falham**

```bash
npm test -w @plataforma/web -- PainelChat
```

Expected: FAIL.

- [ ] **Step 3: Renomear o botão "Finalizar" para "Resolver"**

Em `apps/web/src/features/atendimento/PainelChat.tsx:311`, trocar só o
texto:

```tsx
              <Button
                variante="perigo"
                disabled={ocupado}
                onClick={() => void executar(() => api.post(`/conversas/${conversa.id}/finalizar`))}
              >
                Resolver
              </Button>
```

- [ ] **Step 4: Estado de duas abas no rodapé**

No topo do componente `PainelChat` (onde já existem os `useState`
existentes, ex. `const [texto, setTexto] = useState('')`), adicionar:

```typescript
const [abaRodape, setAbaRodape] = useState<'responder' | 'privada'>('responder');
const [textoPrivado, setTextoPrivado] = useState('');
```

- [ ] **Step 5: Selo "Nota interna" na bolha**

Em `apps/web/src/features/atendimento/PainelChat.tsx:37-63`, o componente
`Bolha` passa a checar `mensagem.interno` antes dos outros dois branches:

```tsx
function Bolha({ mensagem }: { mensagem: Mensagem }) {
  if (mensagem.autor === 'SISTEMA') {
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
          <p className="mb-1 text-xs font-semibold text-amber-700">Nota interna</p>
          <Anexo mensagem={mensagem} />
          <p className="whitespace-pre-wrap break-words">{mensagem.conteudo}</p>
          <p className="mt-1 text-right text-[10px] text-amber-700/70">{hora(mensagem.criadoEm)}</p>
        </div>
      </li>
    );
  }

  const doAgente = mensagem.autor === 'AGENTE';
  return (
    <li className={`flex ${doAgente ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
          doAgente ? 'text-white' : 'border border-slate-200 bg-white text-slate-800'
        }`}
        style={doAgente ? { backgroundColor: 'var(--brand-primary)' } : undefined}
      >
        <Anexo mensagem={mensagem} />
        <p className="whitespace-pre-wrap break-words">{mensagem.conteudo}</p>
        <p className={`mt-1 text-right text-[10px] ${doAgente ? 'text-white/70' : 'text-slate-500'}`}>
          {hora(mensagem.criadoEm)}
        </p>
      </div>
    </li>
  );
}
```

(A cor real da bolha do agente muda na Task 6 — aqui só o branch de nota
interna é novo, o resto do componente fica como está.)

- [ ] **Step 6: Rodapé com as duas abas**

Em `apps/web/src/features/atendimento/PainelChat.tsx:387-431`, o `<footer>`
passa a:

```tsx
      <footer className="border-t border-slate-200 bg-white p-4">
        <div className="mx-auto max-w-3xl">
        {erro && <div className="mb-3"><Alerta>{erro}</Alerta></div>}
        {finalizada ? (
          <p className="text-center text-sm text-slate-500">
            Atendimento finalizado em {new Date(conversa.finalizadoEm!).toLocaleString('pt-BR')}.
          </p>
        ) : (
          <>
            <div role="tablist" className="mb-2 flex gap-1 border-b border-slate-200">
              <button
                type="button"
                role="tab"
                aria-selected={abaRodape === 'responder'}
                onClick={() => setAbaRodape('responder')}
                className={`px-3 py-1.5 text-sm font-medium ${
                  abaRodape === 'responder'
                    ? 'border-b-2 border-[var(--brand-primary)] text-[var(--brand-primary)]'
                    : 'text-slate-500'
                }`}
              >
                Responder
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={abaRodape === 'privada'}
                onClick={() => setAbaRodape('privada')}
                className={`px-3 py-1.5 text-sm font-medium ${
                  abaRodape === 'privada' ? 'border-b-2 border-amber-500 text-amber-700' : 'text-slate-500'
                }`}
              >
                Mensagem Privada
              </button>
            </div>

            {abaRodape === 'responder' ? (
              <form onSubmit={enviar} className="flex items-end gap-2">
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void enviar(e);
                    }
                  }}
                  rows={2}
                  placeholder="Escreva sua resposta... (Enter envia, Shift+Enter quebra linha)"
                  className="max-h-32 min-h-[44px] flex-1 resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--brand-primary)]"
                />
                <label
                  title="Anexar arquivo"
                  className="flex h-[44px] cursor-pointer items-center rounded-lg border border-slate-300 px-3 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Anexar
                  <input
                    type="file"
                    className="hidden"
                    disabled={ocupado}
                    onChange={(e) => {
                      const arquivo = e.target.files?.[0];
                      e.target.value = '';
                      if (arquivo) void anexar(arquivo);
                    }}
                  />
                </label>
                <Button type="submit" disabled={ocupado || !texto.trim()}>
                  Enviar
                </Button>
              </form>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!textoPrivado.trim() || ocupado) return;
                  setOcupado(true);
                  setErro(null);
                  try {
                    const { conversa: nova } = await api.post<{ conversa: typeof conversa }>(
                      `/conversas/${conversa.id}/mensagens`,
                      { conteudo: textoPrivado, interno: true },
                    );
                    onMudou(nova);
                    setTextoPrivado('');
                  } catch (err) {
                    setErro(err instanceof ApiError ? err.message : 'Falha ao enviar a nota interna');
                  } finally {
                    setOcupado(false);
                  }
                }}
                className="flex items-end gap-2"
              >
                <textarea
                  value={textoPrivado}
                  onChange={(e) => setTextoPrivado(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      (e.target as HTMLTextAreaElement).form?.requestSubmit();
                    }
                  }}
                  rows={2}
                  placeholder="Escreva uma nota interna... so a equipe ve (Enter envia, Shift+Enter quebra linha)"
                  className="max-h-32 min-h-[44px] flex-1 resize-y rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm outline-none focus:border-amber-500"
                />
                <Button type="submit" disabled={ocupado || !textoPrivado.trim()}>
                  Enviar
                </Button>
              </form>
            )}
          </>
        )}
        </div>
      </footer>
```

`ocupado` já é compartilhado pelos dois formulários (mesmo estado usado
pelo formulário "Responder" e pelo `anexar`) — os dois botões "Enviar"
desabilitam juntos quando qualquer envio está em voo, cobrindo o caso do
Review Focus (envio simultâneo pelas duas abas).

- [ ] **Step 7: Rodar os testes e confirmar que passam**

```bash
npm test -w @plataforma/web -- PainelChat
```

Expected: PASS.

- [ ] **Step 8: Rodar a suíte inteira do frontend (regressão)**

```bash
npm test -w @plataforma/web
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/features/atendimento/PainelChat.tsx apps/web/src/features/atendimento/PainelChat.test.tsx
git commit -m "feat(atendimento): botao Resolver e aba de nota interna (Mensagem Privada)"
```

---

### Task 6: Frontend — bolhas de mensagem estilo WhatsApp

**Files:**
- Modify: `apps/web/src/features/atendimento/PainelChat.tsx:37-63,365`

**Interfaces:**
- Consumes: componente `Bolha` já modificado na Task 5 (branch de
  `interno` incluído — esta task só muda o branch normal/`doAgente` e o
  fundo da área de mensagens).
- Produces: nenhuma interface nova.

Esta task é puramente visual — sem novo estado, sem nova chamada de API.
Cobertura de teste automatizado não se aplica a CSS/aparência; a
verificação é visual (Step 3).

- [ ] **Step 1: Fundo com padrão estilo WhatsApp na área de mensagens**

Em `apps/web/src/features/atendimento/PainelChat.tsx:365`, o container da
lista de mensagens troca `bg-slate-50` por um fundo bege com padrão SVG
embutido (sem depender de asset externo):

```tsx
      <div
        className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
        style={{
          backgroundColor: '#efeae2',
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Cg fill='none' stroke='%23d9d2c7' stroke-width='1'%3E%3Ccircle cx='20' cy='20' r='6'/%3E%3Ccircle cx='60' cy='60' r='6'/%3E%3Cpath d='M40 10 L46 20 L40 30 L34 20 Z'/%3E%3Cpath d='M10 50 L16 60 L10 70 L4 60 Z'/%3E%3C/g%3E%3C/svg%3E\")",
        }}
      >
```

(Mantém as classes `min-h-0 flex-1 overflow-y-auto px-5 py-4` — só sai
`bg-slate-50` da lista de classes porque a cor de fundo passa a vir do
`style`.)

- [ ] **Step 2: Bolha do agente em verde estilo WhatsApp**

Em `apps/web/src/features/atendimento/PainelChat.tsx`, o branch
`doAgente` do componente `Bolha` (editado na Task 5) muda a cor de fundo e
adiciona o checkmark:

```tsx
  const doAgente = mensagem.autor === 'AGENTE';
  return (
    <li className={`flex ${doAgente ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
          doAgente ? 'text-slate-800' : 'border border-slate-200 bg-white text-slate-800'
        }`}
        style={doAgente ? { backgroundColor: '#d9fdd3' } : undefined}
      >
        <Anexo mensagem={mensagem} />
        <p className="whitespace-pre-wrap break-words">{mensagem.conteudo}</p>
        <p className="mt-1 flex items-center justify-end gap-1 text-right text-[10px] text-slate-500">
          {hora(mensagem.criadoEm)}
          {doAgente && (
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

Nota: `--brand-primary` não é mais usado nesta bolha (era usado como
`backgroundColor` antes) — a cor verde é fixa, conforme o Global
Constraint desta plan. A bolha do cliente (branca) e a de `SISTEMA`
(pill cinza, branch já existente antes de `Bolha`) não mudam.

- [ ] **Step 3: Verificação visual manual**

Com o dev server rodando (`npm run dev`), abrir `/atendimento`, abrir uma
conversa com histórico e confirmar visualmente:
- Fundo da área de mensagens com o padrão bege.
- Bolha do agente em verde claro, com o checkmark duplo ao lado da hora.
- Bolha do cliente continua branca, sem checkmark.
- Nota interna (Task 5) continua amarela, distinta das duas.

- [ ] **Step 4: Rodar a suíte inteira do frontend (regressão)**

```bash
npm test -w @plataforma/web
```

Expected: PASS — mudança é só de classes/estilo, nenhum teste de texto ou
comportamento deveria quebrar.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/atendimento/PainelChat.tsx
git commit -m "feat(atendimento): bolhas de mensagem estilo WhatsApp (fundo, verde, checkmark)"
```
