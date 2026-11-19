# Arquitetura atual — `plataforma-atendimento`

Levantado por leitura direta dos arquivos do repositório (`Glob`/`Grep`/`find`) em 2026-10-14, não por suposição. Fonte: `C:\Users\kaua.tavares\plataforma-atendimento`.

## Estrutura do monorepo

Três aplicações sob `apps/`:

| App | Papel | Evidência |
|---|---|---|
| `apps/api` | Backend principal (Fastify/Express — verificar em `src/app.ts`), Prisma/PostgreSQL, Redis, Socket.IO, fila | `package.json`: `@prisma/client`, `prisma`, `ioredis`, `socket.io` |
| `apps/web` | Frontend React + Vite | `apps/web/vite.config.ts`, `src/App.tsx`, `src/features/*` |
| `apps/ponte` | Serviço-ponte de WhatsApp dedicado, baseado em **Baileys** | `apps/ponte/package.json`: `"@whiskeysockets/baileys": "7.0.0-rc14"` |

## Banco de dados — Prisma (`apps/api/prisma/schema.prisma`)

Confirmado por leitura direta do schema — **69 models** no momento desta leitura. Principais blocos funcionais identificados pelos nomes dos models:

- **Organização/usuários/filas**: `Organizacao`, `User`, `Queue`, `QueueAgent`, `Branding`, `Filial`.
- **Contatos/CRM**: `Contact`, `ContactOperation`, `ImportSourceMapping`, `ContactDeletionRequest` (LGPD), `AccountOperation`, `Account`, `Lead`.
- **Atendimento/conversas**: `Conversation`, `ContadorProtocolo`, `Message`, `MensagemRapida`, `ChatPreview`, `ChannelConfig`, `PonteSessaoAuth`.
- **Comercial/funil**: `Funnel`, `FunnelStage`, `Opportunity`, `OpportunityAnalysis`, `OpportunityStageLog`, `OpportunityAudit`, `OpportunityItem`, `ActivitySeries`, `Activity`, `PropostaGerada`.
- **Metas/IA**: `Meta`, `MetaOperacional`, `ConsumoIA`.
- **Produtos/preço**: `Product`, `PriceCatalog`, `CatalogItem`, `ProdutoDoCliente`, `ComponenteGarantia`.
- **Campos personalizados**: `CampoCustomizado`, `ValorCampoCustomizadoConta`, `ValorCampoCustomizadoLead`, `ValorCampoCustomizadoOportunidade` (um model de valor por tipo de entidade-alvo, não um EAV genérico único).
- **Tickets/suporte**: `Ticket`, `TicketComment`, `TicketAttachment`, `TicketSchedule`.
- **Credenciamento/parceiros** (contexto Bradel: TIM/Starlink): `Credenciamento`, `CredenciamentoHistorico`, `CicloParceiro`, `CicloParceiroEtapa`, `CicloParceiroHistorico`.
- **Pesquisa/turnos**: `Survey`, `WorkShift`, `PresenceLog`.
- **Campanhas**: `Campaign`, `CampaignAttachment`, `CampaignItem`, `PartnerCampaign`, `PartnerCampaignAttachment`.
- **Bots/fluxos (chatbot)**: `Bot`, `BotStep`, `Fluxo`, `ExecucaoFluxo`, `MidiaFluxo`.
- **LGPD**: `RetentionPolicy`, `LgpdLog`.
- **Voz**: `VoiceConfig`, `Call`, `CallSuggestedAction`.
- **Integrações**: `IntegrationToken`.
- **Visões salvas**: `VisaoSalva`.

Lista completa de models em [modulos-existentes.md](modulos-existentes.md).

## Backend — módulos (`apps/api/src/modules/`)

28 módulos confirmados por listagem direta de pastas: `auth`, `bots`, `branding`, `busca`, `campaigns`, `channels`, `contacts`, `conversations`, `crm`, `dados`, `files`, `filiais`, `fluxos`, `health`, `ia`, `integrations`, `lgpd`, `metrics`, `queues`, `quick-replies`, `reports`, `shifts`, `surveys`, `tickets`, `users`, `voice`, `webchat`, `widget`.

## Frontend — features (`apps/web/src/features/`)

Listagem direta mostra apenas: `atendimento`, `auditoria`, `auth`, `branding`, `login`, `monitor`, `tema`. **Número bem menor que os módulos do backend** — indício de que várias áreas do backend (campanhas, chatbot/fluxos, tickets, voz, integrações) ainda não têm uma feature de frontend dedicada nesta pasta, OU estão organizadas de outra forma (dentro de `atendimento` ou em `src/pages`/`src/components`) — **não verificado nesta passada**, precisa de uma leitura mais profunda antes de declarar lacuna real (ver [lacunas.md](lacunas.md)).

## Provedores de WhatsApp — confirmados no código

Dois caminhos distintos coexistem (confirmado por grep, não por memória de sessões anteriores):

1. **`apps/ponte`** — serviço HTTP dedicado em Node/Express usando **Baileys** (`@whiskeysockets/baileys`) diretamente, com Postgres próprio (`pg`), autenticação de sessão (`autenticacaoPostgres.ts`), QR code (`qrcode`), e testes próprios (`sessao.qr.test.ts`, `sessao.reconexao.test.ts`, etc.).
2. **`apps/api`** — variável de ambiente `WHATSAPP_PROVIDER`, documentada em `apps/api/.env.example`, com dois valores possíveis: `"wppconnect"` (chama um WPPConnect Server externo via `WPP_CONNECT_URL`, recebe webhooks em `/api/webhooks/wppconnect` com segredo `?secret=`) ou `"waha"`.

**Conclusão**: existem *pelo menos três* integrações de WhatsApp possíveis no código (Baileys via ponte, WPPConnect via webhook, WAHA via webhook) — qual está ativa em produção depende da configuração de ambiente, não verificado aqui (ver registro de memória da sessão: produção historicamente usa Baileys/ponte, dev local usa WPPConnect — **isso é uma memória de sessões anteriores, precisa reconfirmação, não foi reverificado nesta leitura**).

## Realtime e filas

- `socket.io` no `apps/api` — mecanismo de tempo real confirmado por dependência; comportamento de eventos ainda não mapeado (pendente, ver [lacunas.md](lacunas.md)).
- `ioredis` — Redis usado, provavelmente para filas/cache; biblioteca de fila (BullMQ ou equivalente) não confirmada nesta passada — verificar `apps/api/src/modules/queues` e `apps/api/src/worker.ts` numa próxima rodada.

## Limitações desta leitura

- Não foi lido o conteúdo de nenhum módulo (`src/modules/*/*.ts`) em detalhe — só a existência das pastas e do schema Prisma.
- Não foi verificado qual provedor de WhatsApp está ativo no ambiente de produção real (Coolify) nesta passada.
- Não foi aberto `apps/web/src/features/atendimento` para ver sua profundidade real (pode conter sub-áreas equivalentes a vários módulos do backend).
