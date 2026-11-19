# Evidências REA

## Fase de 14/10 (histórico)

O REA foi usado só para validar o ambiente (CDP, `inspect_web_page`, `capture_web_screenshot` e `export_web_scripts` contra a Central de Ajuda). O conteúdo funcional veio da documentação, via Playwright. Ferramentas: `../00-controle/ferramentas.md`.

## Fase de 22/10: frontend de `app.nectarcrm.com.br`

Os IDs de evidência valem para a sessão REA de 22/10; servem de referência, não podem ser reabertos em outra sessão.

| Evidência | Operação | O que registra |
|---|---|---|
| `ev_ef0850f1d9c6146440c5f1f2130472940a408a4458df4fd7a369b6d9347a67aa` | `list_browser_targets` | Alvo "NectarCRM - Entrar", `https://app.nectarcrm.com.br/crm/?language=pt-BR`, Chrome 155 isolado (CDP 127.0.0.1:9333, perfil temporário) |
| `ev_99ccee11a7b1ecaa8a3c997cc04477e77893c408cb14d170046618e67a39c0fc` | `analyze_web_bundle` (source maps ligados) | 31 scripts observados e analisados, 0 falhas de parse, 248.326 nós AST. Grafo de chunks, 0 rotas e 0 endpoints de alta confiança (URLs montadas por string). Source map do pnotify: HTTP 404 |
| `ev_afcccd29545846bde81b21216a105843e469ebbca79e57a006984ee3c6fe696f` | `analyze_javascript_application` (7 fontes da app selecionadas) | Raiz SHA-256 `58e4ba19…f5`, 61.417 nós AST, cobertura parcial. O grafo do REA é voltado a Node/Electron, pega pouco de `$http` do AngularJS e por isso a leitura direta dos fontes foi necessária |
| `ev_91f3f5d4831e952b93ab7997ee17e890a469ee5ccd561f306dc5ae250b274b7e` | `inspect_analysis_view` (resumo) | Projeção resumida da evidência anterior |

### Integridade dos artefatos

As 31 URLs da evidência `ev_99cc…` foram baixadas de novo (só essas, sem nenhuma outra) e comparadas por SHA-256:

- **26 de 26 arquivos estáticos idênticos** ao que o REA capturou no navegador.
- 2 arquivos `*.js.jsp` (`app-login`, `crm`) **divergem a cada download**, como esperado para JSP renderizado por requisição. Foram usados só para leitura de padrões; os valores por sessão não foram aproveitados.
- 3 scripts inline do HTML não foram baixados à parte.

SHA-256 dos artefatos principais (capturados pelo REA):

| Arquivo | Bytes | SHA-256 |
|---|---|---|
| `crm/js/angularjs/messages.js.jsp` (i18n, versão 26.4.006) | 1.207.319 | `531ab29f89a4e0c3d05734d7440a1482d0cbd7bc41583c6d276a0810663f17fc` |
| `crm/js/angularjs/services/requester.js` | 12.987 | `46b87284f42ffe945117c14cafbcf16e7df35b09e3051c7a72bda7ccf4c9e019` |
| `crm/js/angularjs/components/login/login-component.js` | 28.781 | `dcc08e9cf7f6de7ad672fed2b8926c5362de05494b14a25f7d880b34e150a614` |
| `crm/js/angularjs/directives/directives.default.js` | 367.581 | `969596ff82edcb980985f2f93d8d692f6a2ecc896bbdc3bd69272c53ee4a129a` |
| `crm/js/angularjs/angular.js` | 1.270.821 | `3ca7274302353b8386c230cfed846b122a97fe60a611ff73e88a657d56cc3a3b` |
| `crm/js/crm.js.jsp` (no momento da captura) | 115.062 | `3db2c940c552a4c8f1bc14746666e2817838a9d24557f9304afcd9fba21d3275` |

## Fase de 22/10: área autenticada

| Evidência | Operação | O que registra |
|---|---|---|
| `ev_06b774748ed87874d0ce9f34e385341745bb35011ac031a11e9109e66ac41bd8` | `list_browser_targets` | Alvo "Dashboard \| NectarCRM" depois do login manual do usuário |
| `ev_6e343f17c2d1dedf644859071130a364a2ae27a78aba78a839b52fdad5957698` | `analyze_web_bundle` | 28 scripts, 0 falhas de parse, 1.848.431 nós AST, 53 rotas e 17 endpoints de alta confiança, fingerprint Vue |
| `ev_90185902cc8d7a2fba340c036ecede33f0627b92b9d55e7057b4f9ecd55bb4d4` | `capture_browser_scenario` (connect, só navegação por hash) | 18 passos concluídos em 60 s: 584 requisições, 3 WebSockets, iframe do Nchat. Sem corpos e sem valores de cabeçalho |

**Tratamento de segredo:** a captura de rede trazia o JWT da sessão na query string (`api_token`, `accessToken`) e o e-mail do usuário (Engage), e o REA não mascarou esses valores. Todo o material derivado passou por mascaramento (`<JWT>`, `<REDACTED>`, `<email>`, `{uuid}`) e o arquivo bruto foi **apagado** do disco no mesmo dia. O `app.js.jsp` (gerado por sessão, com tokens) não foi baixado.

Artefatos autenticados (baixados de novo **sem sessão**, idênticos ao capturado):

| Arquivo | Bytes | SHA-256 |
|---|---|---|
| `crm/js/all.js?26.4.006` | 7.082.193 | `6f1f41551cea83ac2c1cc176faf4dce9c6d682b09462e9a8a21f7b4cda9c80a8` |
| `crm/js/angularjs/dialer.js` | 261.382 | `3fd15e92acf39d22f1cd57e4852d2cd6e28f9afbbe5135cbbaf9351ce55bf711` |
| `crm/js/dialer_sip.js` | 21.194 | `0bd5b1cfbbacbc5d5e3312b4f9b7dcdcddaa7c3aa9d3daeb9f4eeef7a44d9e5b` |
| `crm/js/angularjs/services/AutomationFlowService.js` | 29.110 | `5cca5da2f8264485044fe3e5d1ae357280eb97410ea6534ac2f9de64c0110cf5` |
| `crm/js/angularjs/totalvoice/app.js` | 19.933 | `544d80c80ea70f6a46c36bb7511260e4bba94a597565a79ce4d0623a3112253b` |
| `/static/jssip_3_10_0.min.js` (capturado) | 279.299 | `72992195a890d5c15cd85e7ef11f338d7dd6d87cab37d3f8981c9fee9cbd5a58` |

Chunks Vue do Nchat: entrada `/assets/nchat-CTRmj3Fx.js`. Foram 1.391 arquivos (28 MB) alcançados só por importação, nenhum com `sourceMappingURL`.

### Fora do repositório

As cópias dos scripts e o i18n extraído (`i18n.json`) ficaram só no scratchpad local da sessão. Como são material proprietário do Nectar, não foram versionados. Para reproduzir, repita `analyze_web_bundle` na página de login e confira os hashes acima. Se diferirem, o Nectar publicou outra versão.
