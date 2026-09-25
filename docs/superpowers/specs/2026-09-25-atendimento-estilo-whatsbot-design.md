# Atendimento com visual e comportamento do WhatsBot-Pro — Design

## Contexto

O usuário mostrou prints do WhatsBot-Pro (app de referência, stack Python/FastAPI
+ `gowa`, fora deste repositório) e pediu que a tela de Atendimento
(`apps/web/src/pages/AtendimentoPage.tsx`) replique o comportamento e o visual
daquele app: lista de conversas com badge de canal + tag de IA, botão
"Resolver" na conversa aberta, uma aba de "Mensagem Privada" (nota interna) e
bolhas de mensagem no estilo visual do WhatsApp (fundo com padrão, bolhas
brancas/verdes, hora, checkmark).

Decisão confirmada com o usuário: **reescrever a lógica no stack atual
(Node/Express/Prisma + React)**, no mesmo espírito da decisão tomada para o
GOWA — nunca rodar o WhatsBot-Pro (Python) como serviço à parte. Não há
nenhuma mudança de arquitetura de canais/providers aqui: é puramente a camada
de UI de Atendimento + um campo novo em `Message`.

## Fora de escopo

- Qualquer coisa do WhatsBot-Pro que não seja: badge de canal/IA na lista,
  botão Resolver, nota interna, visual das bolhas de mensagem.
- Tema escuro forçado (o usuário decidiu manter a preferência de tema atual).
- IA por conversa individual (a tag reflete o estado do **canal/número**,
  `ChannelConfig.iaAtiva`, não um controle novo por conversa).
- Confirmação de entrega/leitura real (double-check azul). Não existe hoje
  rastreio de ack por mensagem de agente em nenhum provider — construir isso
  exigiria um webhook de status por provider, fora do pedido original. O
  check exibido é estático: uma marca de "mensagem enviada", sempre visível
  em toda mensagem do agente, sem segundo estado.

## 1. Tag de IA e badge de canal na lista de conversas

**Arquivos:**
- `apps/api/src/modules/conversations/conversations.service.ts` (serializer
  `toResumo`/equivalente que monta `ConversaResumo`)
- `apps/web/src/lib/types.ts` (`ConversaResumo`)
- `apps/web/src/features/atendimento/ListaConversas.tsx`

`Conversation.canalConfigId` já aponta para o `ChannelConfig` que tem
`iaAtiva`. O backend passa a incluir, no resumo de cada conversa,
`iaAtiva: boolean | null` (null quando a conversa não tem `canalConfigId`,
ex. Webchat) — resolvido com um único `include: { canalConfig: { select: {
iaAtiva: true } } }` na query que já busca a lista (evita N+1).

No frontend, cada item de `ListaConversas.tsx` ganha, ao lado do badge de
canal (`<Badge tom="neutro">{c.canal}</Badge>`, linha 153), um segundo badge:
`IA ON` (tom sucesso) quando `c.iaAtiva === true`, `IA OFF` (tom neutro)
quando `c.iaAtiva === false`. Quando `iaAtiva` é `null` (sem canal
configurado, ex. Webchat), nenhum badge de IA aparece.

## 2. Botão "Resolver"

**Arquivo:** `apps/web/src/features/atendimento/PainelChat.tsx:311`

Troca só o texto do botão existente, de "Finalizar" para "Resolver". Mesmo
`onClick`, mesmo endpoint (`POST /conversas/:id/finalizar`), mesma variante
(`perigo`), mesma posição. Nenhuma mudança de comportamento — só o rótulo,
para casar com o vocabulário do WhatsBot-Pro.

## 3. Nota interna / "Mensagem Privada"

### 3.1 Banco de dados

**Arquivo:** `apps/api/prisma/schema.prisma`, model `Message` (linha ~394)

```prisma
model Message {
  id            String         @id @default(uuid())
  organizacaoId String         @default("") @map("organizacao_id")
  conversaId    String         @map("conversa_id")
  autor         MessageAuthor
  autorId       String?        @map("autor_id")
  conteudo      String
  tipoAnexo     AttachmentType @default(TEXTO) @map("tipo_anexo")
  anexoUrl      String?        @map("anexo_url")
  idExterno     String?        @unique @map("id_externo")
  /// true = nota interna, visivel so a equipe; nunca sai pelo canal externo.
  /// Mesmo campo/semantica de TicketComment.interno, agora tambem em Message.
  interno       Boolean        @default(false)
  criadoEm      DateTime       @default(now()) @map("criado_em")
  ...
}
```

Nova migration (`npx prisma migrate dev --name mensagem_interna` dentro de
`apps/api`), seguindo o padrão das migrations existentes do projeto.

### 3.2 Backend — nunca sai pelo canal externo

**Arquivo:** `apps/api/src/modules/conversations/conversations.service.ts`

`enviarMensagem(solicitante, id, conteudo, interno = false)` — novo parâmetro
opcional, default `false` (compatível com todo caller existente). Quando
`interno === true`:

- **Pula inteiramente** o bloco `exigeEnvioExterno(conversa.canal) ?
  await enviarParaCanal(...)` (linha 375-377) — nunca chama
  `ChannelProvider.enviarTexto`. `envio.idExterno` fica `null`
  incondicionalmente.
- **Pula** a chamada `entregarParaIa(...)` (linha 404) — nota interna não é
  contexto de conversa com o cliente, não deve ir para o motor de IA externo.
- Grava a `Message` normalmente, com `interno: true`, e ainda atualiza
  `ultimaMensagemEm`/`status` da conversa e notifica via realtime
  (`notificarMensagem`) — a nota precisa aparecer ao vivo pros outros
  agentes vendo a mesma conversa, exatamente como uma mensagem normal.

Mesma mudança em `enviarArquivo` (linha 415), com o mesmo parâmetro
`interno`, pulando `enviarArquivoParaCanal` quando `true`.

**Arquivo:** `apps/api/src/modules/conversations/conversations.schemas.ts`
(ou onde vive `enviarMensagemSchema`) — adiciona campo opcional
`interno: z.boolean().optional().default(false)` ao schema Zod validado em
`POST /conversas/:id/mensagens`.

**Arquivo:** `apps/api/src/modules/conversations/conversations.routes.ts:114`
— passa `req.body.interno` para `enviarMensagem`.

### 3.3 Frontend — nova aba no rodapé

**Arquivo:** `apps/web/src/features/atendimento/PainelChat.tsx`

O `<footer>` (linha 387-431) ganha, acima do formulário existente, duas
abas: **"Responder"** (o formulário atual, sem mudanças de comportamento) e
**"Mensagem Privada"** (novo `textarea` próprio, mesmo padrão de Enter
envia/Shift+Enter quebra linha, mesmo botão "Anexar" reaproveitado — mas
todo envio feito nessa aba manda `interno: true` no corpo do POST). Estado
local `abaRodape: 'responder' | 'privada'` controla qual formulário
renderiza; trocar de aba não perde o texto já digitado na outra (dois
estados de texto separados, um por aba).

`api.post('/conversas/:id/mensagens', { conteudo, interno: abaRodape ===
'privada' })`.

### 3.4 Frontend — destaque visual da nota interna

**Arquivo:** `apps/web/src/features/atendimento/PainelChat.tsx`, componente
`Bolha` (linha 37-63)

Quando `mensagem.interno === true`: fundo amarelo claro (`bg-amber-50
border border-amber-200`) em vez do azul/branco normal, independente de
`autor` (nota interna é sempre do agente, mas o estilo não usa o branch
`doAgente` — usa um terceiro branch dedicado, checado antes dos outros
dois). Um selo "Nota interna" (texto pequeno, `text-amber-700`) aparece
acima do conteúdo da bolha. Continua alinhada à direita (mesma lateral das
mensagens do agente).

## 4. Bolhas de mensagem — visual estilo WhatsApp

**Arquivo:** `apps/web/src/features/atendimento/PainelChat.tsx`

- **Fundo da área de mensagens** (`<div className="min-h-0 flex-1
  overflow-y-auto bg-slate-50 px-5 py-4">`, linha 365): troca
  `bg-slate-50` por um fundo bege com padrão repetido estilo WhatsApp
  (`background-color: #efeae2` + um `background-image` SVG tileable
  embutido como data URI, mesmo princípio do padrão de doodles do
  WhatsApp Web — sem depender de asset externo).
- **Bolha do cliente** (branca): mantém `border border-slate-200 bg-white
  text-slate-800`, já é o visual atual — sem mudança.
- **Bolha do agente** (hoje `--brand-primary` azul): passa a usar o verde
  característico do WhatsApp (`#d9fdd3` fundo, texto escuro — WhatsApp usa
  bolha clara mesmo do lado do remetente, não preenchimento sólido colorido)
  **só dentro deste componente** — não mexe na variável global
  `--brand-primary` (que é usada em botões/marca em toda a plataforma).
  Cor fixa neste componente, não white-label.
- **Checkmark**: mensagem do agente (`doAgente && !mensagem.interno`) ganha
  um ícone de check duplo cinza (✓✓, SVG inline) ao lado da hora, sempre no
  mesmo estado visual (não há segundo estado azul de "lida" — ver "Fora de
  escopo"). Mensagem do cliente e nota interna não mostram checkmark.

## Testes

- Backend: teste de `enviarMensagem` com `interno: true` confirmando que
  `ChannelProvider.enviarTexto` (mock) **não** é chamado, `entregarParaIa`
  **não** é chamado, e a `Message` criada tem `interno: true`,
  `idExterno: null`.
- Backend: teste de regressão confirmando que `enviarMensagem` sem o
  parâmetro (chamada antiga) continua enviando pelo canal normalmente —
  `interno` default `false` não quebra nenhum caller existente.
- Backend: serializer de lista de conversas devolve `iaAtiva: true/false`
  quando a conversa tem `canalConfigId`, e `null` quando não tem (Webchat).
- Frontend: `ListaConversas` renderiza o badge `IA ON`/`IA OFF` condicionado
  a `c.iaAtiva`, e nenhum badge quando `null`.
- Frontend: mensagem com `interno: true` nunca aparece misturada como se
  fosse uma resposta normal — sempre com o selo "Nota interna" visível.
- Frontend: trocar de aba (Responder ↔ Mensagem Privada) preserva o texto
  digitado em cada uma.

## Review Focus

- Conversa sem `canalConfigId` (ex. Webchat, que nunca teve canal de
  WhatsApp): lista não deve quebrar nem mostrar tag de IA errada — `iaAtiva`
  precisa ser `null`, tratado explicitamente, nunca `false` por omissão (que
  pareceria "IA desligada" em vez de "não se aplica").
- Enviar nota interna em conversa já `FINALIZADO`: mesma regra de hoje
  (`enviarMensagem` recusa com 400 antes de checar `interno`) — nota interna
  não é uma forma de contornar o bloqueio de conversa finalizada.
- Enviar nota interna com anexo grande / tipo não suportado: mesma validação
  de `enviarArquivo` de hoje, sem exceção para `interno`.
- Alternar entre as duas abas do rodapé rapidamente, com uma requisição de
  envio em voo: `ocupado` (estado de loading já existente) precisa bloquear
  os dois formulários, não só o da aba ativa — evita dois envios
  simultâneos de abas diferentes.
- Badge de IA em conversa cujo canal foi excluído/desativado depois de
  criada: `canalConfig` vira `null` via `onDelete: SetNull` (já é o
  comportamento do schema) — o resumo deve devolver `iaAtiva: null`, não
  quebrar a query.
