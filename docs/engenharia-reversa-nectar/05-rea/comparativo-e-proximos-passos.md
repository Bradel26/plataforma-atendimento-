# O que isso muda para a plataforma-atendimento

Base do nosso lado: `apps/api/prisma/schema.prisma` (enum `Role`, `ModulePermission`, `Fluxo`/`ExecucaoFluxo`, `ConsumoIA`, `OpportunityAnalysis`, `CallSuggestedAction`, `Lead`, `Funnel`) e os módulos em `apps/api/src/modules/`.

## Onde já estamos à frente em arquitetura

- **Stack**: o Nectar é Struts 1 + JSP + AngularJS 1, com duas camadas de API convivendo. Não vale copiar padrões de código; vale copiar **regras de negócio e UX**.
- **Atendimento integrado**: no Nectar, o Nchat é um sistema à parte, com usuário sincronizado (provisionamento pode falhar, segundo `omnichannel.erro.*`). Em nós, conversa, contato e oportunidade estão no mesmo banco.

## Lacunas concretas que esta fase revelou

| # | Item do Nectar | Nosso equivalente | Sugestão |
|---|---|---|---|
| 1 | 54 permissões finas numeradas (escopo "próprias/qualquer" + ações sensíveis) | 6 papéis fixos (`Role`) + `ModulePermission` por módulo | Acrescentar permissões de **ação sensível** independentes do papel: exportar, excluir, unir contatos, reabrir ou editar oportunidade finalizada, baixar gravação, transferir conversa de outro agente |
| 2 | Modal de re-login quando a sessão expira (`logado:false`), sem perder a tela | (verificar) | Interceptor 401 → modal de login que repete a requisição |
| 3 | Construtor de automações com 17 operadores e 10 ações, incluindo `ROTATE`, `APPLY_SCORE`, `WEBHOOK` e gatilhos "estagnada" e "sem interação" | `Fluxo`/`ExecucaoFluxo` (voltados a bot) | Usar a gramática como referência de escopo de um motor de regras de CRM |
| 4 | Deal Coach: risk score por ciclo + sinais com peso + ação prioritária por etapa, gravado em campo filtrável | `OpportunityAnalysis` | Gravar o score num campo filtrável e permitir "ação prioritária por etapa" configurável |
| 5 | Sinais de intenção com peso, **meia-vida** e calibração com IC de 95% | — | Ideia forte e barata: decaimento exponencial nos sinais da "saúde" da oportunidade |
| 6 | Agentes com modo **automático ou com aprovação** + painel de "aproveitamento" (aceite/recusa) | `ConsumoIA` mede custo, não aceite | Registrar aceite ou recusa de cada sugestão da IA |
| 7 | Fluxo de aprovação de proposta com marca d'água | `PropostaGerada` | Status "aguardando aprovação" + marca d'água no PDF |
| 8 | Restrição de login por IP e por horário; limite de exportação | `WorkShift`/`PresenceLog` existem, mas não bloqueiam login | Avaliar para LGPD |
| 9 | Um login com várias bases (tenants) e escolha no login | `Organizacao` | Só importa se a Bradel for operar várias empresas do grupo separadas |

## Lacunas acrescentadas pela área autenticada

| # | Item do Nectar | Nosso equivalente | Sugestão |
|---|---|---|---|
| 10 | **Pipeline de pós-venda** (`/pipelines/aftersales`) além de venda e qualificação, com o mesmo motor polimórfico (`tipo` 0/1/2) | `Funnel` (vendas) + `CicloParceiro` | Encaixa direto no credenciamento TIM/Starlink e na garantia Philco: um funil depois do ganho |
| 11 | Auditoria campo a campo no **atendimento** (`supportCaseUpdates`: campo, antes, depois, autor) | `OpportunityAudit` só em oportunidade | Estender para `Conversation`: fila, dono e status |
| 12 | **Limite de atendimentos simultâneos por agente** (`caseCapacityLimit` / `openCaseCount`) | `QueueAgent` | Conferir se a distribuição respeita capacidade |
| 13 | Distribuição na criação, na atualização **e periódica**, com estratégia para agente indisponível | Distribuição da fila | Redistribuir periodicamente os casos parados na fila |
| 14 | **Sub-status configuráveis** por cima do status fixo do atendimento | Status fixos | Ex.: "aguardando peça", "aguardando técnico" para assistência técnica |
| 15 | Métricas de atendimento com **mediana** de tempo de resposta (não só média) | `metrics` | A média distorce com casos extremos |
| 16 | Qualidade do número oficial (FLAGGED/RESTRICTED) exposta ao gestor | `ChannelConfig` | Mostrar status de qualidade da Meta |
| 17 | IA com **sugestão de fórmula de lead score**, previsão de vendas e motivo de perda sugerido | `OpportunityAnalysis` | Candidatos baratos sobre dados que já temos |
| 18 | Servidor **MCP** público (`mcp.nectarcrm.com.br/mcp`, OAuth) para o cliente plugar Claude no CRM | — | Diferencial de mercado; nossa API já tem `IntegrationToken` |
| 19 | Ações em massa em background com trava por tela (`hasMassActionInProgress`) | — | Evita importação, exclusão ou edição em massa concorrentes |

O que **não** copiar (ver `area-autenticada.md`): JWT em query string, JWT sem `exp`, pixel do Facebook dentro do app autenticado e e-mail do usuário em URL de terceiro.

## Próximos passos possíveis

1. ~~Telas autenticadas~~: feito em 22/10 (`area-autenticada.md`, `nchat-omnichannel.md`).
2. **Formato dos payloads**: repetir a captura com `include_json_body_shapes`, que traz só nomes e tipos de campos, sem valores, nas telas de oportunidade e Nchat. Exige um novo login manual.
3. **Nectar Mobile (Android)**: JADX e apktool instalados; o APK público pode ser analisado com `inspect_android_package`.
4. **Backend do omnichannel**: o `integratorUrl` vem por cliente e não foi registrado (está só no corpo de resposta). Descobrir o fornecedor exigiria a resposta de `omnichannel/token`, que traz segredo, então está fora do escopo.
