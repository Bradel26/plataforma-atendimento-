# Nchat por dentro (omnichannel)

Fonte: chunks Vue públicos em `/assets/` (1.391 arquivos alcançáveis a partir de `/assets/nchat-*.js`, seguindo só as importações do próprio app) e a navegação até `#/nchat` com sessão real. Corpos de resposta não foram capturados.

## Como o Nchat é montado (OBSERVADO)

1. A rota `#/nchat` do CRM abre um **iframe na mesma origem**: `/nchat/#/resume`.
2. O app do Nchat é **Vue 3 + Pinia + vue-i18n**, empacotado com Rolldown (Vite).
3. Bootstrap (`omnichannelBootstrap-*.js`):
   - `getToken()` no CRM devolve `businessProfileId`, `businessToken` e **`integratorUrl`**;
   - `getOauthToken('business')` dá o token da empresa;
   - `relatedAppService.searchInternalId(userId)` acha o vínculo usuário-CRM ↔ agente-omnichannel (`appId = 'omni-whatsapp'`);
   - `GetSupportAgentById` carrega o agente, e `getOauthToken('agent', agentId, tokenId)` dá o token do agente;
   - o SDK inicializa com **renovação automática** dos dois tokens (folga de 60 s antes de expirar).
4. Mensagens de erro do bootstrap: "There is no omnichannel access token integrated with nectar" e "We did not find omnichannel user linked to the nectar user".

INFERIDO: o backend do Nchat é **outro sistema**, com API GraphQL (Apollo) e OAuth próprio, cujo endereço é por cliente (`integratorUrl` + sufixo `-o2`). O CRM só guarda o vínculo e emite tokens. Isso explica os erros de "provisionar usuário no Nchat" vistos no i18n.

## Modelo de domínio (operações GraphQL OBSERVADAS: 69 queries, 69 mutations, 1 subscription)

| Entidade | Operações (amostra) | Campos relevantes |
|---|---|---|
| **SupportCase** (o atendimento) | `SearchSupportCasePage`, `GetSupportCaseById`, `UpdateSupportCaseStatus`, `UpdateSupportCaseOwner`, `UpdateSupportCaseQueue`, `UpdateSupportCaseExternalId`, `CreateCaseTakeover`, `GetSupportCaseAssignmentTimeline`, `SearchTransferredSupportCases`, `SearchPendingTransfersOfOwner`, `SearchQueueWaitingCases` | `status`, `owner`, `creator {type}`, `customer`, `chatBot`, `supportSubStatus {name,status}`, `unreadMsgCounter`, `markedUnread`, `waid`, `conversationBilling {enabled, customerReEngagement}`, **`supportCaseUpdates[] {creator, timestampCreation, update {field, oldValue, newValue}}`** (auditoria campo a campo) |
| Status do caso | constante `CHAT_STATUS` | `none`, `open`, **`ui`**, **`nmi`** ("aguardando cliente", rótulo `nchatTab.caseStatus.waitingCustomer`), `closed`. Mais **sub-status configuráveis** (`saveSupportSubStatus`) |
| **SupportQueue** (fila) | `SaveSupportQueueComplete`, `UpdateSupportQueueDistribution`, `UpdateCaseSLAConfigurationQueue`, `SearchSupportQueueTransferTargets`, `AddTeamToQueue` | `assignmentServiceConfig { active, creationAssignmentFlow, updateAssignmentFlow, periodicAssignmentFlow, deliveryStrategyList{type}, unavailabilityStrategyList{type}, team }`, `caseSlaConfiguration` |
| Distribuição | enums vistos | `MANUAL`, `AUTOMATIC`, `ROUND_ROBIN`, `RANDOM`. A distribuição roda **na criação, na atualização e periodicamente** (3 gatilhos), com estratégia de entrega e estratégia para agente indisponível |
| **SupportAgent** | `SaveSupportAgentWithCapacity`, `GetSupportAgentLoad`, `UpdateSupportAgentStatus`, `DeactivateSupportAgent`, `RestoreSupportAgent`, `GetSupportAgentDeactivationInfo` | **`caseCapacityLimit`** e `openCaseCount` (limite de atendimentos simultâneos por agente), `perm`, `alias` |
| SupportTeam | `SaveSupportTeam`, `AddAgentToTeam`, `UpdateAgentToTeamEnabled`, `SearchSupportTeamPageWithStatusSummary` | Equipe ↔ fila N:N |
| Conversation | `ConversationsBySupport`, `ConversationsByNumber`, `ConversationsAggregatedFiltered`, **subscription `ConversationsBySupportUpdates`**, `AddInternalMessage`, `MarkUnread`, `ClearUnreadMsgCounter`, `SendNewConversation`, `SendNewTemplateCase` | Mensagem interna (nota) na própria conversa |
| IA no atendimento | **`SummarizeConversation`**, **`TranscribeConversationAudio`** | |
| Chatbot | `saveChatbot`, `saveChatbotInstruction`, `searchChatBotInstructionPage` | `useAccessList`, `accessPerm`, `defaultDenyMessage`, `defaultNoCmdMessage`, por número ou Instagram |
| Canais | WhatsApp oficial (`SearchMetaWabaPage`, `GetMetaWabaById`, Embedded Signup da Meta, Graph v26.0), **WhatsApp Lite** (`genQrCode`, `instanceStatus`, `restartInstance`, `disconnectInstance`, `saveWhatsAppPhoneNumberLite`), Instagram (`registrationIgm`, `subscribeInstagramToApp`, `refreshInstagramAccount`) | Status do número oficial: CONNECTED, DISCONNECTED, PENDING, **FLAGGED**, **RESTRICTED** (com "pode iniciar conversa" por status). Lite: connected, disconnected, blocked, pending, removed |
| Templates | `AddTemplate`, `RetryTemplateSubmission`, `SearchTemplatePage`, `UpdateTemplateDefaultValue` | Template WABA com mídia no cabeçalho e regras de mídia |
| Respostas rápidas | `SaveInternalCannedResponse`, `SearchInternalCannedResponseAllowedPage` | Com controle de quem pode usar |
| Campanhas | `SaveCampaignList`, `SaveCampaignContacts`, `ScheduleCampaign`, `CancelCampaign`, `SearchCampaignContactSentInfoPage` | Lista → contatos → agendamento → status de envio por contato |
| Dashboard | `SearchDashboardInfo` | Casos abertos/fechados por dia e por status (`Nmi`, `Ui`, `None`), **tempo de primeira resposta**, **mediana de resposta**, **tempo de resolução**, casos por agente e status |
| Cobrança | chunks `OmnichannelCharges`, `OmnichannelChargeDenialList` | Cobrança por conversa (`conversationBilling`), lista de negações |

## Comparação direta com a nossa plataforma

| Nchat | Nós (`schema.prisma`) | Observação |
|---|---|---|
| `SupportCase` com `nmi` (aguardando cliente) + sub-status configuráveis | `Conversation` + plano `2026-10-14-aguardando-cliente-e-descartada` | Mesma ideia. Eles têm **sub-status livres** por cima do status fixo |
| `supportCaseUpdates` (campo, valor antigo, valor novo, autor) | `OpportunityAudit` só na oportunidade | Vale para a conversa também: quem mudou fila, dono ou status |
| `caseCapacityLimit` por agente + `openCaseCount` | `QueueAgent`, `WorkShift`, `PresenceLog` | Confirmar se temos limite de atendimentos simultâneos na distribuição |
| Distribuição: na criação, na atualização e **periódica**; estratégia para indisponível | Fila com distribuição | A redistribuição periódica de casos parados é o diferencial |
| Métricas: primeira resposta, mediana, resolução | `metrics`, `reports` | Conferir se usamos **mediana**, não só média |
| Embedded Signup da Meta para WhatsApp oficial | `ChannelConfig` (oficial + não oficial) | Fluxo de conexão do oficial |
| Status FLAGGED/RESTRICTED do número oficial | — | Expor a qualidade do número para o gestor |
| `SummarizeConversation`, `TranscribeConversationAudio` | `ia`, `voice` | Paridade provável |
