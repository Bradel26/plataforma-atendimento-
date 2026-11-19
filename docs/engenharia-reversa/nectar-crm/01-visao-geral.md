# 01 — Visão geral

## Objetivo

Levantamento de evidências públicas sobre o NectarCRM (site institucional, landing page de Ads e a tela pública de cadastro do app) para subsidiar um comparativo com a `plataforma-atendimento` e um plano de melhorias independente. **Não é uma cópia do produto nem usa código, marca ou material protegido do Nectar.**

## Escopo desta rodada

Por decisão explícita do usuário, esta investigação **cobriu apenas páginas públicas**, sem autenticação:

- `https://nectarcrm.com.br/inicio/` (institucional)
- `https://nectarcrm.com.br/preco/`, `/recursos/`, `/automacoes/`, `/nectar-for-whats/`
- `https://lp.nectarcrm.com.br/nectar-google-ads` (landing page de Ads)
- `https://app.nectarcrm.com.br/crm/?register=true` (apenas a tela pública de cadastro, sem criar conta nem logar)

**Não investigado** (requer login, fica para uma próxima rodada quando o usuário quiser autenticar manualmente): o CRM autenticado em si — Kanban de oportunidades, atendimento (Nchat) em uso, automações configuradas, relatórios reais, módulo de clientes/contatos dentro do app, APIs internas autenticadas.

## Ferramentas usadas

- Playwright MCP (navegador real, snapshot de DOM, rede) — usado na home e na tela pública de cadastro.
- WebFetch — usado nas páginas de conteúdo (preço, recursos, automações, Nectar for Whats, landing page), por ser mais direto para extrair texto.
- O pacote `rea-agents` (REA) não foi instalado nesta sessão (ver decisão do usuário em [12-evidencias.md](12-evidencias.md)); as ferramentas acima cobriram o necessário para o material público.

## Resumo do produto (o que dá para afirmar com base no que foi visto)

NectarCRM é um CRM de vendas B2B focado em processo comercial consultivo (a própria FAQ do produto diz que **não** atende vendas transacionais/varejo). Módulos declarados: CRM de vendas, CRM Mobile, Nchat (WhatsApp), Talk+ (VOIP), EasyForms e LeadBoard (geração de lead). Diferencial comercial atual: um "Copilot de IA" (resumo de call, sugestão de próxima ação, análise de sentimento) destacado na landing page de Ads.

## Limites desta investigação

- Tudo que vem de página de marketing é **declaração do fabricante**, não comportamento observado em uso. Marcado como tal nos documentos seguintes.
- Nenhuma automação, fluxo de atendimento ou endpoint de API autenticado foi exercitado.
- Preços e limites de plano podem mudar sem aviso; são um retrato de 2026-10-14.
