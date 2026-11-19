# API interna e autenticação

> Esta é a API **interna** que o front usa, diferente da API pública documentada em `../04-api/`. Só foram coletadas URLs que aparecem como literais nos scripts do login; o conjunto completo exige as telas autenticadas.

## Configuração do cliente (OBSERVADO, `app-login.js.jsp`)

```
APP_CONFIG = { baseUrl: '/crm/crm/', rootUrl: '/crm/', BASE_JSP_PATH: '/crm/crm/jsp',
               tenantId: 'public', usuarioJwt, usuarioJwtSearch, apiToken, usuarioLogadoUuid }
```

INFERIDO: depois do login, o JSP injeta no próprio script o JWT do usuário, um **JWT separado para busca** (`usuarioJwtSearch`, provavelmente um serviço de busca à parte) e o `apiToken`, que também aparece como `newApiToken` em `api/1/voicemail/count?api_token=...`. Ou seja, o front fala com a REST nova usando o mesmo token da API pública.

## Camada 1: Struts `*.do?method=` (OBSERVADO)

| Ação | Métodos vistos |
|---|---|
| `entidade` (contato) | `listar`, `consultarJson`, `listarEntidadeSuggest` |
| `oportunidade` | `listar`, `cicloMedio`, `getProductMix`, `statisticsForContact` |
| `publicacao` (feed social interno) | `listar`, `consultarJson`, `incluirJSON`, `gostar`, `seguir`, `setRead`, `listarAnexosPublicacao` |
| `publicacaoComentario` | `incluir`, `gostar` |
| `tarefa` | `listar`, `listarTarefasDesempenho` |
| `compromisso` | `listar`, `participar` |
| `usuario` | `consultar`, `consultarLembretes`, `usuariosJSON` |
| `item` / `grupoItem` / `subgrupoItem` (produtos) | `listar`, `listarSuggest` |
| `estatistica` | `listarEntidadesDesempenho` |
| `campoPersonalizado` | `listarValoresCamposSuggest` |
| `fluxo`, `formulario`, `mailbox`, `pais` | `listar` / `listarEmails` |
| `contrato` | `solicitarContatoEmail` |

Padrões que se repetem: `ajax=1`, `json=true`, `tableListing=1`, `gridview=true`, `iDisplayLength=9999` (parâmetro do DataTables).

## Camada 2: REST `/crm/api/1/` (OBSERVADO)

`usuario/app/login` (POST), `usuario/app/signup` (POST), `usuario/password-forgot/{login}` (POST, com `g-recaptcha-response`), `usuario/password/change` (POST), `voicemail/count?new=true`, `omie/sync-products`.

## Envelope de resposta (OBSERVADO, `services/requester.js`)

O cliente HTTP único (`Requester`) trata estes campos:

| Campo | Efeito no front |
|---|---|
| `sucesso` + `mensagem` (+ `timer`) | Toast verde ou vermelho automático |
| `mensagens[]` | Mostra a primeira como erro |
| `logado: false` | Abre um **modal de re-login** sem sair da tela (`loginPopup`) |
| `id: 'nectar'` + `vencido: true` | Bloqueia a app por contrato vencido (`setVencido`) |
| `codigoErro: 'STORAGE_LIMITE'` | Abre o modal de storage cheio (interceptor) |
| resposta `text/html` inesperada | Tratada como sessão expirada |
| status 0 | Modo offline: tenta de novo a cada 10 s, até 50 vezes |

Há também debounce de 2 s para requisições agrupadas (`_timerAdd`) e um cache de 5 s por identificador (`_findCached`) para não duplicar GETs.

## Login (OBSERVADO, `components/login/login-component.js`)

1. POST `api/1/usuario/app/login` com o JSON do formulário.
2. Se o e-mail pertence a **várias bases**, o servidor devolve a lista. Abre-se o modal "múltiplos logins", com busca por nome ou CNPJ do contrato e paginação de 10, e o usuário escolhe a base. O POST é repetido com `X-Tenant: <tenant_id>`.
3. A resposta pode trazer `redirectUrl` + `redirectToken`. O front então faz POST de um formulário oculto com `token` para outro domínio (SSO entre produtos). Caso contrário, vai para `/crm/crm/inicio`, preservando `?app=X` para o SSO de apps.
4. "Lembrar-me" usa o cookie `lastlogin`.
5. Revogação do Google OAuth em `/crm/googleOAuthRevokeServlet`; logout em `/crm/logout`.

INFERIDO: um mesmo login (e-mail) acessa vários tenants (contratos), o que é típico de revendas e grupos empresariais como a Bradel. O tenant vai no cabeçalho, não no subdomínio.
