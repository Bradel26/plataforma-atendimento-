# Controle de cobertura — Central de Ajuda

Status possíveis: `pendente`, `em-andamento`, `analisado`, `parcial`, `inacessível`.

| Categoria | Seções inventariadas | Artigos inventariados | Artigos analisados em profundidade | Status |
|---|---|---|---|---|
| Nchat | 13/13 (todas confirmadas por navegação real) | 91/91 | 91 (90 analisados + 1 com conteúdo trocado/mismatch) | **completo** (Fase 3 concluída em 2026-10-14; ver `03-nchat/*.md`) |
| Módulos | 8/8 | 58/58 | 58 analisados | **completo** (Fase 2 concluída em 2026-10-14; ver `02-crm/*.md`) |
| Configurações | 11/11 | 57/57 | 57 analisados | **completo** (Fase 2 concluída em 2026-10-14; ver `02-crm/*.md`) |
| Estatísticas | 3/3 | 17/17 | 17 analisados | **completo** (Fase 2 concluída em 2026-10-14; ver `02-crm/dashboard.md`) |
| Apps | 6/6 | 24/24 | 24 analisados | **completo** (Fase 2 concluída em 2026-10-14; ver `02-crm/propostas.md` e `02-crm/configuracoes.md`) |
| Integrações | 17/17 | 92/92 | 92 analisados | **completo** (Fase 2b concluída em 2026-10-14; ver `01-inventario/funcionalidades.md`) |
| Integrações Pluga | 5/5 | 10/10 | 10 analisados | **completo** (Fase 2b concluída em 2026-10-14; ver `01-inventario/funcionalidades.md`) |
| Nectar Mobile | 8/8 | 34/34 | 34 analisados | **completo** (Fase 2b concluída em 2026-10-14; ver `01-inventario/funcionalidades.md`) |
| Talk+ | 2/2 | 8/8 | 8 analisados | **completo** (Fase 2b concluída em 2026-10-14; ver `01-inventario/funcionalidades.md`) |
| EasyForms | 3/3 | 6/6 | 6 analisados | **completo** (Fase 2b concluída em 2026-10-14; ver `01-inventario/funcionalidades.md`) |
| Leadboard | 5/5 | 19/19 | 19 analisados | **completo** (Fase 2b concluída em 2026-10-14; ver `01-inventario/funcionalidades.md`) |
| API (seção da Central de Ajuda, distinta do repo GitHub) | 1/1 | 7/7 | 7 analisados | **completo** (Fase 2b concluída em 2026-10-14; ver `01-inventario/funcionalidades.md`) |
| FAQ | 1/1 | 15/15 | 15 analisados (6 são índices redundantes com outras categorias) | **completo** (Fase 2b concluída em 2026-10-14; ver `01-inventario/funcionalidades.md`) |
| Novidades | 2/2 | 31/31 | 31 abertos (changelog; varredura por palavra-chave, não resumo individual, por instrução explícita) | **completo** (Fase 2b concluída em 2026-10-14; ver `01-inventario/funcionalidades.md`) |

Não declarar nenhuma categoria 100% coberta enquanto existirem artigos acessíveis e não lidos (regra da seção 35 do prompt mestre).

## Módulos, Configurações, Estatísticas, Apps — detalhamento da Fase 2 (concluída 2026-10-14)

28 seções, 156 artigos, todos abertos e lidos individualmente via Playwright (navigate + evaluate de `innerText` do corpo do artigo, nunca inferidos pelo título). Inventário de seções confirmado via `browser_evaluate` extraindo `a[href*="/articles/"]` de cada página de seção (mesmo método usado na Fase 3/Nchat), garantindo contagem exata mesmo quando a página da categoria só mostra amostra + "Ver todos os N artigos".

Detalhamento seção a seção em `01-inventario/secoes.md`, artigo a artigo em `01-inventario/artigos.md`. Síntese funcional em `02-crm/*.md` (11 arquivos: contatos, oportunidades, pipelines, tarefas, compromissos, produtos, propostas, dashboard, configuracoes, permissoes — mais o diagrama de estados Mermaid em `oportunidades.md`).

Achados de arquitetura/regra de negócio mais relevantes desta fase:
- Ciclo de vida do contato com 3 regras de transição automática literais e configuráveis (`contatos.md`, `configuracoes.md`).
- Regra de prioridade de desconto (usuário > produto quando o limite do usuário é maior) confirmada de forma consistente em 3 artigos independentes (`oportunidades.md`, `produtos.md`, `configuracoes.md`) — inicialmente registrada como achado isolado/contraintuitivo, depois promovida a CONFIRMADO.
- "Uma oportunidade só é removida quando o seu contato é excluído" — Descartar é estado de negócio, não exclusão física (`oportunidades.md`).
- Motor de automação (Apps > Automações): gatilhos por módulo, critérios tipados por campo, ações variadas, sem encadeamento entre automações, limite de automações ativas por plano (`configuracoes.md` não cobre isso — ver nota abaixo, conteúdo ficou em `01-inventario/artigos.md` por não ter arquivo 02-crm dedicado a automações/BI/metas/mailbox/field sales/Nectar Drive).
- Feature de IA "Saúde do negócio" com nota 3–99, decaimento temporal e recalibração de pesos (`oportunidades.md`).
- Log de Auditoria com schema de colunas documentado (`dashboard.md`).

**Nota de escopo**: os arquivos `02-crm/*.md` cobrem os temas explicitamente pedidos no prompt mestre (contatos, oportunidades, pipelines, tarefas, compromissos, produtos, propostas, dashboard, configurações, permissões). Conteúdo lido mas sem arquivo de síntese dedicado — Nectar Drive, Automações, Business Intelligence, Metas (app), Mailbox, Field Sales — está integralmente registrado em `01-inventario/artigos.md` (resumo por artigo) e pode ser expandido em arquivos próprios numa fase futura, se solicitado.

## Nchat — detalhamento da Fase 3 (concluída 2026-10-14)

13 seções, 91 artigos, todos abertos e lidos individualmente via Playwright (nunca inferidos pelo título). Detalhamento seção a seção em `01-inventario/secoes.md`, artigo a artigo em `01-inventario/artigos.md`. Síntese funcional em `03-nchat/*.md` (15 arquivos: arquitetura-funcional, whatsapp-lite, whatsapp-oficial, canais, equipes-permissoes, conversas, estados-atendimento, atribuicao-transferencia, mensagens, respostas-rapidas, encerramento, campanhas, chatbot, instagram, relatorios).

Um único artigo (`49771553678867`, "Como visualizar o histórico de atendimento de um contato no Nchat") foi lido integralmente mas seu corpo publicado é idêntico ao de outro artigo (privacidade de Templates Lite/Respostas Rápidas) — achado de documentação real, registrado e não contornado por suposição.

Quatro inconsistências entre artigos da própria Central de Ajuda foram identificadas e documentadas sem tentativa de resolução por inferência (ver `03-nchat/arquitetura-funcional.md`, seção "Inconsistências de documentação encontradas"): limite de contatos por campanha (100 vs. 500/1000), suporte de campanhas no WhatsApp Lite (Sim vs. Não, conforme o artigo), criação de tarefa pelo Nchat (Sim vs. Não, conforme o artigo), e o mismatch de conteúdo citado acima.

## API pública (`nectarcrm-api`)

Confirmado via listagem real do diretório `docs/` (GitHub, 2026-10-14): **26 pastas**, 3 a mais do que o README linka diretamente (`bigData`, `formulario`, `queues`). Fase 4 concluída (2026-10-14): todas as 26 pastas lidas (README.md de cada uma; `schema.json` lido integralmente só para `contato` e `oportunidade`, as demais ficaram no texto do README). Ver `04-api/*.md` para o detalhamento completo.

| Endpoint (pasta `docs/`) | Status | Nota |
|---|---|---|
| contato | sim | README + schema.json lidos |
| oportunidade | sim | README + schema.json lidos |
| qualificacao | sim | DELETE documentado sem `{id}` no caminho (provável erro de doc) |
| compromisso | sim | só endpoint de listagem documentado no README, demais métodos não especificados |
| tarefa | sim | só endpoint de listagem documentado no README |
| publicacao | sim | paginação específica (limite 100/página, diferente do padrão 200) |
| pipeline | sim | só listagem documentada; vários flags de regra de negócio |
| campoPersonalizado | sim | inclui endpoint separado de layout de tela (`/customField/fields/{objectType}`) |
| produto | sim | README só documenta upload/remoção de foto; CRUD completo não detalhado |
| produtoCategoria | sim | só listagem documentada |
| produtoSubCategoria | sim | só listagem documentada |
| tabelaPreco | sim | inclui endpoints de add/remover produto da tabela |
| tabelaDinamica | sim | pasta mais detalhada do repositório — CRUD completo de tabela e linhas, códigos 400/403/404/409/500 próprios |
| lista | sim | só listagem documentada, com 3 filtros booleanos |
| origem | sim | só listagem documentada |
| segmento | sim | só listagem documentada |
| categoria | sim | só listagem documentada, com flags de visibilidade por seção |
| tipos | sim | cobre 2 subendpoints: tipos de compromisso e tipos de ligação |
| usuario | sim | só listagem documentada |
| webhook | sim | README + `events.md` lidos (lista completa de eventos obtida); payload de entrega NÃO VERIFICADO |
| equipe | sim | só listagem documentada |
| proposta | sim | só consulta por oportunidade documentada |
| rdstation | sim | autenticação via `api_token` na query, não via header `Access-Token` |
| bigData | sim | acesso restrito a ADMIN do plano Enterprise; lista de 13 subendpoints de extração |
| formulario | sim | inclui `modeloFormulario` referenciado sem endpoint próprio |
| queues | sim | distribuição round-robin (FIFO), restrito a ADMIN para escrita |

## Integrações, Integrações Pluga, Nectar Mobile, Talk+, EasyForms, Leadboard, API (Central de Ajuda), FAQ, Novidades — detalhamento da Fase 2b (concluída 2026-10-14)

44 seções, 222 artigos/posts (191 artigos lidos integralmente "analisado" + 31 posts de changelog da categoria Novidades abertos e varridos por palavra-chave, conforme instrução explícita de não resumir changelog item a item). Método: navegação real via `browser_navigate` para abrir cada página de categoria pela primeira vez, seguida de extração em lote via `browser_evaluate` com `fetch()` same-origin (dentro do contexto já autenticado/navegado da própria aba) para ler `a[href*="/sections/"]` de cada categoria e `a[href*="/articles/"]`/`.article-body.innerText` de cada seção/artigo — mesmo princípio de garantir abertura real de cada página (nunca inferência pelo título), adaptado para rodar em lotes de até ~28 artigos por chamada e viabilizar a cobertura de 222 artigos dentro do orçamento da tarefa.

Com esta fase, as **14 categorias da Central de Ajuda do NectarCRM listadas no prompt mestre estão com inventário de seções e artigos 100% concluído**: Nchat (Fase 3), Módulos/Configurações/Estatísticas/Apps (Fase 2), e Integrações/Integrações Pluga/Nectar Mobile/Talk+/EasyForms/Leadboard/API/FAQ/Novidades (Fase 2b, esta).

Arquivos produzidos/atualizados nesta fase:
- `01-inventario/categorias.md`, `secoes.md`, `artigos.md` — acrescentadas as 9 categorias, sem tocar nas entradas de Nchat/Módulos/Configurações/Estatísticas/Apps já existentes.
- `01-inventario/funcionalidades.md` — **arquivo novo**: síntese funcional por categoria periférica, citando fonte (ID do artigo) para cada afirmação.

Achados de maior impacto para a modelagem futura (Fase 7):
1. **Leadboard** é um funil paralelo de pré-venda/qualificação com etapas, tarefas obrigatórias, fila de distribuição, agendamento prévio obrigatório na última etapa (podendo criar Oportunidade automaticamente) e cascata entre funis de Leadboard — mecanismo de encadeamento que o motor de Automações (Apps) explicitamente não possui entre si. Confirma e detalha a menção à "tabela dinâmica vinculada a Qualificação" citada no README da API (`04-api/inventario-endpoints.md`, pasta `tabelaDinamica`). Ver `01-inventario/funcionalidades.md`, seção 6.
2. **Talk+** é VoIP nativo com cobrança por "minuto cheio" (todo minuto iniciado é cobrado integral, chamada é encerrada se o saldo acabar) e IA de pós-atendimento (resumo + próximas ações recomendadas + análise de sentimento) — candidato direto de comparação com nosso módulo `voice`/`VoiceConfig`/`Call`/`CallSuggestedAction` (o nome do model `CallSuggestedAction` no nosso Prisma schema sugere intenção de replicar exatamente essa feature). Ver `01-inventario/funcionalidades.md`, seção 4.
3. Regra de autodesativação de integração por falhas consecutivas de API (2+ respostas de erro HTTP ≠200 desativam a integração com o ActiveCampaign automaticamente) — mecanismo de proteção não documentado em nenhuma outra categoria lida até agora (FAQ, artigo `42427199040915`).
4. A seção "Webhooks" da categoria API (Central de Ajuda) lista uma gama de eventos mais ampla do que o README do GitHub `nectarcrm-api`, incluindo eventos específicos de Leadboard e Easyforms — tratar as duas fontes como complementares, não substitutas.
5. Nenhum dos 31 posts de changelog ("Novidades") menciona "Nchat" nos termos pesquisados, apesar do Nchat ter 91 artigos de documentação de produto — achado de documentação registrado sem tentativa de explicação por inferência.

O que ficou pendente/fora do escopo desta rodada:
1. O Apiary (`docs.nectarcrm.apiary.io` / `nectarcrm.docs.apiary.io`) continua **inacessível para leitura de conteúdo** (já registrado na Fase 4) — esta fase não tentou reabri-lo via Playwright, pois o escopo era só a Central de Ajuda; fica como sugestão para uma fase futura, já que agora temos navegador real disponível (ao contrário do WebFetch usado na Fase 4, que falhou).
2. Dentro de "FAQ", ~6 dos 15 artigos são índices redundantes com conteúdo já lido em outras categorias (Easyforms, Nectar for Whats, Estatísticas, Dashboard) — registrados na tabela de `artigos.md`, mas sem agregar achado novo.
3. Não foi possível confirmar se a regra de autodesativação por falha de API (achado 3 acima) se aplica a outras integrações além do ActiveCampaign — é INFERIDO, não CONFIRMADO, para o caso geral.
4. Nenhuma tentativa de acesso autenticado a `app.nectarcrm.com.br` foi feita (fora de escopo e proibido pelas restrições da tarefa).

`docs.nectarcrm.apiary.io`: **inacessível para leitura de conteúdo**. `https://docs.nectarcrm.apiary.io/` falhou por erro de certificado TLS (hostname não bate com o certificado wildcard `*.apiary.io`). A variante `https://nectarcrm.docs.apiary.io/` carregou, mas é uma SPA renderizada em JavaScript — o WebFetch só capturou o `<title>` ("Nectar API · Apiary"), sem corpo, navegação ou conteúdo de endpoints. Não foi possível confirmar o conteúdo documental do Apiary nesta investigação.
