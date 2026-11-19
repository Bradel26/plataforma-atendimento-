# Pendências e ponto de retomada

> Atualize este arquivo a cada ciclo. Ele deve permitir retomar o trabalho em uma nova sessão sem depender do histórico da conversa.

## Status das fases

| Fase | Descrição | Status |
|---|---|---|
| 1 | Preparação, validação do REA, inventário das fontes | **Em andamento** — ferramentas validadas, categorias da Central de Ajuda listadas, README da API lido. Falta inventariar seções/artigos de cada categoria. |
| 2 | Leitura integral da documentação do CRM (Módulos, Configurações, Estatísticas, Apps) | **Concluída** (2026-10-14) — 28 seções / 156 artigos lidos integralmente. Ver `00-controle/cobertura.md` e `02-crm/*.md` |
| 3 | Leitura integral da documentação Nchat (prioridade) | **Concluída** (2026-10-14) — 13 seções / 91 artigos lidos integralmente. Ver `00-controle/cobertura.md` e `03-nchat/*.md` |
| 4 | Análise da API pública | **Concluída** (2026-10-14) — 26 pastas de `docs/` lidas; `apiary.io` confirmado inacessível |
| 5 | Investigação web com REA | Parcial — validação técnica das ferramentas feita; investigação funcional real não foi necessária (Playwright cobriu o volume de conteúdo) |
| 6 | Cruzamento de evidências | **Concluída** (2026-10-14) — `09-relatorios/descobertas.md` |
| 7 | Modelagem funcional e arquitetural | **Concluída** (2026-10-14) — `06-arquitetura/*` (8 arquivos) |
| 8 | Leitura e avaliação do nosso CRM | **Concluída** (parcial inicial + Etapa 0 de leitura de código em 2026-10-14) — `07-nosso-crm/*` |
| 9 | Comparativo e lacunas | **Concluída** (2026-10-14, atualizada após Etapa 0) — `07-nosso-crm/comparativo.md`, `lacunas.md`, `riscos.md`, `melhorias.md` |
| 10 | Especificações e roadmap | **Concluída** (2026-10-14) — `08-implementacao/*` (5 arquivos) |

## Atualização — Fases 6/7/9/10 (modelagem e comparativo, feitas diretamente, sem agentes em background)

Concluídas em 2026-10-14, a pedido explícito do usuário ("Modelagem e comparativo (Fases 6-7-9-10)"), lendo os arquivos de síntese já produzidos (`02-crm/*`, `03-nchat/*`, `04-api/*`) e o schema Prisma real do projeto (`apps/api/prisma/schema.prisma`) para fundamentar o comparativo em evidência de código, não só em documentação do concorrente.

Arquivos criados: `06-arquitetura/` completo (8 arquivos: entidades, modelo-relacional, diagramas, maquinas-estados, fluxos, arquitetura-proposta, integracoes, seguranca), `07-nosso-crm/comparativo.md`, `lacunas.md`, `riscos.md`, `melhorias.md`, `08-implementacao/` completo (5 arquivos), `09-relatorios/` completo (4 arquivos), `05-rea/evidencias.md` (nota de escopo).

**Achados confirmados por leitura de schema (não suposição)**: `OportunidadeStatus` tem só 3 valores (falta Descartada/Prorrogada — gap de maior impacto em métrica de conversão); `ConversationStatus` tem 4 valores sem equivalente a "Aguardando cliente"; `CampanhaItemStatus` sem distinção entrega/leitura. Em contrapartida, nosso motor de fluxo (`Fluxo`/`ExecucaoFluxo`, com rascunho/publicado/versão) já resolve uma lacuna que o próprio Nchat documenta não ter (sem versionamento/staging).

## Atualização — Etapa 0 do roadmap (leitura de código, concluída 2026-10-14)

Ver `09-relatorios/etapa-0-leitura-codigo.md` para o detalhamento completo. Lidos: `conversations.service.ts`, `queues.service.ts`, `auth.service.ts`, `politicas.ts`, `fluxos/validacao.ts` + `fluxos.service.ts`, `channels/inbound.service.ts`, e os models `OpportunityAnalysis`/`PropostaGerada`. Resultado: 6 dos 12 itens antes `NÃO VERIFICADO` resolvidos — 4 confirmam vantagem já construída (unicidade de conversa, concorrência de "assumir" via `UPDATE...WHERE` atômico, RBAC de 6 papéis com visibilidade por linha de dados, transferência de fila/agente no grafo de fluxo), 2 confirmam gap real de produto (Saúde do negócio, fluxo de aprovação de proposta). `comparativo.md`, `lacunas.md`, `riscos.md`, `roadmap.md`, `backlog.md` e `nao-verificado.md` já atualizados com os novos achados.

## Próximo item pendente (retomar daqui)

Restam **9 itens NÃO VERIFICADO** (ver `09-relatorios/nao-verificado.md`, itens 17-22) e **5 decisões de escopo que dependem do usuário** (`08-implementacao/backlog.md`, BL-14 a BL-18: Saúde do negócio, cascateamento de funil vs. CicloParceiro, webhooks de saída, fluxo de aprovação de proposta, distribuição round-robin de registros de CRM). Nenhum bloqueia a Etapa 1 do roadmap (correções de `OportunidadeStatus` e `ConversationStatus`), que pode começar a qualquer momento com aprovação do usuário — a investigação documental e de arquitetura está completa; o que falta é decisão de implementação, não mais pesquisa.

### Itens já concluídos (histórico)

1. ~~Priorizar a categoria **Nchat**~~ — **feito** (2026-10-14): 13 seções / 91 artigos lidos.
2. ~~Abrir as categorias Módulos, Configurações, Estatísticas e Apps~~ — **feito** (2026-10-14): 28 seções / 156 artigos lidos.
3. ~~Abrir as demais 9 categorias da Central de Ajuda~~ — **feito** (2026-10-14): 44 seções / 222 artigos abertos. Todas as 14 categorias cobertas.
4. ~~Abrir a pasta `docs/` do repositório `nectarcrm-api`~~ — **feito** (Fase 4).
5. ~~Modelagem, comparativo e roadmap (Fases 6-7-9-10)~~ — **feito** (2026-10-14).
6. ~~Etapa 0 de leitura de código~~ — **feito** (2026-10-14).

### Pendências específicas que ficaram dentro do próprio Nchat (não bloqueiam a Fase 3, mas exigem decisão/ação futura)

- 4 inconsistências entre artigos da própria documentação foram registradas sem resolução por inferência (ver `00-controle/cobertura.md` → "Nchat — detalhamento da Fase 3" e `03-nchat/arquitetura-funcional.md`). Só poderiam ser resolvidas com acesso autenticado ao produto real (fora do escopo desta fase, que é documental) ou com uma pergunta direta ao time da Nectar.
- Modelo de dados real (schema de banco), payloads de webhook específicos de conversa/Nchat, e o mecanismo técnico exato de lock de atribuição de conversa continuam **NÃO VERIFICADOS** (são propostas de implementação nossas em `03-nchat/atribuicao-transferencia.md` e `chatbot.md`, não fatos documentados do Nectar).

## Decisões já tomadas (preservar, não repetir pergunta)

- Trabalhar com Playwright para navegação/interação e REA para evidência/captura verificável (instrução explícita do usuário).
- Não logar automaticamente em `app.nectarcrm.com.br`; qualquer tela autenticada interrompe e pede ação manual do usuário.
- Pasta de documentação é `docs/engenharia-reversa-nectar/` (separada da pasta antiga `docs/engenharia-reversa/nectar-crm/`, que cobre só marketing e é só referenciada).
- Ambiente REA/Playwright já validado nesta sessão — não repetir testes de conectividade a menos que uma chamada falhe.

## Limitações já conhecidas

- `WebFetch` direto bloqueado (403) em `ajuda.nectarcrm.com.br` — usar Playwright.
- REA filtra conteúdo de origem de terceiros por padrão; precisa `allowed_origins` explícito por chamada para liberar scripts/recursos.
- `gh` CLI não está instalado nesta máquina — GitHub é acessado via Playwright/WebFetch.

## Atualização Fase 4 (API)

**Cobertura:** as 26 pastas de `docs/` do repositório `nectarcrm-api` foram lidas via WebFetch (README.md de cada pasta; `schema.json` lido integralmente só para `contato` e `oportunidade`; para `webhook`, também foi lido o `events.md` vinculado, que traz a lista completa de códigos de evento). Produzidos os arquivos `04-api/inventario-endpoints.md`, `autenticacao.md`, `contratos.md`, `entidades.md`, `relacionamentos.md`, `webhooks.md`, `tratamento-erros.md`. A seção "API pública" de `00-controle/cobertura.md` foi atualizada com o status de cada pasta.

**O que ficou pendente:**
1. `docs.nectarcrm.apiary.io` está inacessível para leitura via WebFetch: a URL com o subdomínio `docs.` falha por erro de certificado TLS; a variante `nectarcrm.docs.apiary.io` carrega mas é uma SPA JavaScript da qual só se obteve o `<title>`, sem conteúdo navegável. Se a Central de Ajuda (Fase 2/3, via Playwright) encontrar um link direto e funcional para a documentação Apiary, vale reabrir com navegador real em vez de WebFetch.
2. `schema.json` de 24 das 26 pastas não foi lido integralmente (só os READMEs) — os READMEs geralmente já continham tabelas de campos equivalentes, mas os schemas podem ter detalhes de tipo/obrigatoriedade adicionais não capturados.
3. Payload de entrega de webhook (o corpo que o NectarCRM efetivamente envia por POST quando um evento dispara) continua NÃO VERIFICADO — não há exemplo documentado em `docs/webhook/`.
4. Várias pastas (`produto`, `pipeline`, `compromisso`, `tarefa`, `lista`, `origem`, `segmento`, `categoria`, `tipos`, `usuario`, `equipe`, `produtoCategoria`, `produtoSubCategoria`) documentam só o endpoint de listagem/consulta no README, mesmo afirmando "controle total" (CRUD) da entidade — os métodos de criação/atualização/exclusão existem no sistema real mas não foram confirmados pela documentação lida (ver notas "NÃO VERIFICADO" em `inventario-endpoints.md`).
5. Diversas inconsistências de nomenclatura entre texto/tabela de campos e exemplos JSON foram registradas em `relacionamentos.md` e `tratamento-erros.md` (ex.: `isAtivo` vs `ativo` no webhook, `subcategoria` vs `subCategoria` no produto, `anexos` como objeto vs array na publicação) — nenhuma foi resolvida, pois exigiria uma chamada real contra a API, fora do escopo desta fase.

## Atualização Fase 2 (CRM — Módulos/Configurações/Estatísticas/Apps)

**Cobertura:** as 4 categorias foram abertas e lidas por completo via Playwright (`navigate` + `evaluate` do `innerText` do corpo do artigo, nunca inferido pelo título). Inventário de seções obtido por extração de links `a[href*="/articles/"]` de cada página de seção, garantindo contagem exata mesmo quando a página da categoria só mostra amostra + "Ver todos". Resultado: **Módulos** 8 seções/58 artigos, **Configurações** 11 seções/57 artigos, **Estatísticas** 3 seções/17 artigos, **Apps** 6 seções/24 artigos — **total 28 seções / 156 artigos, 100% lidos**.

Arquivos produzidos/atualizados nesta fase:
- `01-inventario/categorias.md`, `secoes.md`, `artigos.md` — acrescentadas as 4 categorias sem tocar nas entradas do Nchat.
- `02-crm/contatos.md`, `oportunidades.md`, `pipelines.md`, `tarefas.md`, `compromissos.md`, `produtos.md`, `propostas.md`, `dashboard.md`, `configuracoes.md`, `permissoes.md` — 10 arquivos novos de síntese funcional, cada um separando CONFIRMADO POR DOCUMENTAÇÃO / INFERIDO / NÃO VERIFICADO / PROPOSTA DE IMPLEMENTAÇÃO.
- `oportunidades.md` inclui um diagrama `stateDiagram-v2` (Mermaid) só com as transições de status confirmadas por documentação (Em Andamento → Ganha/Perdida/Descartada/Prorrogada).
- `00-controle/cobertura.md` — linhas Módulos/Configurações/Estatísticas/Apps atualizadas para `completo`, com uma seção de detalhamento dos achados mais relevantes.

**Achados de maior impacto para a modelagem futura (Fase 7):**
1. Ciclo de vida do contato (Lead→Suspect→Prospect→Cliente) com regras de transição automática citadas literalmente em 2 artigos independentes (configurável, pode estar desligado).
2. Regra de desconto "usuário > produto quando o limite do usuário é maior" confirmada de forma consistente em 3 artigos (`Aplicação de descontos em produto da oportunidade`, `Parâmetros de Produtos`, `Parâmetros de Usuários`) — inicialmente soava como ambiguidade de redação, mas é repetida sem variação.
3. Exclusão de oportunidade só ocorre como efeito colateral da exclusão do contato — "Descartar" é um status de negócio, não remoção física.
4. Motor de workflow por etapa de funil (tarefas automáticas, parâmetro "Passa etapa", bloqueio por tarefa obrigatória) e motor de Automações (Apps) com gatilho+critério+ação e regra explícita de **não encadeamento** entre automações.
5. Feature de IA "Saúde do negócio" (nota 3–99 com decaimento temporal, intenções de feedback com peso configurável, recalibração orientada por análise de fechamento) — redefine a régua clássica de probabilidade "Fria/Morna/Quente/Muito Quente" quando ativada.
6. Log de Auditoria com schema de colunas documentado (Responsável/Quando/Ação/Onde/Permissão/Detalhe antes-depois) — referência direta para desenhar um log de auditoria equivalente no nosso CRM.

**O que ficou pendente/fora do escopo desta rodada:**
1. Seis áreas foram lidas e registradas em `01-inventario/artigos.md` mas não ganharam arquivo de síntese dedicado em `02-crm/`, por não constarem na lista de temas prioritários do prompt mestre: **Nectar Drive** (módulo de arquivos, 9 artigos), **Automações** (motor de regras, 5 artigos), **Business Intelligence** (relatórios dinâmicos + fórmulas, 3 artigos), **Metas** (app, 9 artigos — distinto do Widget de Metas já coberto em `oportunidades.md`), **Mailbox** (webmail integrado, 5 artigos), **Field Sales** (app de campo, 1 artigo). Se desejado, cada um pode virar um arquivo próprio numa iteração futura — o conteúdo já lido está resumido linha a linha na tabela de `artigos.md` e pode ser expandido sem reabrir o navegador.
2. Dentro de "Configurações de Campos", os tipos de campo "Seleção externa" (fonte planilha/API) e "Campos dependentes" foram documentados em `contatos.md`, mas o mecanismo de campos personalizados é genérico (vale também para Oportunidades, Compromissos, Procedimentos, Produtos, Tarefas) — não foi criada uma análise cruzada de todas essas entidades, só a de Contatos foi aprofundada.
3. Uma aparente variação de nomenclatura do campo "Status" de Oportunidade foi registrada sem resolução: a importação usa "Em Andamento/Ganha/Perdida/Descartada/Prorrogada", enquanto o catálogo de campos padrão (`Campos Padrões de Oportunidades no CRM`) usa "aberta/em progresso/ganha/perdida" — não há artigo que concilie os dois vocabulários.
4. "% Liquidez" de produto foi confirmado como "percentual de receita líquida do produto" mas sem detalhamento de fórmula (ex. se desconta impostos/custos específicos).
5. Não foi feita nenhuma tentativa de acesso autenticado a `app.nectarcrm.com.br` (fora de escopo e proibido pelas restrições da tarefa) — toda a leitura é documental, via Central de Ajuda pública.

## Atualização Fase 2b (categorias periféricas)

**Cobertura:** as 9 categorias restantes da Central de Ajuda — Integrações, Integrações Pluga, Nectar Mobile, Talk+, EasyForms, Leadboard, API (seção da Central de Ajuda, distinta do repositório GitHub), FAQ e Novidades — foram abertas e lidas via Playwright. Método: `browser_navigate` para abrir cada página de categoria pela primeira vez (confirmando a lista real de seções, nunca presumida), seguido de `browser_evaluate` com `fetch()` same-origin, rodado dentro do contexto já navegado da própria aba, para extrair em lote os links de artigo de cada seção e o `innerText` de `.article-body` de cada artigo — equivalente a abrir cada página individualmente, mas permitindo processar lotes de até ~28 artigos por chamada de ferramenta e assim cobrir 222 artigos/posts dentro do orçamento da tarefa. Resultado: **Integrações** 17 seções/92 artigos, **Integrações Pluga** 5/10, **Nectar Mobile** 8/34, **Talk+** 2/8, **EasyForms** 3/6, **Leadboard** 5/19, **API** 1/7, **FAQ** 1/15, **Novidades** 2/31 (posts de changelog, tratados por varredura de palavra-chave em vez de resumo individual, conforme instrução explícita do prompt para essa categoria de baixa prioridade) — **total 44 seções / 222 artigos, 222 abertos (100%)**.

Com esta fase, **as 14 categorias da Central de Ajuda do NectarCRM citadas na seção 4 do prompt mestre estão com inventário de seções e artigos 100% concluído**: Nchat (Fase 3), Módulos/Configurações/Estatísticas/Apps (Fase 2), e as 9 desta fase (Fase 2b).

Arquivos produzidos/atualizados nesta fase:
- `01-inventario/categorias.md`, `secoes.md`, `artigos.md` — acrescentadas as 9 categorias (linhas novas), sem alterar o conteúdo já existente de Nchat/Módulos/Configurações/Estatísticas/Apps.
- `01-inventario/funcionalidades.md` — **arquivo novo**: síntese funcional por categoria periférica (o que cada integração/app faz), toda afirmação citando o ID do artigo-fonte.
- `00-controle/cobertura.md` — as 9 linhas das categorias periféricas atualizadas de "pendente" para "completo", com números reais e uma seção de detalhamento dos achados mais relevantes desta fase.

**Achados de maior impacto para a modelagem futura (Fase 7):**
1. **Leadboard** (funil de pré-venda/qualificação, paralelo ao funil de Oportunidades) tem etapas com tarefas obrigatórias, fila de distribuição entre vendedores, agendamento prévio obrigatório configurável na última etapa (pode criar Oportunidade automaticamente ao agendar) e cascata entre funis de Leadboard ao qualificar — mecanismo de encadeamento que o motor de Automações (Apps, já coberto na Fase 2) explicitamente não tem entre si. Isso detalha e confirma a menção a "leadboard" como seção de tabela dinâmica vinculada a Qualificação, já citada no README da pasta `tabelaDinamica` de `04-api/inventario-endpoints.md`.
2. **Talk+** é VoIP nativo (não terceirizado, ao contrário das 9 integrações de telefonia da categoria "Integrações") com cobrança por "minuto cheio" (todo minuto iniciado é cobrado por inteiro; a chamada/transcrição é encerrada automaticamente se o saldo acabar no meio) e uma feature de IA pós-chamada (resumo + "próximas ações recomendadas" + análise de sentimento). É o candidato direto de comparação com o módulo `voice` do nosso CRM (`VoiceConfig`/`Call`/`CallSuggestedAction` no Prisma) — o nome do model `CallSuggestedAction` sugere que já havia intenção de implementar algo equivalente às "próximas ações recomendadas" do Talk+.
3. Regra de autodesativação automática de integração após 2+ respostas de erro HTTP consecutivas (≠200) da API externa — confirmada para a integração com ActiveCampaign (FAQ, artigo `42427199040915`); não confirmamos se o mesmo mecanismo vale para as demais ~40 integrações de API externa documentadas (é INFERIDO, não CONFIRMADO, para o caso geral).
4. A seção "Webhooks" da categoria API (Central de Ajuda) documenta uma lista de eventos mais ampla que o README do repositório GitHub `nectarcrm-api` (inclui eventos de Leadboard e Easyforms não detalhados lá) — as duas fontes devem ser tratadas como complementares.
5. Nenhum dos 31 posts de changelog da categoria "Novidades" (jun/2022–abr/2025) menciona "Nchat" nos termos pesquisados, apesar de o Nchat ter 91 artigos de documentação de produto (Fase 3) — achado de documentação registrado sem tentativa de explicação por inferência (pode ser canal de changelog separado, não indexado nesta categoria pública).

**O que ficou pendente/fora do escopo desta rodada:**
1. `docs.nectarcrm.apiary.io` continua **inacessível para leitura de conteúdo** (já registrado como limitação da Fase 4, via WebFetch). Esta fase não tentou reabri-lo via Playwright porque o escopo da tarefa era só a Central de Ajuda — mas agora que há navegador real disponível (diferente do WebFetch que falhou na Fase 4), vale reabrir numa fase futura.
2. Na categoria FAQ, ~6 dos 15 artigos são índices redundantes com conteúdo já lido em outras categorias (Easyforms, Nectar for Whats, Estatísticas, Dashboard) — registrados na tabela de `artigos.md` por completude, mas sem achado novo de regra de negócio.
3. Não foi possível confirmar se a regra de autodesativação de integração (achado 3 acima) é genérica para todas as integrações de API externa do Nectar ou específica do ActiveCampaign — exigiria mais artigos de FAQ/Status que não existem na Central de Ajuda atual, ou acesso autenticado ao produto (fora de escopo).
4. Uma possível lacuna documental foi registrada sem resolução: o artigo de integração WooCommerce (`8345905070099`) documenta explicitamente ganhar/perder/descartar oportunidade conforme status do pedido, enquanto o artigo de Shopify (`7530678697619`) só documenta o ganho — não sabemos se é uma limitação real da integração Shopify ou uma lacuna de redação do artigo.
5. Nenhuma tentativa de acesso autenticado a `app.nectarcrm.com.br` foi feita (fora de escopo e proibido pelas restrições da tarefa) — toda a leitura desta fase é documental, via Central de Ajuda pública.

## Fase REA do frontend (2026-10-22)

Concluída a análise do código público entregue por `app.nectarcrm.com.br` (página de login, 31 scripts, i18n com 15.607 chaves, versão 26.4.006). Resultados em `../05-rea/`. Correções a achados anteriores:
- "Sem encadeamento entre automações" agora é **parcialmente contestado**: as ações `SELF_UPDATE` e `INIT_LEADBOARD` + o gatilho `updated` permitem encadeamento indireto (INFERIDO; ver `../05-rea/permissoes-e-automacoes.md`).
- A Central de Ajuda não documenta a suíte de agentes de IA (Enriquecedor, Deal Coach, Salesman Coach, Cadência/SDR, Data Steward, Copilot), o módulo Vendas/Pedidos (permissões 1051–1053), o fluxo de aprovação de proposta com marca d'água nem o Nectar Drive com regras; todos estão presentes no i18n.

Pendente:
1. Telas autenticadas: exigem login **manual** de alguém da Bradel no Chrome isolado observado pelo REA.
2. APK do Nectar Mobile: ferramentas (JADX/apktool) já instaladas.
3. Front do Nchat (sistema separado, com usuário sincronizado pelo CRM).

### Atualização 22/10, área autenticada
Login manual de um usuário da Bradel; análise em `../05-rea/area-autenticada.md`, `../05-rea/nchat-omnichannel.md` e `../05-rea/inventario-endpoints-internos.md`. Corrige a fase anterior: o Nchat **não** está em outro domínio; é um iframe Vue em `/nchat/` na mesma origem que fala por GraphQL com um backend omnichannel separado (URL por cliente). A PCM Soluções aparece no código como integração de **telefonia** do Nectar.
Pendente: formato dos payloads (`include_json_body_shapes`, só nomes e tipos de campos) e APK Android.
