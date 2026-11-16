# Roteiro de publicação em produção — correções de segurança, sessão e Socket.IO

**Estado: preparado, NÃO executado.** Nada aqui foi rodado contra produção, Neon, Upstash ou Coolify. Este roteiro só começa quando o responsável disser **"DEPLOY"**; naquele momento todas as verificações da §1 são refeitas contra o ambiente real e **cada ação com efeito externo (§3 em diante) pede autorização explícita**.

**Parecer atual: NO-GO para produção** enquanto houver bloqueio da §1 sem evidência. Este documento não presume que `DATABASE_URL`, `DIRECT_URL`, `REDIS_URL`, a versão do PostgreSQL, o pooler, o número de réplicas ou a política de rolling estejam corretos ou isolados.

Documentos relacionados: `checklist-implantacao-sessao.md` (riscos, rollback e compatibilidade), `sessao-versao.md`, `socketio-multiplas-instancias.md`, `testes-integracao-postgres.md`.

## 0. O que entra na publicação

Seis commits locais no branch `prep/seguranca-sessao-homologacao`, na ordem:

| # | Conteúdo | Efeito em produção |
|---|---|---|
| 1 | Hardening já existente (algoritmo JWT fixado, `TRUST_PROXY`, segredo de webhook por cabeçalho, validação de conteúdo de arquivo, login sem enumeração, etc.) | Muda comportamento; ver §1.6 |
| 2 | IDOR em `concluirAgendamento` | Usuário sem visibilidade recebe 404 |
| 3 | Último ADMIN (lock) + versão de sessão (`sessao_versao`, claim `sv`) + revalidação periódica de sockets | **Migration** `20261116120000_sessao_versao_usuario`; tokens passam a levar `sv` |
| 4 | Front: 5xx/rede no `/auth/refresh` não desloga | Só no navegador |
| 5 | Docs, evidências e este roteiro | Nenhum |
| 6 | Skill e agentes (`.claude/`) | Nenhum (ferramenta) |

## 1. Bloqueios a verificar no momento do DEPLOY (leitura apenas)

Nenhum item abaixo está verificado hoje. Cada um precisa de **evidência registrada** (comando/captura, sem credenciais) antes do GO.

| # | Verificação | Como (somente leitura) | Se falhar |
|---|---|---|---|
| 1.1 | Produção é o alvo certo e o único que o pipeline implanta | `ci.yml`: `COOLIFY_UUID` (var/valor padrão) e `PRODUCAO_URL`; conferir no painel que o UUID é o do app de produção | Parar |
| 1.2 | `DATABASE_URL`/`DIRECT_URL`/`REDIS_URL` de **produção**: existem, são de produção, e **não** são as de homologação/dev | Painel do Coolify → variáveis do app de produção. Comparar só host e nome do banco (sem copiar valores) | Parar |
| 1.3 | Versão do PostgreSQL ≥ 11 (a migration é só metadado) | `SHOW server_version;` por conexão direta de **leitura** autorizada, ou console do provedor | Parar |
| 1.4 | Pooler: `DATABASE_URL` pode ser pooled; `DIRECT_URL` **tem** de ser direta (a migration e o lock de transação dependem disso) | Comparar host: direto = sem `-pooler`. O `pg_advisory_xact_lock` é de transação e vale com pooler em modo transação; **não foi executado em Neon** | Parar |
| 1.5 | Réplicas e política de rolling do app de produção | Painel: réplicas/swarm, health check, "rolling update". O `ci.yml` cita rolling de 6–8 s (comentário, não verificado agora) | Definir janela sem sobreposição (§4) |
| 1.6 | Variáveis que o hardening (commit 1) interpreta | `TRUST_PROXY` (agora aceita `false`, número de saltos, lista de IP/CIDR; `true` continua aceito mas confia em todo o cabeçalho). Webhooks: o segredo continua aceito por `?secret=` e agora também por `X-Webhook-Secret`; sem segredo configurado, nada passa (como antes) | Ajustar valor antes, com aprovação |
| 1.7 | Health check do contêiner | O `Dockerfile` **não** tem `HEALTHCHECK`; a rota é `/api/health` (confere Postgres e Redis). Confirmar que o Coolify tem health check configurado | Sem health check, o rolling não protege |
| 1.8 | Backup possível e restaurável | §2 | Parar |
| 1.9 | Quantos usuários ativos/janela de uso | Escolher horário de baixo uso | — |
| 1.10 | Estado do branch: `git fetch origin` e `git rev-list --count prep/seguranca-sessao-homologacao..origin/main` deve ser **0** | Se > 0, decidir rebase/merge **com aprovação** | Parar |
| 1.11 | CI do branch verde (PR) e o mesmo conjunto passando local | §3, passo 2 | Parar |

## 2. Backup (antes de qualquer merge)

Preferência: **branch/ponto de restauração no console do provedor do banco** (preserva schema, índices e sequences). O script local é só uma rede de segurança lógica:

```
SELO=$(date +%Y%m%d-%H%M)
node scripts/backup-producao.mjs apps/api/.env.production backups/producao-$SELO.json
```

Lê apenas `DIRECT_URL` do arquivo, não imprime a credencial e imprime o host (conferir que é o de produção). Não foi executado nesta preparação. Guardar o arquivo fora do repositório (`backups/` e `.env.*` não devem ser commitados). **Restore não testado.**

Também registrar a linha de base HTTP (somente leitura; o login grava `ultimoLogin`):

```
node scripts/validar-producao.mjs https://atendimento.bradel.com.br apps/api/.env.production baseline.json
```

Esperado antes: `token com claim sv: false`.

## 3. Publicação (só após "DEPLOY" e autorização de cada passo)

**Atenção:** push na `main` implanta em produção, sem aprovação no pipeline (`ci.yml`, job `implantar`, `needs: verificar`). Push em outro branch e PR rodam **só** `verificar`.

1. Reverificar a §1 e anotar as evidências.
2. Publicar o branch (ainda **não** implanta):
   ```
   git push -u origin prep/seguranca-sessao-homologacao
   gh pr create --base main --head prep/seguranca-sessao-homologacao --title "Segurança: sessão versionada, último ADMIN, IDOR, hardening" --body-file <corpo>
   gh pr checks --watch
   ```
   Exigir `verificar` verde (typecheck, `npm test`, build). **Não** cobre integração com Postgres, front em navegador nem Coolify.
3. Backup (§2) e linha de base; janela combinada (§4).
4. Autorização explícita do responsável para o merge. O merge **é o deploy**:
   ```
   gh pr merge --merge    # merge commit: preserva os 6 commits; não usar squash
   gh run watch           # acompanha verificar -> implantar
   ```
5. No contêiner, o `entrypoint.sh` roda `npx prisma migrate deploy` (com `set -eu`) **antes** da API. Acompanhar no log do Coolify: `Applying migration 20261116120000_sessao_versao_usuario`, depois `API ouvindo`. Se a migration falhar (por exemplo `lock_timeout` de 10 s por transação longa em `usuarios`), o contêiner sai e a API nova não sobe; se o rolling mantiver o antigo, não há indisponibilidade (**confirmar**).
6. O job `implantar` confere `/api/health` (`postgres` e `redis` ok) ao final.

Nunca rode a imagem nova contra um banco sem a migration (`P2022`).

## 4. Janela e sobreposição

- Enquanto houver contêiner **antigo** ativo: ele emite token sem `sv` e **não sobe a versão** ao mudar perfil/senha/ativo (a revogação não vale nele). Quem já teve a versão subida e cair numa instância antiga recebe token sem `sv` (= 0) e é recusado pelas novas (401 intermitente).
- Preferir **drenar** a instância antiga ou fazer fora do horário de uso, e **ninguém altera perfil, senha ou status de usuários** durante a janela.
- Não subir duas instâncias novas ao mesmo tempo (ambas executam `migrate deploy`; o lock do Prisma **não foi verificado**).

## 5. Smoke tests pós-deploy

Leitura, salvo onde indicado.

```
curl -fsS https://atendimento.bradel.com.br/api/health
node scripts/validar-producao.mjs https://atendimento.bradel.com.br apps/api/.env.production depois.json
```

Esperado: `status ok`, `postgres ok`, `redis ok`; login com cookie; `POST /auth/refresh` 200; `/auth/me` com o token renovado; refresh reaproveitado → **401** (não 5xx); **`token com claim sv: true`**. Comparar `depois.json` com `baseline.json`.

Com **autorização** (escreve dados), usando **usuário descartável de teste**, nunca um real: logar; mudar o perfil por um ADMIN; confirmar 401 no token antigo e socket desconectado (imediato na mesma instância; até ~77 s em outra). Conferir também: usuário sem visibilidade de um protocolo recebe **404** ao concluir agendamento dele; tela "Servidor indisponível. Tentando reconectar..." no navegador (não executado em navegador real).

## 6. Monitoramento (primeiros 30–60 min)

- Logs do contêiner, ausência de: `[sessao] falha ao consultar a versão da sessão`, `[auth] falha do banco na renovação`, `P2022`, `[realtime] falha na revalidacao periodica de sessoes`.
- Taxa de **503** (`SESSAO_INDISPONIVEL`): esperada zero. Latência das rotas autenticadas contra a linha de base (há uma consulta por pessoa a cada 5 s, e a revalidação de sockets ≤ 1 consulta por pessoa por minuto: **estimativa, não medida**).
- Consumo do Redis (cota do Upstash já estourou antes).
- Webhooks de WhatsApp continuam entrando (segredo).

## 7. Rollback e roll forward

| Situação | Ação | Observação |
|---|---|---|
| Migration falhou | Nada a reverter (`ALTER` não aplicado). Corrigir a causa e repetir | — |
| Problema de código com a plataforma de pé | **Roll forward**: corrigir e publicar de novo | Preferível |
| Falha que derruba a plataforma | Reimplantar a imagem anterior pelo painel do Coolify; **deixar a coluna** | Código antigo ignora a coluna (**confirmado por execução** em Postgres 16.15 local). Desliga a revogação por perfil/senha |
| Remover a coluna | `ALTER TABLE "usuarios" DROP COLUMN "sessao_versao";` só depois de voltar o código | **Exige aprovação**; sem `down` automático |
| Dados perdidos/corrompidos | Restore do backup (§2) | **Restore não testado** |

Voltar a subir o código novo depois: tokens com `sv` menor que a versão atual caem (401 → novo login). Sockets abertos pelo código novo seguem até reconectar.

## 8. O que só pode ser verificado no momento do deploy

Tudo da §1; o comportamento real do Coolify (rolling, health check, réplicas); Postgres e pooler do provedor; o `pg_advisory_xact_lock` por pooler; latência e carga; o front em navegador real; a cota do Redis; se o merge dispara mesmo o job `implantar` (`COOLIFY_TOKEN` presente — sem ele o pipeline só avisa e **não** implanta).

## 9. Decisões e aprovações que dependem do responsável

- Janela de publicação e quem acompanha.
- Resolver, no branch, o trabalho local que **não** entrou nos seis commits (`inbound.service.ts`, `webjs-call-history.service.ts`, `whatsapp.modo.ts`, `webjs-call-history.contato.test.ts`, `server.mjs` do experimento e scripts soltos): continua só no diretório original.
- Alternativa B (pub/sub) para sockets entre instâncias, só se houver mais de uma réplica.
- Drift preexistente em 3 tabelas (`branding`, `mapeamentos_origem_importacao`, `solicitacoes_exclusao_contato`): problema **separado**, sem migration criada.
- Homologação isolada (a existente não está pronta; ver `checklist-implantacao-sessao.md` §10).
