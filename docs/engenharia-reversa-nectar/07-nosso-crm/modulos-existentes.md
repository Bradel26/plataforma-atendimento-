# Módulos existentes — inventário bruto

Fonte: leitura direta de `apps/api/src/modules/` (pastas) e `apps/api/prisma/schema.prisma` (models), 2026-10-14. Sem inferência — isto é o que existe fisicamente no repositório hoje, não necessariamente o que funciona em produção.

## Módulos de backend (pasta → hipótese de propósito, a confirmar lendo o código)

| Módulo | Hipótese de propósito (não confirmado por leitura do código ainda) |
|---|---|
| auth | Autenticação/login |
| bots | Bots de atendimento (ligado aos models `Bot`/`BotStep`) |
| branding | Identidade visual por organização (`Branding`) |
| busca | Busca/pesquisa global |
| campaigns | Campanhas (`Campaign`, `CampaignItem`, `PartnerCampaign`) |
| channels | Canais de atendimento (`ChannelConfig`) |
| contacts | Contatos (`Contact`, `Account`, `Lead`) |
| conversations | Conversas/mensagens (`Conversation`, `Message`) |
| crm | Funil/oportunidades (`Funnel`, `Opportunity`) — a confirmar escopo exato |
| dados | Indefinido — a abrir |
| files | Arquivos/anexos |
| filiais | Filiais (`Filial`) |
| fluxos | Fluxos de automação/chatbot (`Fluxo`, `ExecucaoFluxo`, `MidiaFluxo`) |
| health | Healthcheck |
| ia | IA/consumo (`ConsumoIA`, `OpportunityAnalysis`) |
| integrations | Integrações externas (`IntegrationToken`) |
| lgpd | LGPD (`RetentionPolicy`, `LgpdLog`, `ContactDeletionRequest`) |
| metrics | Métricas/dashboards |
| queues | Filas de atendimento (`Queue`, `QueueAgent`) |
| quick-replies | Mensagens rápidas (`MensagemRapida`) |
| reports | Relatórios |
| shifts | Turnos de trabalho (`WorkShift`, `PresenceLog`) |
| surveys | Pesquisas de satisfação (`Survey`) |
| tickets | Tickets de suporte (`Ticket`, `TicketComment`, `TicketAttachment`, `TicketSchedule`) |
| users | Usuários |
| voice | Voz/chamadas (`VoiceConfig`, `Call`, `CallSuggestedAction`) |
| webchat | Chat via widget web |
| widget | Widget embutível |

## Frontend — correção: `src/features/` NÃO é a pasta principal de telas

Checagem adicional (2026-10-14) em `apps/web/src/pages/` mostrou que a hipótese de "lacuna" abaixo (baseada só em `src/features/`) estava **errada**. A maior parte da UI vive em `pages/`, organizada por domínio, não em `features/`:

| Pasta/arquivo em `pages/` | Módulo de backend correspondente |
|---|---|
| `crm/` (ContatosTab, OportunidadesTab, ProdutosTab, LeadsTab, MetasTab, MetasOperacionais, FunilDeCicloDeVida, CicloParceiroTab, EnviarParaCredenciamento, HistoricoTab, VisoesSalvas, Etiquetas...) | `crm`, `contacts`, `dados` |
| `CampanhasPage.tsx` + `campanhas/` (MontarPublico, CampanhasParceirosTab) | `campaigns` |
| `fluxos/EditorFluxoPage.tsx` | `fluxos` |
| `configuracoes/BotsTab.tsx`, `FluxosTab.tsx` | `bots` |
| `ChamadoTiPage.tsx` + `protocolo/` (ProtocoloPage, DetalheProtocolo) | `tickets` |
| `TelefoniaPage.tsx` + `telefonia/AssistenteDaLigacao.tsx` | `voice` |
| `configuracoes/CanaisTab.tsx` | `channels` |
| `configuracoes/FilaTab.tsx`, `FilasTab.tsx` | `queues` |
| `configuracoes/MensagensRapidasTab.tsx` | `quick-replies` |
| `configuracoes/LgpdTab.tsx` | `lgpd` |
| `configuracoes/IaTab.tsx`, `gestao/ConsumoDeIa.tsx` | `ia` |
| `configuracoes/UsuariosTab.tsx` | `users` |
| `configuracoes/FiliaisTab.tsx` | `filiais` |
| `configuracoes/WhiteLabelTab.tsx` | `branding` |
| `WebchatPage.tsx` | `webchat` |
| `AvaliacaoPage.tsx` | `surveys` |
| `DashboardsPage.tsx`, `RelatoriosPage.tsx`, `DesempenhoPage.tsx`, `dashboard/PainelOperacoes.tsx` | `metrics`, `reports` |
| `AuditoriaPage.tsx` | (auditoria geral) |
| `GestaoPage.tsx`, `MonitoramentoPage.tsx` | `metrics`/supervisão |
| `esteira/EsteiraPage.tsx` | fluxo de esteira (contexto Bradel — credenciamento?) |

Não identificada ainda pasta correspondente a `integrations` (módulo de backend `integrations`/`IntegrationToken`) — pode estar dentro de `configuracoes/` sob outro nome, ou realmente não ter tela própria. **Isso sim fica como pendência real para a Fase 9**, não o resto.

## Features de frontend (`src/features/`) — pasta auxiliar, não a principal

| Feature | Observação |
|---|---|
| atendimento | Núcleo do atendimento/conversas: `ListaConversas`, `PainelChat`, `PainelContato`, `CaixaEntradaEquipes`, `ModalTransferir`, `ModalIniciarConversa`, hooks `useConversas`/`useCaixaEntrada` — é aqui que vive a lógica equivalente ao "Nchat → Conversas" que o agente de Nchat está documentando em paralelo |
| auditoria | Lógica de apoio à `AuditoriaPage` |
| auth | Autenticação |
| branding | Identidade visual |
| login | Tela de login |
| monitor | Monitoramento |
| tema | Tema visual |

## Models Prisma (lista completa, 69 confirmados)

```
Organizacao, User, Queue, QueueAgent, Branding, Contact, ContactOperation,
ImportSourceMapping, ContactDeletionRequest, AccountOperation, Conversation,
ContadorProtocolo, Message, MensagemRapida, Account, OpportunityAnalysis,
Lead, Funnel, FunnelStage, Opportunity, ActivitySeries, Activity,
OpportunityStageLog, OpportunityAudit, PropostaGerada, Meta, MetaOperacional,
ConsumoIA, Product, PriceCatalog, CatalogItem, OpportunityItem,
ProdutoDoCliente, ComponenteGarantia, VisaoSalva, Filial, CampoCustomizado,
ValorCampoCustomizadoConta, ValorCampoCustomizadoLead,
ValorCampoCustomizadoOportunidade, Ticket, TicketComment, TicketAttachment,
TicketSchedule, Credenciamento, CredenciamentoHistorico, CicloParceiro,
CicloParceiroEtapa, CicloParceiroHistorico, ChannelConfig, ChatPreview,
PonteSessaoAuth, Survey, WorkShift, PresenceLog, Campaign, CampaignAttachment,
CampaignItem, PartnerCampaign, PartnerCampaignAttachment, Bot, BotStep,
Fluxo, ExecucaoFluxo, MidiaFluxo, RetentionPolicy, LgpdLog, VoiceConfig,
Call, CallSuggestedAction, IntegrationToken
```

## Provedores de WhatsApp confirmados no código

- `apps/ponte`: Baileys (`@whiskeysockets/baileys@7.0.0-rc14`), serviço dedicado com Postgres próprio.
- `apps/api` (`WHATSAPP_PROVIDER` em `.env.example`): `"wppconnect"` (WPPConnect Server externo, webhook `/api/webhooks/wppconnect`) ou `"waha"`.

Qual está ativo em produção **não foi reverificado nesta leitura** — ver nota em [arquitetura-atual.md](arquitetura-atual.md).

## Próximos passos para esta pasta (Fase 8 continuação)

1. Abrir `apps/web/src/features/atendimento` em profundidade para confirmar se cobre campanhas/chatbot/tickets/voz.
2. Ler `apps/api/src/modules/conversations` e `apps/api/src/modules/queues` para extrair as regras reais de atribuição/transferência (compará-las com o que o agente de Nchat encontrar em `03-nchat/atribuicao-transferencia.md`).
3. Ler `apps/api/src/modules/fluxos` e `apps/api/src/modules/bots` para comparar com `03-nchat/chatbot.md`.
4. Confirmar o provedor de WhatsApp realmente ativo em produção (Coolify) antes de propor qualquer mudança.
