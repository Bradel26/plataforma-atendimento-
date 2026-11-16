# Auditoria de segurança — 2026-11-06

Escopo: API (`apps/api`). Estado: **correções aplicadas só na árvore de trabalho local; nada commitado, publicado ou alterado no Coolify.**

## 1. O que foi corrigido (confirmado no código e coberto por teste)

| # | Severidade | Problema | Onde | Correção | Teste |
|---|---|---|---|---|---|
| 1 | Alta (depende da topologia) | `trust proxy = true` confia em todo o `X-Forwarded-For`; se o proxy só **acrescenta** o IP, o cliente escolhe o próprio IP e escapa do limite de login/refresh | `app.ts`, `env.ts`, `lib/trust-proxy.ts` | `TRUST_PROXY` aceita `false`, nº de saltos ou lista de CIDR. `true` segue funcionando (legado) mas gera aviso no log em produção | `lib/trust-proxy.test.ts` (reproduz o defeito do `true` e prova que saltos/CIDR resistem) |
| 2 | Média | `409 ORGANIZACAO_AMBIGUA` era devolvido **antes** de conferir a senha: qualquer um descobria e-mails que existem em mais de uma organização. O usuário nessa situação também não conseguia entrar | `auth.service.ts` | Senha é conferida em todos os candidatos; ambiguidade só aparece a quem provou a senha de ambas | `auth.service.login.test.ts` |
| 3 | Baixa | E-mail inexistente respondia sem gastar bcrypt → diferença de tempo revela se a conta existe | `auth.service.ts`, `lib/password.ts` | Gasta o mesmo custo de bcrypt com hash descartável | idem |
| 4 | Média (defesa em profundidade) | Upload confiava só no MIME declarado: HTML/EXE/PNG-falso podiam entrar vestidos de tipo permitido | `lib/storage.ts`, `lib/conteudo-arquivo.ts` | Assinatura binária por formato; OOXML exige estrutura; texto sem binário; tipo novo sem verificador é recusado | `lib/conteudo-arquivo.test.ts` (34 casos) |
| 5 | Média (disponibilidade) | `createReadStream(...).pipe(res)` sem handler de `error`: arquivo removido entre `stat` e leitura derruba o **processo** | `files.routes.ts` | Handler de erro | revisão (condição de corrida, difícil de reproduzir em teste) |
| 6 | Média (funcional) | Nome de arquivo com caractere fora do Latin-1 ("Proposta – final.pdf", emoji) faz o Node lançar `ERR_INVALID_CHAR` → 500 ao abrir o anexo | `files.routes.ts` | `Content-Disposition` RFC 6266 (`filename` ASCII + `filename*`) | `files.routes.test.ts` |
| 7 | Baixa | Prazo ilegível na assinatura do link (`NaN`) passava na checagem de validade | `lib/storage.ts` | Exige inteiro | `files.routes.test.ts` |
| 8 | Baixa | `jwt.verify` sem `algorithms` (dependia do padrão da biblioteca) | `lib/tokens.ts` | HS256 fixado em assinar e verificar | `lib/tokens.test.ts` (18 casos: alg `none`, HS512, segredo errado, expirado, sem org/perfil, adulteração de perfil, separação access/refresh/webchat, uso único, revogação, corrida) |
| 9 | Baixa | Credencial em URL (`?secret=`, `?t=`) pode aparecer em mensagem de erro/log | `lib/redacao.ts` | Mascara por **nome** do parâmetro | `segredo-webhook.test.ts` |
| 10 | Info | Webhooks só aceitavam segredo na URL | `providers/segredo-webhook.ts`, WAHA, GOWA, WPPConnect | Aceitam também o cabecalho `X-Webhook-Secret` (cabeçalho presente é o único considerado). Compatível: URL continua valendo | `segredo-webhook.test.ts` |

Ajuste em teste existente (não é afrouxamento): 2 testes de `conversations.service.test.ts` enviavam `Buffer.from('x')` como PDF; passaram a enviar um cabeçalho `%PDF-1.4`, que é o que a nova validação exige de um PDF.

## 2. Riscos NÃO corrigidos (decisão ou validação necessária)

1. **Gestor enxerga a espera de qualquer fila** (`lib/politicas.ts`, ramo `veEquipe`): por id, busca, ficha e socket, mesmo de equipe que não é a dele. Confirmado no código. Não alterei porque muda permissão de um perfil existente. Correção proposta: limitar a `filaId IN filaIds`.
2. **Topologia real de proxies do Coolify não verificada.** Não tenho acesso a ela. Ver seção 4.
3. **Segredo de webhook em URL (WPPConnect, GOWA)**: esses servidores não enviam cabeçalho nem assinatura; a URL é a única prova. Risco residual: logs de acesso do proxy (Traefik) registram a URL com o segredo. O log da própria API já omite a query. Mitigação em 4.2.
4. **Access token não é revogável**: `requireAuth` não consulta o banco; usuário desativado ou com perfil rebaixado mantém o acesso até 15 min (TTL do token). Aceitável/documentado; reduzir exige consulta por requisição ou lista de revogação.
5. **Refresh token sem detecção de reuso**: reuso falha, mas não derruba a cadeia de sessões. Melhoria, não falha.
6. **Bloqueio de login por e-mail** (5 falhas/15 min) permite travar a conta de terceiros (trade-off já documentado em `tentativas.ts`).
7. **HMAC dos links de arquivo usa `JWT_ACCESS_SECRET`** (mesma chave de outra finalidade). Separar invalidaria links ativos (1 h) no deploy; não feito.
8. **Varredura de autorização/IDOR por rota (item 7 do pedido) NÃO foi feita por completo.** Foram lidas as políticas de visibilidade de conversa, o isolamento por organização em arquivos e o `requireAuth`. Falta o inventário rota a rota (usuários, oportunidades, relatórios, canais, configurações) e testes com usuários/organizações fictícios.
9. **Dependências** (`npm audit --omit=dev`, 7 achados): `multer` (alta, direta, fix simples), `prisma`/`@prisma/config` (alta, direta), `body-parser`, `deepmerge-ts`, `qs`, `zod` (alta; exige salto para 4.6.7, mudança de versão maior). Não atualizei: upgrade de dependência precisa de teste de regressão próprio.
10. **Não verificado**: CSP/Helmet em produção, cabeçalhos reais servidos pelo Traefik, segredos reais do Coolify, ausência de `.env` real no histórico (verificado só que `.env.example` e `.env.smoke.example` foram os únicos `.env*` adicionados).

## 3. Resultados dos testes

- Suíte completa: **127 arquivos, 1363 testes passaram, 0 falharam, 0 ignorados.**
- `tsc --noEmit`: API e web sem erros.
- Lint: não há script `lint` configurado.
- Os avisos `[redis] erro de conexão` nos testes são do ambiente (sem Redis) e não afetam resultados.
- Não executado: testes de navegador (Playwright), `smoke:*` (dependem de banco/Redis reais) e qualquer teste contra produção.

## 4. Configuração no Coolify (nada foi alterado)

### 4.1 `TRUST_PROXY` (a mais importante)
Hoje `scripts/env-para-coolify.mjs` define `TRUST_PROXY=true`. Para trocar com segurança, **descubra quantos proxies há na frente da API**:

- Só o Traefik do Coolify na frente → `TRUST_PROXY=1`.
- Cloudflare + Traefik → `TRUST_PROXY=2`, ou CIDRs dos dois.

Como medir sem risco: com a configuração atual, chame `https://atendimento.bradel.com.br/api/health` (ou rota que devolva o IP) com `X-Forwarded-For: 6.6.6.6` e veja qual IP a API registra. Se for `6.6.6.6`, o defeito é real e a correção é necessária. **Errar o número de saltos** faz todos os usuários parecerem ter o IP do proxy (limite de login de 30 por 5 min passaria a valer para a empresa toda). Teste com um valor e confira o IP real no log antes de fixar.

### 4.2 Segredos de webhook fora de logs de proxy
- Configure WAHA/WPPConnect/GOWA para chamar a API pelo **endereço interno da rede Docker** do projeto (ex.: `http://<servico-api>:3333/api/webhooks/...`), em vez da URL pública. O tráfego não passa pelo Traefik, então nenhum log de acesso o registra.
- Rotacione `WPP_CONNECT_WEBHOOK_SECRET` e os segredos de WAHA/GOWA se algum dia a URL pública com `?secret=` já foi exposta.
- Para WAHA, prefira o HMAC (`X-Webhook-Hmac`), que já tem prioridade no código.

### 4.3 Valores esperados (sem expor segredos)
| Variável | Valor esperado |
|---|---|
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | 64 hex, **diferentes** (`openssl rand -hex 32`) |
| `SECRETS_KEY` | 64 hex. Hoje é opcional: sem ela os segredos de canal são cifrados com chave derivada do JWT e a rotação do JWT os perderia |
| `HSTS_ATIVO` | `true` somente com HTTPS valido no domínio |
| `SEED_ADMIN_PASSWORD` | diferente de `Admin@123` (a API já recusa subir em produção com o padrão) |
| `WEB_ORIGIN` | `https://atendimento.bradel.com.br` |

## 5. Plano de deploy e rollback

1. Revisar o diff (`git diff`) e aprovar.
2. Commit por tema (login, uploads/arquivos, trust-proxy, webhooks) para reverter individualmente.
3. Antes do deploy: executar a suíte completa e `tsc` (já verdes).
4. Deploy da API **sem alterar `TRUST_PROXY`** (o código é compatível: `true` continua válido e só gera aviso).
5. Validar em produção: login, renovação de sessão, abrir anexos (imagem, áudio, PDF), enviar um anexo de cada tipo usual, receber uma mensagem por cada provedor de WhatsApp.
6. Só então, em passo separado, ajustar `TRUST_PROXY` conforme 4.1 e validar o IP no log e o limite de login.
7. **Rollback**: reverter o deploy para a imagem anterior (nenhuma migração de banco nesta mudança, nenhum dado alterado). `TRUST_PROXY` volta para `true` por variável de ambiente, sem build.

Ponto de atenção do passo 5: a validação de conteúdo recusa arquivo cujo conteúdo não bate com o tipo. Mídia recebida de cliente que falhar cai no comportamento já existente (guarda a URL do provedor), mas observe os logs `[upload] conteúdo incompatível` nos primeiros dias para achar algum provedor que rotule o tipo errado.
