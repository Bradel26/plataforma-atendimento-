# 08 — APIs e rede (observadas)

## Metodologia

Capturado via Playwright MCP (`browser_network_requests`) nas duas únicas páginas navegadas de fato (home institucional e tela pública de cadastro/login do app). Nenhum dado pessoal, token ou cookie de sessão foi extraído ou registrado — apenas método, host e caminho.

## Site institucional (`nectarcrm.com.br/inicio/`)

Majoritariamente telemetria de marketing, sem relação com a lógica do CRM:

| Funcionalidade | Método | Endpoint (host) | Observação |
|---|---|---|---|
| Google Tag Manager / Ads conversion | POST | `www.google.com/ccm/collect`, `ad.doubleclick.net/ccm/s/collect` | Pixels de conversão de Ads |
| Google Analytics 4 | POST/GET | `analytics.google.com/g/collect`, `btzrwqdi.san.stape.io/g/collect` | A segunda é um GA4 server-side via **Stape** (proxy de analytics em domínio próprio) |
| Remarketing Ads | POST | `www.google.com/rmkt/collect`, `googleadservices.com` | Pixel de remarketing |
| Microsoft Clarity | POST | `e.clarity.ms/collect` | Gravação de sessão / heatmap |
| Visitor API (terceiro) | GET | `api.visitorapi.com/api/` | Retornou `402 Payment Required` — serviço de identificação de visitante (provavelmente geolocalização de IP/empresa), sem crédito/plano ativo no momento da captura |

Nenhuma chamada observada aqui pertence a uma API própria de produto — é só o site WordPress institucional com pilha de marketing padrão.

## Tela pública de cadastro/login (`app.nectarcrm.com.br/crm/?register=true`)

| Funcionalidade | Método | Endpoint | Observação |
|---|---|---|---|
| Componente de login (AngularJS) | GET | `app.nectarcrm.com.br/crm/crm/js/angularjs/components/login/login-component.html.jsp` | `200`. Confirma AngularJS no front e **backend servindo `.jsp`** (ver [09-arquitetura.md](09-arquitetura.md)) |
| (não exercitado) Submissão de cadastro/login | — | — | Não preenchemos nem enviamos o formulário — não há captura de payload de autenticação real |

70 requisições estáticas (JS/CSS/fontes/imagens) foram omitidas do relatório por não terem valor de endpoint de API.

## Não observado

Qualquer chamada autenticada do app (CRUD de oportunidade, mensagens do Nchat, relatórios). Fica fora de escopo até login manual autorizado pelo usuário.
