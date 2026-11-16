# Checklist de implantação — versão de sessão e correções de autorização

**Nada foi executado em staging nem em produção.** A migration e os testes foram executados só num PostgreSQL 16.15 **local e descartável** (resultados em `testes-integracao-postgres.md`). Os itens marcados **(aprovação)** exigem decisão sua.

**Parecer: GO para staging (com as condições da §0 e da §9), NO-GO para produção** até a validação em staging e a confirmação dos itens da §1 que dependem do ambiente.

**Estado da entrega local (2026-11-16, final):** seis commits locais no branch `prep/seguranca-sessao-homologacao` (hardening, IDOR, último ADMIN + versão de sessão + revalidação de sockets, front, docs, skill). Validado na worktree: typecheck de API, ponte e web sem erros; build da API e do front; suíte completa 140 arquivos / 1528 testes, nenhum pulado; integração em Postgres 16.15 local descartável 14/14 (banco encerrado e dados apagados); validadores da skill OK (10 testes). A diferença de 1531 para 1528 testes são os 3 de `webjs-call-history.contato.test.ts`, arquivo seu que depende de `webjs-call-history.service.ts` (modificado e não staged) e por isso **não** entrou nos commits: continua no diretório original. Procedimento de publicação: `runbook-deploy-producao.md`. **Parecer: NO-GO para produção** até os bloqueios da §1 daquele roteiro terem evidência.

Atualização 2026-11-16 (última preparação): **alternativa D do Socket.IO implementada** (revalidação periódica, `realtime/revalidacao.ts`); suíte completa 141 arquivos / 1531 testes verdes; typecheck API, ponte, web e `tsconfig.build` sem erros; estratégia de commits validada por simulação (§8); levantamento de staging (§9).

Contém: (1) correção de `concluirAgendamento`, (2) proteção do último ADMIN, (3) versão de sessão (`sessao_versao` + claim `sv`), (4) front que não desloga por falha transitória do `/auth/refresh`.

## 0. Antes de qualquer merge — o CI faz deploy sozinho

- [ ] **Push na `main` implanta em produção** (`.github/workflows/ci.yml`: `push: branches: [main]` + job `implantar` com `needs: verificar`). Não há aprovação manual. Só faça merge na `main` dentro da janela planejada. **(aprovação)**
- [ ] **Dependência entre o seu trabalho staged e o meu:** `tokens.ts` e `auth.service.ts` têm alterações suas *staged* (fixação do algoritmo HS256 em `tokens.ts` etc.) e as minhas por cima (`MM`). O meu código foi escrito e testado **sobre** o seu; commitar só o meu trecho sem o seu pode não compilar ou mudar comportamento. Commitar os dois juntos, ou revisar cada hunk (`git diff` = só o meu; `git diff --cached` = o seu).
- [ ] **A árvore de trabalho tem outras mudanças pendentes** que não são desta entrega (por exemplo `app.ts`, `env.ts`, `password.ts`, `storage.ts`, `files.routes.ts`, webhooks e telefonia). `tokens.ts` e `auth.service.ts` já tinham alterações *staged* suas antes desta entrega. Separe o commit por arquivo/trecho (`git add -p`) e revise `git diff --staged` antes de commitar. Lista de arquivos desta entrega no fim.

## 1. Preparação (antes da janela)

- [ ] Confirmar a **versão do PostgreSQL de produção** (a migration só é "somente metadado" no PG ≥ 11). *Não verificado.*
- [ ] Confirmar que `DATABASE_URL` (pooled) e `DIRECT_URL` (direta) existem no ambiente de produção; `migrate deploy` usa a direta (`schema.prisma`, `directUrl`). Sem ela o container não sobe. *Não verificado.*
- [ ] Confirmar no Coolify: **número de réplicas**, política de **rolling update** (o container antigo continua atendendo enquanto o novo migra e sobe?) e o volume de `WEBJS_DATA_DIR`. *Não verificado.*
- [ ] **Backup do banco** (`scripts/backup-producao.mjs`, não lido por mim) e confirmar que o restore funciona.
- [x] **Testes de integração em Postgres 16.15 local descartável: 14/14** (lock, corrida entre admins, incremento atômico, isolamento). Controle negativo sem o lock: falha, com 0 admins. *CONFIRMED_BY_EXECUTION neste ambiente; não prova nada sobre o Postgres do Neon.*
- [x] **Imagem/código anterior contra o banco já migrado:** funciona (INSERT/SELECT/UPDATE/upsert/DELETE) e `prisma migrate deploy` antigo responde "No pending migrations" (CONFIRMED_BY_EXECUTION).
- [x] **Migration sobre tabela populada** (25 usuários): todos ficam em versão 0, sem nulos (CONFIRMED_BY_EXECUTION).
- [ ] Repetir o essencial **em staging** (Postgres do mesmo provedor/versão de produção): migration, login, renovação, `/auth/me`, revogação. *NOT_VERIFIED.*
- [ ] **Drift preexistente** em 3 tabelas (`branding`, `mapeamentos_origem_importacao`, `solicitacoes_exclusao_contato`): não é desta entrega e não afeta `migrate deploy`, mas `migrate dev` vai querer gerar migration. Decidir à parte: **nenhuma migration foi criada para essas 3 tabelas nesta tarefa**; é um problema separado.
- [ ] Rodar `node scripts/validar-producao.mjs <url> <.env> baseline.json` **antes** do deploy (somente leitura; o login grava `ultimoLogin`). Guardar a linha de base. Esperado antes: `token com claim sv: false`.
- [ ] Combinar a janela: **ninguém altera perfil, senha ou status de usuários** durante o deploy (ver §3).

## 2. Ordem: migration → código

A ordem já é garantida pelo desenho: `apps/api/entrypoint.sh` roda `npx prisma migrate deploy` (com `set -eu`) **antes** de iniciar a API.

1. O container novo inicia e executa `20261116120000_sessao_versao_usuario/migration.sql` (`ADD COLUMN ... NOT NULL DEFAULT 0`, com `lock_timeout = 10s`).
2. Só depois sobe `node dist/src/main.js` (código novo).
3. Código antigo ignora a coluna e continua funcionando contra o banco já migrado (esperado do Prisma; **não executado**).

- [ ] Acompanhar o log do container: linha de migration aplicada, depois `API ouvindo`.
- [ ] **Se a migration falhar** (por exemplo `lock_timeout`): o container sai com código ≠ 0 e a API nova **não** sobe. Se o rolling do Coolify mantiver o container antigo, não há indisponibilidade; **confirmar no Coolify** (não verificado). Corrigir a causa (transação longa em `usuarios`) e repetir o deploy.
- [ ] **Nunca** rodar a imagem nova contra um banco sem esta migration: toda consulta a `User` falha (`P2022`).
- [ ] Duas instâncias subindo juntas executam `migrate deploy` ao mesmo tempo; o Prisma usa lock consultivo do Postgres, mas isso **não foi verificado**. Evitar subida simultânea.

## 3. Durante o deploy (janela de sobreposição)

- Enquanto houver container **antigo** ativo: ele emite tokens **sem `sv`** e **não sobe a versão** ao mudar perfil/senha/ativo.
- Efeito 1 (segurança): uma revogação feita numa instância antiga **não revoga nada**.
- Efeito 2 (disponibilidade): quem já teve a versão subida e cair no login/refresh de uma instância antiga recebe token sem `sv` (= 0) e é recusado pelas instâncias novas — 401 intermitente e novo login.
- [ ] Preferir deploy **sem sobreposição** (drenar a instância antiga) ou fora do horário de uso, e **não alterar usuários** na janela.

## 4. Verificação pós-deploy (somente leitura, salvo onde indicado)

- [ ] `GET /api/health`: `status ok`, `postgres ok`, `redis ok` (o CI já exige isso).
- [ ] `node scripts/validar-producao.mjs <url> <.env> depois.json` e comparar com a linha de base. Agora inclui: login devolve cookie, `POST /auth/refresh` renova (200), `/auth/me` com o token renovado, o refresh reaproveitado dá **401** (não 5xx). Esperado depois: **`token com claim sv: true`**.
- [ ] Logs do container: ausência de `[sessao] falha ao consultar a versão da sessão`, `[auth] falha do banco na renovação`, `P2022`.
- [ ] Taxa de respostas **503** (`SESSAO_INDISPONIVEL`): esperada zero em operação normal.
- [ ] Latência das rotas autenticadas vs. a linha de base (há uma consulta por pessoa ativa a cada 5 s). *Custo estimado, não medido.*
- [ ] Teste de revogação ponta a ponta com um **usuário descartável de teste** (nunca um real): logar, mudar o perfil por um ADMIN, confirmar 401 no token antigo e desconexão do socket. **Escreve dados em produção: exige aprovação.**
- [ ] Teste do front: derrubar o `/auth/refresh` (503) em ambiente de teste e confirmar que a interface mostra "Servidor indisponível. Tentando reconectar..." e **não** vai para o login; ao voltar, entra sozinha.
- [ ] Tickets: um usuário sem visibilidade de um protocolo recebe **404** ao concluir agendamento dele.

## 5. Rollback

| Cenário | O que fazer | Observação |
|---|---|---|
| Problema só no código | Reimplantar a imagem anterior; **deixar a coluna** | Código antigo ignora a coluna (esperado, não executado). **A revogação por perfil/senha deixa de existir** — o defeito original volta. Preferir *roll forward*. |
| Tokens emitidos pelo código novo (com `sv`) | continuam válidos no antigo | O antigo não confere `sv`. |
| Voltar a subir o código novo depois | tokens antigos com `sv` menor que a versão atual caem (401 → novo login) | Esperado. |
| Migration falhou | nada a reverter (o `ALTER` não foi aplicado) | Ver §2. |
| Remover a coluna (só se for mesmo necessário) | `ALTER TABLE "usuarios" DROP COLUMN "sessao_versao";` **depois** de voltar o código | Perde só o contador. Não há `down` automático. **(aprovação)** |
| Banco corrompido/dados perdidos | restore do backup do §1 | Fora do escopo desta mudança. |

## 6. Compatibilidade e segurança de versões antigas

- **Token legado (sem `sv`) vale como versão 0**: seguro (justificativa em `sessao-versao.md`); cai na primeira revogação da pessoa.
- **Código antigo + coluna nova**: INSERT usa o default, SELECT/UPDATE não a tocam (**CONFIRMED_BY_EXECUTION**, Postgres 16.15 local).
- **Código novo + coluna ausente**: quebra com `P2022` (**CONFIRMED_BY_EXECUTION**). Impedido pela ordem do entrypoint.
- **Instâncias antigas não aplicam revogação** (§3). Depois que todas forem substituídas, a regra vale integralmente.
- **Rollback desliga a proteção**; o front novo é compatível com o servidor antigo (trata 5xx/401 como antes do ponto de vista do servidor).

## 7. Riscos residuais após o deploy

- Cache de `validarSessao`: até **5 s** em outra instância.
- Sockets abertos em **outra instância**: a **revalidação periódica (D)** os derruba em até ≈ 60 s ± 20 % + 5 s de cache (≤ ~77 s). Não é imediato; **B** (pub/sub) reduziria a milissegundos e fica **aguardando decisão** (só se houver mais de uma réplica e exigência de segundos). **Eventos de realtime entre instâncias** (alternativa A) continuam sem solução — problema anterior a esta entrega.
- Revalidação (D): custo ≤ 1 consulta por PK por pessoa conectada por minuto, por instância — **estimado, não medido**; com banco fora nenhum socket é derrubado (testado com banco simulado; **não** com Postgres real nem com Socket.IO real entre processos).
- Socket aberto **não** é derrubado por expiração do token (decisão sua).
- `cli/criar-admin` sobe a versão, mas roda fora da API: sem limpar cache nem derrubar sockets.
- Serialização do advisory lock, incremento atômico e filtro por organização: **CONFIRMED_BY_EXECUTION** em Postgres 16.15 local (14/14). Segue **NOT_VERIFIED** no Postgres/pooler do Neon (o lock é de transação e depende de a transação ficar numa só conexão; confirmar em staging se ele usa o pooler).
- Quantas réplicas, política de rolling e versão do Postgres de produção: **NOT_VERIFIED**.
- Timeout de 3 s da consulta de sessão não cancela a consulta; sob banco lento pode saturar o pool (não medido).

## 8. Estratégia segura para separar os commits (nada foi commitado nem staged por mim)

**Fatos (CONFIRMED_BY_EXECUTION, `git status`/`git diff` somente leitura):**
- O índice tem **51 arquivos staged** seus (1.080 +/85 −): 32 em `.claude/` (skill/agentes) e 19 de código (HS256, redação, storage, webhooks, telefonia, login por senha etc.).
- `tokens.ts` e `auth.service.ts` são **`MM`**: o índice tem o **seu** trabalho e a árvore tem o **meu** por cima. `git diff -- <arquivo>` mostra só o meu; `git diff --cached -- <arquivo>` só o seu. Os trechos **não se sobrepõem** em linhas.
- 11 arquivos de `.claude/` são `AM` (staged por você, com edições minhas depois: regras de evidência).
- **Dependência escondida:** o seu trabalho staged importa arquivos **não rastreados**: `lib/trust-proxy.ts`, `lib/conteudo-arquivo.ts` e `modules/channels/providers/segredo-webhook.ts` (+ seus testes, `auth.service.login.test.ts` e `files.routes.test.ts`). **Commitar só o índice quebra o build** (`TS2307` em `app.ts`, `env.ts`, `storage.ts` e nos três webhooks). Simulado em cópia fora do repositório: HEAD + índice sem esses arquivos → 6 erros de typecheck; com eles → 0 erros e 12 arquivos / 175 testes verdes.
- `lib/tokens.test.ts` (não rastreado) é **misto**: testes seus + os meus de `sv`/refresh. Sem histórico git para separar.
- Não são desta entrega nem do seu índice: `inbound.service.ts`, `webjs-call-history.service.ts`, `whatsapp.modo.ts`, `experimentos/.../server.mjs` (modificados, não staged) e dezenas de não rastreados (mídia, docs, `.zip`, `plataforma-atendimento/` aninhado, `storage-teste/`…).

**Backup feito antes de qualquer sugestão** (fora do repositório): `C:\Users\kaua.tavares\backup-git-20261116\` com `1-staged-indice.patch`, `2-nao-staged-arvore.patch`, `3-status.txt`, a lista e um `.tar` dos fontes não rastreados. Há também 2 stashes antigos (`git stash list`), não tocados.

**Estratégia recomendada — sem `reset` e sem mexer no índice atual:**
1. Trabalhar numa **worktree separada** a partir do HEAD (`git worktree add ../commits-sessao -b <branch-nova> HEAD`): ela tem **índice próprio**, e o seu índice atual continua intacto. (Eu não criei a worktree; a cópia que usei para simular ficou fora do repositório.)
2. **Commit 1 — hardening seu (sem `.claude/`):** aplicar `1-staged-indice.patch` excluindo `.claude/` + copiar os não rastreados dos quais ele depende (3 módulos, seus testes, `auth.service.login.test.ts`, `files.routes.test.ts`). Simulado: compila e passa.
3. **Commit 2 — versão de sessão (meu):** aplicar `2-nao-staged-arvore.patch` **filtrado** (excluir `inbound.service.ts`, `webjs-call-history.service.ts`, `whatsapp.modo.ts`, `server.mjs`) + os meus não rastreados (lista em "Arquivos desta entrega") + `tokens.test.ts` inteiro (misto: revisar). Cada commit deve passar `typecheck` e `npm test` na worktree.
4. **Commit 3 — front** (`api.ts`, `restaurarSessao*`, `AuthProvider.tsx`, `App.tsx`); **commit 4 — docs/evidências**; **`.claude/`** em commit à parte (ferramenta, não produto).
5. Depois de commitar na worktree, o seu índice atual ainda terá os mesmos arquivos; **resolva-o você** (por exemplo `git restore --staged` depois de conferir o conteúdo no novo branch). Eu não executo isso.
6. Revisar hunks por arquivo antes de cada commit e conferir **fins de linha**: o git avisou que 20 arquivos serão convertidos LF→CRLF; confirme `core.autocrlf`/`.gitattributes` para não gerar diff de linha inteira.
- **Não** faça `git add -A`, `git stash -u` nem `git checkout .` neste diretório: há trabalho seu não rastreado e não staged que não está em nenhum commit.

## 9. Staging: existe um isolado, e como implantar sem acionar a `main`?

**Gatilho do pipeline (CONFIRMED_BY_CODE, `.github/workflows/ci.yml`):** `on: push: branches: [main]` e `pull_request`. O job `implantar` só roda com `github.event_name == 'push' && github.ref == 'refs/heads/main'`. Logo, **push de outro branch e pull request rodam só `verificar` (typecheck, testes, build) e NÃO implantam**. Não há `workflow_dispatch` nem `environment:` no arquivo.

**Existência de staging isolado: NÃO CONFIRMADA.**
- No repositório não há compose, workflow, variável ou documento de staging (`docker-compose.yml` é só dev local; o README diz "produção gerenciada pelo Coolify").
- **TECHNICAL_SUSPICION:** uma captura do painel do Coolify (`.playwright-mcp/server-resources.md`, de 2026-11-12, arquivo local ignorado pelo git) lista, no projeto `atendimento`, um **ambiente chamado `homologacao`** com ao menos duas aplicações (uma imagem Docker e uma por branch `feat/waha-provider`). É um instantâneo antigo e indireto: **não prova** que existe hoje, **nem que tem Postgres e Redis próprios** (pode apontar para o mesmo Neon/Upstash de produção).
- Não acessei o Coolify, o Neon nem a produção.

**Como implantar no staging sem acionar a `main` (opções; não executei nenhuma; exigem sua decisão):**

| Opção | Como | Risco |
|---|---|---|
| **1. Aplicação do ambiente `homologacao` no Coolify** (se existir e for isolada) | Apontar a aplicação para o branch; disparar o deploy **no painel dela** ou por `GET /api/v1/deploy?uuid=<UUID DO STAGING>` (mesmo mecanismo do CI, **outro UUID**). Nunca o UUID de produção que está no `ci.yml`. | Conferir **no painel** que `DATABASE_URL`/`DIRECT_URL`/`REDIS_URL` do staging **não** são os de produção. A migration roda no start (`entrypoint.sh`). |
| **2. Staging local descartável** (o que já foi provado) | Postgres local + `npm run test:integracao` + API local contra ele. | Não valida Coolify, rolling, pooler nem Neon. |
| **3. Criar um ambiente de staging novo** (outro app + Postgres/Redis) | Decisão de **infraestrutura**: custo, segredos, domínio, WhatsApp de teste. | Exige aprovação sua. |

**Pontos de atenção:** (a) o `ci.yml` registra um rolling update de 6 a 8 s, ou seja, **há sobreposição** de contêineres na troca (comentário no código, não verificado agora); (b) o WhatsApp de um staging não pode compartilhar a linha da produção; (c) abrir **PR** é seguro (só `verificar`); fazer **merge** na `main` não é.

## 10. Verificação somente leitura do Coolify (2026-11-16) — resultado: isolamento NÃO comprovado

Método: painel web do Coolify por sessão de navegador já autenticada; só leitura; valores de variáveis nunca exibidos (extraí apenas nomes). Nenhum deploy, migration ou alteração de configuração. Snapshots gerados foram apagados.

| Fato | Classificação |
|---|---|
| O ambiente `homologacao` **existe** no projeto `atendimento`, no mesmo servidor (`localhost`) | CONFIRMED_BY_EXECUTION (leitura do painel, hoje) |
| Tem **2 aplicações**: um contêiner **WAHA** (imagem Docker, `running`) e a plataforma pelo branch `feat/waha-provider` (`exited`). **Nenhum recurso de banco ou Redis** no ambiente | CONFIRMED_BY_EXECUTION |
| A aplicação da plataforma usa **Nixpacks** com comando de início `node apps/api/dist/src/main.js`: **não usa o `Dockerfile`/`entrypoint.sh`**, logo **não roda `prisma migrate deploy` ao subir** e não inicia o conector webjs. Sem pre/post-deployment command. Não representa a produção | CONFIRMED_BY_EXECUTION |
| Variáveis cadastradas na aplicação da plataforma: só `NIXPACKS_NODE_VERSION`, `DATABASE_URL` e `DIRECT_URL`, e **as duas últimas aparecem vazias/ilegíveis**. **Não há `REDIS_URL`** nem os segredos JWT | CONFIRMED_BY_EXECUTION |
| `DATABASE_URL`/`DIRECT_URL`/`REDIS_URL` isoladas da produção | **NOT_VERIFIED** (valores não legíveis; sem Redis configurado). Bloqueio: precisa de alguém com acesso aos valores |
| Versão do PostgreSQL e uso do pooler | **NOT_VERIFIED** (nenhum banco no ambiente; valores ilegíveis) |
| Réplicas: o Coolify mostra servidor standalone (`localhost`), sem campo de réplicas | TECHNICAL_SUSPICION de instância única (inclusive em produção) |
| Compatibilidade do `pg_advisory_xact_lock` com pooler: o lock é de **transação** dentro de `prisma.$transaction` (uma conexão até o commit), desenho compatível com pooler em modo transação | CONFIRMED_BY_CODE (desenho); **não executado** no pooler |

**Conclusão: a homologação existente não está pronta nem comprovadamente isolada. Preparação de implantação interrompida**, conforme a regra definida.

## Arquivos desta entrega (para separar o commit; nenhum commit foi feito)

- **Banco:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/seed.ts`, `apps/api/prisma/migrations/20261116120000_sessao_versao_usuario/migration.sql`
- **API:** `src/lib/{sessao,tokens,banco-teste}.ts`, `src/http/middleware/auth.ts`, `src/modules/auth/{auth.routes,auth.service}.ts`, `src/modules/users/users.service.ts`, `src/modules/tickets/tickets.service.ts`, `src/realtime/{server,hub,revalidacao}.ts`, `src/cli/{criar-admin,preparar-banco-teste}.ts`
- **Testes da API:** `src/lib/{sessao,sessao.escritas,tokens,banco-teste}.test.ts`, `src/http/middleware/auth.test.ts`, `src/modules/auth/auth.service.renovar.test.ts`, `src/modules/users/users.service.{admin,sessao}.test.ts`, `src/modules/tickets/tickets.service.agendamento.test.ts`, `src/realtime/{hub,server.handshake,revalidacao}.test.ts`, `src/integracao/sessao-e-admins.integracao.test.ts`
- **Front:** `apps/web/src/lib/{api,restaurarSessao}.ts`, `apps/web/src/features/auth/AuthProvider.tsx`, `apps/web/src/App.tsx`, `apps/web/src/lib/{api.refresh,restaurarSessao}.test.ts`
- **Infra de teste/scripts:** `vitest.config.ts`, `vitest.integracao.config.ts`, `tests/setup-integracao.ts`, `package.json`, `apps/api/package.json`, `scripts/validar-producao.mjs`
- **Docs:** `docs/seguranca/{sessao-versao,socketio-multiplas-instancias,testes-integracao-postgres,checklist-implantacao-sessao}.md`
- **Skill (ferramenta, não é produto):** `.claude/skills/ai-software-architect/**`, `.claude/agents/asa-*.md`
