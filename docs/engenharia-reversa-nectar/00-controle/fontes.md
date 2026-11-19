# Fontes — inventário de origem (Fase 1)

Data da consulta: 2026-10-14.

## Fonte A — Central de Ajuda (`ajuda.nectarcrm.com.br/hc/pt-br`)

Categorias confirmadas na home (`browser_snapshot` via Playwright, 2026-10-14):

| Categoria | URL |
|---|---|
| Módulos | `/hc/pt-br/categories/5464220715155-M%C3%B3dulos` |
| Configurações | `/hc/pt-br/categories/28890828288403-Configura%C3%A7%C3%B5es` |
| Estatísticas | `/hc/pt-br/categories/5464269169171-Estat%C3%ADsticas` |
| Apps | `/hc/pt-br/categories/5464313433107-Apps` |
| Nchat (prioridade máxima) | `/hc/pt-br/categories/41807261105427-Nchat` |
| Integrações | `/hc/pt-br/categories/28437078351123-Integra%C3%A7%C3%B5es` |
| Integrações Pluga | `/hc/pt-br/categories/39676534236179-Integra%C3%A7%C3%B5es-Pluga` |
| Nectar Mobile | `/hc/pt-br/categories/5464376069651-Nectar-Mobile` |
| Talk+ | `/hc/pt-br/categories/37137544631443-Talk` |
| EasyForms | `/hc/pt-br/categories/6599735235731-EasyForms` |
| Leadboard | `/hc/pt-br/categories/29179876296723-Leadboard` |
| API | `/hc/pt-br/categories/27032868144531-API` |
| FAQ | `/hc/pt-br/categories/6855655276563-FAQ` |
| Novidades | `/hc/pt-br/categories/7227592098195-Novidades` |

Seção já identificada dentro de Nchat (via "Atividade recente" na home): **Chatbot** (`/hc/pt-br/sections/55484805472915-Chatbot`), com artigos:
- "Como desativar e reativar o chatbot" (criado há 7 dias em 2026-10-14)
- "Configurações avançadas do chatbot"
- "Como conferir o fluxo do chatbot no Preview"
- "Como montar o fluxo do chatbot"
- "O que é o Chatbot do WhatsApp no Nchat e como acessar"

Status: **pendente de abertura individual** — cada categoria precisa ser percorrida até o nível de artigo (seção 4 do prompt mestre). Ver [cobertura.md](cobertura.md).

## Fonte B — Nchat (subconjunto prioritário da Fonte A)

Mesma URL de categoria acima. Seções-alvo citadas no prompt mestre (confirmar existência real ao abrir a categoria, não presumir pelos nomes): Dashboard, Configurações gerais, Mensagens rápidas, Motivos de encerramento, WhatsApp Oficial, WhatsApp Lite, Canais, Onboarding, Conversas, Campanhas, Chatbot (já confirmado acima).

## Fonte C — API (`github.com/ColmeiaSolucoes/nectarcrm-api`)

Lido o README completo via Playwright em 2026-10-14 (ver sessão anterior desta conversa). Estrutura do repositório:
- `README.md` — guia geral: URL base `https://app.nectarcrm.com.br/crm/api/1/`, autenticação por `Access-Token` (header) ou `api_token` (query param), paginação (`&page`, `&displayLength` máx. 200), busca (`&exato`), padrão REST (GET/POST/PUT/DELETE), códigos de resposta (200/401/403/404/409/500).
- `docs/` — endpoints individuais linkados no README: `contato`, `oportunidade`, `qualificacao`, `compromisso`, `tarefa`, `publicacao`, `pipeline`, `campoPersonalizado`, `produto`, `produtoCategoria`, `produtoSubCategoria`, `tabelaPreco`, `tabelaDinamica` (link exibido como `/table`), `lista`, `origem`, `segmento`, `categoria`, `tipos`, `usuario`, `webhook`, `equipe`, `proposta`, `rdstation`.
- `token.png` — captura de tela de onde obter o token (Configurações → Integrações).
- Endpoint de descoberta geral citado no README: `https://app.nectarcrm.com.br/crm/api/1/app/columns/full` (apenas referência documental — não será chamado sem autorização).
- Repositório público, 197 commits, 6 contribuidores, branch `master`, sem releases.

Status: **README lido; pasta `docs/` ainda não aberta artigo por artigo** — pendente para Fase 4.

Documentação adicional a verificar na Fase 4: `https://docs.nectarcrm.apiary.io/` (ainda não acessada).

## Fonte D — REA (`github.com/morluto/rea`)

Status: **não lida nesta rodada** (o ambiente REA já está validado funcionalmente — ver [ferramentas.md](ferramentas.md) — então a leitura da documentação do próprio REA é baixa prioridade; fica pendente, não bloqueia as fases seguintes).

## Referências visuais

- `https://nectarcrm.com.br/inicio/` — já coberto por rodada anterior em `docs/engenharia-reversa/nectar-crm/` (material de marketing, ver `01-visao-geral.md` e `12-evidencias.md` daquela pasta).
- `https://app.nectarcrm.com.br/crm/?language=pt-BR&register=true` — idem, apenas tela pública de cadastro, sem login.
- Login completo: **não será feito automaticamente**; se necessário para validar um fluxo, será solicitado ao usuário.
