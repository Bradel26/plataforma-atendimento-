# 05 — Funil e oportunidades

## Status

**Não observado em funcionamento** (sem Kanban, sem drag-and-drop testado). Tudo abaixo é declaração de marketing, marcada como tal.

## Declarado (PROVÁVEL, não CONFIRMADO)

- "Múltiplos funis B2B e B2C" e "funil cascata" (plano Pro) — sugere suporte a mais de um pipeline simultâneo e a um funil que depende do resultado de outro (ex.: funil de pré-venda alimentando o funil de venda).
- "Workflows de vendas personalizados" — termo genérico, sem exemplo concreto na página.
- Enterprise adiciona "aprovação de propostas" e "múltiplas tabelas de preço" — indica que proposta comercial é uma entidade com fluxo de aprovação (não só documento gerado).
- Da página de automações: "revisão automática do funil de vendas de cada vendedor" e "criação de tarefa quando uma oportunidade fica sem interação" — ambos presumem que existe um campo de "última interação" por oportunidade e um job periódico de verificação.
- Relatórios de funil citados: win/loss, ranking, auditoria de alterações, metas — não há detalhe de como são calculados.

## Comparativo com o que já existe no nosso CRM

O schema do Prisma (`apps/api/prisma/schema.prisma`) já tem: `Funnel`, `FunnelStage`, `Opportunity`, `OpportunityStageLog`, `OpportunityAudit`, `OpportunityAnalysis`, `PropostaGerada`, `Meta`/`MetaOperacional`, `Product`/`PriceCatalog`/`CatalogItem`, `ActivitySeries`/`Activity`. Ou seja: **já temos oportunidade com histórico de etapa, auditoria, proposta gerada e metas** — a base estrutural equivalente ao que o Nectar anuncia já existe. O que não dá para saber sem abrir o app autenticado é se a *experiência* (Kanban, drag-and-drop, UX de card) está no nosso nível desejado — isso é uma decisão de produto/UX, não de modelo de dados.

## Lacuna real

Sem acesso autenticado não dá para confirmar: comportamento de drag-and-drop, se "funil cascata" move a oportunidade automaticamente ou cria uma cópia, e como a UI comunica "sem interação há X dias" (notificação, badge no card, e-mail).
