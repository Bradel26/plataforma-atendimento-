# Ferramentas — validação do ambiente

Validado nesta sessão (não repetir testes, só revalidar em caso de falha reportada).

## REA (MCP)

- Endpoint CDP: `http://127.0.0.1:9222`, Chrome 155.0.8059.40 real, perfil isolado iniciado pelo usuário.
- `list_browser_targets`: operacional. Observação: targets só aparecem para abas HTTP(S) já abertas; para abrir uma aba nova nesse Chrome específico usa-se o endpoint HTTP do próprio DevTools (`curl -X PUT "http://127.0.0.1:9222/json/new?<url>"`), não é uma tool do REA.
- `inspect_web_page`: operacional, mas com **política de permissão por origem** — por padrão filtra scripts/recursos/metadata de origens de terceiros (`disallowed_origin`). Para liberar, passar `allowed_origins: ["https://ajuda.nectarcrm.com.br"]` (ou outra origem) explicitamente na chamada. Acessibilidade e DOM vêm completos mesmo sem isso.
- `capture_web_screenshot`: operacional, retorna PNG com `sha256` e contagem de bytes verificáveis.
- `observe_web_session`: operacional, captura timeline de lifecycle (commit/domcontentloaded/load/networkidle) numa janela de observação; não repete tráfego anterior ao anexar.
- `export_web_scripts`: operacional — exporta bytes reais de script já capturados por `inspect_web_page` (com `allowed_origins` liberado) para disco, com manifest e `sha256` por arquivo. Testado com sucesso em `script.js` do tema da Central de Ajuda (16.704 bytes, hash conferido).
- `analyze_javascript_application`: não testado ainda nesta sessão (opera sobre arquivo local/ASAR, não URL ao vivo) — usar depois de `export_web_scripts` quando necessário análise estática mais profunda.
- Limitação de design: REA nunca retém corpos de rede, headers, cookies ou valores de console brutos — só metadados e, quando autorizado, bytes de script/imagem/screenshot com hash.

## Playwright (MCP)

- `browser_navigate`, `browser_snapshot`, `browser_network_requests`, `browser_console_messages`, `browser_evaluate`: operacionais, testados em GitHub público e na Central de Ajuda do Nectar.
- Sem restrição de origem (ao contrário do REA) — mas também sem exportação de bytes com hash verificável.
- `WebFetch` direto **falha com 403** no domínio `ajuda.nectarcrm.com.br` (WAF/bot-block) — usar sempre Playwright para esse domínio.

## Acesso a fontes

| Fonte | Ferramenta que funciona | Observação |
|---|---|---|
| `ajuda.nectarcrm.com.br` (Central de Ajuda) | Playwright (navegação) + REA (inspeção/evidência) | WebFetch bloqueado (403) |
| `github.com/ColmeiaSolucoes/nectarcrm-api` | Playwright ou WebFetch | Repositório público, sem necessidade de `gh` (que não está instalado nesta máquina) |
| `docs.nectarcrm.apiary.io` | A testar na Fase 4 | — |
| `app.nectarcrm.com.br` (autenticado) | Interromper ao pedir login | Regra do usuário: não logar automaticamente |
| `github.com/morluto/rea` | A ler na Fase 1 (documentação do próprio REA) | Opcional, não bloqueia o resto |

## Ambiente local (seção 2 do prompt mestre)

Node/npm/REA instalados e funcionando — não revalidado nesta rodada porque o usuário confirmou explicitamente ("ambiente já configurado e testado... não perca tempo repetindo"). Caso alguma chamada REA falhe por `provider_unavailable`, revalidar `list_browser_targets` antes de prosseguir.
