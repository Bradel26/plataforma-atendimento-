# Espelho completo do WhatsApp no Atendimento — Design

Data: 2026-09-14. Segue da sessão que colocou no ar a conexão self-service de WhatsApp
por vendedor (QR + Baileys, sessão persistida no Postgres) e o botão "Iniciar conversa"
a partir de um Contato do CRM. Ao testar, ficou claro que o modelo atual não corresponde
à expectativa do usuário: "conectar o WhatsApp" deveria significar o mesmo que abrir o
WhatsApp Web — falar com **qualquer** contato do celular, com o histórico ali, não só
com quem já tem uma `Conversation` formal na plataforma.

## Estado atual (o que já existe)

- Vendedor conecta o próprio número via QR na tela de Atendimento; a sessão do Baileys
  fica persistida numa linha do Postgres (`ChannelConfig` com `donoId` preenchido),
  sobrevive a restart.
- Mensagem que o cliente manda cria (ou reabre) uma `Conversation` automaticamente
  (`registrarMensagemEntrante`, em `inbound.service.ts`).
- Ao conectar, a agenda do celular é importada para `Contact` (`contacts.upsert` do
  Baileys → `importarContatos`).
- No CRM, o botão "Iniciar conversa" na ficha do contato cria uma `Conversation` vazia
  e leva para o Atendimento (`iniciarConversa`, adicionado nesta mesma sessão).
- **A lacuna:** a ponte (`apps/ponte/src/sessao.ts`) descarta deliberadamente todo o
  histórico que o Baileys entrega ao conectar — o listener de `messages.upsert` só
  aceita `type === 'notify'` (mensagem nova); não existe nenhum listener para chats
  (`messaging-history.set`, `chats.upsert`). Resultado: um contato que já trocou
  mensagens com o vendedor antes de a plataforma existir aparece "zerado" — sem
  histórico, sem sinal de que a conversa já existia — até o dia em que ele escrever de
  novo.

## Objetivo

A lista de conversas do Atendimento deixa de mostrar só `Conversation`s formais e passa
a espelhar **todos os chats individuais do celular do vendedor** (nome, prévia da
última mensagem, hora, não lidas) — como o WhatsApp Web. Abrir um desses chats mostra o
histórico recente de verdade, mesmo que ninguém nunca tenha atendido aquele contato pela
plataforma.

## Fora de escopo (YAGNI, v1)

- **Linha compartilhada.** Só a linha pessoal de cada vendedor (`ChannelConfig.donoId`
  preenchido) ganha o espelho. A linha compartilhada (`donoId: null`) continua exatamente
  como hoje: mensagem chega, vira conversa, cai na fila configurada. Não há "um dono de
  celular" para espelhar ali.
- **Grupos.** Continuam de fora, junto com lista de transmissão — mesma exclusão que já
  existe em `recebida.ts`. Modelar grupo (N participantes por conversa) é mudança de
  esquema à parte.
- **Mídia de mensagens de prévia.** O cache de histórico guarda só texto (ou um resumo
  tipo `[imagem]`, igual ao que `RESUMO` em `recebida.ts` já produz para mensagem ao
  vivo sem legenda). Mídia de verdade só é baixada quando a mensagem chega "ao vivo" ou
  no momento da promoção (ver abaixo) — baixar mídia de histórico que talvez nunca seja
  aberto seria gasto de banda e storage sem uso.
- **Visibilidade de gestor sobre prévia.** Supervisor/gestor não vê prévias da equipe —
  só passa a enxergar quando a conversa é promovida (mesma regra de hoje). Prévia é o
  celular pessoal do vendedor; expor tudo antes de virar atendimento de verdade não foi
  pedido e não deveria ser o padrão.

## Modelo de dados

Novo modelo, só-acréscimo — não toca em `Conversation`:

```prisma
model ChatPreview {
  id            String   @id @default(uuid())
  organizacaoId String   @default("") @map("organizacao_id")
  canalConfigId String   @map("canal_config_id")
  numero        String
  nome          String
  ultimaMensagem   String    @map("ultima_mensagem")
  ultimaMensagemEm DateTime  @map("ultima_mensagem_em")
  naoLidas         Int       @default(0) @map("nao_lidas")

  /// Cache das ultimas ~30 mensagens (texto/resumo, sem midia), mais novo por
  /// ultimo — mesmo formato de `MensagemRecebida` da ponte, para a promocao
  /// virar `Message.createMany` direto, sem remapear campo por campo.
  mensagens Json @default("[]")

  criadoEm     DateTime @default(now()) @map("criado_em")
  atualizadoEm DateTime @updatedAt @map("atualizado_em")

  canalConfig ChannelConfig @relation(fields: [canalConfigId], references: [id], onDelete: Cascade)

  /// Um numero aparece uma vez por linha — chegar mensagem nova so atualiza a
  /// linha existente (upsert), nunca duplica.
  @@unique([canalConfigId, numero])
  @@index([canalConfigId, ultimaMensagemEm])
  @@map("previas_chat")
}
```

`organizacaoId` existe pela mesma razão de todo modelo multi-tenant do projeto (isolado
pela extensão do Prisma); `canalConfigId` (não `donoId` direto) porque é o mesmo padrão
de `Conversation.canalConfigId` — a linha que "dona" a prévia é a config, não a pessoa,
e evita duplicar a FK para `User`.

## Sincronização (ponte → API)

Dois listeners novos em `apps/ponte/src/sessao.ts`, só quando `sessao` corresponde a uma
linha com `donoId` (a própria ponte já sabe seu `nome`/config; o corte "só pessoal" é
feito do lado da API, no handler do webhook, pela mesma config que hoje resolve
`donoId`/`ativo` — a ponte não precisa saber o conceito de "pessoal", só entrega chat
por chat).

- **`messaging-history.set`** — dispara uma vez por conexão nova, com `{ chats,
  contacts, messages, isLatest }`. É a carga completa: usada para popular
  `ChatPreview` pela primeira vez (nome, última mensagem, e as ~30 mensagens mais
  recentes por chat, filtradas por `numeroDoJid` como já se faz para contato e
  mensagem ao vivo — grupo/broadcast fora).
- **`chats.upsert` / `chats.update`** — eventos incrementais depois da carga inicial:
  nova mensagem, contador de não lidas mudou. Atualiza a prévia existente (upsert por
  número).

Ambos empacotados em lotes e entregues por um endpoint novo, assinado por HMAC igual a
todo webhook ponte→API existente — mesma família de rota que já existe em
`ponte.routes.ts` (montada em `/api/webhooks/ponte`, corpo cru validado por assinatura,
`organizacaoId` na URL e `sessao` dentro do corpo, resolvida para a `ChannelConfig` do
mesmo jeito que os outros três handlers desse arquivo já fazem):

### `POST /api/webhooks/ponte/whatsapp/:organizacaoId/chats`

Corpo: `{ sessao, chats: [{ numero, nome, ultimaMensagem, ultimaMensagemEm, naoLidas,
mensagens: [{ autor: 'CLIENTE'|'AGENTE', texto, criadoEm }] }] }`. Resolve a
`ChannelConfig` pela `sessao` (mesma resolução que os handlers vizinhos já fazem);
**se a config não tiver `donoId`, o lote inteiro é descartado em silêncio** (204) — é a
linha compartilhada, fora de escopo, e um 4xx só faria a ponte logar erro por um caso
esperado. Faz `upsert` de `ChatPreview` por número.

## Promoção: quando a prévia vira `Conversation`

Dois gatilhos, nenhum novo endpoint — reaproveitam fluxo existente:

1. **Cliente manda mensagem nova** — `registrarMensagemEntrante` (inbound.service.ts),
   antes de criar a conversa do zero, passa a checar se existe `ChatPreview` para aquele
   número na mesma `canalConfigId`. Se existir: cria a `Conversation`, insere as
   mensagens do cache como `Message` (autor `CLIENTE`/`AGENTE` conforme guardado,
   `criadoEm` preservado do original — a ordenação por `criadoEm` continua correta),
   depois apaga a `ChatPreview` (ela vira supérflua; a `Conversation` passa a ser a
   fonte da verdade).
2. **Vendedor abre e responde pelo Atendimento** — o mesmo `iniciarConversa`
   (conversations.service.ts) passa a checar `ChatPreview` antes de criar uma conversa
   vazia: se existir uma prévia para aquele telefone na linha pessoal do solicitante,
   promove ela (mesmo procedimento acima) em vez de começar do zero. Cobre tanto o clique
   em "Iniciar conversa" na ficha do contato quanto — se a lista do Atendimento passar a
   listar prévias diretamente (ver UI abaixo) — o clique numa linha de prévia.

Promoção é sempre idempotente e atômica (uma transação: criar conversa + mensagens +
apagar prévia), pelo mesmo motivo que `iniciarConversa` já é idempotente hoje: reabrir a
tela e clicar de novo não pode duplicar histórico.

## UI: lista unificada no Atendimento

A lista de conversas (`ListaConversas`) passa a mostrar duas origens intercaladas,
ordenadas por `ultimaMensagemEm` desc — visualmente uma linha de `ChatPreview` é igual a
uma de `Conversation` "Em espera" (nome, prévia de texto, hora, badge de não lidas), sem
os controles de fila/status que só uma conversa promovida tem. Abrir uma linha de prévia
mostra o histórico em cache, **somente leitura** até o vendedor digitar e mandar a
primeira mensagem — o envio é o gatilho de promoção (2, acima); a tela não precisa saber
que promoveu nada, só que `POST /conversas/:id/mensagens` agora recebe um id de
conversa que acabou de nascer.

Endpoint novo de leitura, só para popular essa lista combinada:

### `GET /conversas/previas`

Lista as `ChatPreview` das linhas pessoais **do próprio solicitante** (sem parâmetro de
usuário — nunca lista prévia de outro vendedor, coerente com "prévia é privada do dono
do celular"). Reaproveita o mesmo formato resumido de `toConversaResumo` na medida do
possível, para o front não precisar de dois tipos de card na lista.

## Integração com o CRM

- A ficha do contato (`FichaContato.tsx`) passa a mostrar um indício quando existe uma
  `ChatPreview` para o telefone do contato — algo como "Já tem conversa no WhatsApp" —
  antes mesmo de clicar em "Iniciar conversa", para não parecer que é a primeira vez que
  a empresa fala com ele.
- `iniciarConversa` já promove a prévia (seção acima) — nenhuma mudança adicional de
  contrato na rota `POST /conversas`.
- Contato importado do celular (feature já existente) e prévia deixam de ser conceitos
  desconectados: boa parte dos contatos importados via `contacts.upsert` também vão ter
  uma `ChatPreview` correspondente, populada pelo `messaging-history.set` da mesma
  conexão.

## Erros e casos de borda

- **Baileys não entrega `messaging-history.set` em toda reconexão** — só na primeira
  sincronização de uma sessão nova, ou quando o histórico do celular mudou desde a
  última vez (`isLatest: false` sinaliza carga parcial, vários eventos em sequência). A
  ponte trata isso do jeito que já trata `contacts.upsert`: aceita quantos lotes
  vierem, sem assumir "isto é tudo" em nenhum deles.
- **Prévia e `Conversation` para o mesmo número, ao mesmo tempo** — não deveria
  acontecer (a promoção apaga a prévia), mas se acontecer (ex.: falha a meio da
  transação de promoção, ou uma corrida rara entre os dois gatilhos), a `Conversation`
  sempre vence: a rota de listagem combinada e `iniciarConversa` checam `Conversation`
  aberta primeiro, `ChatPreview` só como segunda tentativa.
- **Sessão desconectada com prévias já sincronizadas** — prévias continuam visíveis e
  abríveis (histórico somente leitura); só a promoção (mandar mensagem) esbarra no
  mesmo erro 503 `CANAL_INDISPONIVEL` que qualquer envio hoje já esbarra com a sessão
  caída.

## Testes

- `dadosContatoImportado`-style: função pura que decide se um chat bruto do Baileys
  entra na sincronização e com que forma (`chatValido`, ao lado de `contatoValido` em
  `sessao.ts`) — cobre grupo/broadcast fora, número inválido fora, mesmo padrão dos
  testes de `sessao.test.ts` já existentes.
- Promoção (`promoverPrevia` ou nome equivalente): teste de unidade da decisão pura
  (dado um cache de N mensagens, produz N `Message` na ordem certa) — parte que toca
  banco (transação criar+apagar) fica para o smoke test, mesma convenção do resto do
  projeto (`vitest.config.ts` documenta isso).
- Estender `scripts/smoke-ponte-multi.mjs` ou `smoke-canais.mjs` com o ciclo completo:
  sincronizar prévia → listar em `/conversas/previas` → promover ao mandar mensagem →
  confirmar que a prévia sumiu e a conversa tem o histórico certo.

## Decomposição sugerida para o plano de implementação

O escopo é grande demais para uma entrega só. Sugestão de fases, cada uma testável e
utilizável isoladamente:

1. **Sincronização e armazenamento** — modelo `ChatPreview`, listeners na ponte,
   endpoint de webhook, `GET /conversas/previas`. Sem UI nova ainda; dá para verificar
   via smoke test que as prévias chegam certas.
2. **Promoção** — `iniciarConversa` e `registrarMensagemEntrante` passam a promover
   prévia existente em vez de criar do zero.
3. **UI unificada** — lista combinada no Atendimento, indício na ficha do contato.

Cada fase é um PR pequeno o bastante para revisar de verdade, e a 1 sozinha já teria
valor observável (dá para conferir no banco que o espelho está sincronizando) antes de
mexer em qualquer fluxo que já está em produção piloto.
