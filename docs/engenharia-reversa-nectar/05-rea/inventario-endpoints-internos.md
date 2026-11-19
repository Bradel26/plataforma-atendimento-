# Inventário de endpoints internos (área autenticada)

Gerado em 2026-10-22 a partir de `all.js?26.4.006` (SHA-256 `6f1f4155…80a8`), `dialer.js` e dos chunks Vue em `/assets/`. Só **nomes** extraídos de literais; segmentos numéricos viraram `{id}`. Rotas montadas inteiramente em tempo de execução não aparecem aqui (limitação estática).

## Rotas do front (ui-router): 137

| Estado | URL (relativa ao pai, após `#`) |
|---|---|
| `dashboard` | `/` |
| `wizard` | `/wizard` |
| `copilotTranscript` | `/copilot/transcript/:sessionId` |
| `contato` | `/contato` |
| `contato.list` | `(herda do pai)` |
| `contato.listv2` | `/v2` |
| `contato.view` | `/:contatoId` |
| `contato.contact` | `/view/:contatoId` |
| `contato.mapa` | `/mapa` |
| `task` | `(herda do pai)` |
| `task.view` | `/task/view/:tarefaId` |
| `publicacaoView` | `/publicacao/view/:publicacaoId` |
| `task.list` | `/task` |
| `task.v2` | `/task/v2` |
| `task.calendar` | `/task/calendario` |
| `compromisso` | `(herda do pai)` |
| `compromisso.calendario.view` | `/view/:compromissoId` |
| `compromisso.calendario` | `/compromisso` |
| `compromisso.mapa` | `/compromisso/mapa` |
| `compromisso.grid` | `/compromisso/grid` |
| `meta` | `/meta` |
| `metaView` | `/meta/usuarios/meta/:metaId` |
| `proposta` | `/proposta` |
| `propostav2` | `/proposta/v2` |
| `fluxo` | `/procedimento/:fluxoId` |
| `procedimento` | `/procedimento` |
| `estatistica` | `/estatistica` |
| `configuracao` | `/configuracao` |
| `configuracao.conta` | `(herda do pai)` |
| `configuracao.usuarios` | `/usuarios` |
| `configuracao.usuarios.limite` | `/limiteExcedido` |
| `configuracao.usuarios.view` | `/:id` |
| `configuracao.parametros` | `/parametros` |
| `configuracao.notificacoes` | `/notificacoes` |
| `configuracao.integracoes` | `/integracoes?section=apps&outlookCallback&azureCallback&rdstationCallback&errorMsg&successMsg&anchor&searchText&integracaoIdx` |
| `configuracao.gerencia` | `/gerencia` |
| `configuracao.integracoes.auvo` | `/auvo` |
| `configuracao.google` | `/integracoes/google` |
| `configuracao.outlook` | `/integracoes/outlook` |
| `configuracao.rdstation` | `/integracoes/rdstation` |
| `configuracao.mailbox` | `/integracoes/mailbox` |
| `configuracao.jobs` | `/jobs` |
| `configuracao.jobsView` | `/jobs/jobsView/:id` |
| `configuracao.segments` | `/segments` |
| `configuracao.currency` | `/currency` |
| `configuracao.justificativas` | `/justificativas` |
| `configuracao.vinculo` | `/vinculo` |
| `configuracao.origin` | `/origin` |
| `configuracao.feedbackIntentions` | `/feedbackIntentions` |
| `configuracao.feedbackIntentionsAnalysis` | `/feedbackIntentions/analysis` |
| `configuracao.taskTypes` | `/taskTypes` |
| `configuracao.eventTypes` | `/eventTypes` |
| `configuracao.callTypes` | `/callTypes` |
| `configuracao.motivosDescarteOportunidade` | `/motivosDescarteOportunidade` |
| `configuracao.motivosDescarte` | `/motivosDescarte` |
| `configuracao.roles` | `/roles` |
| `configuracao.contactCategory` | `/contactCategory` |
| `configuracao.checklists` | `/checklists` |
| `configuracao.tags` | `/tags` |
| `configuracao.grupoItens` | `/grupoItens` |
| `configuracao.itemCusto` | `/formacaoPreco` |
| `configuracao.customFields` | `/customFields?secao&q&campo` |
| `configuracao.tableTemplate` | `/table-template` |
| `configuracao.tableTemplateView` | `/table-template/view/:id` |
| `configuracao.sales` | `/pipelines/sales` |
| `configuracao.qualification` | `/pipelines/qualification` |
| `configuracao.aftersales` | `/pipelines/aftersales` |
| `configuracao.modeloFormulario` | `/modelo-formulario` |
| `configuracao.modeloFormularioInclusao` | `/modelo-formulario/edit/:id` |
| `configuracao.modelosFluxo` | `/modelosProcedimento` |
| `configuracao.modelosProposta` | `/modelosProposta` |
| `configuracao.tabela-preco` | `/tabela-preco` |
| `configuracao.itens` | `/produtos` |
| `configuracao.equipes` | `/equipes` |
| `configuracao.filiais` | `/filiais` |
| `configuracao.regioes` | `/regioes` |
| `configuracao.backoffice` | `/backoffice` |
| `configuracao.queues` | `/queues` |
| `nectarAi` | `/nectar-ai` |
| `changelog` | `/changelog` |
| `mailbox` | `/mailbox` |
| `mailbox.list` | `(herda do pai)` |
| `mailbox.view` | `/:mailId` |
| `mailbox-id` | `/mailbox/view/:id` |
| `bi` | `/bi` |
| `new-bi` | `/new-bi` |
| `bi-3` | `/bi-3` |
| `importacao` | `/importacao` |
| `field-sales` | `/field-sales` |
| `salesforce` | `/importacao/salesforce` |
| `pipedrive` | `/importacao/pipedrive` |
| `qualificacao` | `/qualificacao` |
| `qualificacao.leadplus` | `(herda do pai)` |
| `qualificacao.easyforms` | `/easyforms` |
| `qualificacao.easyformsEdit` | `/webforms/edit/:id` |
| `qualificacao.list` | `/view` |
| `qualificacao.pipe` | `/view/:pipeId` |
| `qualificacao.estatistica` | `/view/:pipeId/estatistica` |
| `qualificacao.nectarForWhats` | `/whatsapp` |
| `qualificacao.estatistica.grafico` | `/:tipoGrafico` |
| `qualificacao.view` | `/lead/:qualificacaoId` |
| `qualificacao.view.main` | `(herda do pai)` |
| `qualificacao.view.main.general` | `(herda do pai)` |
| `qualificacao.view.main.activities` | `/atividades` |
| `qualificacao.view.main.contact` | `/contato` |
| `qualificacao.view.main.people` | `/pessoas` |
| `qualificacao.view.main.products` | `/produtos` |
| `qualificacao.view.main.attachments` | `/anexos` |
| `configuracao.templateEmail` | `/template-email` |
| `configuracao.templateEmailInclusao` | `/template-email/edit/:id` |
| `vazio` | `(herda do pai)` |
| `ligacao` | `(herda do pai)` |
| `ligacao.list` | `/ligacao/list` |
| `ligacao.listv2` | `/ligacao/list/v2` |
| `tarefaView` | `(herda do pai)` |
| `oportunidade` | `/oportunidade` |
| `oportunidade.list` | `?choose` |
| `oportunidade.pipe` | `/:pipeId` |
| `oportunidade.pipev2` | `/v2/:pipeId` |
| `oportunidade.opportunity` | `/:pipelineId/opportunity/:oportunidadeId` |
| `oportunidade.view` | `/view/:oportunidadeId` |
| `oportunidade.consultar` | `/oportunidade/:oportunidadeId` |
| `oportunidade.opportunityEdit` | `/opportunity/edit/:oportunidadeId` |
| `vendas` | `/vendas` |
| `vendas.list` | `(herda do pai)` |
| `vendas.detail` | `/:id` |
| `vendas.detail.order` | `/pedidos/:pedidoId` |
| `export` | `/export-table` |
| `automations` | `/automations` |
| `automationFlowEdit` | `/automations/edit/:automationId` |
| `automationFlowContact` | `/automationContacts?automationId` |
| `automationFlowUser` | `/automationUsers?automationId` |
| `nchat` | `/nchat` |
| `file-browser` | `/file-browser?fonte&id&secao` |
| `file-browser-v2` | `/file-browser-v2` |
| `doc-editor` | `/doc-editor/` |
| `dev-center-app` | `/dev-center-app/:key` |

## REST `/crm/api/1/`: 185 caminhos em 76 recursos

- **dialer** (22): `/crm/api/{id}/dialer/55pbx`, `/crm/api/{id}/dialer/callsys`, `/crm/api/{id}/dialer/desintegrar`, `/crm/api/{id}/dialer/integrar`, `/crm/api/{id}/dialer/nectar-voip`, `/crm/api/{id}/dialer/nectar-voip/balance`, `/crm/api/{id}/dialer/nectar-voip/call-billing`, `/crm/api/{id}/dialer/nectar-voip/callDetails`, `/crm/api/{id}/dialer/nectar-voip/dids`, `/crm/api/{id}/dialer/nectar-voip/integrate`, `/crm/api/{id}/dialer/nectar-voip/my-ramal`, `/crm/api/{id}/dialer/nectar-voip/ramal`, `/crm/api/{id}/dialer/nectar-voip/recharge`, `/crm/api/{id}/dialer/nectar-voip/record`, `/crm/api/{id}/dialer/nectar-voip/sync`, `/crm/api/{id}/dialer/nectar-voip/sync/cancel`, `/crm/api/{id}/dialer/nectar-voip/sync/status`, `/crm/api/{id}/dialer/nectar-voip/update-document`, `/crm/api/{id}/dialer/opens-voip`, `/crm/api/{id}/dialer/pcm`, `/crm/api/{id}/dialer/token`, `/crm/api/{id}/dialer/update`
- **contrato** (14): `/crm/api/{id}/contrato/changeUserLimit`, `/crm/api/{id}/contrato/clear`, `/crm/api/{id}/contrato/client-contact-request`, `/crm/api/{id}/contrato/getInactiveIntegration`, `/crm/api/{id}/contrato/hide-referral-program`, `/crm/api/{id}/contrato/integrations`, `/crm/api/{id}/contrato/mailContractResponsible`, `/crm/api/{id}/contrato/objects/usage`, `/crm/api/{id}/contrato/reenableIntegration`, `/crm/api/{id}/contrato/removeDB`, `/crm/api/{id}/contrato/removeIntegration`, `/crm/api/{id}/contrato/saveIntegration`, `/crm/api/{id}/contrato/summary`, `/crm/api/{id}/contrato/usoUsuarios`
- **usuario** (11): `/crm/api/{id}/usuario`, `/crm/api/{id}/usuario/app/login`, `/crm/api/{id}/usuario/app/signup`, `/crm/api/{id}/usuario/export`, `/crm/api/{id}/usuario/login`, `/crm/api/{id}/usuario/password-forgot`, `/crm/api/{id}/usuario/password/change`, `/crm/api/{id}/usuario/personalizedField`, `/crm/api/{id}/usuario/ramal`, `/crm/api/{id}/usuario/removal/statistics`, `/crm/api/{id}/usuario/send-email-to-admin/{id}`
- **omie** (9): `/crm/api/{id}/omie/cancel`, `/crm/api/{id}/omie/categorias`, `/crm/api/{id}/omie/clear-last-syncing-date`, `/crm/api/{id}/omie/contas`, `/crm/api/{id}/omie/locais-estoque`, `/crm/api/{id}/omie/receive-webhook-data`, `/crm/api/{id}/omie/sync-all`, `/crm/api/{id}/omie/sync-contacts`, `/crm/api/{id}/omie/sync-products`
- **opp-insight** (7): `/crm/api/{id}/opp-insight`, `/crm/api/{id}/opp-insight/closed-opportunity-indicators-widget`, `/crm/api/{id}/opp-insight/conversion-widget`, `/crm/api/{id}/opp-insight/goals-widget`, `/crm/api/{id}/opp-insight/risk-opportunities-widget`, `/crm/api/{id}/opp-insight/ticket-widget`, `/crm/api/{id}/opp-insight/win-loss-widget`
- **copilot** (6): `/crm/api/{id}/copilot`, `/crm/api/{id}/copilot/salesman-coach`, `/crm/api/{id}/copilot/salesman-coach/run`, `/crm/api/{id}/copilot/sdr-cadence`, `/crm/api/{id}/copilot/sdr-cadence/pending`, `/crm/api/{id}/copilot/token`
- **camposPersonalizados** (5): `/crm/api/{id}/camposPersonalizados`, `/crm/api/{id}/camposPersonalizados/dataset/sample`, `/crm/api/{id}/camposPersonalizados/dataset/sheets`, `/crm/api/{id}/camposPersonalizados/dataset/test`, `/crm/api/{id}/camposPersonalizados/inline-import`
- **googlecalendar** (5): `/crm/api/{id}/googlecalendar/integration`, `/crm/api/{id}/googlecalendar/integration/cancelEvent`, `/crm/api/{id}/googlecalendar/integration/synchronizeAll`, `/crm/api/{id}/googlecalendar/integration/update`, `/crm/api/{id}/googlecalendar/integration/usersWithIntegration`
- **import** (5): `/crm/api/{id}/import/analysis`, `/crm/api/{id}/import/cancel`, `/crm/api/{id}/import/errors`, `/crm/api/{id}/import/promote`, `/crm/api/{id}/import/sheets`
- **sales** (5): `/crm/api/{id}/sales`, `/crm/api/{id}/sales/eligible-opportunities`, `/crm/api/{id}/sales/items/sync`, `/crm/api/{id}/sales/stages`, `/crm/api/{id}/sales/statistics`
- **logs** (4): `/crm/api/{id}/logs`, `/crm/api/{id}/logs/client-errors`, `/crm/api/{id}/logs/resend`, `/crm/api/{id}/logs/v2`
- **microsoft** (4): `/crm/api/{id}/microsoft/getAgendas`, `/crm/api/{id}/microsoft/getIntegracao`, `/crm/api/{id}/microsoft/iniciarSincronizacao`, `/crm/api/{id}/microsoft/integrar`
- **docsales** (3): `/crm/api/{id}/docsales`, `/crm/api/{id}/docsales/get-url-sign-document`, `/crm/api/{id}/docsales/receiveStatusUpdate`
- **docusign** (3): `/crm/api/{id}/docusign`, `/crm/api/{id}/docusign/handleWebhooks`, `/crm/api/{id}/docusign/oauthCallback`
- **email** (3): `/crm/api/{id}/email`, `/crm/api/{id}/email/compose/replace-keys-from-html`, `/crm/api/{id}/email/templatesEmail`
- **integration** (3): `/crm/api/{id}/integration/auvo/users`, `/crm/api/{id}/integration/jivo/chat`, `/crm/api/{id}/integration/whatsappConfig`
- **voicemail** (3): `/crm/api/{id}/voicemail`, `/crm/api/{id}/voicemail/count`, `/crm/api/{id}/voicemail/toggle`
- **access** (2): `/crm/api/{id}/access/get-info`, `/crm/api/{id}/access/v2`
- **contatos** (2): `/crm/api/{id}/contatos`, `/crm/api/{id}/contatos/byPhoneNumber`
- **contratosdigitais** (2): `/crm/api/{id}/contratosdigitais`, `/crm/api/{id}/contratosdigitais/receiveStatusUpdate`
- **customized-fields** (2): `/crm/api/{id}/customized-fields/contact`, `/crm/api/{id}/customized-fields/organizeField`
- **export** (2): `/crm/api/{id}/export`, `/crm/api/{id}/export/cancel`
- **feedbacks** (2): `/crm/api/{id}/feedbacks`, `/crm/api/{id}/feedbacks/intents`
- **file-browser** (2): `/crm/api/{id}/file-browser`, `/crm/api/{id}/file-browser/stats`
- **freshdesk** (2): `/crm/api/{id}/freshdesk/integration`, `/crm/api/{id}/freshdesk/receiveTicketsData`
- **ligacao** (2): `/crm/api/{id}/ligacao`, `/crm/api/{id}/ligacao/answer`
- **opportunities** (2): `/crm/api/{id}/opportunities`, `/crm/api/{id}/opportunities/probability-restore`
- **pandadoc** (2): `/crm/api/{id}/pandadoc`, `/crm/api/{id}/pandadoc/receiveStatusUpdate`
- **public** (2): `/crm/api/{id}/public/file`, `/crm/api/{id}/public/folder`
- **publicacao** (2): `/crm/api/{id}/publicacao`, `/crm/api/{id}/publicacao/criarPublicacaoEmail`
- **webform** (2): `/crm/api/{id}/webform`, `/crm/api/{id}/webform/view`
- **activecampaign** (1): `/crm/api/{id}/activecampaign`
- **advanced-search** (1): `/crm/api/{id}/advanced-search`
- **agents** (1): `/crm/api/{id}/agents`
- **ai** (1): `/crm/api/{id}/ai/summary/form`
- **campoPersonalizado** (1): `/crm/api/{id}/campoPersonalizado`
- **categoria** (1): `/crm/api/{id}/categoria`
- **clicksign** (1): `/crm/api/{id}/clicksign`
- **contaazul** (1): `/crm/api/{id}/contaazul/oauthCallback`
- **contact** (1): `/crm/api/{id}/contact`
- **contacts** (1): `/crm/api/{id}/contacts`
- **currency** (1): `/crm/api/{id}/currency`
- **custom-fields** (1): `/crm/api/{id}/custom-fields`
- **dashboard** (1): `/crm/api/{id}/dashboard/ai`
- **document** (1): `/crm/api/{id}/document`
- **feedback-intents** (1): `/crm/api/{id}/feedback-intents`
- **gmeet** (1): `/crm/api/{id}/gmeet/createLink`
- **googleads** (1): `/crm/api/{id}/googleads`
- **integracao** (1): `/crm/api/{id}/integracao/integrador`
- **integrations** (1): `/crm/api/{id}/integrations/dev-center`
- **lista** (1): `/crm/api/{id}/lista`
- **log** (1): `/crm/api/{id}/log`
- **mailbox** (1): `/crm/api/{id}/mailbox`
- **microsoftTeams** (1): `/crm/api/{id}/microsoftTeams/oauthCallback`
- **nectar-card** (1): `/crm/api/{id}/nectar-card`
- **oauthConnections** (1): `/crm/api/{id}/oauthConnections`
- **omnichannel** (1): `/crm/api/{id}/omnichannel/token`
- **opportunity-history** (1): `/crm/api/{id}/opportunity-history/opportunity`
- **orders** (1): `/crm/api/{id}/orders`
- **origem** (1): `/crm/api/{id}/origem`
- **pipelines** (1): `/crm/api/{id}/pipelines`
- **queues** (1): `/crm/api/{id}/queues`
- **regraJuros** (1): `/crm/api/{id}/regraJuros`
- **segmento** (1): `/crm/api/{id}/segmento`
- **shopify** (1): `/crm/api/{id}/shopify`
- **smartlist** (1): `/crm/api/{id}/smartlist`
- **table** (1): `/crm/api/{id}/table`
- **table-template** (1): `/crm/api/{id}/table-template`
- **tarefa** (1): `/crm/api/{id}/tarefa/updateTranscriptionStatus`
- **tarefas** (1): `/crm/api/{id}/tarefas`
- **task-types** (1): `/crm/api/{id}/task-types`
- **tasks** (1): `/crm/api/{id}/tasks/export-calls`
- **team** (1): `/crm/api/{id}/team/leader`
- **user** (1): `/crm/api/{id}/user/change-password`
- **users** (1): `/crm/api/{id}/users`
- **zoom** (1): `/crm/api/{id}/zoom/oauthCallback`

## Struts `/crm/crm/<ação>.do?method=<método>`: 64 ações, 600 métodos

- **configuracao** (71): checkDataBeforeSavingOmie, consultarJSON, consultarPerfilJSON, createOrUpdateConfiguracaoValor, createOrUpdateDataActiveCampaign, createOrUpdateDataContaAzul, createOrUpdateDataContratosDigitais, createOrUpdateDataDocsales, createOrUpdateDataGoogleAds, createOrUpdateDataMailchimp, createOrUpdateDataNvoip, createOrUpdateDataOmie, createOrUpdateDataPandadoc, createOrUpdateDataWooCommerce, createOrUpdateDataZendesk, createOrUpdateDuotalkIntegration, createOrUpdateZoom, desregistraEmailIntegracaoMailCenter, disableMultifilial, disableTokenJSON, emailsIntegracaoMailCenter, getActiveCampaignIntegration, getClientIdTeams, getContaAzulIntegration, getContratosDigitaisIntegration, getDocsalesIntegration, getDocumentIntegrations, getDuotalkIntegration, getEmailsRegisteredInMailcenter, getFoldersAndSignatureTypesContratosDigitais, getGMeetIntegration, getGoogleAdsIntegration, getIdentificadorEmail, getIntegracao, getMTeamsIntegration, getMailchimpIntegration, getNvoipIntegration, getNvoipUsers, getOmieIntegration, getPandadocFolders, getPandadocIntegration, getWooCommerceIntegration, getZendeskIntegration, getZoomIntegration, googleMeet, incluirJSON, incluirPerfilJSON, incluirTokenJSON, iniciarSincronizacao, integracaoSalvar, isAudienceValidMailchimp, jivochat, lahar, leadLovers, listValidationFields, listarAgendasGoogleCalendar, listarIntegracoes, listarTokensJSON, reacplicarRestricao, registraEmailIntegracaoMailCenter, removeAutomaticMailIntegration, removerMensagemBounced, salvarIdentificadorEmail, saveNvoipScript, setAutomaticMailIntegration, superlogica, testConexaoLdap, updateAllContactsExportationLimits, updateContratosDigitaisStatus, updateDocsalesStatus, updatePandadocStatus
- **entidade** (33): alterarCampos, alterarEntidadesSelecionadasJSON, cancelMassAction, categoriasCount, consultar, consultarJson, entidadesCount, estatisticas, excluir, exportar, hasMassActionInProgress, incluirJSON, incluirTelefone, listSimilarContacts, listar, listarAtividades, listarCamposPersonalizadosJSON, listarContatosJSON, listarContatosMapaJSON, listarContatosRelacionados, listarContatosVinculados, listarEnderecoSuggest, listarEntidadeJSON, listarEntidadePadrao, listarEntidadeSuggest, listarOportunidadesSuggest, loadAsyncInfo, paginaMigracao, retornaEntidadePadrao, save, setMinhaEmpresa, unirContatos, updateMainContactFromCompany
- **usuario** (28): activate, ajaxCompletarPerfil, alterarAtivo, alterarCampos, checkLoggedUser, consultar, consultarConfiguracaoRestricaoAcesso, consultarJson, consultarUsuarioLogadoJSON, excluir, getExportsInformation, getIntegrationFailures, incluirJSON, integrateAzureMail, isNPSValid, listar, listarCorresponsaveisSuggest, listarUsuarioSuggest, meusGruposJSON, removeIntegrationFailure, resendEmail, retornaAssinaturaEmailUsuario, sendAutomationSpecialistMail, setNps, toggleDarkMode, tryNewVersion, usuariosJSON, validateIfLoginExists
- **estatistica** (28): analiseClienteJSON, analiseConversaoAgrupador, analiseConversaoLoadExtras, analiseFinanceiraJSON, clientFunnelButtons, desempenhoJSON, estatisticaAnaliseConversao, estatisticaGraficoCandidato, estatisticaGraficoEvolucaoPorEtapa, estatisticaGraficoFunilVendas, estatisticaGraficoOportunidade, estatisticaGraficoOportunidadeGanhaPerdida, estatisticaLigacoesRealizadas, funilClientesJSON, getActivitiesStats, getCallStats, getQualificationActivitiesStatsGroupUsers, graficoOportunidadesAgrupado, graficoWinLoss, graficoWinLossAgrupado, graficoWinLossOportunidades, indicadoresJSON, listarEntidadesDesempenho, listarEstatisticaPipelineInfo, metasMensaisJSON, painelAoVivoJSON, ranking, relatorioAnaliseDesempenhoUsuarioExcel
- **oportunidade** (25): alterarListas, alterarOportunidadesSelecionadasJSON, cancelMassAction, cicloMedio, concluir, consultar, consultarJSON, estatisticasForPipe, exportar, getProductMix, hasMassActionInProgress, incluirJSON, listAllProductsPersonalizedFieldsJSON, listar, listarAtividades, listarCamposPersonalizadosJSON, listarCamposPersonalizadosProdutoJSON, listarOportunidadeJSON, listarOportunidadeSuggest, listarOportunidadeSuggestCount, listarPaginaMigracao, listarPipelines, loadAsyncInfo, prepareFormula, statisticsForContact
- **compromisso** (19): ajaxAlterarPresenca, ajaxConcluirLigacao, ajaxExcluir, ajaxIncluirJSON, ajaxMudarStatus, consultar, consultarGoogle, consultarJson, consultarRepeticao, excluir, exportar, incluirJSON, listar, listarCamposPersonalizadosJSON, listarCompromissosMapa, listarCompromissosMarcados, listarLocalizacoesUsuario, listarObjetosVinculados, verificarCompromissosExistentesJSON
- **tarefa** (19): ajaxConcluirLigacao, ajaxExcluir, ajaxMudarStatus, alterarTarefasSelecionadasJSON, cancelMassAction, consultar, consultarJson, excluir, exportar, hasMassActionInProgress, incluirJSON, listar, listarCamposPersonalizadosJSON, listarObjetosVinculados, listarTarefasMarcados, loadAsyncInfo, paginaMigracao, setarSubTarefa, unirContatos
- **qualificacao** (18): alterarListasQualificacao, alterarQualificacoesSelecionadasJSON, cancelMassAction, consultar, consultarJSON, estatisticas, estatisticasForPipe, getHiddenObjects, hasMassActionInProgress, importarDados, incluirJSON, iniciar, listar, listarAtividades, next, paginaMigracao, quickActions, setHiddenObjects
- **pipeline** (16): alterarJSON, calcularConversao, changeUserDefaultPipeline, checkRequirements, consultarJSON, excluir, getCamposConfiguracao, getOpportunitiesCount, incluirJSON, listar, listarPipelinePadrao, listarPipelineSuggest, listarSequenciaJSON, pipelineTasksBySequence, unir, validadePipelinesCurrency
- **item** (16): alterarItensSelecionadosJSON, calculateFormula, cancelMassAction, consultarJSON, excluir, hasMassActionInProgress, hasPricingTable, incluirJSON, listar, listarCamposPersonalizadosJSON, listarExportarExcel, listarItemSuggest, listarPaginaMigracao, unir, updateProductInPriceTables, validaMoedaProdutosDependentes
- **mailbox** (15): alterarEmMassa, changeMailStatusEnvio, checkAccountMailCenterActive, consultar, consultarEmail, delayThread, estatisticas, estatisticasEnvio, listar, listarEmails, markAsFavorite, markReadThread, thread, viewDefaultEmail, visualizacoes
- **contrato** (14): acceptContractTerm, activateEnterpriseTrial, activateTrial, alterarPlano, checkTermAcceptance, consultarInformacoesPlanoJSON, consultarJSON, consultarJson, fns, getMyMods, incluirJSON, mods, pms, solicitarContatoEmail
- **publicacao** (14): ajaxMarcarImportante, consultar, consultarJson, excluir, gostar, incluirJSON, listMentionated, listar, listarAnexosPublicacao, listarObjetoNome, marcarCategoria, protegerJSON, removeMultipleAttachments, setRead
- **meta** (14): atualizar, consultarByOwnerJson, consultarJson, estatisticas, excluir, getEstatisticasFromTimelapse, getMetaItemDetails, getMetasEmpresa, incluirJSON, isDateHoliday, listar, listarMetaSuggest, mudarStatusJSON, salvarMetasEmpresa
- **dashboard** (13): atividades, botoesOportunidades, funilCliente, funilVendaAnalitico, generatePublicUrl, gestor, getMyDashboards, keys, meta, metaPorRegiao, removeDashboard, revokePublicUrl, saveDashboard
- **proposta** (13): alterarStatusJSON, consultarJson, deleteSelected, excluir, generatePublicLink, incluirJSON, listar, listarChavesModelo, listarInformacoesOportunidade, listarPathPropostaSuggest, listarPropostaSuggest, previewProposalKeys, removeClicksignPath
- **templateEmail** (12): consultarJson, excluir, incluirJSON, listMailTemplateFolders, listar, listarChavesDisponiveis, listarTemplateEmailSuggest, prepararTemplateEmail, removeTemplateMailFolder, templateEmailPadraoJSON, transferTemplates, updateTemplateMailFolder
- **cargo** (11): consultarJSON, excluir, getUsersByJob, incluirJSON, listJobsUser, listar, listarCargoSuggest, restoreJobToAllUsers, restoreJobToOneUsers, restoreJobToSelectedUsers, unir
- **importacao** (10): analisar, cancelImportPipedrive, cancelImportSF, consultaImportacaoPipe, importar, importarPipedrive, processar, retry, running, stop
- **campoPersonalizado** (9): ajaxListar, carregarTiposCamposPersonalizados, excluir, incluirJSON, listPersonalizedFieldsSuggest, listarSecoesSuggest, listarValoresCamposSuggest, ordenarJSON, unir
- **fluxo** (9): ajaxMudarStatus, consultarJson, excluir, incluirJSON, listar, listarCamposPersonalizadosJSON, listarFluxoSuggest, listarFluxosSuggestCount, listarResponsaveisPapeisJSON
- **pivotTable** (9): cancel, consultar, excluir, getFavoritesConfigList, getFields, getOpsFields, getPersonalizedFields, incluirJSON, listar
- **ordenacaoCampos** (8): consultar, consultarCamposPadroes, findFieldById, incluirJSON, incluirJSONNew, listOtherFieldsNew, listarCampos, listarCamposNew
- **modeloFormulario** (8): consultarJson, excluir, getObjectDefaultFields, incluirJSON, listar, listarModeloFormularioSuggest, podeAdicionarModelo, salvarPergunta
- **justificativa** (7): consultar, excluir, incluir, incluirJSON, listar, listarJustificativaSuggest, unir
- **tarefaTipo** (7): excluir, getDefaultTaskType, incluirJSON, listar, listarPadrao, listarSuggest, unir
- **grupo** (7): excluir, incluirJSON, listar, listarControleGrupos, listarGrupoCorresponsavelSuggest, listarGrupoSuggest, listarSuggest
- **login** (7): destinatariosJSON, listarBotoesRapidos, listarMeusWidgets, listarWidgetsDisponiveis, salvarMeusWidgets, salvarWizard, salvarWizardPrimeiraEtapa
- **estatisticaQualificacao** (7): estatisticas, getMediumResponseTime, graficoCriadoRealizadoJSON, graficoMotivoDescarte, graficoOutrosMotivosDescarte, graficoQualificacaoAgendamentoJSON, leadOriginGraph
- **modeloProposta** (7): consultarJson, excluir, incluirJSON, listar, listarChavesDisponiveis, listarModeloPropostaSuggest, listarPipelines
- **origem** (6): excluir, incluirJSON, listar, listarOrigemSuggest, listarVinculoSuggest, unir
- **segmento** (6): excluir, incluirJSON, listar, listarSegmentoPadrao, listarSegmentoSuggest, unir
- **checklist** (6): excluir, incluirJSON, listar, listarSuggest, loadSubTarefas, unir
- **tipoCompromisso** (6): excluir, incluir, incluirJSON, listar, listarSuggest, unir
- **tabelaPreco** (6): consultarJSON, excluir, incluirJSON, listar, listarProdutosTabelaPreco, listarTabelaPrecoSuggest
- **entidadeLista** (5): excluir, incluirJSON, listar, listarSuggest, unir
- **formulario** (5): consultarJson, excluir, incluirJSON, listar, retornaFormularioExistenteJSON
- **motivoDescarteOportunidade** (5): excluir, incluirJSON, listar, listarSuggest, unir
- **motivoDescarte** (5): excluir, incluirJSON, listar, listarSuggest, unir
- **grupoItem** (5): excluir, incluirJSON, listar, listarSuggest, unir
- **tipoEntidade** (5): excluir, incluirJSON, listar, listarSuggest, unir
- **tipoLigacao** (5): excluir, incluirJSON, listar, listarTipoLigacaoSuggest, unir
- **modeloFluxo** (5): consultarJson, excluir, incluirJSON, listar, listarModeloFluxoSuggest
- **itemCusto** (5): excluir, incluirJSON, listar, listarItemSuggest, unir
- **papel** (5): excluir, incluirJSON, listar, listarSuggest, unir
- **vinculo** (5): excluir, incluirJSON, listar, listarVinculoSuggest, unir
- **snapshot** (4): consultar, excluir, incluir, listar
- **filial** (4): excluir, incluirJSON, listar, listarFilialSuggest
- **regiao** (4): excluir, incluirJSON, listar, listarRegiaoSuggest
- **webhook** (4): excluir, incluir, listar, listarEvents
- **estado** (4): getEstadoByName, getEstadoBySigla, listarEstadoSuggest, listarPaisSuggest
- **municipio** (3): getMunicipioByName, listarMesorregiaoSuggest, listarMunicipioSuggest
- **publicacaoComentario** (3): gostar, incluir, listar
- **fieldSales** (3): consultarCheckinCheckoutJSON, consultarPedidosJSON, incluirJSON
- **notificacao** (2): getNotifyCount, listar
- **timeline** (2): getLogAcaoInfo, listar
- **atribuicao** (1): listar
- **subgrupoItem** (1): listarSuggest
- **grupoTabelaPreco** (1): listarSuggest
- **subgrupoTabelaPreco** (1): listarSuggest
- **tableTemplate** (1): excluir
- **logradouro** (1): listarLogradouroSuggest
- **categoria** (1): listarSuggest
- **candidato** (1): consultar
