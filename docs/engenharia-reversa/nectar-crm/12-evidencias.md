# 12 — Registro de evidências

## Decisões do usuário nesta sessão

- Ferramenta: usar **Playwright MCP**, sem instalar o pacote `rea-agents` (REA não está configurado neste ambiente; instalá-lo exigiria `npx rea-agents setup` + reinício do Claude Code).
- Escopo: **pular módulos autenticados** do `app.nectarcrm.com.br` nesta rodada — nenhuma tentativa de login foi feita, exceto abrir a tela pública de cadastro sem submetê-la.

## Capturas e fontes brutas

| Documento que usa | Fonte | Como foi obtido |
|---|---|---|
| 02, 03, 08 | `https://nectarcrm.com.br/inicio/` | Playwright: `browser_navigate` + `browser_snapshot` (salvo em `.playwright-mcp/page-2026-10-14T14-57-01-105Z.yml`) + `browser_network_requests` |
| 03, 08, 09 | `https://app.nectarcrm.com.br/crm/?language=pt-BR&register=true` | Playwright: `browser_navigate` + `browser_snapshot` (`.playwright-mcp/page-2026-10-14T14-58-00-751Z.yml`) + `browser_network_requests` filtrado por `nectarcrm` |
| 01, 03, 10 | `https://lp.nectarcrm.com.br/nectar-google-ads` | WebFetch (conversão HTML→texto, resumo por prompt) |
| 02, 06 | `https://nectarcrm.com.br/nectar-for-whats/` | WebFetch |
| 02, 07 | `https://nectarcrm.com.br/automacoes/` | WebFetch |
| 02, 05, 10 | `https://nectarcrm.com.br/preco/` | WebFetch |
| 02 | `https://nectarcrm.com.br/recursos/` | WebFetch |
| 09 | repo `github.com/morluto/rea` (ferramenta REA, não o Nectar) | WebFetch, para decidir se valia instalar |
| 10 | `apps/api/prisma/schema.prisma`, `apps/api/src/modules/*` | Leitura local (Bash/grep/find) do nosso próprio repositório |

## Páginas mencionadas no prompt original e NÃO abertas nesta rodada

- `lp.nectarcrm.com.br/nchat` (linkada no menu, mas não visitada)
- Qualquer tela dentro do app autenticado
- `github.com/ColmeiaSolucoes/nectarcrm-api` (API pública do Nectar, linkada no rodapé)

## Regra seguida

Nenhuma tentativa de contornar autenticação, CAPTCHA ou controle de acesso. Nenhum formulário de cadastro foi submetido. Nenhuma automação ou dado real foi criado/alterado em qualquer ambiente, próprio ou de terceiros.
