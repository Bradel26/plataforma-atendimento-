# Área autenticada do NectarCRM (2026-10-22)

Login feito **manualmente** por um usuário da Bradel num Chrome isolado (perfil temporário, CDP em 127.0.0.1:9333). A análise foi estática sobre os scripts e passiva sobre a rede, navegando só por telas de listagem (oportunidades, contatos, leadboard, tarefas, automações, vendas, Nectar AI, Nchat). Nada foi criado, editado ou excluído. Corpos de resposta e valores de cabeçalho **não** foram capturados; tokens, e-mails e IDs foram mascarados, e a captura bruta foi apagada.

Inventário completo de rotas e endpoints: [inventario-endpoints-internos.md](inventario-endpoints-internos.md).

## Arquitetura de serviços (OBSERVADO)

O front é uma **casca AngularJS com micro-frontends Vue 3** dentro dela. Os endereços dos serviços aparecem como padrões no módulo de ambiente dos apps Vue (`env-*.js`, sobrescrito por `window.__APP_CONFIG__`):

| Serviço | Endereço | Evidência |
|---|---|---|
| Monólito Java (Struts + JSP) | `/crm/crm/*.do`, `/crm/crm/jsp/...` | 64 ações, 600 métodos |
| REST v1 do monólito | `/crm/api/1/` | 185 caminhos estáticos |
| REST v2 (Bearer) | `/crm/api/2/` | Cliente `apiV2` com `Authorization: Bearer` e erro em `detail` |
| Notificações em tempo real | `wss://app.nectarcrm.com.br/notify/{tenantUuid}/{userId}` | Visto em runtime |
| **Automações** (serviço separado, GraphQL) | `https://automation.nectarcrm.com.br/graphql` (`/automation/`) | POST visto na tela de automações; JWT próprio (`usuarioJwtAutomation`) |
| **IA / Copilot** (serviço separado) | `https://ai.nectarcrm.com.br` (em dev: `localhost:8000`) | Mapa por hostname em `env-*.js` |
| BI | `/bi3-get/api/` | `VITE_BI_SERVICE_URL` |
| Assistente (transcrição) | `/assistant` | `VITE_NECTAR_ASSISTANT_BASE_URL` |
| Busca | `elasticServiceHost` + `usuarioJwtSearch` | INFERIDO: Elasticsearch chamado do navegador com JWT dedicado |
| Backoffice / contrato | `/backoffice-backend/api/contract/feature?featureConstant=N` | Visto em runtime (feature flags por contrato) |
| Engage (tours, pesquisas, flags, eventos) | `https://engage.nectarcrm.com.br/api/engage/*` + WS | Visto em runtime |
| Tema da marca | `https://nectar-data.nectarcrm.com.br/view/customization/brand-theme-*` | Visto em runtime |
| Plugins / CDN | `/static/plugins`, `/cdn/`, `/reloaded/<app>/*.mjs` | Micro-frontends com Vue, vue-router, Pinia, Rolldown |
| **MCP público** | `https://mcp.nectarcrm.com.br/mcp` (OAuth, client `ncrm_mcp`) | Tela "Integrações > IA/MCP" sugere `claude mcp add --transport http nectar …` |
| Omnichannel (Nchat) | URL dinâmica (`integratorUrl`) via GraphQL | Ver [nchat-omnichannel.md](nchat-omnichannel.md) |

INFERIDO: o Nectar está saindo do monólito pelas bordas. O novo vira micro-frontend Vue mais um serviço próprio (IA em Python, automações em GraphQL), e o núcleo (contato, oportunidade, tarefa) continua no Struts.

## Front autenticado (OBSERVADO)

- `all.js?26.4.006`: **7 MB**, um único arquivo concatenado (81 linhas), com 353 componentes, 157 controllers, 202 diretivas, 72 services, 25 factories e 15 filtros AngularJS. **Servido sem autenticação**, com o mesmo SHA-256 dentro e fora da sessão.
- Telefonia web: `JsSIP 3.10` + `dialer_sip.js` + `dialer.js` (261 KB) + `totalvoice/app.js`. O ramal SIP do usuário (`usuarioSipUsername`/`usuarioSipPassword`) é entregue ao navegador no `APP_CONFIG`, o que é inevitável para WebRTC.
- 137 rotas ui-router. Destaques ausentes da documentação:
  - três tipos de pipeline: `/pipelines/sales`, `/pipelines/qualification` e **`/pipelines/aftersales`** (pós-venda);
  - `/vendas` com `/pedidos/:pedidoId`;
  - `/nectar-ai`;
  - `/copilot/transcript/:sessionId`;
  - `/doc-editor`;
  - **`/dev-center-app/:key`** (apps de terceiros);
  - `/file-browser-v2`;
  - importadores de **Salesforce e Pipedrive**;
  - `/feedbackIntentions/analysis` (a calibração de intenção);
  - `/jobs` (fila de jobs visível ao admin);
  - `/backoffice`.
- Flags de funcionalidade no `APP_CONFIG`: `funcionalidadeVendas`, `funcionalidadeOmnichannel`, `funcionalidadeScriptDialer`. Status como constantes: oportunidade (ABERTA, GANHA, PERDIDA, DESCARTADA, PRORROGADA) e qualificação (EM_ANDAMENTO, AGENDADA, QUALIFICADA, VENDIDA, NAO_VENDIDA, DESCARTADA).

## O que cada tela chama ao abrir (OBSERVADO em runtime)

| Tela | Chamadas principais |
|---|---|
| Oportunidades (kanban) | `pipeline.do?checkRequirements`, `pipeline.do?consultarJSON`, `configuracao.do?consultarPerfilJSON`, `oportunidade.do?hasMassActionInProgress`, `POST oportunidade.do?listarPipelines` (uma vez por coluna, 6 chamadas), `POST oportunidade.do?estatisticasForPipe` |
| Contatos | `POST entidade.do?listar&listType=3`, `POST entidade.do?estatisticas`, `campoPersonalizado.do?ajaxListar&isFiltro=true`, `usuario.do?getExportsInformation`, `entidade.do?hasMassActionInProgress` |
| Leadboard | `backoffice-backend/api/contract/feature?featureConstant=7` (feature flag do contrato), módulo ES `/static/leadboard/leadboard.mjs`, `qualificacao.do?getHiddenObjects`, `pipeline.do?listarPipelinePadrao&tipo=1` |
| Tarefas | `GET api/1/smartlist` (listas inteligentes), `POST tarefa.do?listar` com 30+ filtros e lista de colunas (`campos=`), mais 5 contadores (`count=true`: abertas, atrasadas, hoje, semana, mês) |
| Automações | `POST https://automation.nectarcrm.com.br/graphql` |
| Vendas | `GET api/1/sales?archived=false&status=0,1,2&page&per_page=30&sort=data_criacao`, `GET api/1/sales/stages`, `pipeline.do?listarPipelineSuggest&tipo=2` |
| Nectar AI | ~100 módulos `/reloaded/dashboard-ai/*.mjs`, `api/1/usuario/getSessionToken`, `api/1/usuario/tokeninfo?addProfile&addUserPermissions&addConfig&addModules`, `api/1/dashboard/ai/{credits,stats,events,events/timeseries,notifications}`, `api/1/agents`, `api/1/agents/summary?dias=14` |
| Nchat | iframe `/nchat/#/resume` (Vue + Pinia). Troca de token: `getSessionToken` → `tokeninfo` → `integracao?active=true` → OAuth do omnichannel (ver doc próprio) |

Padrões que se repetem:
- `hasMassActionInProgress` em toda listagem: ações em massa rodam em background e travam a tela enquanto executam.
- `pipeline.do?...&tipo=N`, em que o pipeline é polimórfico: 0 = venda, 1 = qualificação, 2 = pós-venda.
- `GET api/1/integracao/integrador` a cada troca de tela.

## Endpoints do serviço de IA (`ai.nectarcrm.com.br/api/v1/`, OBSERVADO estático)

| Grupo | Caminhos |
|---|---|
| Copilot / chat | `chat/sessions`, `chat/sessions/{id}/messages`, `chat/intent`, `chat/pilot-result`, `chat/messages/{id}/feedback`, `config/copilot-status` |
| Sugestões com aceite | `suggestions`, `suggestions/count`, `suggestions/{id}/accept`, `suggestions/{id}/dismiss`, `config/suggestions` |
| Lead score com IA | `lead-score/config`, `lead-score/config/resumo`, `lead-score/preview`, `lead-score/preview/busca`, `lead-score/validate`, **`lead-score/suggest-formula`**, `lead-score/sugerir-melhorias` |
| Previsão de vendas | `sales-forecast/config`, `sales-forecast/preview`, `sales-forecast/suggest` |
| Pipeline | `pipeline-insights`, `pipeline-suggestion`, `insights/contextual`, `insights/dismiss` |
| Duplicados (Data Steward) | `duplicates`, `duplicates/count`, `duplicates/contacts`, `duplicates/{id}/{merged,reject,reopen,detach}` |
| Diagnóstico em lote | `diagnostico/runs`, `diagnostico/runs/{id}/cancel` |
| Texto | `text/assist`, `text/assist/uso`, `generate/email`, `generate/email/refine`, `email-template`, **`form-fill`**, **`winloss-motive/suggest`** |

No monólito também: `api/1/opp-insight/*-widget` (conversão, metas, oportunidades em risco, ticket, win/loss, indicadores de fechadas), `api/1/copilot/salesman-coach[/run]`, `api/1/copilot/sdr-cadence[/pending]`, `api/1/copilot/token`, `api/1/ai/summary/form`, `api/1/feedback-intents`.

## Segurança e privacidade observáveis (para não copiar)

| Observação | Status |
|---|---|
| **JWT na query string** (`?api_token=<JWT>`, `?accessToken=<JWT>`) em várias chamadas: o token vai para logs de proxy, histórico e ferramentas de rede | OBSERVADO |
| O JWT da sessão analisada traz `iat`, `tenantId`, `userId` e `userLogin`, **sem `exp`** | OBSERVADO (um token); validade no servidor NÃO VERIFICADA |
| **Meta (Facebook) Pixel dentro do app autenticado**: um `PageView` por troca de tela, enviando a URL com rota e ID de registro (ex.: `#/oportunidade/1`) e o título da página | OBSERVADO (16 requisições a `facebook.com/tr` em 60 s) |
| Engage recebe o **e-mail do usuário** como `externalId` na query string (HTTP e WebSocket) | OBSERVADO |
| Bundle completo do app servido sem autenticação | OBSERVADO (normal para SPA; confirma que o front não guarda segredo) |
| Credenciais SIP do usuário no `APP_CONFIG` da página | OBSERVADO (inerente a softphone WebRTC) |

Lição para nós: usar token em cabeçalho (`Authorization`), nunca em query; JWT com `exp` curto e renovação; nenhum pixel de marketing dentro do app autenticado (LGPD), ou no mínimo sem IDs de registro na URL enviada.
