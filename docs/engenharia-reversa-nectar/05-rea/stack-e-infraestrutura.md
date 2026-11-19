# Stack e infraestrutura

## Versão

- OBSERVADO: `nectarVersion = '26.4.006'`, no topo de `crm/js/angularjs/messages.js.jsp`.

## Backend

| Fato | Status | Base |
|---|---|---|
| Aplicação Java servlet (JSP) | OBSERVADO | Scripts servidos como `*.js.jsp`, renderizados por requisição (o SHA-256 muda a cada download); cookie `JSESSIONID` com `Path=/crm; HttpOnly` |
| Camada legada estilo **Struts 1 DispatchAction** | OBSERVADO | URLs `entidade.do?method=listar`, `oportunidade.do?method=cicloMedio` etc. |
| Camada REST mais nova sob `/crm/api/1/...` | OBSERVADO | `api/1/usuario/app/login`, `api/1/voicemail/count`, `api/1/omie/sync-products` |
| Roteamento por modo de instância (leitura/escrita) | INFERIDO | Cabeçalho `x-nectar-instance-mode: rw`, que sugere instâncias somente leitura (`ro`) para réplicas |
| Multi-tenant com tenant por base | OBSERVADO | `APP_CONFIG.tenantId: 'public'` antes do login; cabeçalho `X-Tenant` no POST de login. "public" com cara de schema do Postgres é INFERIDO |
| Cota de storage por conta | OBSERVADO | Código de erro `STORAGE_LIMITE` tratado no cliente HTTP (comentário cita o ticket interno `DEL-806`) |
| Cobrança via Stripe no trial | OBSERVADO | Chaves `configuracao.trialStripe.*` (17) |

## Frontend

| Fato | Status |
|---|---|
| **AngularJS 1.x** (não Angular 2+), módulo `nectarApp`, componentes com `.component()` | OBSERVADO |
| Área autenticada: casca AngularJS (`all.js`, 7 MB) + **micro-frontends Vue 3** (Pinia, vue-router, Rolldown) em `/reloaded/<app>/` e `/assets/`, inclusive o Nchat inteiro (ver `area-autenticada.md`) | OBSERVADO |
| jQuery + Bootstrap 3 + `ui-bootstrap-custom-tpls-2.5.0` + `ui-mask` + `ngStorage` + `ngCookies` + `angular-sanitize` | OBSERVADO |
| SweetAlert, PNotify, jQuery Validate, jQuery DataTables (TableTools 2.1.4 com SWF de exportação) | OBSERVADO |
| Sem bundler: arquivos soltos, **não minificados**, com comentários em português | OBSERVADO |
| Sem source maps: o único `sourceMappingURL` declarado (pnotify) responde 404 | OBSERVADO (evidência REA) |
| Templates HTML também servidos por JSP (`crm/jsp/<modulo>/template-*.html.jsp`) | OBSERVADO |
| Strings da UI injetadas como um único objeto global `i18nmessages` (~1,2 MB) | OBSERVADO |
| `moment.js` usado pelo cliente HTTP | OBSERVADO (referência; o arquivo não carrega no login) |

INFERIDO: é um monólito com mais de 10 anos (Struts 1 + AngularJS 1, que perdeu suporte em 2022), modernizado por fora: REST `api/1`, componentes novos e IA. As features novas (Copilot, agentes) convivem com o legado na mesma página.

## Segurança observável no login

| Item | Status |
|---|---|
| HSTS `max-age=31536000; includeSubDomains`; `X-Frame-Options: SAMEORIGIN` | OBSERVADO |
| reCAPTCHA v2 no cadastro e no "esqueci a senha" (chave pública no código) | OBSERVADO |
| Login com Google (Google Identity Services, `accounts.google.com/gsi/client`) | OBSERVADO |
| Política de senha validada também no cliente (`PasswordPolicyService.js`) | OBSERVADO |
| Token de redirecionamento SSO enviado por POST de formulário, não pela URL (comentário cita histórico, logs e referer) | OBSERVADO |
| Arte da tela de login ("Engage") em iframe sandbox de outro domínio, escolhido para não alcançar o formulário de senha | OBSERVADO |
| Cabeçalho `X-Timezone` em todas as requisições | OBSERVADO |
| Sem CSP | OBSERVADO na resposta do login; nas telas internas, NÃO VERIFICADO |

## Terceiros vistos no login

Google Identity Services, reCAPTCHA, **Pipz** (`pipz.track('Login', ...)`, automação de marketing ou CDP) e html5shim (googlecode, já desativado).
